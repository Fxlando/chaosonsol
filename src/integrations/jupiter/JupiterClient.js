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
import { API_ENDPOINTS, PROGRAM_IDS } from '../../config/constants.js';
import { loggerManager } from '../../utils/logger.js';
import { ErrorClassifier } from '../../utils/errors.js';
import TransactionBuilder from '../../core/TransactionBuilder.js';
import AccountManager from '../../core/AccountManager.js';

const logger = loggerManager.getLogger('JupiterClient');

/**
 * Jupiter Client Class
 */
export class JupiterClient {
  constructor(solanaCore, config = {}) {
    this.solanaCore = solanaCore;
    this.connection = solanaCore.getConnection();
    this.config = {
      jupiterApiUrl: API_ENDPOINTS.JUPITER_V6,
      jupiterProgramId: PROGRAM_IDS.JUPITER_V6_PROGRAM,
      defaultSlippage: config.defaultSlippage || 1.0, // 1%
      maxRetries: config.maxRetries || 3,
      priorityFee: config.priorityFee || 1000,
      ...config
    };

    this.transactionBuilder = new TransactionBuilder(this.connection);
    this.accountManager = new AccountManager(this.connection);
    this.cache = new Map();
    this.isInitialized = false;
    
    this.initialize();
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
   * Get quote from Jupiter API
   */
  async getQuote(inputMint, outputMint, amount, options = {}) {
    const slippageBps = options.slippageBps || Math.floor(this.config.defaultSlippage * 100);
    const cacheKey = `quote_${inputMint}_${outputMint}_${amount}_${slippageBps}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.data;
    }

    try {
      const response = await axios.get(`${this.config.jupiterApiUrl}/quote`, {
        params: {
          inputMint: inputMint,
          outputMint: outputMint,
          amount: amount.toString(),
          slippageBps: slippageBps.toString(),
          onlyDirectRoutes: options.onlyDirectRoutes || false,
          asLegacyTransaction: false
        },
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
          success: true
        };

        this.cache.set(cacheKey, { data: quote, timestamp: Date.now() });
        return quote;
      }
    } catch (error) {
      logger.warn('Jupiter quote API failed:', error.message);
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
      const response = await axios.post(`${this.config.jupiterApiUrl}/swap`, {
        quoteResponse: quote,
        userPublicKey: userPublicKey.toString(),
        wrapAndUnwrapSol: options.wrapAndUnwrapSol !== false,
        useSharedAccounts: options.useSharedAccounts !== false,
        feeAccount: options.feeAccount || null,
        trackingAccount: options.trackingAccount || null,
        computeUnitPriceMicroLamports: options.computeUnitPriceMicroLamports || this.config.priorityFee * 1000,
        asLegacyTransaction: false,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: options.prioritizationFeeLamports || this.config.priorityFee
      }, {
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
      logger.info(`Executing swap: ${inputMint} -> ${outputMint}, amount: ${amount}`);

      // Get quote
      const quote = await this.getQuote(inputMint, outputMint, amount, {
        slippageBps: options.slippageBps || Math.floor(this.config.defaultSlippage * 100),
        onlyDirectRoutes: options.onlyDirectRoutes || false
      });

      if (!quote.success) {
        throw new Error(quote.error || 'Failed to get quote');
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
      return {
        signature: null,
        inputAmount: 0,
        outputAmount: 0,
        priceImpact: 0,
        success: false,
        error: classifiedError.message
      };
    }
  }

  /**
   * Swap SOL to Token
   */
  async swapSOLToToken(walletKeypair, outputMint, solAmount, options = {}) {
    const solMint = 'So11111111111111111111111111111111111111112'; // SOL
    const amount = Math.floor(solAmount * LAMPORTS_PER_SOL);
    
    return await this.executeSwap(walletKeypair, solMint, outputMint, amount, options);
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
      const response = await axios.get(`${this.config.jupiterApiUrl}/tokens`, {
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

