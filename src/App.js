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

/**
 * Main Application Class
 */
export class App {
  constructor(config = {}) {
    this.config = {
      network: config.network || 'mainnet-beta',
      rpc: config.rpc || {},
      trading: config.trading || {},
      smartSell: config.smartSell || {},
      volumeBot: config.volumeBot || {},
      ...config
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
      this.walletManager = new WalletManager(this.solanaCore);
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
    return await this.tradingEngine.launchToken(walletId, metadata, initialBuyAmount, options);
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

