/**
 * Trading Engine
 * Orchestrates all trading operations with PumpFun, Jupiter, and other integrations
 */

import { loggerManager } from '../utils/logger.js';
import { ErrorClassifier } from '../utils/errors.js';
import PumpFunClient from '../integrations/pumpfun/PumpFunClient.js';
import JupiterClient from '../integrations/jupiter/JupiterClient.js';

const logger = loggerManager.getLogger('TradingEngine');

/**
 * Trading Engine Class
 */
export class TradingEngine {
  constructor(solanaCore, walletManager, config = {}) {
    this.solanaCore = solanaCore;
    this.walletManager = walletManager;
    this.config = {
      defaultSlippage: config.defaultSlippage || 1.0,
      priorityFee: config.priorityFee || 1000,
      maxRetries: config.maxRetries || 3,
      ...config
    };

    // Initialize integrations
    this.pumpFun = new PumpFunClient(solanaCore, {
      defaultSlippage: this.config.defaultSlippage
    });
    
    this.jupiter = new JupiterClient(solanaCore, {
      defaultSlippage: this.config.defaultSlippage,
      priorityFee: this.config.priorityFee
    });

    this.isInitialized = false;
    this.initialize();
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info('Initializing Trading Engine...');
    
    await this.pumpFun.initialize();
    await this.jupiter.initialize();
    
    this.isInitialized = true;
    logger.info('✅ Trading Engine initialized');
  }

  /**
   * Buy token (auto-detects PumpFun or DEX)
   */
  async buyToken(walletId, tokenMint, solAmount, options = {}) {
    try {
      logger.info(`Buying token: ${tokenMint} with ${solAmount} SOL`);

      // Get wallet keypair
      const keypair = this.walletManager.getWalletKeypair(walletId);

      // Check if token is PumpFun token
      const tokenInfo = await this.pumpFun.getTokenInfo(tokenMint);
      
      if (tokenInfo.success && !tokenInfo.isComplete) {
        // Use PumpFun for bonding curve tokens
        logger.info('Using PumpFun for bonding curve token');
        const result = await this.pumpFun.buyToken(keypair, tokenMint, solAmount, options);
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      } else {
        // Use Jupiter for DEX tokens
        logger.info('Using Jupiter for DEX token');
        const result = await this.jupiter.swapSOLToToken(keypair, tokenMint, solAmount, options);
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      }
    } catch (error) {
      logger.error('Buy token failed:', error);
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      return {
        success: false,
        error: classifiedError.message
      };
    }
  }

  /**
   * Sell token (auto-detects PumpFun or DEX)
   */
  async sellToken(walletId, tokenMint, tokenAmount, options = {}) {
    try {
      logger.info(`Selling token: ${tokenMint}, amount: ${tokenAmount}`);

      // Get wallet keypair
      const keypair = this.walletManager.getWalletKeypair(walletId);

      // Check if token is PumpFun token
      const tokenInfo = await this.pumpFun.getTokenInfo(tokenMint);
      
      if (tokenInfo.success && !tokenInfo.isComplete) {
        // Use PumpFun for bonding curve tokens
        logger.info('Using PumpFun for bonding curve token');
        const result = await this.pumpFun.sellToken(keypair, tokenMint, tokenAmount, options);
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      } else {
        // Use Jupiter for DEX tokens
        logger.info('Using Jupiter for DEX token');
        const result = await this.jupiter.swapTokenToSOL(keypair, tokenMint, tokenAmount, options);
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      }
    } catch (error) {
      logger.error('Sell token failed:', error);
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      return {
        success: false,
        error: classifiedError.message
      };
    }
  }

  /**
   * Get token price
   */
  async getTokenPrice(tokenMint) {
    try {
      // Try PumpFun first
      const pumpFunInfo = await this.pumpFun.getTokenInfo(tokenMint);
      if (pumpFunInfo.success && pumpFunInfo.price > 0) {
        return {
          price: pumpFunInfo.price,
          marketCap: pumpFunInfo.marketCap,
          source: 'pumpfun',
          success: true
        };
      }

      // Try Jupiter
      const jupiterPrice = await this.jupiter.getTokenPrice(tokenMint);
      if (jupiterPrice.success) {
        return {
          price: jupiterPrice.price,
          source: 'jupiter',
          success: true
        };
      }

      return {
        success: false,
        error: 'Unable to get token price'
      };
    } catch (error) {
      logger.error('Get token price failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create and launch token on PumpFun
   */
  async createToken(walletId, metadata, options = {}) {
    try {
      // Get wallet keypair
      const keypair = this.walletManager.getWalletKeypair(walletId);

      // Use PumpFun client to create token
      const result = await this.pumpFun.createToken(keypair, metadata, options);

      // Update wallet last used
      this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();

      return result;
    } catch (error) {
      logger.error('Create token failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Launch token with initial buy
   */
  async launchToken(walletId, metadata, initialBuyAmount = 0, options = {}) {
    try {
      // Get wallet keypair
      const keypair = this.walletManager.getWalletKeypair(walletId);

      // Use PumpFun client to launch token
      const result = await this.pumpFun.launchToken(keypair, metadata, initialBuyAmount, options);

      // Update wallet last used
      this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();

      return result;
    } catch (error) {
      logger.error('Launch token failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get quote for swap
   */
  async getQuote(inputMint, outputMint, amount, options = {}) {
    try {
      // Check if either token is PumpFun
      const inputInfo = await this.pumpFun.getTokenInfo(inputMint);
      const outputInfo = await this.pumpFun.getTokenInfo(outputMint);

      if ((inputInfo.success && !inputInfo.isComplete) || 
          (outputInfo.success && !outputInfo.isComplete)) {
        // Use PumpFun calculations
        if (inputMint === 'So11111111111111111111111111111111111111112') {
          // Buying with SOL
          return await this.pumpFun.calculateBuyAmount(amount / 1e9, outputMint);
        } else if (outputMint === 'So11111111111111111111111111111111111111112') {
          // Selling for SOL
          return await this.pumpFun.calculateSellAmount(amount, inputMint);
        }
      }

      // Use Jupiter for DEX swaps
      return await this.jupiter.getQuote(inputMint, outputMint, amount, options);
    } catch (error) {
      logger.error('Get quote failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Swap tokens (auto-detects best route)
   */
  async swapTokens(walletId, inputMint, outputMint, inputAmount, options = {}) {
    try {
      // Get wallet keypair
      const keypair = this.walletManager.getWalletKeypair(walletId);

      // Check if either token is PumpFun
      const inputInfo = await this.pumpFun.getTokenInfo(inputMint);
      const outputInfo = await this.pumpFun.getTokenInfo(outputMint);

      if ((inputInfo.success && !inputInfo.isComplete) || 
          (outputInfo.success && !outputInfo.isComplete)) {
        // For PumpFun tokens, we need to use PumpFun client
        logger.warn('PumpFun token swaps require separate buy/sell operations');
        return {
          success: false,
          error: 'PumpFun token swaps require separate buy/sell operations'
        };
      }

      // Use Jupiter for DEX swaps
      const result = await this.jupiter.swapTokenToToken(
        keypair,
        inputMint,
        outputMint,
        inputAmount,
        options
      );

      // Update wallet last used
      this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();

      return result;
    } catch (error) {
      logger.error('Swap tokens failed:', error);
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      return {
        success: false,
        error: classifiedError.message
      };
    }
  }
}

export default TradingEngine;

