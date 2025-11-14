/**
 * PumpFun Client
 * Production-ready PumpFun integration using pumpfun-sdk for all on-chain transactions
 * All operations use real on-chain transactions via the official SDK
 */

import { 
  PublicKey, 
  Keypair, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount
} from '@solana/spl-token';
import { deserializeMetadata } from '@metaplex-foundation/mpl-token-metadata';
import axios from 'axios';
import bs58 from 'bs58';
import { API_ENDPOINTS, PROGRAM_IDS } from '../../config/constants.js';
import { loggerManager } from '../../utils/logger.js';
import { ErrorClassifier } from '../../utils/errors.js';
import TransactionBuilder from '../../core/TransactionBuilder.js';
import AccountManager from '../../core/AccountManager.js';

const logger = loggerManager.getLogger('PumpFunClient');

/**
 * PumpFun Client Class
 */
export class PumpFunClient {
  constructor(solanaCore, config = {}) {
    this.solanaCore = solanaCore;
    this.connection = solanaCore.getConnection();
    this.config = {
      pumpFunProgramId: PROGRAM_IDS.PUMPFUN_PROGRAM,
      apiBaseUrl: API_ENDPOINTS.PUMPFUN,
      defaultSlippage: config.defaultSlippage || 1.0,
      maxRetries: config.maxRetries || 3,
      metadataFallback: config.metadataFallback || null,
      pumpPortal: config.pumpPortal || {},
      ...config
    };

    this.transactionBuilder = new TransactionBuilder(this.connection);
    this.accountManager = new AccountManager(this.connection);
    this.cache = new Map();
    this.isInitialized = false;
    this.metadataProgramId = new PublicKey(PROGRAM_IDS.METAPLEX_METADATA_PROGRAM);
    
    this.initialize();
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info('Initializing PumpFun Client...');
    
    // Verify PumpFun program exists
    try {
      const programId = new PublicKey(this.config.pumpFunProgramId);
      const programInfo = await this.connection.getAccountInfo(programId);
      if (!programInfo) {
        throw new Error('PumpFun program not found');
      }
      logger.info('✅ PumpFun program verified');
    } catch (error) {
      logger.error('Failed to verify PumpFun program:', error);
      throw error;
    }

    this.isInitialized = true;
    logger.info('✅ PumpFun Client initialized');
  }

