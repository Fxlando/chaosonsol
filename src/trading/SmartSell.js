/**
 * Smart Sell Automation
 * Automated profit taking, stop loss, and trailing stops
 */

import { loggerManager } from '../utils/logger.js';
import { TRADING_CONFIG } from '../config/constants.js';

const logger = loggerManager.getLogger('SmartSell');

/**
 * Smart Sell Class
 */
export class SmartSell {
  constructor(tradingEngine, walletManager, config = {}) {
    this.tradingEngine = tradingEngine;
    this.walletManager = walletManager;
    this.config = {
      profitTarget: config.profitTarget || TRADING_CONFIG.SMART_SELL_PROFIT_TARGET, // 30%
      stopLoss: config.stopLoss || TRADING_CONFIG.SMART_SELL_STOP_LOSS, // -15%
      trailingStop: config.trailingStop || TRADING_CONFIG.SMART_SELL_TRAILING_STOP, // 10%
      emergencyLoss: config.emergencyLoss || TRADING_CONFIG.SMART_SELL_EMERGENCY_LOSS, // -25%
      checkInterval: config.checkInterval || 30000, // 30 seconds
      enabled: config.enabled !== false,
      ...config
    };

    this.monitoring = new Map(); // tokenMint -> monitoring config
    this.monitoringInterval = null;
    this.isInitialized = false;
    
    this.initialize();
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info('Initializing Smart Sell...');
    
    if (this.config.enabled) {
      this.startMonitoring();
    }
    
    this.isInitialized = true;
    logger.info('✅ Smart Sell initialized');
  }

