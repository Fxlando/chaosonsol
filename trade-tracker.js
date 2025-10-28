/**
 * Trade Tracker - Real P&L Tracking System
 * Tracks actual profit/loss for all trading operations
 */

const fs = require('fs');
const path = require('path');

class TradeTracker {
  constructor(filePath = './trade-history.json') {
    this.filePath = filePath;
    this.trades = this.loadTrades();
  }

  /**
   * Load existing trades from file
   */
  loadTrades() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading trades:', error.message);
    }
    
    return {
      trades: [],
      summary: {
        totalTrades: 0,
        totalProfitUSD: 0,
        totalVolumeSOL: 0,
        volumeTradingPnL: 0,
        smartSellPnL: 0,
        successfulTrades: 0,
        lastUpdated: null
      }
    };
  }

  /**
   * Save trades to file
   */
  saveTrades() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.trades, null, 2));
    } catch (error) {
      console.error('Error saving trades:', error.message);
    }
  }

  /**
   * Record a BUY trade
   */
  recordBuy(data) {
    const trade = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'buy',
      timestamp: Date.now(),
      wallet: data.wallet,
      tokenMint: data.tokenMint,
      solAmount: data.solAmount,
      tokensReceived: data.tokensReceived,
      pricePerToken: data.solAmount / data.tokensReceived,
      txSignature: data.txSignature,
      session: data.session || null,
      source: data.source || 'manual' // 'volume', 'smart-sell', 'manual'
    };

    this.trades.trades.push(trade);
    this.updateSummary();
    this.saveTrades();
    
    console.log(`✅ Recorded BUY: ${data.tokensReceived.toFixed(2)} tokens for ${data.solAmount.toFixed(4)} SOL`);
    return trade;
  }

  /**
   * Record a SELL trade and calculate P&L
   */
  recordSell(data) {
    const trade = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'sell',
      timestamp: Date.now(),
      wallet: data.wallet,
      tokenMint: data.tokenMint,
      tokensSold: data.tokensSold,
      solReceived: data.solReceived,
      pricePerToken: data.solReceived / data.tokensSold,
      txSignature: data.txSignature,
      session: data.session || null,
      source: data.source || 'manual' // 'volume', 'smart-sell', 'manual'
    };

    // Calculate P&L by finding matching buy orders
    const pnl = this.calculatePnL(data.wallet, data.tokenMint, data.tokensSold, data.solReceived);
    trade.profitLossSOL = pnl.profitSOL;
    trade.profitLossUSD = pnl.profitUSD;
    trade.profitPercentage = pnl.profitPercentage;
    
    this.trades.trades.push(trade);
    this.updateSummary();
    this.saveTrades();
    
    console.log(`✅ Recorded SELL: ${data.tokensSold.toFixed(2)} tokens for ${data.solReceived.toFixed(4)} SOL | P&L: ${pnl.profitUSD >= 0 ? '+' : ''}$${pnl.profitUSD.toFixed(2)}`);
    return trade;
  }

  /**
   * Calculate P&L for a sell by matching with previous buys
   */
  calculatePnL(wallet, tokenMint, tokensSold, solReceived, solPriceUSD = 187) {
    // Get all buy trades for this wallet and token
    const buyTrades = this.trades.trades.filter(t => 
      t.type === 'buy' && 
      t.wallet === wallet && 
      t.tokenMint === tokenMint
    );

    if (buyTrades.length === 0) {
      // No buy history, assume break-even
      return { profitSOL: 0, profitUSD: 0, profitPercentage: 0 };
    }

    // Calculate weighted average buy price
    let totalTokensBought = 0;
    let totalSolSpent = 0;
    
    buyTrades.forEach(buy => {
      totalTokensBought += buy.tokensReceived;
      totalSolSpent += buy.solAmount;
    });

    const avgBuyPricePerToken = totalSolSpent / totalTokensBought;
    const costBasis = avgBuyPricePerToken * tokensSold;
    
    // Calculate profit
    const profitSOL = solReceived - costBasis;
    const profitUSD = profitSOL * solPriceUSD;
    const profitPercentage = ((solReceived - costBasis) / costBasis) * 100;

    return {
      profitSOL: profitSOL,
      profitUSD: profitUSD,
      profitPercentage: profitPercentage
    };
  }

  /**
   * Update summary statistics
   */
  updateSummary() {
    const summary = {
      totalTrades: this.trades.trades.length,
      totalProfitUSD: 0,
      totalVolumeSOL: 0,
      volumeTradingPnL: 0,
      smartSellPnL: 0,
      successfulTrades: 0,
      lastUpdated: Date.now()
    };

    this.trades.trades.forEach(trade => {
      // Count volume
      if (trade.type === 'buy') {
        summary.totalVolumeSOL += trade.solAmount;
      } else if (trade.type === 'sell') {
        summary.totalVolumeSOL += trade.solReceived;
      }

      // Count P&L
      if (trade.type === 'sell' && trade.profitLossUSD !== undefined) {
        summary.totalProfitUSD += trade.profitLossUSD;
        summary.successfulTrades++;

        // Categorize by source
        if (trade.source === 'volume') {
          summary.volumeTradingPnL += trade.profitLossUSD;
        } else if (trade.source === 'smart-sell') {
          summary.smartSellPnL += trade.profitLossUSD;
        }
      }
    });

    this.trades.summary = summary;
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    return this.trades.summary;
  }

  /**
   * Get recent trades
   */
  getRecentTrades(limit = 10) {
    return this.trades.trades.slice(-limit).reverse();
  }

  /**
   * Get trades by session
   */
  getSessionTrades(sessionId) {
    return this.trades.trades.filter(t => t.session === sessionId);
  }

  /**
   * Get P&L for specific token
   */
  getTokenPnL(tokenMint) {
    const tokenTrades = this.trades.trades.filter(t => t.tokenMint === tokenMint);
    let totalPnL = 0;
    
    tokenTrades.forEach(trade => {
      if (trade.type === 'sell' && trade.profitLossUSD !== undefined) {
        totalPnL += trade.profitLossUSD;
      }
    });

    return totalPnL;
  }

  /**
   * Clear all trades (use with caution)
   */
  clearTrades() {
    this.trades = {
      trades: [],
      summary: {
        totalTrades: 0,
        totalProfitUSD: 0,
        totalVolumeSOL: 0,
        volumeTradingPnL: 0,
        smartSellPnL: 0,
        successfulTrades: 0,
        lastUpdated: null
      }
    };
    this.saveTrades();
  }
}

// Create singleton instance
const tradeTracker = new TradeTracker();

module.exports = tradeTracker;

