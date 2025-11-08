/**
 * Main Application Class
 * Unified entry point that initializes and manages all components
 */

import { SolanaCore } from './core/SolanaCore.js';
import { WalletManager } from './wallet/WalletManager.js';
import { TradingEngine } from './trading/TradingEngine.js';
import { SmartSell } from './trading/SmartSell.js';
import { VolumeBot } from './trading/VolumeBot.js';
import { Security } from './wallet/Security.js';
import { loggerManager } from './utils/logger.js';

const logger = loggerManager.getLogger('App');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Main Application Class
 */
export class App {
  constructor(config = {}) {
    this.config = {
      ...config,
      network: config.network || 'mainnet-beta',
      rpc: { ...(config.rpc || {}) },
      solanaCore: { ...(config.solanaCore || {}) },
      trading: { ...(config.trading || {}) },
      smartSell: { ...(config.smartSell || {}) },
      volumeBot: { ...(config.volumeBot || {}) },
      walletManager: { ...(config.walletManager || {}) }
    };

    // Core components
    this.solanaCore = null;
    this.walletManager = null;
    this.tradingEngine = null;
    this.smartSell = null;
    this.volumeBot = null;
    this.security = null;

    this.isInitialized = false;
  }

  /**
   * Initialize application
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('App already initialized');
      return;
    }

    logger.info('🚀 Initializing Chaos Bot Application...');

    try {
      // Initialize Security first
      this.security = new Security();
      await this.security.initialize();

      // Initialize Solana Core
      this.solanaCore = new SolanaCore(this.config.network, {
        rpc: this.config.rpc,
        ...this.config.solanaCore
      });
      await this.solanaCore.initialize();

      // Initialize Wallet Manager
      const walletStorage = this.config.walletManager?.storage || null;
      this.walletManager = new WalletManager(this.solanaCore, walletStorage);
      await this.walletManager.initialize();

      // Initialize Trading Engine
      this.tradingEngine = new TradingEngine(this.solanaCore, this.walletManager, {
        ...this.config.trading
      });
      await this.tradingEngine.initialize();

      // Initialize Smart Sell
      this.smartSell = new SmartSell(this.tradingEngine, this.walletManager, {
        ...this.config.smartSell
      });
      await this.smartSell.initialize();

      // Initialize Volume Bot
      this.volumeBot = new VolumeBot(this.tradingEngine, this.walletManager, {
        ...this.config.volumeBot
      });
      await this.volumeBot.initialize();

      this.isInitialized = true;
      logger.info('✅ Chaos Bot Application initialized successfully');
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  /**
   * Get application status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      network: this.config.network,
      components: {
        solanaCore: !!this.solanaCore,
        walletManager: !!this.walletManager,
        tradingEngine: !!this.tradingEngine,
        smartSell: !!this.smartSell,
        volumeBot: !!this.volumeBot,
        security: !!this.security
      },
      stats: {
        wallets: this.walletManager?.wallets.size || 0,
        monitoringPositions: this.smartSell?.monitoring.size || 0,
        activeSessions: this.volumeBot?.getActiveSessions().length || 0
      }
    };
  }

  /**
   * Get RPC statistics
   */
  getRPCStats() {
    if (!this.solanaCore) {
      return null;
    }
    return this.solanaCore.getRPCStats();
  }

  /**
   * Quick buy token (convenience method)
   */
  async buyToken(walletId, tokenMint, solAmount, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.buyToken(walletId, tokenMint, solAmount, options);
  }

  /**
   * Quick sell token (convenience method)
   */
  async sellToken(walletId, tokenMint, tokenAmount, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.sellToken(walletId, tokenMint, tokenAmount, options);
  }

