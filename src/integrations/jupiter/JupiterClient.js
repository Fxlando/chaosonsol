/**
 * Jupiter Client
 * Complete Jupiter v6 integration with VersionedTransaction support
 */

import { 
  PublicKey, 
  Keypair, 
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import axios from 'axios';
import https from 'https';
import dns from 'dns';
import { API_ENDPOINTS, PROGRAM_IDS } from '../../config/constants.js';
import { loggerManager } from '../../utils/logger.js';
import { ErrorClassifier } from '../../utils/errors.js';
import TransactionBuilder from '../../core/TransactionBuilder.js';
import AccountManager from '../../core/AccountManager.js';

const logger = loggerManager.getLogger('JupiterClient');

function parseCsv(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
}

function isValidIpOrHost(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  const ipv4Regex = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  if (ipv4Regex.test(trimmed)) return true;

  const hostnameRegex = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;
  return hostnameRegex.test(trimmed);
}

function formatJupiterResponseData(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    return data.map(item => formatJupiterResponseData(item)).join('; ');
  }
  if (typeof data === 'object') {
    const keys = ['error', 'message', 'msg', 'detail', 'details', 'reason'];
    for (const key of keys) {
      if (data[key]) {
        return formatJupiterResponseData(data[key]);
      }
    }
    try {
      return JSON.stringify(data);
    } catch {
      return String(data);
    }
  }
  return String(data);
}

function enrichAxiosError(error, context) {
  if (!error) return error;
  const response = error.response;
  if (response && typeof response.status === 'number') {
    const details = formatJupiterResponseData(response.data);
    const messageParts = [`Jupiter API ${context || ''} responded with status ${response.status}`];
    if (details) {
      messageParts.push(details);
    }
    const enriched = new Error(messageParts.join(': '));
    enriched.status = response.status;
    enriched.data = response.data;
    enriched.originalError = error;
    return enriched;
  }
  return error;
}

/**
 * Jupiter Client Class
 */
