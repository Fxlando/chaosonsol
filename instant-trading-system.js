/**
 * Unified Instant Trading System
 * Combines outsider detection and instant auto-selling
 * Provides a complete solution for instant response trading
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const InstantOutsiderDetector = require('./instant-outsider-detector');
const InstantAutoSell = require('./instant-auto-sell');
const RateLimitManager = require('./rate-limit-manager');

class InstantTradingSystem {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      detectionSpeed: 30000, // 30 seconds - balanced for rate limits
      minProfitThreshold: 20, // 20% minimum profit
      topWalletsCount: 5, // Sell from top 5 wallets
      autoSellEnabled: true,
      ...config
    };
    
    this.rateLimitManager = new RateLimitManager();
    this.outsiderDetector = new InstantOutsiderDetector(connection, {
      monitoringInterval: this.config.detectionSpeed
    });
    this.autoSell = new InstantAutoSell(connection, {
      minProfitThreshold: this.config.minProfitThreshold,
      topWalletsCount: this.config.topWalletsCount
    });
    
    // Set reference to parent system for wallet access
    this.autoSell.parentSystem = this;
    
    this.isRunning = false;
    this.currentToken = null;
    this.wallets = [];
    this.stats = {
      totalDetections: 0,
      totalSells: 0,
      successfulSells: 0,
      startTime: null,
      lastDetection: null,
      lastSell: null
    };
  }

  /**
   * Initialize the system with wallets
   */
  async initialize(wallets) {
    try {
      console.log(`🚀 Initializing Instant Trading System with ${wallets.length} wallets...`);
      
      this.wallets = wallets;
      
      // Add wallets to whitelist for outsider detection
      this.outsiderDetector.addWhitelistedWallets(wallets);
      
      // Initialize auto-sell system
      await this.autoSell.initialize(wallets);
      
      console.log('✅ Instant Trading System initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing Instant Trading System:', error.message);
      return false;
    }
  }

  /**
   * Start monitoring and trading for a token
   */
  async startTrading(tokenMint, options = {}) {
    if (this.isRunning) {
      console.log('⚠️ System already running, stopping previous session');
      await this.stopTrading();
    }

    try {
      console.log(`🎯 Starting instant trading for token: ${tokenMint}`);
      
      this.currentToken = tokenMint;
      this.isRunning = true;
      this.stats.startTime = Date.now();
      
      // Start outsider detection
      await this.outsiderDetector.startMonitoring(tokenMint, async (outsiderData) => {
        await this.handleOutsiderDetection(outsiderData);
      });
      
      console.log('✅ Instant trading system started successfully');
      return true;
    } catch (error) {
      console.error('❌ Error starting trading system:', error.message);
      this.isRunning = false;
      return false;
    }
  }

  /**
   * Handle outsider detection and execute instant sells
   */
  async handleOutsiderDetection(outsiderData) {
    try {
      console.log(`🚨 Outsider detected! Processing ${outsiderData.outsiderTransactions.length} transactions...`);
      
      // Update stats
      this.stats.totalDetections++;
      this.stats.lastDetection = Date.now();
      
      // Log outsider details
      outsiderData.outsiderTransactions.forEach(tx => {
        console.log(`👤 Outsider buy detected:`);
        console.log(`   Signature: ${tx.signature}`);
        console.log(`   Outsiders: ${tx.outsiders.join(', ')}`);
        console.log(`   Amount: ${tx.analysis.amount}`);
        console.log(`   Time: ${new Date(tx.timestamp).toLocaleString()}`);
      });
      
      // Execute instant auto-sell if enabled
      if (this.config.autoSellEnabled) {
        await this.executeInstantAutoSell(outsiderData);
      }
      
    } catch (error) {
      console.error('❌ Error handling outsider detection:', error.message);
    }
  }

  /**
   * Execute instant auto-sell from top profitable wallets
   */
  async executeInstantAutoSell(outsiderData) {
    try {
      console.log('💰 Executing instant auto-sell from top profitable wallets...');
      
      const sellResult = await this.autoSell.executeInstantSell(outsiderData);
      
      // Update stats
      this.stats.totalSells++;
      this.stats.lastSell = Date.now();
      
      if (sellResult.success) {
        this.stats.successfulSells++;
        console.log(`✅ Auto-sell completed successfully:`);
        console.log(`   Wallets sold: ${sellResult.successful}/${sellResult.totalWallets}`);
        console.log(`   Failed: ${sellResult.failed}`);
        
        // Log individual results
        sellResult.results.forEach(result => {
          if (result.result.success) {
            console.log(`   ✅ ${result.wallet}: ${result.result.amount} tokens sold (${result.result.profitPercentage.toFixed(2)}% profit)`);
          } else {
            console.log(`   ❌ ${result.wallet}: ${result.result.error}`);
          }
        });
      } else {
        console.log(`❌ Auto-sell failed: ${sellResult.error || sellResult.reason}`);
      }
      
    } catch (error) {
      console.error('❌ Error executing instant auto-sell:', error.message);
    }
  }

  /**
   * Stop trading system
   */
  async stopTrading() {
    try {
      console.log('🛑 Stopping instant trading system...');
      
      await this.outsiderDetector.stopMonitoring();
      this.autoSell.stop();
      
      this.isRunning = false;
      this.currentToken = null;
      
      console.log('✅ Instant trading system stopped');
    } catch (error) {
      console.error('❌ Error stopping trading system:', error.message);
    }
  }

  /**
   * Get current system status
   */
  getStatus() {
    const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
    const detectionStats = this.outsiderDetector.getStats();
    const autoSellStats = this.autoSell.getStatus();
    const rateLimitStatus = this.rateLimitManager.getStatus();
    
    return {
      isRunning: this.isRunning,
      currentToken: this.currentToken,
      totalWallets: this.wallets.length,
      uptime: uptime,
      stats: {
        ...this.stats,
        uptime: uptime,
        detectionRate: this.stats.totalDetections / (uptime / 60000), // detections per minute
        successRate: this.stats.totalSells > 0 ? (this.stats.successfulSells / this.stats.totalSells) * 100 : 0
      },
      detection: detectionStats,
      autoSell: autoSellStats,
      rateLimits: rateLimitStatus
    };
  }

  /**
   * Get detailed statistics
   */
  getDetailedStats() {
    const status = this.getStatus();
    const topWallets = this.autoSell.getTopProfitableWallets();
    
    return {
      ...status,
      topProfitableWallets: topWallets.map(wallet => ({
        address: wallet.walletAddress,
        profitPercentage: wallet.profitPercentage,
        profitAmount: wallet.profitAmount,
        sellAmount: wallet.sellAmount,
        priority: wallet.priority
      }))
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ Configuration updated:', this.config);
  }

  /**
   * Manually trigger outsider check (for testing)
   */
  async triggerOutsiderCheck() {
    if (!this.isRunning || !this.currentToken) {
      console.log('⚠️ System not running or no token set');
      return false;
    }
    
    try {
      await this.outsiderDetector.checkForOutsiderTransactions(this.currentToken);
      return true;
    } catch (error) {
      console.error('❌ Error triggering outsider check:', error.message);
      return false;
    }
  }

  /**
   * Manually execute auto-sell (for testing or emergency)
   */
  async triggerAutoSell() {
    try {
      const mockOutsiderData = {
        tokenMint: this.currentToken,
        outsiderTransactions: [{ signature: 'manual-trigger', timestamp: Date.now() }],
        timestamp: Date.now(),
        totalOutsiders: 1
      };
      
      await this.executeInstantAutoSell(mockOutsiderData);
      return true;
    } catch (error) {
      console.error('❌ Error triggering auto-sell:', error.message);
      return false;
    }
  }

  /**
   * Force sell from all wallets regardless of profit (emergency only)
   */
  async forceSellAll() {
    try {
      console.log('🚨 FORCE SELLING from all wallets...');
      
      const topWallets = this.autoSell.getTopProfitableWallets(10); // Get top 10
      
      if (topWallets.length === 0) {
        console.log('⚠️ No wallets with tokens found for force sell');
        return { success: false, reason: 'No wallets with tokens' };
      }

      // Override profit threshold for emergency sell
      const originalThreshold = this.autoSell.config.minProfitThreshold;
      this.autoSell.config.minProfitThreshold = -100; // Allow selling even at loss
      
      const result = await this.autoSell.executeInstantSell({
        tokenMint: this.currentToken,
        outsiderTransactions: [{ signature: 'force-sell', timestamp: Date.now() }],
        timestamp: Date.now(),
        totalOutsiders: 1
      });
      
      // Restore original threshold
      this.autoSell.config.minProfitThreshold = originalThreshold;
      
      console.log(`🚨 Force sell completed: ${result.successful}/${result.totalWallets} successful`);
      return result;
      
    } catch (error) {
      console.error('❌ Error in force sell:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = InstantTradingSystem;