  /**
   * Get token info from PumpFun API
   */
  async getTokenInfo(tokenMint) {
    const cacheKey = `pumpfun_token_${tokenMint}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }

    try {
      const response = await axios.get(`${this.config.apiBaseUrl}/coins/${tokenMint}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.data) {
        const totalSupplyRaw = Number(response.data.total_supply) || 0;
        const decimals = typeof response.data.decimals === 'number'
          ? response.data.decimals
          : (response.data.decimals ? Number(response.data.decimals) : 9);
        const marketCap = typeof response.data.usd_market_cap === 'number'
          ? response.data.usd_market_cap
          : (response.data.usd_market_cap ? Number(response.data.usd_market_cap) : null);
        const price = marketCap && totalSupplyRaw > 0
          ? marketCap / (totalSupplyRaw / Math.pow(10, decimals))
          : null;

        const metadataUri =
          response.data.metadata_uri ||
          response.data.metadataUri ||
          (response.data.metadata && response.data.metadata.uri) ||
          '';

        const unpackSocial = (key) =>
          response.data[key] ||
          (response.data.socials && response.data.socials[key]) ||
          (response.data.metadata && response.data.metadata[key]) ||
          null;

        const tokenData = {
          mint: tokenMint,
          name: response.data.name || 'Unknown',
          symbol: response.data.symbol || 'UNK',
          description: response.data.description || (response.data.metadata && response.data.metadata.description) || '',
          image: response.data.image_uri || response.data.imageUri || response.data.image || response.data.imageUrl || response.data.image_url || '',
          metadataUri,
          twitter: unpackSocial('twitter'),
          telegram: unpackSocial('telegram'),
          website: unpackSocial('website'),
          marketCap,
          price,
          totalSupply: totalSupplyRaw,
          decimals,
          bondingCurve: response.data.bonding_curve || null,
          isComplete: response.data.complete || false,
          createdTimestamp: response.data.created_timestamp || 0,
          success: true
        };

        this.cache.set(cacheKey, { data: tokenData, timestamp: Date.now() });
        return tokenData;
      }
    } catch (error) {
      // Silently handle expected API failures (5xx errors, network issues)
      const errorMessage = error.message || String(error);
      const isExpectedError = errorMessage.includes('530') || 
                             errorMessage.includes('503') || 
                             errorMessage.includes('502') ||
                             errorMessage.includes('504') ||
                             errorMessage.includes('ECONNREFUSED') ||
                             errorMessage.includes('ETIMEDOUT') ||
                             errorMessage.includes('timeout');
      
      if (!isExpectedError) {
        logger.warn('PumpFun API failed:', error.message);
      } else {
        logger.debug('PumpFun API unavailable (expected):', error.message);
      }
    }

    const onChainFallback = await this.fetchOnChainTokenInfo(tokenMint);
    if (onChainFallback) {
      this.cache.set(cacheKey, { data: onChainFallback, timestamp: Date.now() });
      return onChainFallback;
    }

    return {
      mint: tokenMint,
      name: 'Unknown Token',
      symbol: 'UNK',
      success: false,
      error: 'Unable to fetch token info'
    };
  }

  resolveMetadataUri(uri) {
    if (!uri || typeof uri !== 'string') {
      return '';
    }

    if (uri.startsWith('ipfs://')) {
      return `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
    }

    return uri;
  }

  sanitizeString(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }

    return value.replace(/\0/g, '').trim();
  }

  async fetchOnChainTokenInfo(tokenMint) {
    try {
      const mintKey = new PublicKey(tokenMint);
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('metadata'), this.metadataProgramId.toBuffer(), mintKey.toBuffer()],
        this.metadataProgramId
      );

      const accountInfo = await this.connection.getAccountInfo(metadataPda);
      if (!accountInfo) {
        logger.debug(`No on-chain metadata account found for mint ${tokenMint} (this is normal for some tokens)`);
        return null;
      }

      const rawAccount = {
        publicKey: metadataPda.toBase58(),
        owner: this.metadataProgramId.toBase58(),
        executable: accountInfo.executable,
        lamports: BigInt(accountInfo.lamports),
        rentEpoch: typeof accountInfo.rentEpoch === 'number'
          ? BigInt(accountInfo.rentEpoch)
          : undefined,
        data: accountInfo.data instanceof Uint8Array
          ? accountInfo.data
          : new Uint8Array(accountInfo.data)
      };

      const metadataAccount = deserializeMetadata(rawAccount);
      if (!metadataAccount) {
        logger.warn(`Unable to deserialize metadata account for mint ${tokenMint}`);
        return null;
      }

      const tokenMetadata = metadataAccount;

      const metadataUri = this.resolveMetadataUri(
        this.sanitizeString(tokenMetadata.uri)
      );
      const name = this.sanitizeString(tokenMetadata.name) || 'Unknown';
      const symbol = this.sanitizeString(tokenMetadata.symbol) || 'UNK';

      let decimals = 9;
      let totalSupply = 0;

      try {
        const supplyInfo = await this.connection.getTokenSupply(mintKey);
        if (supplyInfo?.value) {
          decimals = typeof supplyInfo.value.decimals === 'number'
            ? supplyInfo.value.decimals
            : decimals;

          if (typeof supplyInfo.value.uiAmount === 'number') {
            totalSupply = supplyInfo.value.uiAmount;
          } else if (supplyInfo.value.amount) {
            totalSupply = Number(supplyInfo.value.amount) / Math.pow(10, decimals);
          }
        }
      } catch (supplyError) {
        logger.warn(`Unable to fetch token supply for ${tokenMint}:`, supplyError.message);
      }

      if (!totalSupply) {
        try {
          const parsedInfo = await this.connection.getParsedAccountInfo(mintKey);
          const mintInfo = parsedInfo?.value?.data?.parsed?.info;
          if (mintInfo) {
            decimals = typeof mintInfo.decimals === 'number'
              ? mintInfo.decimals
              : decimals;
            if (mintInfo.supply) {
              totalSupply = Number(mintInfo.supply) / Math.pow(10, decimals);
            }
          }
        } catch (parsedError) {
          logger.warn(`Unable to parse mint account for ${tokenMint}:`, parsedError.message);
        }
      }

      return {
        mint: tokenMint,
        name,
        symbol,
        description: '',
        image: '',
        metadataUri,
        twitter: null,
        telegram: null,
        website: null,
        marketCap: null,
        price: null,
        totalSupply,
        decimals,
        bondingCurve: null,
        isComplete: null,
        createdTimestamp: null,
        success: true,
        source: 'on-chain'
      };
    } catch (error) {
      logger.error(`On-chain metadata fallback failed for ${tokenMint}:`, error);
      return null;
    }
  }

  async fetchMetadataFromUri(metadataUri) {
    const normalized = this.resolveMetadataUri(metadataUri);

    if (!normalized) {
      return null;
    }

    const cacheKey = `pumpfun_metadata_${normalized}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.data;
    }

    try {
      const response = await axios.get(normalized, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (ChaosBot/PumpFunClient)'
        }
      });

      if (response.data && typeof response.data === 'object') {
        // Extract image from various possible field names
        const metadata = response.data;
        let image = null;
        
        // Try common image field names
        if (metadata.image) {
          image = metadata.image;
        } else if (metadata.imageUri) {
          image = metadata.imageUri;
        } else if (metadata.image_uri) {
          image = metadata.image_uri;
        } else if (metadata.imageUrl) {
          image = metadata.imageUrl;
        } else if (metadata.image_url) {
          image = metadata.image_url;
        } else if (metadata.properties?.image) {
          image = metadata.properties.image;
        } else if (metadata.properties?.files && Array.isArray(metadata.properties.files)) {
          // Try to find image in files array
          const imageFile = metadata.properties.files.find(f => 
            f.type && f.type.startsWith('image/')
          );
          if (imageFile && imageFile.uri) {
            image = imageFile.uri;
          }
        }
        
        // If image found, add it to metadata
        if (image) {
          metadata.image = image;
        }
        
        this.cache.set(cacheKey, { data: metadata, timestamp: Date.now() });
        return metadata;
      }
    } catch (error) {
      logger.warn(`Failed to fetch metadata URI ${normalized}:`, error.message);
    }

    return null;
  }

  async buildMetadataFromMint(tokenMint) {
    // First, check local metadata store (for tokens launched through this app)
    if (this.config.metadataFallback && typeof this.config.metadataFallback.getByMint === 'function') {
      try {
        const localMetadata = this.config.metadataFallback.getByMint(tokenMint);
        if (localMetadata) {
          logger.info(`✅ Found local metadata for ${tokenMint}`);
          const mintKey = new PublicKey(tokenMint);
          let decimals = 9;
          let totalSupply = 0;
          
          try {
            const supplyInfo = await this.connection.getTokenSupply(mintKey);
            if (supplyInfo?.value) {
              decimals = typeof supplyInfo.value.decimals === 'number'
                ? supplyInfo.value.decimals
                : decimals;
              if (typeof supplyInfo.value.uiAmount === 'number') {
                totalSupply = supplyInfo.value.uiAmount;
              } else if (supplyInfo.value.amount) {
                totalSupply = Number(supplyInfo.value.amount) / Math.pow(10, decimals);
              }
            }
          } catch (supplyError) {
            logger.warn(`Unable to fetch token supply for ${tokenMint}:`, supplyError.message);
          }

          const info = {
            mint: tokenMint,
            name: localMetadata.name || `Token ${tokenMint.slice(0, 8)}`,
            symbol: localMetadata.symbol || 'TOKEN',
            description: localMetadata.description || '',
            image: localMetadata.image || '',
            metadataUri: null,
            twitter: localMetadata.twitter || null,
            telegram: localMetadata.telegram || null,
            website: localMetadata.website || null,
            marketCap: null,
            price: null,
            totalSupply,
            decimals,
            bondingCurve: null,
            isComplete: null,
            createdTimestamp: null,
            success: true,
            source: 'local'
          };

          return {
            metadata: {
              name: info.name,
              symbol: info.symbol,
              description: info.description,
              image: info.image,
              twitter: info.twitter,
              telegram: info.telegram,
              website: info.website
            },
            info
          };
        }
      } catch (localError) {
        logger.warn(`Local metadata lookup failed for ${tokenMint}:`, localError.message);
      }
    }

    let info = await this.getTokenInfo(tokenMint);

    // If API failed, try direct on-chain lookup
    if (!info.success) {
      logger.debug(`PumpFun API unavailable for ${tokenMint}, using on-chain fallback...`);
      const onChainInfo = await this.fetchOnChainTokenInfo(tokenMint);
      
      if (onChainInfo) {
        info = onChainInfo;
      } else {
        // Last resort: verify mint exists and create minimal info
        try {
          const mintKey = new PublicKey(tokenMint);
          const mintInfo = await this.connection.getParsedAccountInfo(mintKey);
          
          if (!mintInfo?.value) {
            throw new Error(`Token mint ${tokenMint} does not exist on-chain`);
          }

          // Mint exists, create minimal metadata
          const mintData = mintInfo.value.data?.parsed?.info;
          const decimals = mintData?.decimals ?? 9;
          const supply = mintData?.supply 
            ? Number(mintData.supply) / Math.pow(10, decimals)
            : 0;

          info = {
            mint: tokenMint,
            name: `Token ${tokenMint.slice(0, 8)}`,
            symbol: 'TOKEN',
            description: '',
            image: '',
            metadataUri: null,
            twitter: null,
            telegram: null,
            website: null,
            marketCap: null,
            price: null,
            totalSupply: supply,
            decimals,
            bondingCurve: null,
            isComplete: null,
            createdTimestamp: null,
            success: true,
            source: 'minimal'
          };
        } catch (mintError) {
          throw new Error(`Unable to fetch token info: ${mintError.message || info.error || 'Token not found'}`);
        }
      }
    }

    const metadata = {
      name: info.name || `Token ${tokenMint.slice(0, 8)}`,
      symbol: info.symbol || 'TOKEN',
      description: info.description || '',
      image: info.image || '',
      twitter: info.twitter || undefined,
      telegram: info.telegram || undefined,
      website: info.website || undefined
    };

    if (info.metadataUri) {
      try {
        const remote = await this.fetchMetadataFromUri(info.metadataUri);
        if (remote) {
          metadata.description = remote.description || metadata.description;
          metadata.image = remote.image || metadata.image;
          metadata.twitter = remote.twitter || metadata.twitter;
          metadata.telegram = remote.telegram || metadata.telegram;
          metadata.website = remote.website || remote.external_url || metadata.website;
        }
      } catch (uriError) {
        logger.warn(`Failed to fetch metadata from URI ${info.metadataUri}:`, uriError.message);
        // Continue with existing metadata
      }
    }

    return {
      metadata,
      info
    };
  }

  /**
   * Get bonding curve data
   */
  async getBondingCurveData(tokenMint) {
    try {
      const response = await axios.get(`${this.config.apiBaseUrl}/coins/${tokenMint}/bonding-curve`, {
        timeout: 10000
      });

      if (response.data) {
        return {
          virtualSolReserves: response.data.virtual_sol_reserves || 0,
          virtualTokenReserves: response.data.virtual_token_reserves || 0,
          realSolReserves: response.data.real_sol_reserves || 0,
          realTokenReserves: response.data.real_token_reserves || 0,
          complete: response.data.complete || false,
          success: true
        };
      }
    } catch (error) {
      // Silently handle expected API failures
      const errorMessage = error.message || String(error);
      const isExpectedError = errorMessage.includes('530') || 
                             errorMessage.includes('503') || 
                             errorMessage.includes('502') ||
                             errorMessage.includes('504');
      
      if (!isExpectedError) {
        logger.warn('Bonding curve API failed:', error.message);
      } else {
        logger.debug('Bonding curve API unavailable (expected):', error.message);
      }
    }

    return {
      success: false,
      error: 'Unable to fetch bonding curve data'
    };
  }

  /**
   * Calculate buy amount (tokens received for SOL)
   */
  async calculateBuyAmount(solAmount, tokenMint) {
    try {
      const bondingCurve = await this.getBondingCurveData(tokenMint);
      
      if (!bondingCurve.success) {
        return {
          tokenAmount: 0,
          priceImpact: 0,
          success: false,
          error: bondingCurve.error
        };
      }

      const { virtualSolReserves, virtualTokenReserves } = bondingCurve;
      const solAmountLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      
      // Constant product formula: x * y = k
      const k = virtualSolReserves * virtualTokenReserves;
      const newSolReserves = virtualSolReserves + solAmountLamports;
      const newTokenReserves = k / newSolReserves;
      const tokenAmount = virtualTokenReserves - newTokenReserves;
      
      // Calculate price impact
      const priceBefore = virtualSolReserves / virtualTokenReserves;
      const priceAfter = newSolReserves / newTokenReserves;
      const priceImpact = ((priceAfter - priceBefore) / priceBefore) * 100;

      return {
        tokenAmount: Math.floor(tokenAmount),
        priceImpact: priceImpact,
        success: true
      };
    } catch (error) {
      logger.error('Failed to calculate buy amount:', error);
      return {
        tokenAmount: 0,
        priceImpact: 0,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate sell amount (SOL received for tokens)
   */
  async calculateSellAmount(tokenAmount, tokenMint) {
    try {
      const bondingCurve = await this.getBondingCurveData(tokenMint);
      
      if (!bondingCurve.success) {
        return {
          solAmount: 0,
          priceImpact: 0,
          success: false,
          error: bondingCurve.error
        };
      }

      const { virtualSolReserves, virtualTokenReserves } = bondingCurve;
      
      // Constant product formula: x * y = k
      const k = virtualSolReserves * virtualTokenReserves;
      const newTokenReserves = virtualTokenReserves + tokenAmount;
      const newSolReserves = k / newTokenReserves;
      const solAmount = virtualSolReserves - newSolReserves;
      
      // Calculate price impact
      const priceBefore = virtualSolReserves / virtualTokenReserves;
      const priceAfter = newSolReserves / newTokenReserves;
      const priceImpact = ((priceBefore - priceAfter) / priceBefore) * 100;

      return {
        solAmount: solAmount / LAMPORTS_PER_SOL,
        priceImpact: priceImpact,
        success: true
      };
    } catch (error) {
      logger.error('Failed to calculate sell amount:', error);
      return {
        solAmount: 0,
        priceImpact: 0,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Note: Instruction building is not needed as we use pumpfun-sdk for all real transactions.
   * The SDK handles all instruction building, account derivation, and transaction construction.
   */

  /**
   * Buy token on PumpFun
   */
  async buyToken(walletKeypair, tokenMint, solAmount, options = {}) {
    try {
      logger.info(`Buying ${solAmount} SOL worth of ${tokenMint} on PumpFun`);

      // Calculate expected token amount
      const calculation = await this.calculateBuyAmount(solAmount, tokenMint);
      if (!calculation.success) {
        throw new Error(calculation.error);
      }

      // Use pumpfun-sdk for REAL on-chain buy (100% real transaction)
      try {
        const pumpfunSdk = await import('pumpfun-sdk');
        const { pumpFunBuy, TransactionMode } = pumpfunSdk;
        
        const privateKeyBase58 = bs58.encode(walletKeypair.secretKey);
        const slippageDecimal = (options.slippage || this.config.defaultSlippage) / 100;
        const priorityFeeSol = ((options.priorityFee || 5000) / 1e9);
        
        logger.info(`Slippage: ${(slippageDecimal * 100).toFixed(2)}%, Priority Fee: ${priorityFeeSol} SOL`);
        
        const result = await pumpFunBuy(
          TransactionMode.Execution,
          privateKeyBase58,
          tokenMint.toString(),
          solAmount,
          priorityFeeSol,
          slippageDecimal,
          {
            rpcUrl: this.connection.rpcEndpoint,
            commitment: 'confirmed',
            trackTx: true
          }
        );
        
        if (result && result.signature) {
          logger.info(`✅ REAL buy successful: ${result.signature}`);
          return {
            success: true,
            signature: result.signature,
            solAmount: solAmount,
            tokenAmount: result.expectedOutput || calculation.tokenAmount,
            priceImpact: calculation.priceImpact,
            transaction: result,
            viewOnExplorer: `https://solscan.io/tx/${result.signature}`
          };
        }
        
        throw new Error('Buy transaction failed - no signature returned');
      } catch (error) {
        logger.error('REAL buy failed:', error);
        throw new Error(`Buy failed: ${error.message}`);
      }
    } catch (error) {
      logger.error('Buy failed:', error);
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      return {
        signature: null,
        tokenAmount: 0,
        solAmount: 0,
        success: false,
        error: classifiedError.message
      };
    }
  }

  /**
   * Sell token on PumpFun (REAL on-chain transaction)
   */
  async sellToken(walletKeypair, tokenMint, tokenAmount, options = {}) {
    try {
      logger.info(`💰 Executing REAL sell: ${tokenAmount} tokens of ${tokenMint}`);

      // Calculate expected SOL amount
      const calculation = await this.calculateSellAmount(tokenAmount, tokenMint);
      if (!calculation.success) {
        throw new Error(calculation.error);
      }

      // Use pumpfun-sdk for REAL on-chain sell (100% real transaction)
      try {
        const pumpfunSdk = await import('pumpfun-sdk');
        const { pumpFunSell, TransactionMode } = pumpfunSdk;
        
        const privateKeyBase58 = bs58.encode(walletKeypair.secretKey);
        const slippageDecimal = (options.slippage || this.config.defaultSlippage) / 100;
        const priorityFeeSol = ((options.priorityFee || 5000) / 1e9);
        
        logger.info(`Slippage: ${(slippageDecimal * 100).toFixed(2)}%, Priority Fee: ${priorityFeeSol} SOL`);
        
        const result = await pumpFunSell(
          TransactionMode.Execution,
          privateKeyBase58,
          tokenMint.toString(),
          tokenAmount,
          priorityFeeSol,
          slippageDecimal,
          {
            rpcUrl: this.connection.rpcEndpoint,
            commitment: 'confirmed',
            trackTx: true
          }
        );
        
        if (result && result.signature) {
          logger.info(`✅ REAL sell successful: ${result.signature}`);
          return {
            success: true,
            signature: result.signature,
            tokenAmount: tokenAmount,
            solAmount: result.expectedOutput || calculation.solAmount,
            priceImpact: calculation.priceImpact,
            transaction: result,
            viewOnExplorer: `https://solscan.io/tx/${result.signature}`
          };
        }
        
        throw new Error('Sell transaction failed - no signature returned');
      } catch (error) {
        logger.error('REAL sell failed:', error);
        throw new Error(`Sell failed: ${error.message}`);
      }
    } catch (error) {
      logger.error('Sell failed:', error);
      return {
        signature: null,
        tokenAmount: 0,
        solAmount: 0,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create and launch token on PumpFun
   */
  async createToken(walletKeypair, metadata, options = {}) {
    try {
      // Import TokenLaunch for token creation
      const { TokenLaunch } = await import('./TokenLaunch.js');
      const tokenLaunch = new TokenLaunch(this.solanaCore, this.config);
      await tokenLaunch.initialize();

      return await tokenLaunch.createToken(walletKeypair, metadata, options);
    } catch (error) {
      logger.error('Create token failed:', error);
      return {
        success: false,
        error: error.message,
        tokenMint: null,
        signature: null
      };
    }
  }

  /**
   * Launch token with initial buy
   */
  async launchToken(walletKeypair, metadata, initialBuyAmount = 0, options = {}) {
    try {
      // Import TokenLaunch for token launch
      const { TokenLaunch } = await import('./TokenLaunch.js');
      const tokenLaunch = new TokenLaunch(this.solanaCore, this.config);
      await tokenLaunch.initialize();

      return await tokenLaunch.launchToken(walletKeypair, metadata, initialBuyAmount, options);
    } catch (error) {
      logger.error('Launch token failed:', error);
      return {
        success: false,
        error: error.message,
        tokenMint: null,
        signature: null
      };
    }
  }

  /**
   * Get trending tokens
   */
  async getTrendingTokens(limit = 20) {
    try {
      const response = await axios.get(`${this.config.apiBaseUrl}/coins/trending?limit=${limit}`, {
        timeout: 10000
      });

      if (response.data && response.data.coins) {
        return {
          tokens: response.data.coins.map(coin => ({
            mint: coin.mint,
            name: coin.name,
            symbol: coin.symbol,
            price: coin.usd_market_cap / (coin.total_supply / Math.pow(10, coin.decimals)),
            marketCap: coin.usd_market_cap,
            volume24h: coin.volume_24h || 0,
            change24h: coin.change_24h || 0,
            image: coin.image_uri
          })),
          success: true
        };
      }
    } catch (error) {
      logger.warn('Trending tokens API failed:', error.message);
    }

    return {
      tokens: [],
      success: false,
      error: 'Unable to fetch trending tokens'
    };
  }
}

export default PumpFunClient;