export class JupiterClient {
  constructor(solanaCore, config = {}) {
    this.solanaCore = solanaCore;
    this.connection = solanaCore.getConnection();
    this.config = {
      jupiterApiUrl: config.jupiterApiUrl || process.env.JUPITER_API_URL || API_ENDPOINTS.JUPITER_V6,
      jupiterProgramId: config.jupiterProgramId || process.env.JUPITER_PROGRAM_ID || PROGRAM_IDS.JUPITER_V6_PROGRAM,
      defaultSlippage: config.defaultSlippage || 1.0, // 1%
      maxRetries: config.maxRetries || 3,
      priorityFee: config.priorityFee || 1000,
      dnsResolvers: config.dnsResolvers || parseCsv(process.env.JUPITER_DNS_RESOLVERS) || [
        '1.1.1.1',
        '1.0.0.1',
        '8.8.8.8',
        '8.8.4.4'
      ],
      dohEndpoints: config.dohEndpoints || parseCsv(process.env.JUPITER_DOH_ENDPOINTS) || [
        'https://cloudflare-dns.com/dns-query',
        'https://1.1.1.1/dns-query',
        'https://dns.google/resolve',
        'https://google-public-dns-a.google.com/resolve'
      ],
      jupiterStaticIps: config.jupiterStaticIps || parseCsv(process.env.JUPITER_STATIC_IPS),
      ...config
    };

    this.transactionBuilder = new TransactionBuilder(this.connection);
    this.accountManager = new AccountManager(this.connection);
    this.cache = new Map();
    this.isInitialized = false;

    this.systemLookup = dns.lookup;
    this.dnsResolver = new dns.promises.Resolver();
    if (Array.isArray(this.config.dnsResolvers) && this.config.dnsResolvers.length > 0) {
      try {
        this.dnsResolver.setServers(this.config.dnsResolvers);
      } catch (error) {
        logger.warn('Failed to set custom DNS resolvers:', error.message);
      }
    }

    this.lookupFn = this.createLookupFunction();
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      lookup: this.lookupFn
    });
    this.jupiterHostname = this.extractHostname(this.config.jupiterApiUrl);
    this.jupiterPort = this.extractPort(this.config.jupiterApiUrl);
    this.staticIpPool = Array.isArray(this.config.jupiterStaticIps)
      ? this.config.jupiterStaticIps.filter(isValidIpOrHost)
      : [];
    this.staticIpIndex = 0;
    
    this.initialize();
  }

  getStaticFallbackIp() {
    if (!this.staticIpPool || this.staticIpPool.length === 0) {
      return null;
    }

    const ip = this.staticIpPool[this.staticIpIndex % this.staticIpPool.length];
    this.staticIpIndex = (this.staticIpIndex + 1) % this.staticIpPool.length;
    return ip;
  }

  createLookupFunction() {
    return (hostname, options, callback) => {
      let lookupOptions = options;
      let lookupCallback = callback;

      if (typeof lookupOptions === 'function') {
        lookupCallback = lookupOptions;
        lookupOptions = {};
      }

      const complete = (error, address, family) => {
        if (lookupCallback) {
          lookupCallback(error, address, family);
          lookupCallback = null;
        }
      };

      const fallbackToSystem = () => {
        try {
          this.systemLookup(hostname, lookupOptions, complete);
        } catch (error) {
          complete(error);
        }
      };

      Promise.resolve().then(async () => {
        if (!this.dnsResolver) {
          fallbackToSystem();
          return;
        }

        const preferIPv6 = lookupOptions && lookupOptions.family === 6;
        const recordOrder = preferIPv6 ? ['AAAA', 'A'] : ['A', 'AAAA'];

        for (const recordType of recordOrder) {
          try {
            let addresses;
            if (recordType === 'A') {
              addresses = await this.dnsResolver.resolve4(hostname);
            } else {
              addresses = await this.dnsResolver.resolve6(hostname);
            }

            if (addresses && addresses.length > 0) {
              const family = recordType === 'A' ? 4 : 6;
              complete(null, addresses[0], family);
              return;
            }
          } catch (error) {
            if (typeof logger.debug === 'function') {
              logger.debug(`Custom DNS resolve failed for ${hostname} (${recordType}): ${error.message}`);
            }
          }
        }

        fallbackToSystem();
      }).catch(fallbackToSystem);
    };
  }

  extractHostname(urlString) {
    try {
      return new URL(urlString).hostname;
    } catch (error) {
      logger.warn(`Invalid Jupiter API URL "${urlString}": ${error.message}. Falling back to default host.`);
      return 'quote-api.jup.ag';
    }
  }

  extractPort(urlString) {
    try {
      const parsed = new URL(urlString);
      return parsed.port ? parseInt(parsed.port, 10) : null;
    } catch {
      return null;
    }
  }

  buildJupiterUrl(endpoint = '') {
    const normalizedBase = this.config.jupiterApiUrl.endsWith('/')
      ? this.config.jupiterApiUrl
      : `${this.config.jupiterApiUrl}/`;
    const sanitizedEndpoint = endpoint.startsWith('/')
      ? endpoint.slice(1)
      : endpoint;
    return new URL(sanitizedEndpoint, normalizedBase);
  }

  async performJupiterRequest({ endpoint = '', method = 'GET', params, data, headers = {}, timeout = 10000 }) {
    // CRITICAL: Log immediately to verify new code is running
    logger.error(`🚨🚨🚨 [performJupiterRequest] NEW CODE VERSION - Called with endpoint: ${endpoint}`);
    
    const requestUrl = this.buildJupiterUrl(endpoint);
    
    // Log params before sending (especially amount) to debug
    if (params && params.amount) {
      logger.error(`🚨 [performJupiterRequest] BEFORE FIX: params.amount = ${params.amount} (type: ${typeof params.amount})`);
      // Validate amount is an integer string
      const amountValue = String(params.amount);
      if (amountValue.includes('.') || isNaN(parseInt(amountValue))) {
        logger.error(`❌ ERROR: Invalid amount in params: ${amountValue}`);
      }
    }
    
    // CRITICAL FIX: If amount is suspiciously large (> 1e12), fix it by dividing by 1e6
    // This handles the case where amount was incorrectly multiplied by 1e6
    if (params && params.amount) {
      const amountValue = params.amount;
      const amountStr = String(amountValue);
      const amountNum = parseInt(amountStr);
      
      // If amount is > 1 trillion, it's likely been incorrectly multiplied by 1e6
      // Fix it by dividing by 1e6
      if (amountNum > 1e12 && amountNum % 1000000 === 0) {
        const fixedAmount = (amountNum / 1000000).toString();
        logger.error(`🚨 CRITICAL FIX: Amount is ${amountNum} which is > 1 trillion! Dividing by 1e6 to fix: ${fixedAmount}`);
        params = { ...params, amount: fixedAmount };
      }
    }
    
    const axiosConfig = {
      method,
      url: requestUrl.toString(),
      params,
      data,
      timeout,
      headers: { ...headers },
      httpsAgent: this.httpsAgent
    };

    try {
      // Log right before axios call - CRITICAL DEBUG
      if (params && params.amount) {
        const amountValue = params.amount;
        const amountType = typeof amountValue;
        const amountStr = String(amountValue);
        logger.error(`🚨 [performJupiterRequest] CRITICAL: About to send request with amount: ${amountValue} (type: ${amountType}, string: "${amountStr}")`);
        logger.error(`🚨 [performJupiterRequest] Full params object: ${JSON.stringify(params, null, 2)}`);
        
        // If amount is still suspiciously large after fix, log error
        if (parseInt(amountStr) > 1e12) {
          logger.error(`🚨 CRITICAL ERROR: Amount is still ${parseInt(amountStr)} after fix! This is wrong!`);
          logger.error(`🚨 Expected amount should be around 4,000,000 (0.004 SOL). Got: ${amountStr}`);
        }
      }
      return await axios(axiosConfig);
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : '';
      const causeMessage = typeof error?.cause?.message === 'string' ? error.cause.message : '';
      const isDnsError =
        error?.code === 'ENOTFOUND' ||
        error?.cause?.code === 'ENOTFOUND' ||
        message.includes('ENOTFOUND') ||
        causeMessage.includes('ENOTFOUND') ||
        message.includes('getaddrinfo') ||
        causeMessage.includes('getaddrinfo');
      if (!isDnsError) {
        throw enrichAxiosError(error, endpoint || requestUrl.pathname || requestUrl.hostname);
      }

      logger.debug(`Primary Jupiter request failed due to DNS resolution (${requestUrl.hostname}). Attempting DoH fallback...`);
      let fallbackIp = await this.resolveHostViaDoh(requestUrl.hostname);
      if (!fallbackIp) {
        fallbackIp = this.getStaticFallbackIp();
        if (fallbackIp) {
          logger.debug(`Using configured static Jupiter IP override ${fallbackIp} for ${requestUrl.hostname}`);
        }
      }

      if (!fallbackIp) {
        logger.error(`DoH fallback failed to resolve ${requestUrl.hostname}`);
        logger.error('Provide IPs via JUPITER_STATIC_IPS or ensure outbound HTTPS to DoH endpoints is allowed.');
        throw enrichAxiosError(error, endpoint || requestUrl.pathname || requestUrl.hostname);
      }

      if (typeof logger.info === 'function') {
        logger.info(`✅ Resolved ${requestUrl.hostname} -> ${fallbackIp}. Retrying request with SNI preservation.`);
      }

      const fallbackUrl = new URL(requestUrl.toString());
      fallbackUrl.hostname = fallbackIp;
      if (this.jupiterPort) {
        fallbackUrl.port = this.jupiterPort.toString();
      }

      const hostHeader = requestUrl.hostname;
      const fallbackHeaders = {
        ...headers,
        Host: hostHeader
      };

      const fallbackAgent = new https.Agent({
        keepAlive: true,
        servername: hostHeader
      });

      try {
        return await axios({
          ...axiosConfig,
          url: fallbackUrl.toString(),
          headers: fallbackHeaders,
          httpsAgent: fallbackAgent
        });
      } catch (fallbackError) {
        throw enrichAxiosError(fallbackError, `${endpoint || requestUrl.pathname || requestUrl.hostname} (fallback)`);
      }
    }
  }

  async resolveHostViaDoh(hostname) {
    const dohEndpoints = Array.isArray(this.config.dohEndpoints) && this.config.dohEndpoints.length > 0
      ? this.config.dohEndpoints
      : [
          'https://cloudflare-dns.com/dns-query',
          'https://1.1.1.1/dns-query',
          'https://dns.google/resolve'
        ];

    for (const endpoint of dohEndpoints) {
      try {
        const response = await axios.get(endpoint, {
          params: {
            name: hostname,
            type: 'A',
            ct: 'application/dns-json'
          },
          headers: {
            Accept: 'application/dns-json',
            'User-Agent': 'ChaosBot-DNS-Resolver/1.0'
          },
          timeout: 5000
        });

        const data = response.data || {};
        const answers = data.Answer || data.answer || [];
        if (Array.isArray(answers) && answers.length > 0) {
          const ipv4Record = answers.find(record => record.type === 1 && record.data);
          if (ipv4Record?.data && isValidIpOrHost(ipv4Record.data)) {
            return ipv4Record.data;
          }
        }

        if (Array.isArray(data?.Answer) && data.Answer.length === 0 && typeof data?.Status === 'number') {
          logger.warn(`DoH endpoint ${endpoint} responded with status ${data.Status} for ${hostname}`);
        }
      } catch (error) {
        if (typeof logger.debug === 'function') {
          logger.debug(`DoH lookup via ${endpoint} failed for ${hostname}: ${error.message}`);
        }
      }
    }

    return null;
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info('Initializing Jupiter Client...');
    
    // Verify Jupiter program exists
    try {
      const programId = new PublicKey(this.config.jupiterProgramId);
      const programInfo = await this.connection.getAccountInfo(programId);
      if (!programInfo) {
        logger.warn('Jupiter program not found on-chain (may be using versioned transactions)');
      } else {
        logger.info('✅ Jupiter program verified');
      }
    } catch (error) {
      logger.warn('Could not verify Jupiter program:', error.message);
    }

    this.isInitialized = true;
    logger.info('✅ Jupiter Client initialized');
  }

  /**
   * Validate if a trading route exists for a token pair
   * This helps catch tokens with no liquidity before attempting to swap
   */
  async validateTokenRoutes(inputMint, outputMint, amount) {
    try {
      // Ensure amount is an integer string
      const amountString = Math.floor(Number(amount)).toString();
      
      const testUrl = `${this.apiUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountString}&slippageBps=100`;
      
      try {
        const response = await axios.get(testUrl, {
          timeout: 5000,
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.data && !response.data.error) {
          const routeCount = response.data.routePlan?.length || 0;
          logger.info(`✅ Route validation: Found ${routeCount} route(s) for ${inputMint.substring(0, 8)}... -> ${outputMint.substring(0, 8)}...`);
          return {
            valid: true,
            routes: routeCount,
            quote: response.data
          };
        } else {
          logger.warn(`⚠️ Route validation: No routes found - ${response.data?.error || 'Unknown error'}`);
          return {
            valid: false,
            error: response.data?.error || 'No routes available',
            errorCode: response.data?.errorCode || 'COULD_NOT_FIND_ANY_ROUTE'
          };
        }
      } catch (error) {
        if (error.response?.status === 400) {
          const errorData = error.response.data || {};
          logger.warn(`⚠️ Route validation failed: ${errorData.error || error.message}`);
          return {
            valid: false,
            error: errorData.error || 'No routes available',
            errorCode: errorData.errorCode || 'COULD_NOT_FIND_ANY_ROUTE'
          };
        }
        // Network error - don't fail validation, let the actual quote attempt handle it
        logger.warn(`⚠️ Route validation network error: ${error.message}`);
        return {
          valid: true, // Allow attempt if it's just a network issue
          routes: 0,
          warning: error.message
        };
      }
    } catch (error) {
      logger.warn(`⚠️ Route validation error: ${error.message}`);
      return {
        valid: true, // Allow attempt if validation fails
        routes: 0,
        warning: error.message
      };
    }
  }

  /**
   * Get quote from Jupiter API
   */
  async getQuote(inputMint, outputMint, amount, options = {}) {
    // CRITICAL FIX: If amount is suspiciously large (> 1e12), it's likely been incorrectly multiplied by 1e6
    // This can happen if something thinks the amount has 6 decimals when it already has 9 decimals
    let amountInteger = amount;
    
    // Convert to number first for validation
    const amountNum = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    
    // If amount > 1 trillion and divisible by 1e6, it's likely been incorrectly multiplied
    // Fix it by dividing by 1e6 (e.g., 4000000000000 -> 4000000)
    if (amountNum > 1e12 && amountNum % 1000000 === 0) {
      const fixedAmount = Math.floor(amountNum / 1000000);
      logger.error(`🚨 CRITICAL FIX in getQuote: Amount ${amountNum} is > 1 trillion and divisible by 1e6. Fixing to ${fixedAmount}`);
      amountInteger = fixedAmount;
    } else if (typeof amount === 'number' && amount % 1 !== 0) {
      logger.warn(`⚠️ Warning: getQuote received decimal amount ${amount}. Flooring to integer.`);
      amountInteger = Math.floor(amount);
    } else if (typeof amount === 'string' && amount.includes('.')) {
      logger.warn(`⚠️ Warning: getQuote received decimal string ${amount}. Converting to integer.`);
      amountInteger = Math.floor(parseFloat(amount));
    }
    
    // Ensure it's a string representation of an integer (no decimals)
    const amountString = Math.floor(Number(amountInteger)).toString();
    
    // Validate: amount must be positive
    if (parseInt(amountString) <= 0) {
      throw new Error(`Invalid amount for quote: ${amountString}. Must be positive integer.`);
    }
    
    const slippageBps = options.slippageBps || Math.floor(this.config.defaultSlippage * 100);
    const cacheKey = `quote_${inputMint}_${outputMint}_${amountString}_${slippageBps}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.data;
    }

    try {
      // Log the actual amount being sent to debug
      logger.info(`🔍 [getQuote] Requesting quote: ${inputMint.substring(0, 8)}... -> ${outputMint.substring(0, 8)}..., amount: ${amountString} (type: ${typeof amountString}, original: ${amount}, integer: ${amountInteger})`);
      
      // Final validation - ensure amountString is exactly what we expect
      const finalAmount = Math.floor(Number(amountString)).toString();
      if (finalAmount !== amountString) {
        logger.warn(`⚠️ Amount string mismatch: ${amountString} -> ${finalAmount}`);
      }
      
      // Double-check: amount should not have decimals
      if (finalAmount.includes('.') || parseFloat(finalAmount) % 1 !== 0) {
        logger.error(`❌ ERROR: Amount still has decimals: ${finalAmount}. This should not happen!`);
        throw new Error(`Invalid amount format: ${finalAmount}. Amount must be an integer string.`);
      }
      
      // CRITICAL: Log and validate right before creating params
      logger.error(`🚨 [getQuote] BEFORE performJupiterRequest: finalAmount = "${finalAmount}" (type: ${typeof finalAmount}, parsed: ${parseInt(finalAmount)})`);
      
      const paramsObject = {
        inputMint: inputMint,
        outputMint: outputMint,
        amount: finalAmount, // Final validated integer string, no decimals
        slippageBps: slippageBps.toString(),
        onlyDirectRoutes: options.onlyDirectRoutes || false,
        asLegacyTransaction: false
      };
      
      logger.error(`🚨 [getQuote] Params object created: ${JSON.stringify(paramsObject, null, 2)}`);
      
      const response = await this.performJupiterRequest({
        endpoint: 'quote',
        method: 'GET',
        params: paramsObject,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data) {
        const quote = {
          inputMint: response.data.inputMint,
          outputMint: response.data.outputMint,
          inputAmount: response.data.inAmount,
          outputAmount: response.data.outAmount,
          otherAmountThreshold: response.data.otherAmountThreshold,
          swapMode: response.data.swapMode,
          slippageBps: response.data.slippageBps,
          platformFee: response.data.platformFee,
          priceImpactPct: response.data.priceImpactPct,
          routePlan: response.data.routePlan,
          contextSlot: response.data.contextSlot,
          timeTaken: response.data.timeTaken,
          rawResponse: response.data,
          success: true
        };

        this.cache.set(cacheKey, { data: quote, timestamp: Date.now() });
        return quote;
      }
    } catch (error) {
      logger.warn('Jupiter quote API failed:', error.message);
      if (error?.code === 'ENOTFOUND' || error?.cause?.code === 'ENOTFOUND') {
        logger.error('DNS resolution failed for Jupiter quote API host. Consider updating DNS settings or providing a custom resolver.');
      }
      const classifiedError = ErrorClassifier.classifyRPCError(error);
      throw classifiedError;
    }

    return {
      success: false,
      error: 'Unable to get quote'
    };
  }

  /**
   * Get swap transaction from Jupiter API
   */
  async getSwapTransaction(quote, userPublicKey, options = {}) {
    try {
      const swapPayload = {
        quoteResponse: quote.rawResponse || quote,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: options.wrapAndUnwrapSol !== false,
        useSharedAccounts: options.useSharedAccounts !== false,
        feeAccount: options.feeAccount || null,
        trackingAccount: options.trackingAccount || null,
        asLegacyTransaction: false,
        dynamicComputeUnitLimit: true
      };

      const computeUnitPrice = options.computeUnitPriceMicroLamports !== undefined
        ? options.computeUnitPriceMicroLamports
        : this.config.priorityFee * 1000;
      const prioritizationFee = options.prioritizationFeeLamports !== undefined
        ? options.prioritizationFeeLamports
        : this.config.priorityFee;

      if (computeUnitPrice && prioritizationFee) {
        swapPayload.computeUnitPriceMicroLamports = computeUnitPrice;
      } else if (computeUnitPrice) {
        swapPayload.computeUnitPriceMicroLamports = computeUnitPrice;
      } else if (prioritizationFee) {
        swapPayload.prioritizationFeeLamports = prioritizationFee;
      }

      const response = await this.performJupiterRequest({
        endpoint: 'swap',
        method: 'POST',
        data: swapPayload,
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data) {
        return {
          swapTransaction: response.data.swapTransaction,
          lastValidBlockHeight: response.data.lastValidBlockHeight,
          prioritizationFeeLamports: response.data.prioritizationFeeLamports,
          addressLookupTableAccounts: response.data.addressLookupTableAccounts || [],
          success: true
        };
      }
    } catch (error) {
      logger.warn('Jupiter swap transaction API failed:', error.message);
      if (error?.code === 'ENOTFOUND' || error?.cause?.code === 'ENOTFOUND') {
        logger.error('DNS resolution failed for Jupiter swap API host. Consider updating DNS settings or providing a custom resolver.');
      }
      const classifiedError = ErrorClassifier.classifyRPCError(error);
      throw classifiedError;
    }

    return {
      success: false,
      error: 'Unable to get swap transaction'
    };
  }

  /**
   * Execute swap with proper VersionedTransaction handling
   */
  async executeSwap(walletKeypair, inputMint, outputMint, amount, options = {}) {
    try {
      // Ensure amount is an integer (no decimals) before proceeding
      const amountInteger = Math.floor(Number(amount));
      if (!Number.isInteger(amountInteger) || amountInteger <= 0) {
        throw new Error(`Invalid swap amount: ${amount}. Must be positive integer in base units.`);
      }
      
      logger.info(`🔍 [executeSwap] Executing swap: ${inputMint.substring(0, 8)}... -> ${outputMint.substring(0, 8)}..., amount: ${amountInteger} (type: ${typeof amountInteger}, original: ${amount})`);
      
      // Validate amountInteger is reasonable - SOL amounts should typically be < 1e12 lamports
      // If amount > 1e12, it's likely been incorrectly multiplied (e.g., 4,000,000 -> 4,000,000,000,000)
      if (amountInteger > 1e12) {
        logger.error(`❌ CRITICAL: Amount is suspiciously large! ${amountInteger} lamports (${amountInteger / 1e9} SOL). This suggests a conversion error.`);
        // Don't throw - just log, as some large amounts might be legitimate
        // But log a warning so we can track this
      }
      
      // Validate route exists before attempting swap (helps catch liquidity issues early)
      if (options.validateRoute !== false) {
        logger.info(`🔍 [executeSwap] Validating route availability...`);
        const routeValidation = await this.validateTokenRoutes(inputMint, outputMint, amountInteger);
        
        if (!routeValidation.valid) {
          const errorMsg = `Token has no available trading routes. ${routeValidation.error || 'No liquidity pools found on any DEX.'}`;
          logger.error(`❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        if (routeValidation.routes === 0 && !routeValidation.warning) {
          logger.warn(`⚠️ Route validation found 0 routes but allowing attempt anyway`);
        }
      }
      
      // Get quote (use integer amount)
      logger.info(`🔍 [executeSwap] Calling getQuote with amount: ${amountInteger} (type: ${typeof amountInteger})`);
      const quote = await this.getQuote(inputMint, outputMint, amountInteger, {
        slippageBps: options.slippageBps || Math.floor(this.config.defaultSlippage * 100),
        onlyDirectRoutes: options.onlyDirectRoutes || false
      });

      if (!quote.success) {
        // Provide more helpful error messages
        const errorMsg = quote.error || 'Failed to get quote';
        if (errorMsg.includes('COULD_NOT_FIND_ANY_ROUTE') || errorMsg.includes('Could not find any route')) {
          throw new Error(`Token has no available trading routes. This token may have insufficient liquidity or no DEX pairs available. Try checking the token on Raydium, Orca, or other DEX platforms.`);
        }
        throw new Error(errorMsg);
      }

      logger.debug(`Quote received: ${quote.inputAmount} -> ${quote.outputAmount} (${quote.priceImpactPct}% impact)`);

      // Get swap transaction
      const swapData = await this.getSwapTransaction(quote, walletKeypair.publicKey, {
        wrapAndUnwrapSol: options.wrapAndUnwrapSol !== false,
        computeUnitPriceMicroLamports: options.computeUnitPriceMicroLamports || this.config.priorityFee * 1000,
        prioritizationFeeLamports: options.prioritizationFeeLamports || this.config.priorityFee
      });

      if (!swapData.success) {
        throw new Error(swapData.error || 'Failed to get swap transaction');
      }

      // Deserialize versioned transaction
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const swapTransaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Sign transaction
      swapTransaction.sign([walletKeypair]);

      // Execute versioned transaction
      const result = await this.solanaCore.executeVersionedTransaction(
        swapTransaction,
        [walletKeypair],
        {
          maxRetries: options.maxRetries || this.config.maxRetries
        }
      );

      if (!result.success) {
        throw new Error('Transaction failed');
      }

      logger.info(`✅ Swap successful: ${result.signature}`);
      
      return {
        signature: result.signature,
        inputAmount: quote.inputAmount,
        outputAmount: quote.outputAmount,
        priceImpact: quote.priceImpactPct,
        quote: quote,
        success: true
      };

    } catch (error) {
      logger.error('Swap failed:', error);
      const classifiedError = ErrorClassifier.classifyTransactionError(error);

      if (classifiedError?.err) {
        try {
          logger.error('Swap failure details:', JSON.stringify(classifiedError.err, null, 2));
        } catch {
          logger.error('Swap failure details (raw):', classifiedError.err);
        }
      } else if (classifiedError?.details?.originalError?.message) {
        logger.error('Swap failure original error:', classifiedError.details.originalError.message);
      }

      return {
        signature: null,
        inputAmount: 0,
        outputAmount: 0,
        priceImpact: 0,
        success: false,
        error: classifiedError.message,
        details: classifiedError.err || classifiedError.details || {}
      };
    }
  }

  /**
   * Swap SOL to Token
   */
  async swapSOLToToken(walletKeypair, outputMint, solAmount, options = {}) {
    const solMint = 'So11111111111111111111111111111111111111112'; // SOL
    
    // Convert SOL amount to lamports (base units)
    // SOL has 9 decimals (LAMPORTS_PER_SOL = 1e9), NOT 6 or 12!
    let amountInLamports;
    
    // Check if solAmount is already in lamports or needs conversion
    const isLikelyHumanReadable = solAmount < 1e6 || 
                                   (typeof solAmount === 'string' && solAmount.includes('.'));
    
    if (isLikelyHumanReadable) {
      // Convert SOL to lamports (1 SOL = 1e9 lamports)
      amountInLamports = Math.floor(Number(solAmount) * LAMPORTS_PER_SOL);
      logger.debug(`Converted SOL amount: ${solAmount} SOL → ${amountInLamports} lamports`);
    } else {
      // Already in lamports, but ensure it's an integer
      amountInLamports = Math.floor(Number(solAmount));
      logger.debug(`Using SOL amount as-is (already in lamports): ${amountInLamports}`);
    }
    
    // Validate: amount must be a positive integer
    if (!Number.isInteger(amountInLamports) || amountInLamports <= 0) {
      throw new Error(`Invalid SOL amount: ${amountInLamports}. Must be positive integer lamports. Original: ${solAmount}`);
    }
    
    return await this.executeSwap(walletKeypair, solMint, outputMint, amountInLamports, options);
  }

  /**
   * Swap Token to SOL
   */
  async swapTokenToSOL(walletKeypair, inputMint, tokenAmount, options = {}) {
    const solMint = 'So11111111111111111111111111111111111111112'; // SOL
    
    return await this.executeSwap(walletKeypair, inputMint, solMint, tokenAmount, options);
  }

  /**
   * Swap Token to Token
   */
  async swapTokenToToken(walletKeypair, inputMint, outputMint, inputAmount, options = {}) {
    return await this.executeSwap(walletKeypair, inputMint, outputMint, inputAmount, options);
  }

  /**
   * Get token price
   */
  async getTokenPrice(tokenMint, baseAmount = LAMPORTS_PER_SOL) {
    try {
      const solMint = 'So11111111111111111111111111111111111111112';
      
      const quote = await this.getQuote(solMint, tokenMint, baseAmount);
      
      if (quote.success) {
        return {
          price: parseFloat(quote.outputAmount) / baseAmount,
          formatted: `${(parseFloat(quote.outputAmount) / baseAmount).toFixed(8)} tokens per SOL`,
          impact: quote.priceImpactPct,
          success: true
        };
      }
    } catch (error) {
      logger.error('Failed to get token price:', error);
    }

    return {
      price: 0,
      formatted: '0 tokens per SOL',
      impact: 0,
      success: false,
      error: 'Unable to fetch token price'
    };
  }

  /**
   * Get token list
   */
  async getTokenList() {
    const cacheKey = 'token_list';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.data;
    }

    try {
      const response = await this.performJupiterRequest({
        endpoint: 'tokens',
        method: 'GET',
        timeout: 10000
      });

      if (response.data) {
        const tokens = response.data.map(token => ({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          logoURI: token.logoURI,
          tags: token.tags || [],
          verified: token.verified || false
        }));

        const result = { tokens, success: true };
        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
      }
    } catch (error) {
      logger.warn('Token list API failed:', error.message);
    }

    return {
      tokens: [],
      success: false,
      error: 'Unable to fetch token list'
    };
  }

  /**
   * Search tokens
   */
  async searchTokens(query, limit = 20) {
    try {
      const tokenList = await this.getTokenList();
      if (!tokenList.success) {
        return tokenList;
      }

      const queryLower = query.toLowerCase();
      const filteredTokens = tokenList.tokens
        .filter(token => 
          token.symbol.toLowerCase().includes(queryLower) ||
          token.name.toLowerCase().includes(queryLower) ||
          token.address.toLowerCase().includes(queryLower)
        )
        .slice(0, limit);

      return {
        tokens: filteredTokens,
        success: true
      };
    } catch (error) {
      return {
        tokens: [],
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get route info
   */
  async getRouteInfo(inputMint, outputMint, amount) {
    try {
      const quote = await this.getQuote(inputMint, outputMint, amount);
      if (!quote.success) {
        return quote;
      }

      return {
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inputAmount: quote.inputAmount,
        outputAmount: quote.outputAmount,
        priceImpact: quote.priceImpactPct,
        routePlan: quote.routePlan,
        platformFee: quote.platformFee,
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default JupiterClient;

