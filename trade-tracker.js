/**
 * Trade Tracker
 * Comprehensive P&L tracking and trade history management
 */

const fs = require('fs');
const path = require('path');

class TradeTracker {
  constructor() {
    this.tradesFile = path.join(__dirname, 'trade-history.json');
    this.positionsFile = path.join(__dirname, 'active-positions.json');
    this.pnlFile = path.join(__dirname, 'pnl-summary.json');
    
    this.trades = this.loadTrades();
    this.positions = this.loadPositions();
    this.pnlSummary = this.loadPnLSummary();
  }

  /**
   * Load trades from file
   */
  loadTrades() {
    try {
      if (fs.existsSync(this.tradesFile)) {
        const data = fs.readFileSync(this.tradesFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ Error loading trades:', error.message);
    }
    return [];
  }

  /**
   * Load positions from file
   */
  loadPositions() {
    try {
      if (fs.existsSync(this.positionsFile)) {
        const data = fs.readFileSync(this.positionsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ Error loading positions:', error.message);
    }
    return {};
  }

  /**
   * Load P&L summary from file
   */
  loadPnLSummary() {
    try {
      if (fs.existsSync(this.pnlFile)) {
        const data = fs.readFileSync(this.pnlFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('❌ Error loading P&L summary:', error.message);
    }
    return {
      totalTrades: 0,
      totalVolume: 0,
      totalProfit: 0,
      totalLoss: 0,
      netPnL: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      lastUpdated: Date.now()
    };
  }

  /**
   * Save trades to file
   */
  saveTrades() {
    try {
      fs.writeFileSync(this.tradesFile, JSON.stringify(this.trades, null, 2));
    } catch (error) {
      console.error('❌ Error saving trades:', error.message);
    }
  }

  /**
   * Save positions to file
   */
  savePositions() {
    try {
      fs.writeFileSync(this.positionsFile, JSON.stringify(this.positions, null, 2));
    } catch (error) {
      console.error('❌ Error saving positions:', error.message);
    }
  }

  /**
   * Save P&L summary to file
   */
  savePnLSummary() {
    try {
      fs.writeFileSync(this.pnlFile, JSON.stringify(this.pnlSummary, null, 2));
    } catch (error) {
      console.error('❌ Error saving P&L summary:', error.message);
    }
  }

  /**
   * Record a buy trade
   */
  recordBuy(tradeData) {
    try {
      const trade = {
        id: `buy_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'buy',
        wallet: tradeData.wallet,
        tokenMint: tradeData.tokenMint,
        solAmount: tradeData.solAmount,
        tokensReceived: tradeData.tokensReceived,
        txSignature: tradeData.txSignature,
        source: tradeData.source || 'unknown',
        session: tradeData.session || null,
        timestamp: Date.now(),
        solPriceUSD: tradeData.solPriceUSD || 0,
        usdValue: (tradeData.solAmount * (tradeData.solPriceUSD || 0))
      };

      this.trades.push(trade);
      this.updatePosition(trade);
      this.updatePnLSummary();
      this.saveTrades();
      this.savePositions();
      this.savePnLSummary();

      console.log(`📈 Buy recorded: ${trade.tokensReceived.toFixed(2)} tokens for ${trade.solAmount.toFixed(4)} SOL`);
      return trade;
    } catch (error) {
      console.error('❌ Error recording buy trade:', error.message);
      return null;
    }
  }

  /**
   * Record a sell trade
   */
  recordSell(tradeData) {
    try {
      const trade = {
        id: `sell_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'sell',
        wallet: tradeData.wallet,
        tokenMint: tradeData.tokenMint,
        tokensSold: tradeData.tokensSold,
        solReceived: tradeData.solReceived,
        txSignature: tradeData.txSignature,
        source: tradeData.source || 'unknown',
        session: tradeData.session || null,
        timestamp: Date.now(),
        solPriceUSD: tradeData.solPriceUSD || 0,
        usdValue: (tradeData.solReceived * (tradeData.solPriceUSD || 0))
      };

      this.trades.push(trade);
      this.updatePosition(trade);
      this.updatePnLSummary();
      this.saveTrades();
      this.savePositions();
      this.savePnLSummary();

      console.log(`📉 Sell recorded: ${trade.tokensSold.toFixed(2)} tokens for ${trade.solReceived.toFixed(4)} SOL`);
      return trade;
    } catch (error) {
      console.error('❌ Error recording sell trade:', error.message);
      return null;
    }
  }

  /**
   * Update position for a wallet/token pair
   */
  updatePosition(trade) {
    const positionKey = `${trade.wallet}_${trade.tokenMint}`;
    
    if (!this.positions[positionKey]) {
      this.positions[positionKey] = {
        wallet: trade.wallet,
        tokenMint: trade.tokenMint,
        totalBought: 0,
        totalSold: 0,
        totalSolSpent: 0,
        totalSolReceived: 0,
        currentTokens: 0,
        avgBuyPrice: 0,
        avgSellPrice: 0,
        totalPnL: 0,
        firstTrade: trade.timestamp,
        lastTrade: trade.timestamp,
        tradeCount: 0
      };
    }

    const position = this.positions[positionKey];

    if (trade.type === 'buy') {
      position.totalBought += trade.tokensReceived;
      position.totalSolSpent += trade.solAmount;
      position.currentTokens += trade.tokensReceived;
      position.avgBuyPrice = position.totalSolSpent / position.totalBought;
    } else if (trade.type === 'sell') {
      position.totalSold += trade.tokensSold;
      position.totalSolReceived += trade.solReceived;
      position.currentTokens -= trade.tokensSold;
      position.avgSellPrice = position.totalSolReceived / position.totalSold;
    }

    position.lastTrade = trade.timestamp;
    position.tradeCount++;
    position.totalPnL = position.totalSolReceived - position.totalSolSpent;
  }

  /**
   * Update P&L summary
   */
  updatePnLSummary() {
    const completedTrades = this.trades.filter(t => t.type === 'sell');
    const buyTrades = this.trades.filter(t => t.type === 'buy');
    
    let totalVolume = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let bestTrade = 0;
    let worstTrade = 0;

    // Calculate P&L for each position
    for (const [positionKey, position] of Object.entries(this.positions)) {
      if (position.totalPnL > 0) {
        totalProfit += position.totalPnL;
        winningTrades++;
        if (position.totalPnL > bestTrade) {
          bestTrade = position.totalPnL;
        }
      } else if (position.totalPnL < 0) {
        totalLoss += Math.abs(position.totalPnL);
        losingTrades++;
        if (position.totalPnL < worstTrade) {
          worstTrade = position.totalPnL;
        }
      }
    }

    // Calculate total volume
    for (const trade of this.trades) {
      totalVolume += trade.usdValue || 0;
    }

    const totalTrades = completedTrades.length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgWin = winningTrades > 0 ? totalProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;

    this.pnlSummary = {
      totalTrades,
      totalVolume,
      totalProfit,
      totalLoss,
      netPnL: totalProfit - totalLoss,
      winRate,
      avgWin,
      avgLoss,
      bestTrade,
      worstTrade,
      winningTrades,
      losingTrades,
      lastUpdated: Date.now()
    };
  }

  /**
   * Get trade history for a wallet
   */
  getWalletTrades(walletAddress, limit = 100) {
    return this.trades
      .filter(trade => trade.wallet === walletAddress)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get trade history for a token
   */
  getTokenTrades(tokenMint, limit = 100) {
    return this.trades
      .filter(trade => trade.tokenMint === tokenMint)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get all trades with filters
   */
  getTrades(filters = {}) {
    let filteredTrades = [...this.trades];

    if (filters.wallet) {
      filteredTrades = filteredTrades.filter(t => t.wallet === filters.wallet);
    }

    if (filters.tokenMint) {
      filteredTrades = filteredTrades.filter(t => t.tokenMint === filters.tokenMint);
    }

    if (filters.type) {
      filteredTrades = filteredTrades.filter(t => t.type === filters.type);
    }

    if (filters.source) {
      filteredTrades = filteredTrades.filter(t => t.source === filters.source);
    }

    if (filters.session) {
      filteredTrades = filteredTrades.filter(t => t.session === filters.session);
    }

    if (filters.startTime) {
      filteredTrades = filteredTrades.filter(t => t.timestamp >= filters.startTime);
    }

    if (filters.endTime) {
      filteredTrades = filteredTrades.filter(t => t.timestamp <= filters.endTime);
    }

    return filteredTrades
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, filters.limit || 1000);
  }

  /**
   * Get active positions
   */
  getActivePositions() {
    return Object.values(this.positions).filter(position => position.currentTokens > 0);
  }

  /**
   * Get position for wallet/token
   */
  getPosition(walletAddress, tokenMint) {
    const positionKey = `${walletAddress}_${tokenMint}`;
    return this.positions[positionKey] || null;
  }

  /**
   * Get P&L summary
   */
  getPnLSummary() {
    return { ...this.pnlSummary };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const summary = this.getPnLSummary();
    const activePositions = this.getActivePositions();
    
    return {
      ...summary,
      activePositions: activePositions.length,
      totalActiveValue: activePositions.reduce((sum, pos) => sum + (pos.currentTokens * pos.avgBuyPrice), 0),
      dailyTrades: this.getTrades({
        startTime: Date.now() - (24 * 60 * 60 * 1000)
      }).length,
      weeklyTrades: this.getTrades({
        startTime: Date.now() - (7 * 24 * 60 * 60 * 1000)
      }).length,
      monthlyTrades: this.getTrades({
        startTime: Date.now() - (30 * 24 * 60 * 60 * 1000)
      }).length
    };
  }

  /**
   * Get top performing wallets
   */
  getTopWallets(limit = 10) {
    const walletStats = {};
    
    for (const [positionKey, position] of Object.entries(this.positions)) {
      if (!walletStats[position.wallet]) {
        walletStats[position.wallet] = {
          wallet: position.wallet,
          totalPnL: 0,
          totalTrades: 0,
          totalVolume: 0
        };
      }
      
      walletStats[position.wallet].totalPnL += position.totalPnL;
      walletStats[position.wallet].totalTrades += position.tradeCount;
      walletStats[position.wallet].totalVolume += position.totalSolSpent + position.totalSolReceived;
    }

    return Object.values(walletStats)
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, limit);
  }

  /**
   * Get top performing tokens
   */
  getTopTokens(limit = 10) {
    const tokenStats = {};
    
    for (const [positionKey, position] of Object.entries(this.positions)) {
      if (!tokenStats[position.tokenMint]) {
        tokenStats[position.tokenMint] = {
          tokenMint: position.tokenMint,
          totalPnL: 0,
          totalTrades: 0,
          totalVolume: 0
        };
      }
      
      tokenStats[position.tokenMint].totalPnL += position.totalPnL;
      tokenStats[position.tokenMint].totalTrades += position.tradeCount;
      tokenStats[position.tokenMint].totalVolume += position.totalSolSpent + position.totalSolReceived;
    }

    return Object.values(tokenStats)
      .sort((a, b) => b.totalPnL - a.totalPnL)
      .slice(0, limit);
  }

  /**
   * Export trade data
   */
  exportTrades(format = 'json', filters = {}) {
    const trades = this.getTrades(filters);
    
    if (format === 'csv') {
      const csv = [
        ['ID', 'Type', 'Wallet', 'Token', 'Amount', 'SOL', 'USD Value', 'Source', 'Timestamp'],
        ...trades.map(trade => [
          trade.id,
          trade.type,
          trade.wallet,
          trade.tokenMint,
          trade.tokensReceived || trade.tokensSold || 0,
          trade.solAmount || trade.solReceived || 0,
          trade.usdValue || 0,
          trade.source,
          new Date(trade.timestamp).toISOString()
        ])
      ].map(row => row.join(',')).join('\n');
      
      return csv;
    }
    
    return trades;
  }

  /**
   * Clear old trades (older than specified days)
   */
  clearOldTrades(days = 30) {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    const oldTrades = this.trades.filter(trade => trade.timestamp < cutoffTime);
    
    this.trades = this.trades.filter(trade => trade.timestamp >= cutoffTime);
    this.saveTrades();
    
    console.log(`🗑️ Cleared ${oldTrades.length} trades older than ${days} days`);
    return oldTrades.length;
  }

  /**
   * Reset all data
   */
  reset() {
    this.trades = [];
    this.positions = {};
    this.pnlSummary = {
      totalTrades: 0,
      totalVolume: 0,
      totalProfit: 0,
      totalLoss: 0,
      netPnL: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      lastUpdated: Date.now()
    };
    
    this.saveTrades();
    this.savePositions();
    this.savePnLSummary();
    
    console.log('🔄 Trade tracker reset');
  }
}

// Create singleton instance
const tradeTracker = new TradeTracker();

module.exports = tradeTracker;