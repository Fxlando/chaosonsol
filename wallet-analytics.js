const { WalletGroupManager } = require('./wallet-group-manager');
const { PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');

class WalletAnalytics {
  constructor(walletGroupManager) {
    this.walletGroupManager = walletGroupManager;
    this.connection = walletGroupManager.connection;
    this.metricsFilePath = './wallet-metrics.json';
    this.performanceHistory = this.loadPerformanceHistory();
  }

  // ===========================================
  // PERFORMANCE TRACKING
  // ===========================================

  loadPerformanceHistory() {
    try {
      if (fs.existsSync(this.metricsFilePath)) {
        return JSON.parse(fs.readFileSync(this.metricsFilePath, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading performance history:', error);
    }
    return {
      groups: {},
      wallets: {},
      trades: [],
      lastUpdated: new Date().toISOString()
    };
  }

  savePerformanceHistory() {
    try {
      this.performanceHistory.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.metricsFilePath, JSON.stringify(this.performanceHistory, null, 2));
    } catch (error) {
      console.error('Error saving performance history:', error);
    }
  }

  // Record trade execution
  recordTrade(groupName, walletAddress, operation, tokenAddress, amount, success, txSignature = null, error = null) {
    const trade = {
      id: this.generateTradeId(),
      timestamp: new Date().toISOString(),
      groupName,
      walletAddress,
      operation, // 'buy', 'sell', 'transfer'
      tokenAddress,
      amount,
      success,
      txSignature,
      error,
      executionTime: Date.now()
    };

    this.performanceHistory.trades.push(trade);

    // Update group metrics
    if (!this.performanceHistory.groups[groupName]) {
      this.performanceHistory.groups[groupName] = {
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalVolume: 0,
        averageExecutionTime: 0,
        lastActivity: null
      };
    }

    const groupMetrics = this.performanceHistory.groups[groupName];
    groupMetrics.totalTrades++;
    if (success) {
      groupMetrics.successfulTrades++;
      groupMetrics.totalVolume += amount;
    } else {
      groupMetrics.failedTrades++;
    }
    groupMetrics.lastActivity = trade.timestamp;

    // Update wallet metrics
    if (!this.performanceHistory.wallets[walletAddress]) {
      this.performanceHistory.wallets[walletAddress] = {
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalVolume: 0,
        lastActivity: null,
        groupName: groupName
      };
    }

    const walletMetrics = this.performanceHistory.wallets[walletAddress];
    walletMetrics.totalTrades++;
    if (success) {
      walletMetrics.successfulTrades++;
      walletMetrics.totalVolume += amount;
    } else {
      walletMetrics.failedTrades++;
    }
    walletMetrics.lastActivity = trade.timestamp;

    this.savePerformanceHistory();
    return trade.id;
  }

  // ===========================================
  // GROUP ANALYTICS
  // ===========================================

  async getGroupAnalytics(groupName) {
    const wallets = this.walletGroupManager.getWalletsByGroup(groupName);
    const groupConfig = this.walletGroupManager.getGroupConfig(groupName);
    const metrics = this.performanceHistory.groups[groupName] || this.createEmptyGroupMetrics();

    // Calculate real-time balances
    const balances = await this.calculateGroupBalances(groupName);
    
    return {
      groupName,
      config: groupConfig,
      walletCount: wallets.length,
      totalBalance: balances.totalSOL,
      averageBalance: balances.averageSOL,
      metrics: {
        ...metrics,
        successRate: metrics.totalTrades > 0 ? (metrics.successfulTrades / metrics.totalTrades * 100).toFixed(2) + '%' : '0%',
        failureRate: metrics.totalTrades > 0 ? (metrics.failedTrades / metrics.totalTrades * 100).toFixed(2) + '%' : '0%'
      },
      balances,
      recentTrades: this.getRecentTradesForGroup(groupName, 10),
      performance: this.calculateGroupPerformance(groupName)
    };
  }

  async calculateGroupBalances(groupName) {
    const wallets = this.walletGroupManager.getWalletsByGroup(groupName);
    let totalSOL = 0;
    const walletBalances = [];

    for (const wallet of wallets) {
      try {
        const balance = await this.connection.getBalance(new PublicKey(wallet.pubkey));
        const solBalance = balance / LAMPORTS_PER_SOL;
        totalSOL += solBalance;
        walletBalances.push({
          address: wallet.pubkey,
          name: wallet.name,
          balance: solBalance,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        console.error(`Error getting balance for ${wallet.name}:`, error);
        walletBalances.push({
          address: wallet.pubkey,
          name: wallet.name,
          balance: 0,
          error: error.message,
          lastUpdated: new Date().toISOString()
        });
      }
    }

    return {
      totalSOL,
      averageSOL: wallets.length > 0 ? totalSOL / wallets.length : 0,
      walletBalances
    };
  }

  getRecentTradesForGroup(groupName, limit = 10) {
    return this.performanceHistory.trades
      .filter(trade => trade.groupName === groupName)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  calculateGroupPerformance(groupName) {
    const trades = this.performanceHistory.trades.filter(trade => trade.groupName === groupName);
    
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        profitLoss: 0,
        winRate: 0,
        avgTradeSize: 0
      };
    }

    const successfulTrades = trades.filter(trade => trade.success);
    const avgTradeSize = trades.reduce((sum, trade) => sum + trade.amount, 0) / trades.length;

    return {
      totalTrades: trades.length,
      winRate: (successfulTrades.length / trades.length * 100).toFixed(2) + '%',
      avgTradeSize: avgTradeSize.toFixed(6),
      lastTradeTime: trades[0]?.timestamp
    };
  }

  // ===========================================
  // SYSTEM-WIDE ANALYTICS
  // ===========================================

  async getSystemAnalytics() {
    const allGroups = Object.keys(this.walletGroupManager.groupsConfig);
    const systemStats = {
      totalGroups: allGroups.length,
      totalWallets: 0,
      totalBalance: 0,
      groupAnalytics: {},
      systemMetrics: {
        totalTrades: this.performanceHistory.trades.length,
        successfulTrades: this.performanceHistory.trades.filter(t => t.success).length,
        failedTrades: this.performanceHistory.trades.filter(t => !t.success).length,
        totalVolume: this.performanceHistory.trades.reduce((sum, t) => sum + (t.success ? t.amount : 0), 0)
      }
    };

    // Get analytics for each group
    for (const groupName of allGroups) {
      try {
        const groupAnalytics = await this.getGroupAnalytics(groupName);
        systemStats.groupAnalytics[groupName] = groupAnalytics;
        systemStats.totalWallets += groupAnalytics.walletCount;
        systemStats.totalBalance += groupAnalytics.totalBalance;
      } catch (error) {
        console.error(`Error getting analytics for group ${groupName}:`, error);
      }
    }

    return systemStats;
  }

  // ===========================================
  // REPORTING
  // ===========================================

  generatePerformanceReport(groupName = null) {
    const report = {
      generatedAt: new Date().toISOString(),
      reportType: groupName ? 'Group Report' : 'System Report'
    };

    if (groupName) {
      // Group-specific report
      const groupMetrics = this.performanceHistory.groups[groupName];
      const recentTrades = this.getRecentTradesForGroup(groupName, 50);
      
      report.groupName = groupName;
      report.metrics = groupMetrics;
      report.recentActivity = recentTrades;
      report.summary = this.generateGroupSummary(groupName);
    } else {
      // System-wide report
      report.systemMetrics = {
        totalTrades: this.performanceHistory.trades.length,
        totalGroups: Object.keys(this.performanceHistory.groups).length,
        totalWallets: Object.keys(this.performanceHistory.wallets).length
      };
      report.groupSummaries = {};
      
      Object.keys(this.performanceHistory.groups).forEach(group => {
        report.groupSummaries[group] = this.generateGroupSummary(group);
      });
    }

    return report;
  }

  generateGroupSummary(groupName) {
    const metrics = this.performanceHistory.groups[groupName];
    if (!metrics) return null;

    return {
      totalTrades: metrics.totalTrades,
      successRate: metrics.totalTrades > 0 ? ((metrics.successfulTrades / metrics.totalTrades) * 100).toFixed(2) + '%' : '0%',
      totalVolume: metrics.totalVolume.toFixed(6),
      lastActivity: metrics.lastActivity,
      status: this.determineGroupStatus(groupName)
    };
  }

  determineGroupStatus(groupName) {
    const metrics = this.performanceHistory.groups[groupName];
    if (!metrics || !metrics.lastActivity) return 'inactive';
    
    const lastActivity = new Date(metrics.lastActivity);
    const now = new Date();
    const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60);
    
    if (hoursSinceActivity < 1) return 'very_active';
    if (hoursSinceActivity < 24) return 'active';
    if (hoursSinceActivity < 168) return 'moderate';
    return 'inactive';
  }

  // ===========================================
  // UTILITY FUNCTIONS
  // ===========================================

  generateTradeId() {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  createEmptyGroupMetrics() {
    return {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0,
      averageExecutionTime: 0,
      lastActivity: null
    };
  }

  // Export analytics data
  exportAnalytics(format = 'json') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `wallet-analytics-${timestamp}.${format}`;
    
    if (format === 'json') {
      const data = {
        exportedAt: new Date().toISOString(),
        performanceHistory: this.performanceHistory,
        systemStats: this.getSystemAnalytics()
      };
      fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    } else if (format === 'csv') {
      // Convert trades to CSV format
      const csvHeaders = 'Timestamp,Group,Wallet,Operation,Token,Amount,Success,TxSignature\n';
      const csvData = this.performanceHistory.trades.map(trade => 
        `${trade.timestamp},${trade.groupName},${trade.walletAddress},${trade.operation},${trade.tokenAddress},${trade.amount},${trade.success},${trade.txSignature || ''}`
      ).join('\n');
      fs.writeFileSync(filename, csvHeaders + csvData);
    }

    return filename;
  }
}

module.exports = { WalletAnalytics };