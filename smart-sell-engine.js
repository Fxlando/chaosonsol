/**
 * Smart Sell Engine
 * AI-powered selling system with profit detection and automated selling
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { JupiterV6Integration } = require('./jupiter-v6-integration');
const RateLimitManager = require('./rate-limit-manager');
const smartCacheManager = require('./smart-cache-manager');

class SmartSellEngine {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.jupiter = new JupiterV6Integration(connection, config);
    this.rateLimitManager = new RateLimitManager();
    
    this.config = {
      // Profit detection settings
      minProfitThreshold: config.minProfitThreshold || 5, // 5% minimum profit
      maxProfitThreshold: config.maxProfitThreshold || 1000, // 1000% max profit (safety)
      
      // Stop loss settings
      stopLossPercentage: config.stopLossPercentage || -15, // -15% stop loss
      trailingStopPercentage: config.trailingStopPercentage || 10, // 10% trailing stop
      
      // Selling settings
      sellPercentage: config.sellPercentage || 30, // Sell 30% of holdings
      maxSellPercentage: config.maxSellPercentage || 90, // Max 90% sell
      
      // Risk management
      maxPositionSize: config.maxPositionSize || 1.0, // Max 1 SOL position
      emergencyStopLoss: config.emergencyStopLoss || -25, // -25% emergency stop
      
      // Monitoring settings
      checkInterval: config.checkInterval || 30000, // 30 seconds
      priceUpdateInterval: config.priceUpdateInterval || 10000, // 10 seconds
      
      // Trading settings
      slippage: config.slippage || 200, // 2% slippage
      priorityFee: config.priorityFee || 2000, // 2k lamports
      
      ...config
    };

    // System state
    this.isEnabled = false;
    this.activeMonitors = new Map(); // token -> monitor data
    this.priceHistory = new Map(); // token -> price history
    this.walletPositions = new Map(); // wallet -> position data
    this.sellHistory = new Map(); // wallet -> sell history
    
    // Statistics
    this.stats = {
      totalMonitors: 0,
      totalSells: 0,
      successfulSells: 0,
      totalProfit: 0,
      startTime: null,
      lastSell: null
    };
  }

  /**
   * Enable smart sell for a token and wallet set
   */
  async enable(tokenMint, wallets, options = {}) {
    try {
      console.log(`🧠 Enabling Smart Sell for token: ${tokenMint}`);
      
      if (this.isEnabled) {
        console.log('⚠️ Smart Sell already enabled, disabling previous session');
        await this.disable();
      }

      this.isEnabled = true;
      this.stats.startTime = Date.now();
      
      // Initialize monitor data
      const monitorData = {
        tokenMint,
        wallets: wallets.map(w => ({
          ...w,
          entryPrice: 0,
          maxPrice: 0,
          currentPrice: 0,
          profitPercentage: 0,
          positionSize: 0,
          lastUpdate: Date.now()
        })),
        startTime: Date.now(),
        isActive: true,
        settings: { ...this.config, ...options },
        stats: {
          checksPerformed: 0,
          sellsTriggered: 0,
          profitRealized: 0,
          stopLossTriggered: 0
        }
      };

      this.activeMonitors.set(tokenMint, monitorData);
      this.priceHistory.set(tokenMint, []);
      
      // Start monitoring loop
      this.startMonitoringLoop(tokenMint);
      
      console.log(`✅ Smart Sell enabled for ${wallets.length} wallets`);
      return true;
    } catch (error) {
      console.error('❌ Error enabling Smart Sell:', error.message);
      return false;
    }
  }

  /**
   * Disable smart sell
   */
  async disable() {
    try {
      console.log('🛑 Disabling Smart Sell...');
      
      this.isEnabled = false;
      
      // Stop all monitors
      for (const [tokenMint, monitorData] of this.activeMonitors) {
        monitorData.isActive = false;
      }
      
      this.activeMonitors.clear();
      this.priceHistory.clear();
      this.walletPositions.clear();
      
      console.log('✅ Smart Sell disabled');
    } catch (error) {
      console.error('❌ Error disabling Smart Sell:', error.message);
    }
  }

  /**
   * Main monitoring loop
   */
  startMonitoringLoop(tokenMint) {
    const monitor = async () => {
      try {
        const monitorData = this.activeMonitors.get(tokenMint);
        if (!monitorData || !monitorData.isActive || !this.isEnabled) {
          return; // Stop monitoring
        }

        // Update prices and positions
        await this.updatePricesAndPositions(tokenMint);
        
        // Check for sell conditions
        await this.checkSellConditions(tokenMint);
        
        // Update statistics
        monitorData.stats.checksPerformed++;
        
        // Schedule next check
        setTimeout(monitor, monitorData.settings.checkInterval);

      } catch (error) {
        console.error(`❌ Smart Sell monitoring error for ${tokenMint}:`, error.message);
        setTimeout(monitor, this.config.checkInterval * 2); // Double interval on error
      }
    };

    // Start the monitoring
    monitor();
  }

  /**
   * Update prices and wallet positions
   */
  async updatePricesAndPositions(tokenMint) {
    try {
      const monitorData = this.activeMonitors.get(tokenMint);
      if (!monitorData) return;

      // Get current token price
      const currentPrice = await this.getCurrentPrice(tokenMint);
      const timestamp = Date.now();

      // Update price history
      const history = this.priceHistory.get(tokenMint);
      history.push({ price: currentPrice, timestamp });
      
      // Keep only recent history (last hour)
      const cutoff = timestamp - (60 * 60 * 1000);
      this.priceHistory.set(tokenMint, history.filter(h => h.timestamp > cutoff));

      // Update wallet positions
      for (const wallet of monitorData.wallets) {
        try {
          // Get token balance
          const tokenBalance = await this.getTokenBalance(wallet.publicKey, tokenMint);
          
          if (tokenBalance > 0) {
            // Update position data
            wallet.currentPrice = currentPrice;
            wallet.positionSize = tokenBalance * currentPrice;
            
            // Calculate profit percentage
            if (wallet.entryPrice > 0) {
              wallet.profitPercentage = ((currentPrice - wallet.entryPrice) / wallet.entryPrice) * 100;
            } else {
              // Set entry price if not set
              wallet.entryPrice = currentPrice;
              wallet.profitPercentage = 0;
            }
            
            // Update max price for trailing stop
            if (currentPrice > wallet.maxPrice) {
              wallet.maxPrice = currentPrice;
            }
            
            wallet.lastUpdate = timestamp;
          }
        } catch (error) {
          console.log(`⚠️ Error updating position for wallet ${wallet.publicKey}:`, error.message);
        }
      }

    } catch (error) {
      console.error(`❌ Error updating prices and positions:`, error.message);
    }
  }

  /**
   * Check for sell conditions and execute sells
   */
  async checkSellConditions(tokenMint) {
    try {
      const monitorData = this.activeMonitors.get(tokenMint);
      if (!monitorData) return;

      for (const wallet of monitorData.wallets) {
        if (wallet.positionSize <= 0) continue;

        const shouldSell = this.shouldSellWallet(wallet, monitorData.settings);
        
        if (shouldSell.shouldSell) {
          console.log(`🚨 Sell condition triggered for wallet ${wallet.publicKey}: ${shouldSell.reason}`);
          await this.executeSell(wallet, tokenMint, shouldSell.reason);
        }
      }

    } catch (error) {
      console.error(`❌ Error checking sell conditions:`, error.message);
    }
  }

  /**
   * Determine if a wallet should be sold
   */
  shouldSellWallet(wallet, settings) {
    // Emergency stop loss
    if (wallet.profitPercentage <= settings.emergencyStopLoss) {
      return { shouldSell: true, reason: 'Emergency stop loss triggered' };
    }

    // Regular stop loss
    if (wallet.profitPercentage <= settings.stopLossPercentage) {
      return { shouldSell: true, reason: 'Stop loss triggered' };
    }

    // Trailing stop
    if (wallet.maxPrice > 0) {
      const trailingStopPrice = wallet.maxPrice * (1 - settings.trailingStopPercentage / 100);
      if (wallet.currentPrice <= trailingStopPrice) {
        return { shouldSell: true, reason: 'Trailing stop triggered' };
      }
    }

    // Profit target
    if (wallet.profitPercentage >= settings.minProfitThreshold) {
      return { shouldSell: true, reason: 'Profit target reached' };
    }

    // Position size limit
    if (wallet.positionSize > settings.maxPositionSize) {
      return { shouldSell: true, reason: 'Position size limit exceeded' };
    }

    return { shouldSell: false, reason: 'No sell conditions met' };
  }

  /**
   * Execute sell for a wallet
   */
  async executeSell(wallet, tokenMint, reason) {
    try {
      console.log(`💰 Executing sell for wallet ${wallet.publicKey}: ${reason}`);
      
      // Get current token balance
      const tokenBalance = await this.getTokenBalance(wallet.publicKey, tokenMint);
      
      if (tokenBalance <= 0) {
        console.log(`⚠️ No tokens to sell for wallet ${wallet.publicKey}`);
        return;
      }

      // Calculate sell amount
      const sellPercentage = this.config.sellPercentage / 100;
      const tokensToSell = Math.floor(tokenBalance * sellPercentage);
      
      if (tokensToSell <= 0) {
        console.log(`⚠️ Calculated sell amount is 0 for wallet ${wallet.publicKey}`);
        return;
      }

      // Get wallet keypair
      const keypair = this.getWalletKeypair(wallet);
      if (!keypair) {
        console.log(`❌ Could not get keypair for wallet ${wallet.publicKey}`);
        return;
      }

      // Execute sell through Jupiter
      const sellResult = await this.jupiter.sellToken(
        keypair,
        tokenMint,
        tokensToSell,
        {
          slippage: this.config.slippage,
          priorityFee: this.config.priorityFee,
          source: 'smart-sell',
          session: `smart_sell_${Date.now()}`
        }
      );

      if (sellResult && sellResult.txid) {
        // Record successful sell
        this.recordSell(wallet, tokenMint, tokensToSell, sellResult, reason);
        
        console.log(`✅ Sell executed successfully: ${sellResult.txid}`);
        console.log(`   Tokens sold: ${tokensToSell}`);
        console.log(`   SOL received: ${sellResult.outAmount ? (sellResult.outAmount / LAMPORTS_PER_SOL).toFixed(6) : 'Unknown'}`);
        
        this.stats.successfulSells++;
        this.stats.totalSells++;
        this.stats.lastSell = Date.now();
        
        // Update wallet position
        wallet.positionSize = 0;
        wallet.profitPercentage = 0;
        
      } else {
        console.log(`❌ Sell failed for wallet ${wallet.publicKey}`);
        this.stats.totalSells++;
      }

    } catch (error) {
      console.error(`❌ Error executing sell for wallet ${wallet.publicKey}:`, error.message);
      this.stats.totalSells++;
    }
  }

  /**
   * Record sell transaction
   */
  recordSell(wallet, tokenMint, tokensSold, sellResult, reason) {
    const sellRecord = {
      wallet: wallet.publicKey,
      tokenMint,
      tokensSold,
      solReceived: sellResult.outAmount ? sellResult.outAmount / LAMPORTS_PER_SOL : 0,
      txSignature: sellResult.txid,
      reason,
      timestamp: Date.now(),
      profitPercentage: wallet.profitPercentage
    };

    // Add to sell history
    if (!this.sellHistory.has(wallet.publicKey)) {
      this.sellHistory.set(wallet.publicKey, []);
    }
    this.sellHistory.get(wallet.publicKey).push(sellRecord);

    // Update total profit
    this.stats.totalProfit += sellRecord.solReceived;
  }

  /**
   * Get current token price
   */
  async getCurrentPrice(tokenMint) {
    try {
      const quote = await this.jupiter.getQuote(tokenMint, this.jupiter.solMint, LAMPORTS_PER_SOL);
      return parseFloat(quote.outAmount) / LAMPORTS_PER_SOL;
    } catch (error) {
      console.log(`⚠️ Error getting price for ${tokenMint}:`, error.message);
      return 0.001; // Default fallback price
    }
  }

  /**
   * Get token balance for a wallet
   */
  async getTokenBalance(walletAddress, tokenMint) {
    const cacheKey = `token_balance_${walletAddress}_${tokenMint}`;
    
    return await smartCacheManager.getOrFetch('token-balance', cacheKey, async () => {
      try {
        return await this.rateLimitManager.makeRequest('solana-rpc', async () => {
          const publicKey = new PublicKey(walletAddress);
          const tokenMintPublicKey = new PublicKey(tokenMint);
          
          // Get all token accounts for this wallet
          const tokenAccounts = await this.connection.getTokenAccountsByOwner(
            publicKey,
            { mint: tokenMintPublicKey }
          );
          
          if (tokenAccounts.value.length === 0) {
            return 0; // No token account for this token
          }
          
          // Get balance from the first token account
          const tokenAccount = tokenAccounts.value[0];
          const balance = await this.connection.getTokenAccountBalance(tokenAccount.pubkey);
          return balance.value.uiAmount || 0;
        });
      } catch (error) {
        console.log(`⚠️ Error getting token balance for ${walletAddress}:`, error.message);
        return 0;
      }
    });
  }

  /**
   * Get wallet keypair
   */
  getWalletKeypair(wallet) {
    try {
      if (wallet.keypair) {
        return wallet.keypair;
      } else if (wallet.privateKey) {
        const { Keypair } = require('@solana/web3.js');
        return Keypair.fromSecretKey(new Uint8Array(wallet.privateKey));
      }
      return null;
    } catch (error) {
      console.log(`⚠️ Error getting keypair for wallet:`, error.message);
      return null;
    }
  }

  /**
   * Get current system status
   */
  getStatus() {
    const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
    const activeMonitors = Array.from(this.activeMonitors.values()).filter(m => m.isActive).length;
    
    return {
      isEnabled: this.isEnabled,
      activeMonitors,
      uptime,
      stats: {
        ...this.stats,
        uptime,
        successRate: this.stats.totalSells > 0 ? (this.stats.successfulSells / this.stats.totalSells) * 100 : 0,
        avgProfitPerSell: this.stats.successfulSells > 0 ? this.stats.totalProfit / this.stats.successfulSells : 0
      },
      monitors: Array.from(this.activeMonitors.entries()).map(([tokenMint, data]) => ({
        tokenMint,
        walletCount: data.wallets.length,
        isActive: data.isActive,
        startTime: data.startTime,
        stats: data.stats
      }))
    };
  }

  /**
   * Get sell history for a wallet
   */
  getSellHistory(walletAddress) {
    return this.sellHistory.get(walletAddress) || [];
  }

  /**
   * Get all sell history
   */
  getAllSellHistory() {
    const allHistory = [];
    for (const [walletAddress, history] of this.sellHistory) {
      allHistory.push(...history);
    }
    return allHistory.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Update settings for a monitor
   */
  updateMonitorSettings(tokenMint, settings) {
    const monitorData = this.activeMonitors.get(tokenMint);
    if (!monitorData) {
      throw new Error(`Monitor for token ${tokenMint} not found`);
    }

    monitorData.settings = { ...monitorData.settings, ...settings };
    console.log(`✅ Updated settings for monitor ${tokenMint}`);
  }

  /**
   * Manually trigger sell for a wallet
   */
  async triggerManualSell(walletAddress, tokenMint, reason = 'Manual trigger') {
    const monitorData = this.activeMonitors.get(tokenMint);
    if (!monitorData) {
      throw new Error(`Monitor for token ${tokenMint} not found`);
    }

    const wallet = monitorData.wallets.find(w => w.publicKey === walletAddress);
    if (!wallet) {
      throw new Error(`Wallet ${walletAddress} not found in monitor`);
    }

    await this.executeSell(wallet, tokenMint, reason);
  }
}

module.exports = { SmartSellEngine };