  /**
   * Quick create wallet (convenience method)
   */
  createWallet(name, tags = []) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return this.walletManager.createWallet(name, tags);
  }

  /**
   * Quick import wallet (convenience method)
   */
  importWallet(privateKey, name, tags = []) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return this.walletManager.importWallet(privateKey, name, tags);
  }

  /**
   * Get all wallets with balances
   */
  async getAllWalletsWithBalances() {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.walletManager.getAllWalletsWithBalances();
  }

  /**
   * Execute tagging workflow for multiple wallets
   * Performs a quick buy (tag) and sell, then persists tag metadata on the wallet
   */
  async tagWallets(options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    const {
      walletIds = [],
      tags = [],
      minAmount = 0.1,
      maxAmount = 0.2,
      executor = 'jito',
      slippage = 3.0,
      mintCandidates = [],
      method = 'uniform',
      sellDelaySeconds = 6
    } = options;

    if (!Array.isArray(walletIds) || walletIds.length === 0) {
      return {
        success: false,
        error: 'No wallet IDs provided for tagging',
        results: []
      };
    }

    if (!Array.isArray(mintCandidates) || mintCandidates.length === 0) {
      return {
        success: false,
        error: 'No mint candidates supplied for tagging',
        results: []
      };
    }

    const sanitizedTags = Array.from(
      new Set(
        (tags || [])
          .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
          .filter(Boolean)
      )
    );

    if (sanitizedTags.length === 0) {
      return {
        success: false,
        error: 'At least one platform tag must be selected',
        results: []
      };
    }

    const candidatePool = mintCandidates.map((mint) => {
      if (mint && typeof mint === 'object') {
        return {
          mint: mint.mint || mint.address || '',
          symbol: mint.symbol || null,
          decimals: mint.decimals,
          source: mint.source || null
        };
      }
      return {
        mint: String(mint || '').trim(),
        symbol: null,
        decimals: undefined,
        source: null
      };
    }).filter(entry => entry.mint);

    if (candidatePool.length === 0) {
      return {
        success: false,
        error: 'Mint candidate list is empty after sanitization',
        results: []
      };
    }

    const results = [];

    for (const walletId of walletIds) {
      const wallet = this.walletManager.getWallet(walletId);
      if (!wallet) {
        results.push({
          walletId,
          success: false,
          error: 'Wallet not found'
        });
        continue;
      }

      const amountRange = Math.max(0, maxAmount - minAmount);
      const solAmount = Number(
        (minAmount + (amountRange > 0 ? Math.random() * amountRange : 0))
          .toFixed(4)
      );

      // Rotate candidate pool to avoid hammering the same mint repeatedly
      const candidateIndex = Math.floor(Math.random() * candidatePool.length);
      const { mint, symbol, decimals, source } = candidatePool[candidateIndex];

      if (!mint) {
        results.push({
          walletId,
          success: false,
          error: 'Invalid mint candidate'
        });
        continue;
      }

      logger.info(`Tagging wallet ${walletId} using mint ${mint} (${symbol || 'unknown'}) with amount ${solAmount} SOL`);

      try {
        const buyOptions = {
          slippage,
          executor,
          source: 'tagging',
          tags: sanitizedTags,
          method
        };

        const buyResult = await this.tradingEngine.buyToken(
          walletId,
          mint,
          solAmount,
          buyOptions
        );

        if (!buyResult?.success) {
          results.push({
            walletId,
            mint,
            solAmount,
            success: false,
            stage: 'buy',
            error: buyResult?.error || 'Buy transaction failed'
          });
          continue;
        }

        let tokenAmount = null;

        if (buyResult.tokenAmount) {
          tokenAmount = typeof buyResult.tokenAmount === 'string'
            ? parseInt(buyResult.tokenAmount, 10)
            : Math.floor(buyResult.tokenAmount);
        } else if (buyResult.outputAmount) {
          tokenAmount = typeof buyResult.outputAmount === 'string'
            ? parseInt(buyResult.outputAmount, 10)
            : Math.floor(buyResult.outputAmount);
        }

        if (!tokenAmount || Number.isNaN(tokenAmount) || tokenAmount <= 0) {
          // Fallback: fetch balance in UI units and convert using decimals if provided
          const uiBalance = await this.solanaCore.getTokenBalance(wallet.publicKey, mint);
          if (uiBalance && decimals !== undefined) {
            tokenAmount = Math.floor(Number(uiBalance) * Math.pow(10, decimals));
          } else if (uiBalance) {
            tokenAmount = Math.floor(Number(uiBalance));
          }
        }

        if (!tokenAmount || Number.isNaN(tokenAmount) || tokenAmount <= 0) {
          results.push({
            walletId,
            mint,
            solAmount,
            success: false,
            stage: 'prepare-sell',
            error: 'Unable to determine token amount for sell'
          });
          continue;
        }

        // Optional wait to mimic natural tagging behaviour
        const delayMs = Math.max(0, sellDelaySeconds) * 1000;
        if (delayMs > 0) {
          await sleep(delayMs);
        }

        const sellResult = await this.tradingEngine.sellToken(
          walletId,
          mint,
          tokenAmount,
          {
            slippage,
            executor,
            source: 'tagging',
            tags: sanitizedTags,
            method
          }
        );

        if (!sellResult?.success) {
          results.push({
            walletId,
            mint,
            solAmount,
            tokenAmount,
            success: false,
            stage: 'sell',
            buy: buyResult,
            error: sellResult?.error || 'Sell transaction failed'
          });
          continue;
        }

        const existingTags = Array.isArray(wallet.tags) ? wallet.tags : [];
        const mergedTags = Array.from(new Set([...existingTags, ...sanitizedTags]));
        this.walletManager.updateWalletTags(walletId, mergedTags);

        results.push({
          walletId,
          mint,
          symbol,
          source,
          solAmount,
          tokenAmount,
          success: true,
          buy: buyResult,
          sell: sellResult,
          tags: mergedTags
        });
      } catch (error) {
        logger.error(`Tagging workflow failed for wallet ${walletId}:`, error);
        results.push({
          walletId,
          mint,
          solAmount,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(result => result.success).length;
    const failureCount = results.length - successCount;

    return {
      success: failureCount === 0,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Add position to Smart Sell monitoring
   */
  async addSmartSellPosition(walletId, tokenMint, entryPrice, amount, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.smartSell.addPosition(walletId, tokenMint, entryPrice, amount, options);
  }

  /**
   * Start volume trading session
   */
  async startVolumeSession(walletIds, tokenMint, config = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.volumeBot.startSession(walletIds, tokenMint, config);
  }

  /**
   * Get token price
   */
  async getTokenPrice(tokenMint) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.getTokenPrice(tokenMint);
  }

  /**
   * Create token on PumpFun
   */
  async createToken(walletId, metadata, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.createToken(walletId, metadata, options);
  }

  /**
   * Launch token with initial buy
   */
  async launchToken(walletId, metadata, initialBuyAmount = 0, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    const platform = options.platform || 'pumpfun';

    if (platform !== 'pumpfun') {
      return {
        success: false,
        error: `Unsupported launch platform: ${platform}`
      };
    }

    const launchResult = await this.tradingEngine.launchToken(
      walletId,
      metadata,
      initialBuyAmount,
      options
    );

    if (!launchResult.success) {
      return launchResult;
    }

    const automationResults = {};
    const automations = options.automations || {};
    const tokenMint = launchResult.tokenMint;

    // Smart Sell automation
    if (automations.smartSell?.enabled) {
      try {
        const smartConfig = { ...automations.smartSell };
        const wallet = this.walletManager.getWallet(walletId);

        if (!wallet) {
          throw new Error('Creator wallet not found for Smart Sell automation');
        }

        let entryPrice = smartConfig.entryPrice;
        if (!entryPrice || entryPrice <= 0) {
          const priceInfo = await this.getTokenPrice(tokenMint);
          if (priceInfo.success && priceInfo.price > 0) {
            entryPrice = priceInfo.price;
          }
        }

        let amount = smartConfig.amount;
        if (!amount || amount <= 0) {
          const balanceInfo = await this.solanaCore.getTokenBalance(
            wallet.publicKey,
            tokenMint
          );

          if (balanceInfo && typeof balanceInfo.uiAmount === 'number') {
            amount = balanceInfo.uiAmount;
          }
        }

        if (!entryPrice || entryPrice <= 0) {
          throw new Error('Unable to determine entry price for Smart Sell automation');
        }

        if (!amount || amount <= 0) {
          throw new Error('No token balance available for Smart Sell automation');
        }

        const smartOptions = {
          profitTarget: smartConfig.profitTarget,
          stopLoss: smartConfig.stopLoss,
          trailingStop: smartConfig.trailingStop,
          emergencyLoss:
            smartConfig.emergencyLoss !== undefined
              ? smartConfig.emergencyLoss
              : smartConfig.emergencyStop,
          partialSells: smartConfig.partialSells,
          sellPercentages: smartConfig.sellPercentages
        };

        const smartResult = await this.addSmartSellPosition(
          walletId,
          tokenMint,
          entryPrice,
          amount,
          smartOptions
        );

        automationResults.smartSell = {
          ...smartResult,
          config: smartOptions,
          walletId
        };
      } catch (error) {
        logger.error('Smart Sell automation setup failed:', error);
        automationResults.smartSell = {
          success: false,
          error: error.message
        };
      }
    }

    // Volume Bot automation
    if (automations.volumeBot?.enabled) {
      try {
        const volumeConfig = { ...automations.volumeBot };
        const walletIds =
          Array.isArray(volumeConfig.walletIds) && volumeConfig.walletIds.length > 0
            ? volumeConfig.walletIds
            : [walletId];

        // Ensure configuration fields align with VolumeBot expectations
        if (
          volumeConfig.buyAmount &&
          volumeConfig.minAmount === undefined &&
          volumeConfig.maxAmount === undefined
        ) {
          volumeConfig.minAmount = volumeConfig.buyAmount;
          volumeConfig.maxAmount = volumeConfig.buyAmount;
        }

        const sellIntervalSeconds =
          volumeConfig.sellIntervalSeconds ??
          volumeConfig.sellDelay ??
          volumeConfig.delayBetween;

        if (sellIntervalSeconds && !volumeConfig.delayBetween) {
          volumeConfig.delayBetween = sellIntervalSeconds;
        }

        if (!volumeConfig.guardrails) {
          volumeConfig.guardrails = { enabled: false };
        }

        delete volumeConfig.enabled;
        delete volumeConfig.walletIds;

        const volumeResult = await this.startVolumeSession(
          walletIds,
          tokenMint,
          volumeConfig
        );

        automationResults.volumeBot = {
          ...volumeResult,
          walletIds,
          config: volumeConfig
        };
      } catch (error) {
        logger.error('Volume bot automation setup failed:', error);
        automationResults.volumeBot = {
          success: false,
          error: error.message
        };
      }
    }

    return {
      ...launchResult,
      platform,
      automations: automationResults
    };
  }

  /**
   * Get quote for swap
   */
  async getQuote(inputMint, outputMint, amount, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.getQuote(inputMint, outputMint, amount, options);
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    logger.info('Destroying application...');

    if (this.smartSell) {
      this.smartSell.destroy();
    }

    if (this.volumeBot) {
      this.volumeBot.destroy();
    }

    if (this.solanaCore) {
      this.solanaCore.destroy();
    }

    this.isInitialized = false;
    logger.info('Application destroyed');
  }
}

export default App;

