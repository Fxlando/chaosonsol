/**
 * PumpFun Client
 * Complete PumpFun integration with proper instruction building
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
        const tokenData = {
          mint: tokenMint,
          name: response.data.name || 'Unknown',
          symbol: response.data.symbol || 'UNK',
          description: response.data.description || '',
          image: response.data.image_uri || '',
          marketCap: response.data.usd_market_cap || 0,
          price: response.data.usd_market_cap / (response.data.total_supply / Math.pow(10, response.data.decimals)) || 0,
          totalSupply: response.data.total_supply || 0,
          decimals: response.data.decimals || 9,
          bondingCurve: response.data.bonding_curve || null,
          isComplete: response.data.complete || false,
          createdTimestamp: response.data.created_timestamp || 0,
          success: true
        };

        this.cache.set(cacheKey, { data: tokenData, timestamp: Date.now() });
        return tokenData;
      }
    } catch (error) {
      logger.warn('PumpFun API failed:', error.message);
    }

    return {
      mint: tokenMint,
      name: 'Unknown Token',
      symbol: 'UNK',
      success: false,
      error: 'Unable to fetch token info'
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
      logger.warn('Bonding curve API failed:', error.message);
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
   * Build PumpFun buy instruction
   */
  async buildBuyInstruction(walletKeypair, tokenMint, solAmount, options = {}) {
    try {
      const walletPubkey = walletKeypair.publicKey;
      
      // Get or create associated token account
      const tokenAccountExists = await this.accountManager.tokenAccountExists(tokenMint, walletPubkey);
      
      const instructions = [];

      // Create token account if needed
      if (!tokenAccountExists) {
        const createTokenAccountIx = await this.accountManager.createAssociatedTokenAccountInstruction(
          walletPubkey,
          walletPubkey,
          tokenMint
        );
        instructions.push(createTokenAccountIx);
      }

      // Build PumpFun buy instruction using instruction builder
      const { buildBuyInstruction } = await import('./instructions.js');
      const buyInstruction = await buildBuyInstruction(
        walletPubkey,
        tokenMint,
        solAmount,
        {
          slippageBps: options.slippageBps || Math.floor(this.config.defaultSlippage * 100),
          ...options
        }
      );

      instructions.push(buyInstruction);

      return instructions;
    } catch (error) {
      logger.error('Failed to build buy instruction:', error);
      throw error;
    }
  }

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

      // Build buy instructions
      const instructions = await this.buildBuyInstruction(walletKeypair, tokenMint, solAmount, options);

      // Build transaction
      const transaction = await this.transactionBuilder.buildTransaction({
        instructions,
        feePayer: walletKeypair.publicKey,
        priorityFee: options.priorityFee || this.config.priorityFee
      });

      // Sign transaction
      this.transactionBuilder.signTransaction(transaction, [walletKeypair]);

      // Execute transaction
      const result = await this.solanaCore.executeTransaction(transaction, [walletKeypair], {
        maxRetries: options.maxRetries || this.config.maxRetries
      });

      if (!result.success) {
        throw new Error('Transaction failed');
      }

      logger.info(`✅ Buy successful: ${result.signature}`);
      
      return {
        signature: result.signature,
        tokenAmount: calculation.tokenAmount,
        solAmount: solAmount,
        priceImpact: calculation.priceImpact,
        success: true
      };
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
   * Sell token on PumpFun
   */
  async sellToken(walletKeypair, tokenMint, tokenAmount, options = {}) {
    try {
      logger.info(`Selling ${tokenAmount} tokens of ${tokenMint} on PumpFun`);

      // Calculate expected SOL amount
      const calculation = await this.calculateSellAmount(tokenAmount, tokenMint);
      if (!calculation.success) {
        throw new Error(calculation.error);
      }

      // TODO: Build sell instruction (similar to buy)
      // This requires the same program interface knowledge as buy

      logger.warn('Sell instruction building requires program interface - not yet implemented');
      
      return {
        signature: null,
        tokenAmount: tokenAmount,
        solAmount: 0,
        success: false,
        error: 'Sell instruction building not yet implemented'
      };
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

