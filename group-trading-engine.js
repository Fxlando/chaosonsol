const { WalletGroupManager } = require('./wallet-group-manager');
const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');

class GroupTradingEngine {
  constructor(connection, walletGroupManager, jupiterIntegration = null, smartSellEngine = null) {
    this.connection = connection;
    this.walletGroupManager = walletGroupManager;
    this.jupiterIntegration = jupiterIntegration;
    this.smartSellEngine = smartSellEngine;
    this.executionHistory = [];
  }

  // ===========================================
  // GROUP TRADING OPERATIONS
  // ===========================================

  async executeGroupBuy(groupName, tokenAddress, options = {}) {
    const groupConfig = this.walletGroupManager.groupsConfig[groupName];
    if (!groupConfig) {
      throw new Error(`Group '${groupName}' not found`);
    }

    if (groupConfig.status !== 'active') {
      throw new Error(`Group '${groupName}' is not active`);
    }

    const {
      strategy = groupConfig.strategy,
      maxWallets = null,
      buyAmount = groupConfig.settings.buyAmount,
      slippage = groupConfig.settings.slippage,
      priorityFee = groupConfig.settings.priorityFee,
      delayBetweenTrades = 0,
      simultaneousLimit = null
    } = options;

    const walletsToExecute = this.walletGroupManager.getWalletsForExecution(
      groupName, 
      strategy, 
      maxWallets
    );

    if (walletsToExecute.length === 0) {
      throw new Error(`No active wallets found in group '${groupName}'`);
    }

    const executionId = this.generateExecutionId();
    const execution = {
      id: executionId,
      type: 'buy',
      groupName,
      tokenAddress,
      strategy,
      buyAmount,
      slippage,
      priorityFee,
      walletsCount: walletsToExecute.length,
      startTime: Date.now(),
      status: 'executing',
      results: []
    };

    this.executionHistory.push(execution);

    try {
      let results = [];

      if (strategy === 'simultaneous' || (simultaneousLimit && walletsToExecute.length <= simultaneousLimit)) {
        // Execute all wallets simultaneously
        results = await this.executeSimultaneousBuys(walletsToExecute, tokenAddress, {
          buyAmount, slippage, priorityFee
        });
      } else {
        // Execute wallets sequentially with optional delay
        results = await this.executeSequentialBuys(walletsToExecute, tokenAddress, {
          buyAmount, slippage, priorityFee, delayBetweenTrades
        });
      }

      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.results = results;
      execution.successCount = results.filter(r => r.success).length;
      execution.failureCount = results.filter(r => !r.success).length;

      // Update wallet execution timestamps
      this.updateWalletExecutionTimestamps(walletsToExecute);

      return execution;

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = Date.now();
      throw error;
    }
  }

  async executeGroupSell(groupName, tokenAddress, options = {}) {
    const groupConfig = this.walletGroupManager.groupsConfig[groupName];
    if (!groupConfig) {
      throw new Error(`Group '${groupName}' not found`);
    }

    if (groupConfig.status !== 'active') {
      throw new Error(`Group '${groupName}' is not active`);
    }

    const {
      strategy = groupConfig.strategy,
      maxWallets = null,
      sellAmount = groupConfig.settings.sellAmount,
      sellPercentage = null, // Sell percentage of holdings instead of fixed amount
      slippage = groupConfig.settings.slippage,
      priorityFee = groupConfig.settings.priorityFee,
      delayBetweenTrades = 0,
      simultaneousLimit = null,
      onlyIfProfit = false,
      minProfitPercentage = 0
    } = options;

    const walletsToExecute = this.walletGroupManager.getWalletsForExecution(
      groupName, 
      strategy, 
      maxWallets
    );

    if (walletsToExecute.length === 0) {
      throw new Error(`No active wallets found in group '${groupName}'`);
    }

    // Filter wallets that have the token to sell
    const walletsWithToken = await this.getWalletsWithToken(walletsToExecute, tokenAddress);
    
    if (walletsWithToken.length === 0) {
      throw new Error(`No wallets in group '${groupName}' hold token ${tokenAddress}`);
    }

    const executionId = this.generateExecutionId();
    const execution = {
      id: executionId,
      type: 'sell',
      groupName,
      tokenAddress,
      strategy,
      sellAmount,
      sellPercentage,
      slippage,
      priorityFee,
      walletsCount: walletsWithToken.length,
      startTime: Date.now(),
      status: 'executing',
      results: []
    };

    this.executionHistory.push(execution);

    try {
      let results = [];

      if (strategy === 'simultaneous' || (simultaneousLimit && walletsWithToken.length <= simultaneousLimit)) {
        // Execute all wallets simultaneously
        results = await this.executeSimultaneousSells(walletsWithToken, tokenAddress, {
          sellAmount, sellPercentage, slippage, priorityFee, onlyIfProfit, minProfitPercentage
        });
      } else {
        // Execute wallets sequentially with optional delay
        results = await this.executeSequentialSells(walletsWithToken, tokenAddress, {
          sellAmount, sellPercentage, slippage, priorityFee, delayBetweenTrades, onlyIfProfit, minProfitPercentage
        });
      }

      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.results = results;
      execution.successCount = results.filter(r => r.success).length;
      execution.failureCount = results.filter(r => !r.success).length;

      // Update wallet execution timestamps
      this.updateWalletExecutionTimestamps(walletsWithToken);

      return execution;

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = Date.now();
      throw error;
    }
  }

