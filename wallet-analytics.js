/**
 * Wallet Analytics
 * Comprehensive analytics and performance tracking for wallets
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const tradeTracker = require('./trade-tracker');
const smartCacheManager = require('./smart-cache-manager');
const RateLimitManager = require('./rate-limit-manager');

class WalletAnalytics {
  constructor(walletGroupManager) {
    this.walletGroupManager = walletGroupManager;
    this.rateLimitManager = new RateLimitManager();
    this.analyticsCache = new Map();
  }

  /**
   * Get comprehensive wallet analytics
   */
  async getWalletAnalytics(walletAddress, options = {}) {
    const cacheKey = `analytics_${walletAddress}_${JSON.stringify(options)}`;
    
    return await smartCacheManager.getOrFetch('wallet-analytics', cacheKey, async () => {
      try {
        const wallet = this.walletGroupManager.getWalletByPublicKey(walletAddress);
        if (!wallet) {
          throw new Error(`Wallet ${walletAddress} not found`);
        }

        // Get basic wallet info
        const basicInfo = await this.getBasicWalletInfo(walletAddress);
        
        // Get trading history
        const tradingHistory = tradeTracker.getWalletTrades(walletAddress, options.limit || 100);
        
        // Get P&L data
        const pnlData = this.calculateWalletPnL(walletAddress, tradingHistory);
        
        // Get performance metrics
        const performanceMetrics = this.calculatePerformanceMetrics(tradingHistory);
        
        // Get token holdings
        const tokenHoldings = await this.getTokenHoldings(walletAddress);
        
        // Get risk metrics
        const riskMetrics = this.calculateRiskMetrics(tradingHistory);
        
        // Get activity summary
        const activitySummary = this.calculateActivitySummary(tradingHistory);

        return {
          wallet: {
            address: walletAddress,
            name: wallet.name,
            groupId: wallet.groupId,
            status: wallet.status,
            createdAt: wallet.createdAt
          },
          basicInfo,
          tradingHistory: tradingHistory.slice(0, options.limit || 50),
          pnlData,
          performanceMetrics,
          tokenHoldings,
          riskMetrics,
          activitySummary,
          lastUpdated: Date.now()
        };
      } catch (error) {
        console.error(`❌ Error getting wallet analytics for ${walletAddress}:`, error.message);
        throw error;
      }
    });
  }

  /**
   * Get basic wallet information
   */
  async getBasicWalletInfo(walletAddress) {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Get SOL balance
      const solBalance = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        const balance = await this.connection.getBalance(publicKey);
        return balance / LAMPORTS_PER_SOL;
      });

      // Get account info
      const accountInfo = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        return await this.connection.getAccountInfo(publicKey);
      });

      return {
        solBalance,
        isExecutable: accountInfo?.executable || false,
        owner: accountInfo?.owner?.toString(),
        lamports: accountInfo?.lamports || 0,
        dataLength: accountInfo?.data?.length || 0
      };
    } catch (error) {
      console.error(`❌ Error getting basic wallet info for ${walletAddress}:`, error.message);
      return {
        solBalance: 0,
        isExecutable: false,
        owner: null,
        lamports: 0,
        dataLength: 0
      };
    }
  }

  /**
   * Calculate wallet P&L
   */
  calculateWalletPnL(walletAddress, trades) {
    const buyTrades = trades.filter(t => t.type === 'buy');
    const sellTrades = trades.filter(t => t.type === 'sell');
    
    let totalSolSpent = 0;
    let totalSolReceived = 0;
    let totalTokensBought = 0;
    let totalTokensSold = 0;
    
    for (const trade of buyTrades) {
      totalSolSpent += trade.solAmount || 0;
      totalTokensBought += trade.tokensReceived || 0;
    }
    
    for (const trade of sellTrades) {
      totalSolReceived += trade.solReceived || 0;
      totalTokensSold += trade.tokensSold || 0;
    }
    
    const netPnL = totalSolReceived - totalSolSpent;
    const roi = totalSolSpent > 0 ? (netPnL / totalSolSpent) * 100 : 0;
    
    return {
      totalSolSpent,
      totalSolReceived,
      netPnL,
      roi,
      totalTokensBought,
      totalTokensSold,
      currentTokens: totalTokensBought - totalTokensSold,
      totalTrades: trades.length,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length
    };
  }

  /**
   * Calculate performance metrics
   */
  calculatePerformanceMetrics(trades) {
    if (trades.length === 0) {
      return {
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
        totalVolume: 0
      };
    }

    const sellTrades = trades.filter(t => t.type === 'sell');
    const pnlValues = [];
    let totalVolume = 0;
    let totalWins = 0;
    let totalLosses = 0;
    let maxDrawdown = 0;
    let peak = 0;
    let currentPnL = 0;

    for (const trade of trades) {
      totalVolume += trade.usdValue || 0;
      
      if (trade.type === 'sell') {
        const pnl = (trade.solReceived || 0) - (trade.solAmount || 0);
        pnlValues.push(pnl);
        currentPnL += pnl;
        
        if (pnl > 0) {
          totalWins += pnl;
        } else {
          totalLosses += Math.abs(pnl);
        }
        
        if (currentPnL > peak) {
          peak = currentPnL;
        }
        
        const drawdown = peak - currentPnL;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    const winRate = sellTrades.length > 0 ? (totalWins > 0 ? (totalWins / sellTrades.length) * 100 : 0) : 0;
    const avgWin = totalWins > 0 ? totalWins / sellTrades.filter(t => (t.solReceived || 0) > (t.solAmount || 0)).length : 0;
    const avgLoss = totalLosses > 0 ? totalLosses / sellTrades.filter(t => (t.solReceived || 0) < (t.solAmount || 0)).length : 0;
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;
    
    // Calculate Sharpe ratio (simplified)
    const avgReturn = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
    const variance = pnlValues.length > 1 ? pnlValues.reduce((sum, val) => sum + Math.pow(val - avgReturn, 2), 0) / (pnlValues.length - 1) : 0;
    const sharpeRatio = variance > 0 ? avgReturn / Math.sqrt(variance) : 0;

    return {
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      totalVolume,
      totalTrades: trades.length,
      profitableTrades: sellTrades.filter(t => (t.solReceived || 0) > (t.solAmount || 0)).length
    };
  }

  /**
   * Get token holdings for wallet
   */
  async getTokenHoldings(walletAddress) {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Get all token accounts
      const tokenAccounts = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        return await this.connection.getTokenAccountsByOwner(publicKey, {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
        });
      });

      const holdings = [];
      
      for (const account of tokenAccounts.value) {
        try {
          const balance = await this.connection.getTokenAccountBalance(account.pubkey);
          const accountInfo = await this.connection.getParsedAccountInfo(account.pubkey);
          
          if (balance.value.uiAmount > 0) {
            holdings.push({
              mint: account.account.data.parsed.info.mint,
              balance: balance.value.uiAmount,
              decimals: balance.value.decimals,
              amount: balance.value.amount,
              owner: account.account.data.parsed.info.owner
            });
          }
        } catch (error) {
          // Skip invalid accounts
        }
      }

      return holdings;
    } catch (error) {
      console.error(`❌ Error getting token holdings for ${walletAddress}:`, error.message);
      return [];
    }
  }

  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(trades) {
    if (trades.length === 0) {
      return {
        volatility: 0,
        maxLoss: 0,
        maxGain: 0,
        riskScore: 0,
        concentration: 0
      };
    }

    const pnlValues = trades
      .filter(t => t.type === 'sell')
      .map(t => (t.solReceived || 0) - (t.solAmount || 0));

    if (pnlValues.length === 0) {
      return {
        volatility: 0,
        maxLoss: 0,
        maxGain: 0,
        riskScore: 0,
        concentration: 0
      };
    }

    const avgReturn = pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length;
    const variance = pnlValues.reduce((sum, val) => sum + Math.pow(val - avgReturn, 2), 0) / pnlValues.length;
    const volatility = Math.sqrt(variance);
    
    const maxLoss = Math.min(...pnlValues);
    const maxGain = Math.max(...pnlValues);
    
    // Risk score (0-100, higher = riskier)
    const riskScore = Math.min(100, Math.max(0, (volatility * 10) + (Math.abs(maxLoss) * 5)));
    
    // Concentration (based on token diversity)
    const tokenCounts = {};
    for (const trade of trades) {
      tokenCounts[trade.tokenMint] = (tokenCounts[trade.tokenMint] || 0) + 1;
    }
    const totalTrades = trades.length;
    const maxTokenTrades = Math.max(...Object.values(tokenCounts));
    const concentration = totalTrades > 0 ? (maxTokenTrades / totalTrades) * 100 : 0;

    return {
      volatility,
      maxLoss,
      maxGain,
      riskScore,
      concentration,
      tokenDiversity: Object.keys(tokenCounts).length
    };
  }

  /**
   * Calculate activity summary
   */
  calculateActivitySummary(trades) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    const recentTrades = trades.filter(t => now - t.timestamp < oneDay);
    const weeklyTrades = trades.filter(t => now - t.timestamp < oneWeek);
    const monthlyTrades = trades.filter(t => now - t.timestamp < oneMonth);

    const buyTrades = trades.filter(t => t.type === 'buy');
    const sellTrades = trades.filter(t => t.type === 'sell');

    return {
      totalTrades: trades.length,
      recentTrades: recentTrades.length,
      weeklyTrades: weeklyTrades.length,
      monthlyTrades: monthlyTrades.length,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      firstTrade: trades.length > 0 ? Math.min(...trades.map(t => t.timestamp)) : null,
      lastTrade: trades.length > 0 ? Math.max(...trades.map(t => t.timestamp)) : null,
      avgTradesPerDay: monthlyTrades.length / 30,
      mostActiveToken: this.getMostActiveToken(trades),
      tradingSources: this.getTradingSources(trades)
    };
  }

  /**
   * Get most active token
   */
  getMostActiveToken(trades) {
    const tokenCounts = {};
    for (const trade of trades) {
      tokenCounts[trade.tokenMint] = (tokenCounts[trade.tokenMint] || 0) + 1;
    }

    const mostActive = Object.entries(tokenCounts)
      .sort(([,a], [,b]) => b - a)[0];

    return mostActive ? {
      tokenMint: mostActive[0],
      tradeCount: mostActive[1]
    } : null;
  }

  /**
   * Get trading sources
   */
  getTradingSources(trades) {
    const sourceCounts = {};
    for (const trade of trades) {
      sourceCounts[trade.source] = (sourceCounts[trade.source] || 0) + 1;
    }

    return Object.entries(sourceCounts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get group analytics
   */
  async getGroupAnalytics(groupId, options = {}) {
    try {
      const group = this.walletGroupManager.getGroup(groupId);
      if (!group) {
        throw new Error(`Group ${groupId} not found`);
      }

      const walletAnalytics = await Promise.all(
        group.wallets.map(wallet => 
          this.getWalletAnalytics(wallet.publicKey, options)
        )
      );

      // Aggregate group metrics
      const groupMetrics = this.aggregateGroupMetrics(walletAnalytics);

      return {
        groupId,
        groupName: group.name,
        walletCount: group.wallets.length,
        walletAnalytics,
        groupMetrics,
        lastUpdated: Date.now()
      };
    } catch (error) {
      console.error(`❌ Error getting group analytics for ${groupId}:`, error.message);
      throw error;
    }
  }

  /**
   * Aggregate group metrics
   */
  aggregateGroupMetrics(walletAnalytics) {
    const totalWallets = walletAnalytics.length;
    const activeWallets = walletAnalytics.filter(w => w.basicInfo.solBalance > 0).length;

    let totalPnL = 0;
    let totalVolume = 0;
    let totalTrades = 0;
    let totalWins = 0;
    let totalLosses = 0;

    for (const wallet of walletAnalytics) {
      totalPnL += wallet.pnlData.netPnL;
      totalVolume += wallet.performanceMetrics.totalVolume;
      totalTrades += wallet.pnlData.totalTrades;
      totalWins += wallet.performanceMetrics.avgWin * wallet.pnlData.buyTrades;
      totalLosses += wallet.performanceMetrics.avgLoss * wallet.pnlData.sellTrades;
    }

    const avgPnL = totalWallets > 0 ? totalPnL / totalWallets : 0;
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

    return {
      totalWallets,
      activeWallets,
      totalPnL,
      avgPnL,
      totalVolume,
      totalTrades,
      winRate,
      avgTradesPerWallet: totalWallets > 0 ? totalTrades / totalWallets : 0
    };
  }

  /**
   * Get top performing wallets
   */
  getTopPerformingWallets(limit = 10) {
    const allWallets = this.walletGroupManager.getAllWallets();
    const walletPerformance = [];

    for (const wallet of allWallets) {
      const trades = tradeTracker.getWalletTrades(wallet.publicKey);
      const pnlData = this.calculateWalletPnL(wallet.publicKey, trades);
      
      walletPerformance.push({
        wallet: wallet.publicKey,
        name: wallet.name,
        groupId: wallet.groupId,
        netPnL: pnlData.netPnL,
        roi: pnlData.roi,
        totalTrades: pnlData.totalTrades
      });
    }

    return walletPerformance
      .sort((a, b) => b.netPnL - a.netPnL)
      .slice(0, limit);
  }

  /**
   * Get performance comparison
   */
  getPerformanceComparison(walletAddresses) {
    const comparisons = [];

    for (const walletAddress of walletAddresses) {
      const trades = tradeTracker.getWalletTrades(walletAddress);
      const pnlData = this.calculateWalletPnL(walletAddress, trades);
      const performanceMetrics = this.calculatePerformanceMetrics(trades);

      comparisons.push({
        wallet: walletAddress,
        netPnL: pnlData.netPnL,
        roi: pnlData.roi,
        totalTrades: pnlData.totalTrades,
        winRate: performanceMetrics.winRate,
        avgWin: performanceMetrics.avgWin,
        avgLoss: performanceMetrics.avgLoss
      });
    }

    return comparisons.sort((a, b) => b.netPnL - a.netPnL);
  }

  /**
   * Export analytics data
   */
  exportAnalytics(walletAddresses, format = 'json') {
    const data = walletAddresses.map(address => {
      const trades = tradeTracker.getWalletTrades(address);
      return {
        wallet: address,
        pnlData: this.calculateWalletPnL(address, trades),
        performanceMetrics: this.calculatePerformanceMetrics(trades),
        activitySummary: this.calculateActivitySummary(trades)
      };
    });

    if (format === 'csv') {
      const csv = [
        ['Wallet', 'Net P&L', 'ROI', 'Total Trades', 'Win Rate', 'Avg Win', 'Avg Loss'],
        ...data.map(d => [
          d.wallet,
          d.pnlData.netPnL.toFixed(6),
          d.pnlData.roi.toFixed(2),
          d.pnlData.totalTrades,
          d.performanceMetrics.winRate.toFixed(2),
          d.performanceMetrics.avgWin.toFixed(6),
          d.performanceMetrics.avgLoss.toFixed(6)
        ])
      ].map(row => row.join(',')).join('\n');
      
      return csv;
    }

    return data;
  }
}

module.exports = { WalletAnalytics };