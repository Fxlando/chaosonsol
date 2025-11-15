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
      metadataFallback: config.metadataFallback || null,
      pumpPortal: config.pumpPortal || {},
      ...config
    };

    // Initialize integrations
    this.pumpFun = new PumpFunClient(solanaCore, {
      defaultSlippage: this.config.defaultSlippage,
      metadataFallback: this.config.metadataFallback,
      pumpPortal: this.config.pumpPortal
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

      // Check if token is PumpFun token first - use pump.fun SDK directly
      const tokenInfo = await this.pumpFun.getTokenInfo(tokenMint);
      
      if (tokenInfo.success && !tokenInfo.isComplete) {
        // Use PumpFun SDK directly for bonding curve tokens (before graduation)
        logger.info('Using PumpFun SDK for bonding curve token');
        const result = await this.pumpFun.buyToken(keypair, tokenMint, solAmount, options);
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      }
      
      // For graduated tokens or non-pump.fun tokens, try Jupiter V6, then legacy
      try {
        // Try to use Jupiter V6 integration if available
        // Using createRequire to import CommonJS module in ES module context
        const { createRequire } = await import('module');
        const { fileURLToPath } = await import('url');
        const { dirname, resolve } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const require = createRequire(import.meta.url);
        const jupiterV6Path = resolve(__dirname, '../../jupiter-v6-integration.js');
        const { JupiterV6Integration } = require(jupiterV6Path);
        const jupiterV6 = new JupiterV6Integration(this.solanaCore.connection, {
          slippage: options.slippage || 1000, // 10% default
          priorityFee: options.priorityFee || 500000 // 0.0005 SOL default
        });
        
        const result = await jupiterV6.buyToken(keypair, tokenMint, solAmount, options);
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      } catch (jupiterV6Error) {
        logger.warn('Jupiter V6 integration not available, falling back to legacy system:', jupiterV6Error.message);
        
        // Fallback to legacy system
        // Use Jupiter for DEX tokens (pump.fun tokens already handled above)
        logger.info('Using legacy Jupiter client for DEX token');
        const result = await this.jupiter.swapSOLToToken(keypair, tokenMint, solAmount, {
          ...options,
          useSharedAccounts: false // Disable shared accounts to avoid pump.fun issues
        });
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      }
    } catch (error) {
      logger.error('Buy token failed:', error);
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        error: error
      });
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      return {
        success: false,
        error: classifiedError.message || error.message || 'Transaction failed',
        errorDetails: error.stack || error.toString()
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

      // Use Jupiter V6 integration which handles both pump.fun and Jupiter automatically
      // It tries pump.fun first (for bonding curve tokens), then Jupiter (for DEX tokens)
      logger.info('Using Jupiter V6 integration with automatic pump.fun fallback');
      
      // Check if token is PumpFun token first - use pump.fun SDK directly
      const tokenInfo = await this.pumpFun.getTokenInfo(tokenMint);
      
      if (tokenInfo.success && !tokenInfo.isComplete) {
        // Use PumpFun SDK directly for bonding curve tokens (before graduation)
        logger.info('Using PumpFun SDK for bonding curve token');
        const result = await this.pumpFun.sellToken(keypair, tokenMint, tokenAmount, options);
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      }
      
      // For graduated tokens or non-pump.fun tokens, try Jupiter V6, then legacy
      try {
        // Try to use Jupiter V6 integration if available
        // Using createRequire to import CommonJS module in ES module context
        const { createRequire } = await import('module');
        const { fileURLToPath } = await import('url');
        const { dirname, resolve } = await import('path');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const require = createRequire(import.meta.url);
        const jupiterV6Path = resolve(__dirname, '../../jupiter-v6-integration.js');
        const { JupiterV6Integration } = require(jupiterV6Path);
        const jupiterV6 = new JupiterV6Integration(this.solanaCore.connection, {
          slippage: options.slippage || 1000, // 10% default
          priorityFee: options.priorityFee || 500000 // 0.0005 SOL default
        });
        
        const result = await jupiterV6.sellToken(keypair, tokenMint, tokenAmount, options);
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      } catch (jupiterV6Error) {
        logger.warn('Jupiter V6 integration not available, falling back to legacy system:', jupiterV6Error.message);
        
        // Fallback to legacy system
        // Use Jupiter for DEX tokens (pump.fun tokens already handled above)
        logger.info('Using legacy Jupiter client for DEX token');
        const result = await this.jupiter.swapTokenToSOL(keypair, tokenMint, tokenAmount, {
          ...options,
          useSharedAccounts: false // Disable shared accounts to avoid pump.fun issues
        });
        
        // Update wallet last used
        this.walletManager.wallets.get(walletId).lastUsed = new Date().toISOString();
        
        return result;
      }
    } catch (error) {
      logger.error('Sell token failed:', error);
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        error: error
      });
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      return {
        success: false,
        error: classifiedError.message || error.message || 'Transaction failed',
        errorDetails: error.stack || error.toString()
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

  async copyToken(walletId, sourceMint, options = {}) {
    try {
      const { metadata, info } = await this.pumpFun.buildMetadataFromMint(sourceMint);
      const platform = options.platform || 'pumpfun';

      const draftTemplate = {
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description || '',
        image: metadata.image || '',
        metadataUri: info.metadataUri || metadata.metadataUri || '',
        twitter: metadata.twitter || null,
        telegram: metadata.telegram || null,
        website: metadata.website || null,
        platform,
        sourceMint
      };

      return {
        success: true,
        copiedMetadata: metadata,
        source: info,
        metadataUri: info.metadataUri || null,
        platform,
        draftTemplate
      };
    } catch (error) {
      logger.error('Copy token failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async importToken(tokenMint, options = {}) {
    try {
      const { metadata, info } = await this.pumpFun.buildMetadataFromMint(tokenMint);
      const bondingCurve = await this.pumpFun.getBondingCurveData(tokenMint);

      return {
        success: true,
        token: {
          mint: tokenMint,
          name: metadata.name,
          symbol: metadata.symbol,
          description: metadata.description,
          image: metadata.image,
          twitter: metadata.twitter,
          telegram: metadata.telegram,
          website: metadata.website,
          metadataUri: info.metadataUri,
          marketCap: info.marketCap,
          price: info.price,
          totalSupply: info.totalSupply,
          decimals: info.decimals,
          bondingCurve
        },
        source: info,
        platform: options.platform || 'pumpfun'
      };
    } catch (error) {
      logger.error('Import token failed:', error);
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