  // ===========================================
  // VOLUME GENERATION
  // ===========================================

  async generateVolume(groupName, tokenAddress, options = {}) {
    const {
      volumeTarget = 1000, // Target volume in SOL
      duration = 300, // Duration in seconds (5 minutes)
      buyPercentage = 50, // Percentage of operations that should be buys
      minTradeSize = 0.001,
      maxTradeSize = 0.01,
      randomDelay = { min: 1000, max: 5000 }, // Random delay between trades in ms
      spreadTrades = true // Whether to spread trades evenly across duration
    } = options;

    const walletsToUse = this.walletGroupManager.getWalletsForExecution(groupName, 'random');
    
    if (walletsToUse.length === 0) {
      throw new Error(`No wallets available in group '${groupName}' for volume generation`);
    }

    const executionId = this.generateExecutionId();
    const execution = {
      id: executionId,
      type: 'volume_generation',
      groupName,
      tokenAddress,
      volumeTarget,
      duration,
      walletsCount: walletsToUse.length,
      startTime: Date.now(),
      status: 'executing',
      results: [],
      volumeGenerated: 0
    };

    this.executionHistory.push(execution);

    try {
      const trades = this.planVolumeGeneration(walletsToUse, {
        volumeTarget,
        duration,
        buyPercentage,
        minTradeSize,
        maxTradeSize,
        spreadTrades
      });

      const results = [];
      let totalVolume = 0;

      for (const trade of trades) {
        // Wait for the scheduled time
        const now = Date.now();
        if (trade.executeAt > now) {
          await this.sleep(trade.executeAt - now);
        }

        try {
          let result;
          if (trade.type === 'buy') {
            result = await this.executeSingleBuy(trade.wallet, tokenAddress, {
              buyAmount: trade.amount,
              slippage: trade.slippage,
              priorityFee: trade.priorityFee
            });
          } else {
            result = await this.executeSingleSell(trade.wallet, tokenAddress, {
              sellAmount: trade.amount,
              slippage: trade.slippage,
              priorityFee: trade.priorityFee
            });
          }

          if (result.success) {
            totalVolume += trade.amount;
          }

          results.push({
            ...result,
            tradeType: trade.type,
            plannedAmount: trade.amount,
            executeAt: trade.executeAt
          });

        } catch (error) {
          results.push({
            wallet: trade.wallet.name,
            tradeType: trade.type,
            plannedAmount: trade.amount,
            success: false,
            error: error.message,
            executeAt: trade.executeAt
          });
        }

        // Add random delay between trades if specified
        if (randomDelay && randomDelay.min > 0) {
          const delay = Math.random() * (randomDelay.max - randomDelay.min) + randomDelay.min;
          await this.sleep(delay);
        }
      }

      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.results = results;
      execution.volumeGenerated = totalVolume;
      execution.volumePercentage = (totalVolume / volumeTarget) * 100;
      execution.successCount = results.filter(r => r.success).length;
      execution.failureCount = results.filter(r => !r.success).length;

      return execution;

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = Date.now();
      throw error;
    }
  }

  planVolumeGeneration(wallets, options) {
    const {
      volumeTarget,
      duration,
      buyPercentage,
      minTradeSize,
      maxTradeSize,
      spreadTrades
    } = options;

    const trades = [];
    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);

    let remainingVolume = volumeTarget;
    let tradeIndex = 0;

    while (remainingVolume > minTradeSize && trades.length < 1000) { // Safety limit
      const wallet = wallets[tradeIndex % wallets.length];
      
      // Determine if this should be a buy or sell
      const isBuy = Math.random() * 100 < buyPercentage;
      
      // Calculate trade amount
      const maxPossibleTrade = Math.min(maxTradeSize, remainingVolume);
      const tradeAmount = Math.random() * (maxPossibleTrade - minTradeSize) + minTradeSize;
      
      // Calculate execution time
      let executeAt;
      if (spreadTrades) {
        executeAt = startTime + (trades.length / 1000) * duration * 1000;
      } else {
        executeAt = startTime + Math.random() * duration * 1000;
      }

      trades.push({
        wallet,
        type: isBuy ? 'buy' : 'sell',
        amount: tradeAmount,
        executeAt,
        slippage: 1.0 + Math.random() * 0.5, // Random slippage between 1.0-1.5%
        priorityFee: 10000 + Math.random() * 5000 // Random priority fee
      });

      remainingVolume -= tradeAmount;
      tradeIndex++;
    }