  /**
   * Start monitoring positions
   */
  startMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.checkPositions();
    }, this.config.checkInterval);

    logger.info('Smart Sell monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Smart Sell monitoring stopped');
    }
  }

  /**
   * Add position to monitor
   */
  async addPosition(walletId, tokenMint, entryPrice, amount, options = {}) {
    try {
      const position = {
        walletId,
        tokenMint,
        entryPrice,
        amount,
        highestPrice: entryPrice,
        lowestPrice: entryPrice,
        profitTarget: options.profitTarget || this.config.profitTarget,
        stopLoss: options.stopLoss || this.config.stopLoss,
        trailingStop: options.trailingStop || this.config.trailingStop,
        emergencyLoss: options.emergencyLoss || this.config.emergencyLoss,
        enabled: options.enabled !== false,
        createdAt: new Date().toISOString(),
        lastCheck: new Date().toISOString()
      };

      const key = `${walletId}_${tokenMint}`;
      this.monitoring.set(key, position);
      
      logger.info(`Added position to monitor: ${tokenMint} (${walletId})`);
      
      return { success: true, position };
    } catch (error) {
      logger.error('Failed to add position:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove position from monitoring
   */
  removePosition(walletId, tokenMint) {
    const key = `${walletId}_${tokenMint}`;
    const removed = this.monitoring.delete(key);
    
    if (removed) {
      logger.info(`Removed position from monitoring: ${tokenMint} (${walletId})`);
    }
    
    return { success: removed };
  }

  /**
   * Check all positions
   */
  async checkPositions() {
    if (!this.config.enabled) return;
    
    const positions = Array.from(this.monitoring.values());
    
    for (const position of positions) {
      if (!position.enabled) continue;
      
      try {
        await this.checkPosition(position);
      } catch (error) {
        logger.error(`Failed to check position ${position.tokenMint}:`, error);
      }
    }
  }

  /**
   * Check single position
   */
  async checkPosition(position) {
    try {
      // Get current price
      const priceInfo = await this.tradingEngine.getTokenPrice(position.tokenMint);
      
      if (!priceInfo.success || !priceInfo.price) {
        logger.warn(`Unable to get price for ${position.tokenMint}`);
        return;
      }

      const currentPrice = priceInfo.price;
      const entryPrice = position.entryPrice;
      
      // Calculate profit/loss percentage
      const profitLoss = ((currentPrice - entryPrice) / entryPrice) * 100;
      
      // Update highest/lowest prices
      if (currentPrice > position.highestPrice) {
        position.highestPrice = currentPrice;
      }
      if (currentPrice < position.lowestPrice) {
        position.lowestPrice = currentPrice;
      }
      
      position.lastCheck = new Date().toISOString();
      position.currentPrice = currentPrice;
      position.profitLoss = profitLoss;
      
      // Check conditions
      const shouldSell = await this.shouldSell(position, currentPrice, profitLoss);
      
      if (shouldSell.shouldSell) {
        logger.info(`Triggering sell for ${position.tokenMint}: ${shouldSell.reason}`);
        await this.executeSell(position, shouldSell.reason);
      }
    } catch (error) {
      logger.error(`Failed to check position ${position.tokenMint}:`, error);
    }
  }

  /**
   * Determine if position should be sold
   */
  async shouldSell(position, currentPrice, profitLoss) {
    // Emergency loss (highest priority)
    // Note: emergencyLoss is already negative (e.g., -25), so we compare directly
    if (profitLoss <= position.emergencyLoss) {
      return {
        shouldSell: true,
        reason: `Emergency loss: ${profitLoss.toFixed(2)}%`,
        sellPercentage: 100 // Sell all
      };
    }

    // Stop loss
    // Note: stopLoss is already negative (e.g., -15), so we compare directly
    if (profitLoss <= position.stopLoss) {
      return {
        shouldSell: true,
        reason: `Stop loss triggered: ${profitLoss.toFixed(2)}%`,
        sellPercentage: 100 // Sell all
      };
    }

    // Profit target
    if (profitLoss >= position.profitTarget) {
      return {
        shouldSell: true,
        reason: `Profit target reached: ${profitLoss.toFixed(2)}%`,
        sellPercentage: 100 // Sell all
      };
    }

    // Trailing stop
    if (position.highestPrice > position.entryPrice) {
      const pullbackFromHigh = ((position.highestPrice - currentPrice) / position.highestPrice) * 100;
      
      if (pullbackFromHigh >= position.trailingStop) {
        return {
          shouldSell: true,
          reason: `Trailing stop triggered: ${pullbackFromHigh.toFixed(2)}% pullback from high`,
          sellPercentage: 100 // Sell all
        };
      }
    }

    return { shouldSell: false };
  }

  /**
   * Execute sell
   */
  async executeSell(position, reason) {
    try {
      // Get wallet keypair
      const keypair = this.walletManager.getWalletKeypair(position.walletId);
      
      // Get current token balance
      // Note: getTokenBalance returns a number (uiAmount), not an object
      const balance = await this.tradingEngine.solanaCore.getTokenBalance(
        keypair.publicKey.toString(),
        position.tokenMint
      );

      // Validate balance - it's a number representing uiAmount
      if (!Number.isFinite(balance) || balance <= 0) {
        logger.warn(`No tokens to sell for ${position.tokenMint}`);
        this.removePosition(position.walletId, position.tokenMint);
        return { success: false, error: 'No tokens to sell' };
      }

      // Calculate sell amount based on percentage
      // balance is already in UI units (human-readable), so we can use it directly
      const sellPercentage = position.sellPercentage || 100;
      if (!Number.isFinite(sellPercentage) || sellPercentage <= 0 || sellPercentage > 100) {
        logger.error(`Invalid sell percentage: ${sellPercentage}`);
        return { success: false, error: 'Invalid sell percentage' };
      }
      
      const sellAmount = Math.floor(balance * sellPercentage / 100);
      
      if (!Number.isFinite(sellAmount) || sellAmount <= 0) {
        logger.warn(`Calculated sell amount is invalid: ${sellAmount}`);
        return { success: false, error: 'Invalid sell amount calculated' };
      }
      
      logger.info(`Selling ${sellAmount} tokens of ${position.tokenMint} (${reason})`);
      
      // Execute sell
      const result = await this.tradingEngine.sellToken(
        position.walletId,
        position.tokenMint,
        sellAmount,
        {
          slippage: 5.0, // 5% slippage for automated sells
          source: 'smart-sell',
          reason: reason
        }
      );

      if (result.success) {
        logger.info(`✅ Smart sell executed: ${result.signature}`);
        
        // Remove position if fully sold
        if ((position.sellPercentage || 100) >= 100) {
          this.removePosition(position.walletId, position.tokenMint);
        }
        
        return { success: true, result };
      } else {
        logger.error(`Failed to execute smart sell: ${result.error}`);
        return { success: false, error: result.error };
      }
    } catch (error) {
      logger.error('Execute sell failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all monitored positions
   */
  getPositions() {
    return Array.from(this.monitoring.values()).map(position => ({
      walletId: position.walletId,
      tokenMint: position.tokenMint,
      entryPrice: position.entryPrice,
      currentPrice: position.currentPrice,
      profitLoss: position.profitLoss,
      highestPrice: position.highestPrice,
      lowestPrice: position.lowestPrice,
      enabled: position.enabled,
      createdAt: position.createdAt,
      lastCheck: position.lastCheck
    }));
  }

  /**
   * Get position
   */
  getPosition(walletId, tokenMint) {
    const key = `${walletId}_${tokenMint}`;
    return this.monitoring.get(key) || null;
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled) {
    this.config.enabled = enabled;
    
    if (enabled) {
      this.startMonitoring();
    } else {
      this.stopMonitoring();
    }
    
    logger.info(`Smart Sell monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Update position settings
   */
  updatePosition(walletId, tokenMint, updates) {
    const key = `${walletId}_${tokenMint}`;
    const position = this.monitoring.get(key);
    
    if (!position) {
      return { success: false, error: 'Position not found' };
    }

    Object.assign(position, updates);
    this.monitoring.set(key, position);
    
    logger.info(`Updated position: ${tokenMint} (${walletId})`);
    
    return { success: true, position };
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopMonitoring();
    this.monitoring.clear();
    this.isInitialized = false;
    logger.info('Smart Sell destroyed');
  }
}

export default SmartSell;