    // Sort trades by execution time
    trades.sort((a, b) => a.executeAt - b.executeAt);

    return trades;
  }

  // ===========================================
  // EXECUTION HELPERS
  // ===========================================

  async executeSimultaneousBuys(wallets, tokenAddress, options) {
    const promises = wallets.map(wallet => 
      this.executeSingleBuy(wallet, tokenAddress, options)
    );

    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          wallet: wallets[index].name,
          success: false,
          error: result.reason.message || 'Unknown error',
          amount: options.buyAmount
        };
      }
    });
  }

  async executeSequentialBuys(wallets, tokenAddress, options) {
    const results = [];
    
    for (const wallet of wallets) {
      try {
        const result = await this.executeSingleBuy(wallet, tokenAddress, options);
        results.push(result);
        
        if (options.delayBetweenTrades > 0) {
          await this.sleep(options.delayBetweenTrades);
        }
      } catch (error) {
        results.push({
          wallet: wallet.name,
          success: false,
          error: error.message,
          amount: options.buyAmount
        });
      }
    }
    
    return results;
  }

  async executeSimultaneousSells(wallets, tokenAddress, options) {
    const promises = wallets.map(wallet => 
      this.executeSingleSell(wallet, tokenAddress, options)
    );

    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          wallet: wallets[index].name,
          success: false,
          error: result.reason.message || 'Unknown error',
          amount: options.sellAmount
        };
      }
    });
  }

  async executeSequentialSells(wallets, tokenAddress, options) {
    const results = [];
    
    for (const wallet of wallets) {
      try {
        const result = await this.executeSingleSell(wallet, tokenAddress, options);
        results.push(result);
        
        if (options.delayBetweenTrades > 0) {
          await this.sleep(options.delayBetweenTrades);
        }
      } catch (error) {
        results.push({
          wallet: wallet.name,
          success: false,
          error: error.message,
          amount: options.sellAmount || options.sellPercentage
        });
      }
    }
    
    return results;
  }

  async executeSingleBuy(wallet, tokenAddress, options) {
    const { buyAmount, slippage, priorityFee } = options;
    const startTime = Date.now();

    try {
      // This would integrate with your Jupiter/trading engine
      if (this.jupiterIntegration) {
        const keypair = this.walletGroupManager.getKeypairFromAddress(wallet.pubkey);
        const result = await this.jupiterIntegration.swapSOLToToken(
          keypair,
          tokenAddress,
          buyAmount,
          { slippage, priorityFee }
        );

        return {
          wallet: wallet.name,
          success: true,
          amount: buyAmount,
          tokenAddress,
          txHash: result.txHash,
          tokensReceived: result.tokensReceived,
          duration: Date.now() - startTime,
          executedAt: Date.now()
        };
      } else {
        // Simulated buy for testing
        await this.sleep(Math.random() * 2000 + 1000); // Simulate network delay
        
        return {
          wallet: wallet.name,
          success: true,
          amount: buyAmount,
          tokenAddress,
          txHash: 'simulated_buy_' + Math.random().toString(36).substr(2, 9),
          tokensReceived: buyAmount * 1000000, // Simulated tokens received
          duration: Date.now() - startTime,
          executedAt: Date.now(),
          simulated: true
        };
      }
    } catch (error) {
      return {
        wallet: wallet.name,
        success: false,
        amount: buyAmount,
        tokenAddress,
        error: error.message,
        duration: Date.now() - startTime,
        executedAt: Date.now()
      };
    }
  }

  async executeSingleSell(wallet, tokenAddress, options) {
    const { sellAmount, sellPercentage, slippage, priorityFee, onlyIfProfit, minProfitPercentage } = options;
    const startTime = Date.now();

    try {
      // This would integrate with your Jupiter/trading engine
      if (this.jupiterIntegration) {
        const keypair = this.walletGroupManager.getKeypairFromAddress(wallet.pubkey);
        
        let actualSellAmount = sellAmount;
        if (sellPercentage) {
          const tokenBalance = await this.getTokenBalance(wallet.pubkey, tokenAddress);
          actualSellAmount = (tokenBalance * sellPercentage) / 100;
        }

        if (onlyIfProfit && minProfitPercentage > 0) {
          const profitCheck = await this.checkProfitability(wallet.pubkey, tokenAddress, actualSellAmount);
          if (profitCheck.profitPercentage < minProfitPercentage) {
            throw new Error(`Profit check failed: ${profitCheck.profitPercentage}% < ${minProfitPercentage}%`);
          }
        }

        const result = await this.jupiterIntegration.swapTokenToSOL(
          keypair,
          tokenAddress,
          actualSellAmount,
          { slippage, priorityFee }
        );

        return {
          wallet: wallet.name,
          success: true,
          amount: actualSellAmount,
          tokenAddress,
          txHash: result.txHash,
          solReceived: result.solReceived,
          duration: Date.now() - startTime,
          executedAt: Date.now()
        };
      } else {
        // Simulated sell for testing
        await this.sleep(Math.random() * 2000 + 1000); // Simulate network delay
        
        const actualSellAmount = sellAmount || (sellPercentage ? sellPercentage + '% of holdings' : 'unknown');
        
        return {
          wallet: wallet.name,
          success: true,
          amount: actualSellAmount,
          tokenAddress,
          txHash: 'simulated_sell_' + Math.random().toString(36).substr(2, 9),
          solReceived: 0.005, // Simulated SOL received
          duration: Date.now() - startTime,
          executedAt: Date.now(),
          simulated: true
        };
      }
    } catch (error) {
      const actualSellAmount = sellAmount || (sellPercentage ? sellPercentage + '% of holdings' : 'unknown');
      
      return {
        wallet: wallet.name,
        success: false,
        amount: actualSellAmount,
        tokenAddress,
        error: error.message,
        duration: Date.now() - startTime,
        executedAt: Date.now()
      };
    }
  }

  // ===========================================
  // HELPER METHODS
  // ===========================================

  async getWalletsWithToken(wallets, tokenAddress) {
    // This would check which wallets actually hold the token
    // For now, return all wallets (simulated)
    return wallets;
  }

  async getTokenBalance(walletAddress, tokenAddress) {
    // This would get the actual token balance
    // For now, return simulated balance
    return Math.random() * 1000000; // Simulated token amount
  }

  async checkProfitability(walletAddress, tokenAddress, amount) {
    // This would check if selling would be profitable
    // For now, return simulated profitability
    return {
      profitPercentage: Math.random() * 200 - 50, // Random profit between -50% and +150%
      breakEven: false
    };
  }

  updateWalletExecutionTimestamps(wallets) {
    const now = Date.now();
    wallets.forEach(wallet => {
      const walletIndex = this.walletGroupManager.wallets.findIndex(w => w.pubkey === wallet.pubkey);
      if (walletIndex !== -1) {
        this.walletGroupManager.wallets[walletIndex].lastExecuted = now;
      }
    });
    this.walletGroupManager.saveWallets();
  }

  generateExecutionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===========================================
  // EXECUTION HISTORY & ANALYTICS
  // ===========================================

  getExecutionHistory(limit = 50) {
    return this.executionHistory
      .slice(-limit)
      .reverse(); // Most recent first
  }

  getGroupExecutionStats(groupName) {
    const groupExecutions = this.executionHistory.filter(e => e.groupName === groupName);
    
    if (groupExecutions.length === 0) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        totalVolume: 0,
        lastExecution: null
      };
    }

    const successful = groupExecutions.filter(e => e.status === 'completed');
    const failed = groupExecutions.filter(e => e.status === 'failed');
    
    const totalDuration = successful.reduce((sum, e) => sum + (e.duration || 0), 0);
    const averageDuration = successful.length > 0 ? totalDuration / successful.length : 0;
    
    const totalVolume = groupExecutions.reduce((sum, e) => {
      if (e.type === 'volume_generation') {
        return sum + (e.volumeGenerated || 0);
      } else if (e.results) {
        return sum + e.results.reduce((subSum, r) => {
          return subSum + (r.success ? (r.amount || 0) : 0);
        }, 0);
      }
      return sum;
    }, 0);

    return {
      totalExecutions: groupExecutions.length,
      successfulExecutions: successful.length,
      failedExecutions: failed.length,
      successRate: groupExecutions.length > 0 ? (successful.length / groupExecutions.length) * 100 : 0,
      averageDuration,
      totalVolume,
      lastExecution: groupExecutions[groupExecutions.length - 1]
    };
  }

  getAllGroupStats() {
    const allGroups = Object.keys(this.walletGroupManager.groupsConfig);
    const stats = {};

    for (const groupName of allGroups) {
      stats[groupName] = this.getGroupExecutionStats(groupName);
    }

    return stats;
  }
}

module.exports = { GroupTradingEngine };