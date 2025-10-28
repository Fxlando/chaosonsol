// Smart Sell Engine with Bubble Detection and Risk Management
const { JupiterV6Integration } = require('./jupiter-v6-integration');
const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const axios = require('axios');

class SmartSellEngine {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.jupiter = new JupiterV6Integration(connection, config);
    
    this.config = {
      // Price monitoring
      priceCheckInterval: config.priceCheckInterval || 30000, // 30 seconds
      volatilityWindow: config.volatilityWindow || 10, // 10 price samples
      
      // Bubble detection thresholds
      rapidGrowthThreshold: config.rapidGrowthThreshold || 50, // 50% in short time
      unsustainableGrowthPeriod: config.unsustainableGrowthPeriod || 300000, // 5 minutes
      volumeSpikeThreshold: config.volumeSpikeThreshold || 200, // 200% volume increase
      
      // Selling triggers
      profitTarget: config.profitTarget || 30, // 30% profit target
      stopLoss: config.stopLoss || -15, // 15% stop loss
      trailingStopPercentage: config.trailingStopPercentage || 10, // 10% trailing stop
      
      // Risk management
      maxSellPercentage: config.maxSellPercentage || 90, // Sell max 90% of holdings
      emergencySellThreshold: config.emergencySellThreshold || -25, // Emergency sell at -25%
      cooldownPeriod: config.cooldownPeriod || 60000, // 1 minute between sells
      
      // Transaction monitoring (new)
      realtimeTransactions: config.realtimeTransactions || false, // Enable WebSocket real-time monitoring
      autoDumpPercentage: config.autoDumpPercentage || 25, // Dump 25% when outsiders buy
      outsiderBuyThreshold: config.outsiderBuyThreshold || 0.001, // Minimum 0.001 SOL buy to trigger
      maxOutsiderBuysBeforeDump: config.maxOutsiderBuysBeforeDump || 1, // Dump after 1 outsider buy
      
      ...config
    };

    this.activeMonitors = new Map(); // token -> monitor data
    this.priceHistory = new Map(); // token -> price history
    this.sellHistory = new Map(); // token -> last sell timestamps
    
    // New transaction monitoring properties
    this.whitelistedWallets = new Set(); // Set of whitelisted wallet addresses
    this.transactionMonitors = new Map(); // token -> transaction monitoring data
    this.lastCheckedSignatures = new Map(); // token -> last signature checked
    this.outsiderDetectionLog = new Map(); // token -> outsider buy events
  }

  // Start monitoring a token for smart selling
  async startMonitoring(tokenMint, wallets, options = {}) {
    if (this.activeMonitors.has(tokenMint)) {
      throw new Error('Token is already being monitored');
    }

    const monitorData = {
      tokenMint,
      wallets: wallets.map(w => ({
        ...w,
        initialBalance: null,
        highestPrice: null,
        buyPrice: null
      })),
      startTime: Date.now(),
      isActive: true,
      sellTriggers: {
        profitTarget: options.profitTarget || this.config.profitTarget,
        stopLoss: options.stopLoss || this.config.stopLoss,
        trailingStop: options.trailingStop !== false,
        bubbleDetection: options.bubbleDetection !== false,
        outsiderDetection: options.outsiderDetection !== false // New trigger
      },
      stats: {
        sellsExecuted: 0,
        profitRealized: 0,
        bubbleDetections: 0,
        outsiderBuysDetected: 0,
        autoDumpsTriggered: 0
      }
    };

    // Get initial balances and buy prices
    for (const wallet of monitorData.wallets) {
      try {
        const balance = await this.getTokenBalance(wallet.keypair.publicKey, tokenMint);
        wallet.initialBalance = balance;
        
        // Try to estimate buy price from recent transactions
        const buyPrice = await this.estimateBuyPrice(wallet.keypair.publicKey, tokenMint);
        wallet.buyPrice = buyPrice;
      } catch (error) {
        console.error(`Failed to get initial data for wallet:`, error.message);
      }
    }

    this.activeMonitors.set(tokenMint, monitorData);
    this.priceHistory.set(tokenMint, []);

    // Setup whitelist with provided wallets
    for (const wallet of wallets) {
      const walletAddress = wallet.keypair.publicKey.toString();
      this.whitelistedWallets.add(walletAddress);
      console.log(`✅ Added to whitelist: ${walletAddress.substring(0, 8)}...${walletAddress.substring(-6)} (${wallet.name})`);
    }
    
    console.log(`🛡️ Whitelist initialized with ${this.whitelistedWallets.size} wallets`);

    // Initialize transaction monitoring for this token  
    if (monitorData.sellTriggers.outsiderDetection) {
      this.initializeTransactionMonitoring(tokenMint, options.realtimeTransactions);
    }

    // Start monitoring loop
    this.startMonitoringLoop(tokenMint);

    console.log(`🧠 Smart Sell: Started monitoring ${tokenMint} with ${wallets.length} wallets`);
    
    return {
      tokenMint,
      walletsMonitored: wallets.length,
      triggers: monitorData.sellTriggers,
      message: 'Smart sell monitoring activated'
    };
  }

  // Stop monitoring a token
  async stopMonitoring(tokenMint) {
    const monitorData = this.activeMonitors.get(tokenMint);
    if (!monitorData) {
      throw new Error('Token is not being monitored');
    }

    monitorData.isActive = false;
    this.activeMonitors.delete(tokenMint);
    
    // Clean up transaction monitoring and WebSocket subscriptions
    const txMonitorData = this.transactionMonitors.get(tokenMint);
    if (txMonitorData) {
      txMonitorData.isMonitoring = false;
      
      // Remove WebSocket subscription if it exists
      if (txMonitorData.subscriptionId) {
        try {
          await this.connection.removeAccountChangeListener(txMonitorData.subscriptionId);
          console.log(`🔌 WebSocket subscription ${txMonitorData.subscriptionId} removed for ${tokenMint}`);
        } catch (error) {
          console.warn(`⚠️ Failed to remove WebSocket subscription:`, error.message);
        }
      }
      
      this.transactionMonitors.delete(tokenMint);
    }
    
    console.log(`🧠 Smart Sell: Stopped monitoring ${tokenMint}`);
    
    return {
      tokenMint,
      duration: Date.now() - monitorData.startTime,
      stats: monitorData.stats,
      message: 'Smart sell monitoring stopped'
    };
  }

  // Main monitoring loop
  async startMonitoringLoop(tokenMint) {
    const monitor = async () => {
      try {
        const monitorData = this.activeMonitors.get(tokenMint);
        if (!monitorData || !monitorData.isActive) {
          return; // Stop monitoring
        }

        // Get current price
        const currentPrice = await this.getCurrentPrice(tokenMint);
        const timestamp = Date.now();

        // Update price history
        const history = this.priceHistory.get(tokenMint);
        history.push({ price: currentPrice, timestamp });
        
        // Keep only recent history
        const cutoff = timestamp - (this.config.volatilityWindow * this.config.priceCheckInterval);
        this.priceHistory.set(tokenMint, history.filter(h => h.timestamp > cutoff));

        // Analyze market conditions
        const analysis = await this.analyzeMarketConditions(tokenMint, currentPrice);
        
        // Check for outsider transaction activity (new)
        if (monitorData.sellTriggers.outsiderDetection) {
          const outsiderData = await this.checkForOutsiderActivity(tokenMint, monitorData);
          if (outsiderData) {
            analysis.outsiderActivity = outsiderData.outsiderActivity;
          }
        }
        
        // Check sell triggers for each wallet
        for (let i = 0; i < monitorData.wallets.length; i++) {
          const wallet = monitorData.wallets[i];
          
          const shouldSell = this.evaluateSellTriggers(
            wallet, 
            currentPrice, 
            analysis, 
            monitorData.sellTriggers
          );

          if (shouldSell.sell) {
            await this.executeSell(tokenMint, wallet, shouldSell, monitorData);
          }
        }

        // Schedule next check
        setTimeout(monitor, this.config.priceCheckInterval);

      } catch (error) {
        console.error(`❌ Smart Sell monitoring error for ${tokenMint}:`, error.message);
        setTimeout(monitor, this.config.priceCheckInterval * 2); // Double interval on error
      }
    };

    // Start the monitoring
    monitor();
  }

  // Analyze market conditions for bubble detection
  async analyzeMarketConditions(tokenMint, currentPrice) {
    const history = this.priceHistory.get(tokenMint);
    
    if (history.length < 3) {
      return { bubbleRisk: 'unknown', volatility: 0, trend: 'unknown' };
    }

    // Calculate price changes
    const recentPrices = history.map(h => h.price);
    const oldestPrice = recentPrices[0];
    const priceChange = ((currentPrice - oldestPrice) / oldestPrice) * 100;

    // Calculate volatility
    const returns = [];
    for (let i = 1; i < recentPrices.length; i++) {
      returns.push((recentPrices[i] - recentPrices[i-1]) / recentPrices[i-1]);
    }
    const volatility = this.calculateStandardDeviation(returns) * 100;

    // Bubble detection logic
    let bubbleRisk = 'low';
    
    // Rapid growth detection
    const recentGrowth = ((currentPrice - recentPrices[Math.max(0, recentPrices.length-3)]) 
                         / recentPrices[Math.max(0, recentPrices.length-3)]) * 100;
    
    if (recentGrowth > this.config.rapidGrowthThreshold) {
      bubbleRisk = 'high';
    } else if (recentGrowth > this.config.rapidGrowthThreshold * 0.7) {
      bubbleRisk = 'medium';
    }

    // High volatility increases bubble risk
    if (volatility > 30) { // 30% volatility threshold
      bubbleRisk = bubbleRisk === 'low' ? 'medium' : 'high';
    }

    return {
      bubbleRisk,
      volatility,
      priceChange,
      recentGrowth,
      trend: priceChange > 5 ? 'bullish' : priceChange < -5 ? 'bearish' : 'sideways'
    };
  }

  // Evaluate sell triggers for a wallet
  evaluateSellTriggers(wallet, currentPrice, analysis, triggers) {
    const reasons = [];
    let sellPercentage = this.config.maxSellPercentage;
    let urgency = 'normal';

    // Skip if no buy price data
    if (!wallet.buyPrice) {
      return { sell: false, reasons: ['No buy price data'], percentage: 0, urgency: 'none' };
    }

    const profitPercentage = ((currentPrice - wallet.buyPrice) / wallet.buyPrice) * 100;

    // Update highest price for trailing stop
    if (!wallet.highestPrice || currentPrice > wallet.highestPrice) {
      wallet.highestPrice = currentPrice;
    }

    // Profit target reached
    if (profitPercentage >= triggers.profitTarget) {
      reasons.push(`Profit target reached: ${profitPercentage.toFixed(2)}%`);
    }

    // Stop loss triggered
    if (profitPercentage <= triggers.stopLoss) {
      reasons.push(`Stop loss triggered: ${profitPercentage.toFixed(2)}%`);
      urgency = 'high';
    }

    // Emergency sell for major losses
    if (profitPercentage <= this.config.emergencySellThreshold) {
      reasons.push(`Emergency sell: ${profitPercentage.toFixed(2)}% loss`);
      sellPercentage = 100;
      urgency = 'emergency';
    }

    // Trailing stop
    if (triggers.trailingStop && wallet.highestPrice) {
      const dropFromHigh = ((wallet.highestPrice - currentPrice) / wallet.highestPrice) * 100;
      if (dropFromHigh >= this.config.trailingStopPercentage) {
        reasons.push(`Trailing stop: ${dropFromHigh.toFixed(2)}% drop from high`);
        urgency = 'high';
      }
    }

    // Bubble detection
    if (triggers.bubbleDetection && analysis.bubbleRisk === 'high') {
      reasons.push(`Bubble detected: ${analysis.recentGrowth.toFixed(2)}% recent growth, ${analysis.volatility.toFixed(2)}% volatility`);
      urgency = 'high';
      sellPercentage = Math.min(sellPercentage, 70); // Sell less in bubble to avoid slippage
    }

    // Outsider detection (new)
    if (triggers.outsiderDetection && analysis.outsiderActivity) {
      reasons.push(`Non-whitelisted buyer detected: ${analysis.outsiderActivity.buyCount} recent buys (${analysis.outsiderActivity.totalValue.toFixed(3)} SOL)`);
      urgency = 'high';
      sellPercentage = this.config.autoDumpPercentage; // Use configured auto-dump percentage
    }

    return {
      sell: reasons.length > 0,
      reasons,
      percentage: sellPercentage,
      urgency,
      profitPercentage,
      analysis
    };
  }

  // Execute sell order
  async executeSell(tokenMint, wallet, sellDecision, monitorData) {
    const now = Date.now();
    const lastSell = this.sellHistory.get(`${tokenMint}_${wallet.keypair.publicKey.toString()}`);

    // Check cooldown period
    if (lastSell && (now - lastSell) < this.config.cooldownPeriod) {
      console.log(`⏰ Cooldown active for wallet, skipping sell`);
      return;
    }

    try {
      console.log(`🚨 SMART SELL TRIGGERED for ${wallet.name || 'wallet'}`);
      console.log(`📊 Reasons: ${sellDecision.reasons.join(', ')}`);
      console.log(`💰 Profit: ${sellDecision.profitPercentage.toFixed(2)}%`);

      // Get current token balance
      const balance = await this.getTokenBalance(wallet.keypair.publicKey, tokenMint);
      const sellAmount = Math.floor(balance * (sellDecision.percentage / 100));

      if (sellAmount <= 0) {
        console.log(`❌ No tokens to sell for wallet`);
        return;
      }

      // Execute the sell
      const sellResult = await this.jupiter.sellToken(
        wallet.keypair, 
        tokenMint, 
        sellAmount, 
        {
          slippage: sellDecision.urgency === 'emergency' ? 800 : 150, // Reduced slippage (8% emergency, 1.5% normal)
          priorityFee: sellDecision.urgency === 'emergency' ? 5000 : 1000, // Reduced fees (5k emergency, 1k normal)
          source: 'smart-sell-engine',
          session: `smart_sell_${Date.now()}`
        }
      );

      // Update statistics
      monitorData.stats.sellsExecuted++;
      if (sellDecision.profitPercentage > 0) {
        monitorData.stats.profitRealized += sellDecision.profitPercentage;
      }
      if (sellDecision.analysis.bubbleRisk === 'high') {
        monitorData.stats.bubbleDetections++;
      }

      // Record sell time
      this.sellHistory.set(`${tokenMint}_${wallet.keypair.publicKey.toString()}`, now);

      console.log(`✅ Smart sell executed: ${sellResult.signature}`);
      console.log(`💎 Sold ${sellAmount} tokens for ${sellResult.outAmount / 1e9} SOL`);

      return {
        success: true,
        signature: sellResult.signature,
        amount: sellAmount,
        solReceived: sellResult.outAmount / 1e9,
        profitPercentage: sellDecision.profitPercentage,
        reasons: sellDecision.reasons
      };

    } catch (error) {
      console.error(`❌ Smart sell failed for wallet:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper methods
  async getCurrentPrice(tokenMint) {
    try {
      const quote = await this.jupiter.getQuote(tokenMint, this.jupiter.solMint, 1000000); // 1M token units
      return parseFloat(quote.outAmount) / 1000000; // SOL per token unit
    } catch (error) {
      throw new Error(`Failed to get current price: ${error.message}`);
    }
  }

  async getTokenBalance(walletPubkey, tokenMint) {
    
    try {
      console.log(`🔍 Getting balance for wallet ${walletPubkey.toString().substring(0, 8)}... and token ${tokenMint.substring(0, 8)}...`);
      
      const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        walletPubkey
      );
      
      console.log(`🏦 Token account address: ${tokenAccount.toString().substring(0, 8)}...`);
      
      const balance = await this.connection.getTokenAccountBalance(tokenAccount);
      console.log(`📊 Raw balance response:`, balance);
      
      const finalBalance = balance.value.uiAmount ? balance.value.uiAmount : 0;
      console.log(`💰 Final balance: ${finalBalance} tokens`);
      
      return finalBalance;
    } catch (error) {
      console.log(`❌ Error getting token balance: ${error.message}`);
      
      // Try alternative method - get all token accounts for this wallet
      try {
        console.log(`🔄 Trying alternative method - getting all token accounts...`);
        const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
          walletPubkey,
          { mint: new PublicKey(tokenMint) }
        );
        
        console.log(`🏦 Found ${tokenAccounts.value.length} token accounts`);
        
        if (tokenAccounts.value.length > 0) {
          const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
          console.log(`💰 Alternative method balance: ${balance} tokens`);
          return balance || 0;
        }
      } catch (altError) {
        console.log(`❌ Alternative method also failed: ${altError.message}`);
      }
      
      return 0; // No token account or balance
    }
  }

  async estimateBuyPrice(walletPubkey, tokenMint) {
    // This is a simplified version - in reality you'd analyze transaction history
    // For now, we'll use current price as buy price (user can override)
    try {
      return await this.getCurrentPrice(tokenMint);
    } catch (error) {
      return null;
    }
  }

  calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    
    return Math.sqrt(avgSquaredDiff);
  }

  // Get monitoring status
  getMonitoringStatus(tokenMint) {
    const monitorData = this.activeMonitors.get(tokenMint);
    if (!monitorData) {
      return { active: false };
    }

    const history = this.priceHistory.get(tokenMint);
    const currentPrice = history.length > 0 ? history[history.length - 1].price : null;

    return {
      active: true,
      tokenMint,
      walletsMonitored: monitorData.wallets.length,
      runtime: Date.now() - monitorData.startTime,
      currentPrice,
      priceHistory: history.length,
      stats: monitorData.stats,
      triggers: monitorData.sellTriggers
    };
  }

  // Get all active monitors
  getAllActiveMonitors() {
    const monitors = [];
    for (const [tokenMint, data] of this.activeMonitors) {
      monitors.push(this.getMonitoringStatus(tokenMint));
    }
    return monitors;
  }

  // NEW TRANSACTION MONITORING METHODS

  // Initialize transaction monitoring for a token
  async initializeTransactionMonitoring(tokenMint, useRealtime = false) {
    
    try {
      // Get token program account to monitor
      const tokenPubkey = new PublicKey(tokenMint);
      
      this.transactionMonitors.set(tokenMint, {
        tokenAddress: tokenMint,
        lastCheckedSlot: null,
        outsiderBuyCount: 0,
        recentOutsiderBuys: [],
        isMonitoring: true,
        realtimeMode: useRealtime
      });

      if (useRealtime) {
        // Start real-time WebSocket monitoring (INSTANT)
        console.log(`⚡ REAL-TIME Transaction Monitor: Starting WebSocket stream for ${tokenMint}`);
        this.startRealtimeTransactionMonitoring(tokenMint);
      } else {
        // Start periodic transaction monitoring loop (OLD METHOD)
        console.log(`🔍 Periodic Transaction Monitor: Started for token ${tokenMint}`);
        this.startTransactionMonitoringLoop(tokenMint);
      }
    } catch (error) {
      console.error(`❌ Failed to initialize transaction monitoring:`, error.message);
    }
  }

  // Real-time WebSocket transaction monitoring (INSTANT DETECTION)
  async startRealtimeTransactionMonitoring(tokenMint) {
    console.log(`⚡ STARTING REAL-TIME MONITORING for ${tokenMint}`);
    
    // Use aggressive periodic checking instead of unreliable WebSocket
    // Check every 2 seconds for maximum responsiveness
    const monitorTransactions = async () => {
      try {
        const monitorData = this.transactionMonitors.get(tokenMint);
        if (!monitorData || !monitorData.isMonitoring) {
          console.log(`🛑 Stopping real-time monitoring for ${tokenMint}`);
          return;
        }

        console.log(`🔍 REAL-TIME CHECK: Scanning for new transactions...`);
        await this.checkRecentTransactionsRealtime(tokenMint, null);
        
        // Schedule next check in 2 seconds for near-instant detection
        setTimeout(monitorTransactions, 2000); // Back to 2-second monitoring with QuickNode

      } catch (error) {
        console.error(`❌ Real-time monitoring error for ${tokenMint}:`, error.message);
        // Retry with longer interval on error
        setTimeout(monitorTransactions, 5000);
      }
    };

    // Start aggressive monitoring
    console.log(`✅ Real-time monitoring active for ${tokenMint} - checking every 2 seconds`);
    monitorTransactions();
  }

  // Transaction monitoring loop (OLD METHOD - periodic checking)
  async startTransactionMonitoringLoop(tokenMint) {
    const monitorTransactions = async () => {
      try {
        const monitorData = this.transactionMonitors.get(tokenMint);
        if (!monitorData || !monitorData.isMonitoring) {
          return; // Stop monitoring
        }

        await this.checkRecentTransactions(tokenMint);
        
        // Schedule next check (much longer interval since this is backup)
        setTimeout(monitorTransactions, 30000); // 30 seconds for periodic backup

      } catch (error) {
        console.error(`❌ Transaction monitoring error for ${tokenMint}:`, error.message);
        setTimeout(monitorTransactions, 60000); // 1 minute retry on error
      }
    };

    // Start monitoring
    monitorTransactions();
  }

  // Real-time transaction checking (triggered by account changes)
  async checkRecentTransactionsRealtime(tokenMint, currentSlot) {
    
    try {
      const tokenPubkey = new PublicKey(tokenMint);
      const monitorData = this.transactionMonitors.get(tokenMint);
      
      // Get very recent signatures (last few seconds only)
      const signatures = await this.connection.getSignaturesForAddress(
        tokenPubkey,
        {
          limit: 20, // Check more signatures for better detection
          until: monitorData.lastCheckedSlot
        }
      );

      if (signatures.length === 0) {
        console.log(`🔍 No new transactions found for ${tokenMint}`);
        return;
      }

      // Update last checked immediately
      monitorData.lastCheckedSlot = signatures[0].signature;

      console.log(`⚡ REAL-TIME: Found ${signatures.length} new signatures to analyze for ${tokenMint}`);

      // Limit analysis to prevent overwhelming the RPC (max 10 per cycle)
      const limitedSignatures = signatures.slice(0, 10);
      if (signatures.length > 10) {
        console.log(`🔄 Limiting analysis to first 10 transactions (${signatures.length} total found)`);
      }

      // Analyze each transaction with delays to prevent rate limiting
      for (let i = 0; i < limitedSignatures.length; i++) {
        const sigInfo = limitedSignatures[i];
        console.log(`🔍 Analyzing signature: ${sigInfo.signature}`);
        
        await this.analyzeTransaction(tokenMint, sigInfo);
        
        // Add delay between transactions to prevent rate limiting
        if (i < limitedSignatures.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Increased to 500ms delay
        }
      }

    } catch (error) {
      console.error(`❌ Real-time transaction check error for ${tokenMint}:`, error.message);
    }
  }

  // Check recent transactions for non-whitelisted buys (PERIODIC METHOD)
  async checkRecentTransactions(tokenMint) {
    
    try {
      const tokenPubkey = new PublicKey(tokenMint);
      const monitorData = this.transactionMonitors.get(tokenMint);
      
      // Get recent signatures for the token
      const signatures = await this.connection.getSignaturesForAddress(
        tokenPubkey,
        {
          limit: 50,
          before: monitorData.lastCheckedSlot ? undefined : null
        }
      );

      if (signatures.length === 0) return;

      // Update last checked
      if (signatures.length > 0) {
        monitorData.lastCheckedSlot = signatures[0].signature;
      }

      // Analyze each transaction with delays to prevent rate limiting
      for (let i = 0; i < signatures.length; i++) {
        const sigInfo = signatures[i];
        await this.analyzeTransaction(tokenMint, sigInfo);
        
        // Add delay between transactions to prevent rate limiting
        if (i < signatures.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Increased to 500ms delay
        }
      }

    } catch (error) {
      console.error(`❌ Error checking transactions for ${tokenMint}:`, error.message);
    }
  }

  // Analyze individual transaction for buy activity
  async analyzeTransaction(tokenMint, signatureInfo) {
    try {
      const signature = signatureInfo.signature;
      console.log(`🔍 Getting transaction details for: ${signature}`);
      
      // Get full transaction details
      const transaction = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!transaction) {
        console.log(`❌ No transaction data for signature: ${signature}`);
        return;
      }

      if (transaction.meta.err) {
        console.log(`❌ Transaction failed: ${signature}`);
        return;
      }

      // Look for token transfers indicating buys
      const preTokenBalances = transaction.meta.preTokenBalances || [];
      const postTokenBalances = transaction.meta.postTokenBalances || [];
      
      console.log(`🔍 Transaction ${signature} has ${postTokenBalances.length} post token balances`);

      // Find accounts that received the target token
      for (const postBalance of postTokenBalances) {
        if (postBalance.mint === tokenMint && postBalance.uiTokenAmount.uiAmount > 0) {
          // Handle versioned transactions - account keys can be in different locations
          let accountKeys = [];
          
          // For versioned transactions, use staticAccountKeys and loadedAddresses
          if (transaction.transaction.message.staticAccountKeys) {
            accountKeys = [...transaction.transaction.message.staticAccountKeys];
            
            // Add loaded addresses if they exist
            if (transaction.meta?.loadedAddresses?.writable) {
              accountKeys = [...accountKeys, ...transaction.meta.loadedAddresses.writable];
            }
            if (transaction.meta?.loadedAddresses?.readonly) {
              accountKeys = [...accountKeys, ...transaction.meta.loadedAddresses.readonly];
            }
          } else {
            // Legacy transaction format
            accountKeys = transaction.transaction.message.accountKeys || [];
          }
          
          if (postBalance.accountIndex >= accountKeys.length) {
            console.log(`⚠️  Account index ${postBalance.accountIndex} exceeds total accountKeys length ${accountKeys.length}, skipping`);
            continue;
          }
          
          const accountPubkey = accountKeys[postBalance.accountIndex];
          
          // Check if this is a buy (comparing pre/post balances)
          const preBalance = preTokenBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
          const tokenIncrease = postBalance.uiTokenAmount.uiAmount - (preBalance ? preBalance.uiTokenAmount.uiAmount : 0);
          
          console.log(`🔍 Token balance change: ${tokenIncrease} tokens for account ${accountPubkey.toString().substring(0, 8)}...`);
          
          if (tokenIncrease > 0) {
            // This is a token purchase - check if buyer is whitelisted
            const buyerAddress = accountPubkey.toString();
            const isWhitelisted = this.whitelistedWallets.has(buyerAddress);
            
            console.log(`🔍 Buyer ${buyerAddress.substring(0, 8)}...${buyerAddress.substring(-6)} is ${isWhitelisted ? 'WHITELISTED ✅' : 'NON-WHITELISTED ❌'}`);
            console.log(`🔍 Current whitelist has ${this.whitelistedWallets.size} addresses`);
            
            // Debug: Show first few whitelisted addresses for comparison
            if (this.whitelistedWallets.size > 0) {
              const whitelistArray = Array.from(this.whitelistedWallets);
              console.log(`🔍 Whitelist sample: ${whitelistArray.slice(0, 3).map(addr => addr.substring(0, 8) + '...').join(', ')}`);
            }
            
            if (!isWhitelisted) {
              console.log(`🚨 NON-WHITELISTED BUYER DETECTED!`);
              // Non-whitelisted buyer detected!
              const estimatedSOL = this.estimateSOLSpent(transaction, postBalance.accountIndex);
              console.log(`💰 Estimated SOL spent: ${estimatedSOL.toFixed(4)} SOL (threshold: ${this.config.outsiderBuyThreshold} SOL)`);
              
              await this.handleOutsiderBuy(tokenMint, {
                buyer: buyerAddress,
                tokenAmount: tokenIncrease,
                signature: signature,
                timestamp: Date.now(),
                solAmount: estimatedSOL
              });
            } else {
              console.log(`✅ Whitelisted wallet transaction - ignoring`);
            }
          }
        }
      }

    } catch (error) {
      console.error(`❌ Error analyzing transaction ${signatureInfo.signature}:`, error.message);
    }
  }

  // Handle detection of outsider buy
  async handleOutsiderBuy(tokenMint, buyEvent) {
    const monitorData = this.transactionMonitors.get(tokenMint);
    const smartSellData = this.activeMonitors.get(tokenMint);
    
    if (!monitorData || !smartSellData) return;

    // Only process significant buys
    if (buyEvent.solAmount < this.config.outsiderBuyThreshold) return;

    console.log(`🚨 OUTSIDER BUY DETECTED!`);
    console.log(`👤 Buyer: ${buyEvent.buyer.substring(0, 8)}...${buyEvent.buyer.substring(-6)}`);
    console.log(`💰 Amount: ~${buyEvent.solAmount.toFixed(3)} SOL`);
    console.log(`🪙 Tokens: ${buyEvent.tokenAmount.toFixed(2)}`);

    // Add to recent buys
    monitorData.recentOutsiderBuys.push(buyEvent);
    monitorData.outsiderBuyCount++;

    // Keep only recent buys (last 5 minutes)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    monitorData.recentOutsiderBuys = monitorData.recentOutsiderBuys.filter(
      buy => buy.timestamp > fiveMinutesAgo
    );

    // Update stats
    smartSellData.stats.outsiderBuysDetected++;

    // IMMEDIATE PROPORTIONAL AUTO-DUMP (New Logic)
    // Calculate sell amount based on outsider's purchase
    const outsiderBuyValueSOL = buyEvent.solAmount;
    const autoDumpPercentage = this.config.autoDumpPercentage;
    const targetSellValueSOL = outsiderBuyValueSOL * (autoDumpPercentage / 100);
    
    console.log(`📊 PROPORTIONAL AUTO-DUMP CALCULATION:`);
    console.log(`   Outsider bought: ${outsiderBuyValueSOL.toFixed(4)} SOL`);
    console.log(`   Auto-dump setting: ${autoDumpPercentage}%`);
    console.log(`   Target sell value: ${targetSellValueSOL.toFixed(4)} SOL`);
    
    // Execute proportional auto-dump immediately
    await this.executeProportionalAutoDump(tokenMint, targetSellValueSOL, smartSellData.wallets);
    smartSellData.stats.autoDumpsTriggered++;
  }

  // Check for outsider activity (called from main monitoring loop)
  async checkForOutsiderActivity(tokenMint, monitorData) {
    const txMonitorData = this.transactionMonitors.get(tokenMint);
    
    if (!txMonitorData) return;

    // Check if there are recent outsider buys that should trigger sells
    const recentBuys = txMonitorData.recentOutsiderBuys;
    
    if (recentBuys.length >= this.config.maxOutsiderBuysBeforeDump) {
      // Add outsider activity to analysis
      const totalValue = recentBuys.reduce((sum, buy) => sum + buy.solAmount, 0);
      
      return {
        outsiderActivity: {
          buyCount: recentBuys.length,
          totalValue: totalValue,
          recentBuys: recentBuys.slice(-3) // Last 3 buys for logging
        }
      };
    }
    
    return null;
  }

  // Estimate SOL spent in transaction (helper method)
  estimateSOLSpent(transaction, tokenAccountIndex) {
    try {
      // Look for SOL balance changes to estimate spend
      const preBalances = transaction.meta.preBalances;
      const postBalances = transaction.meta.postBalances;
      
      // Find the account that spent SOL (decreased balance)
      for (let i = 0; i < preBalances.length; i++) {
        const solDecrease = (preBalances[i] - postBalances[i]) / 1e9; // Convert to SOL
        if (solDecrease > 0.001) { // Minimum meaningful spend
          return solDecrease;
        }
      }
      
      return 0.1; // Default estimate
    } catch (error) {
      return 0.1; // Default estimate on error
    }
  }

  // Add wallet to whitelist
  addToWhitelist(walletAddress) {
    this.whitelistedWallets.add(walletAddress);
    console.log(`✅ Added wallet to whitelist: ${walletAddress.substring(0, 8)}...${walletAddress.substring(-6)}`);
  }

  // Remove wallet from whitelist
  removeFromWhitelist(walletAddress) {
    this.whitelistedWallets.delete(walletAddress);
    console.log(`❌ Removed wallet from whitelist: ${walletAddress.substring(0, 8)}...${walletAddress.substring(-6)}`);
  }

  // Get whitelist status
  getWhitelistInfo() {
    return {
      whitelistedCount: this.whitelistedWallets.size,
      addresses: Array.from(this.whitelistedWallets)
    };
  }

  // Debug method to check if an address is whitelisted
  isAddressWhitelisted(address) {
    const isWhitelisted = this.whitelistedWallets.has(address);
    console.log(`🔍 Checking address: ${address.substring(0, 8)}...${address.substring(-6)}`);
    console.log(`🔍 Whitelisted: ${isWhitelisted ? 'YES ✅' : 'NO ❌'}`);
    console.log(`🔍 Total whitelist size: ${this.whitelistedWallets.size}`);
    return isWhitelisted;
  }

  // Enhanced monitoring status including transaction data
  getMonitoringStatusEnhanced(tokenMint) {
    const basicStatus = this.getMonitoringStatus(tokenMint);
    const txData = this.transactionMonitors.get(tokenMint);
    
    return {
      ...basicStatus,
      transactionMonitoring: txData ? {
        active: txData.isMonitoring,
        outsiderBuysDetected: txData.outsiderBuyCount,
        recentOutsiderBuys: txData.recentOutsiderBuys.length,
        lastChecked: txData.lastCheckedSlot ? 'Active' : 'Initializing'
      } : null,
      whitelist: this.getWhitelistInfo()
    };
  }

  // Execute smart hybrid auto-dump: Find wallet with largest profitable position
  async executeProportionalAutoDump(tokenMint, targetSellValueSOL, wallets) {
    try {
      console.log(`🚀 EXECUTING SMART HYBRID AUTO-DUMP`);
      console.log(`🎯 Target sell value: ${targetSellValueSOL.toFixed(4)} SOL`);
      console.log(`👥 Checking ${wallets.length} whitelisted wallets`);

      let totalSold = 0;
      const walletsWithValue = [];

      // PHASE 1: Find wallets with tokens and calculate their profitable positions
      for (const wallet of wallets) {
        try {
          const walletAddress = wallet.keypair.publicKey.toString();
          console.log(`🔍 Checking wallet ${wallet.name} (${walletAddress.substring(0, 8)}...) for tokens`);
          
          const balance = await this.getTokenBalance(wallet.keypair.publicKey, tokenMint);
          console.log(`📊 Wallet ${wallet.name}: Balance = ${balance} tokens`);
          
          if (balance > 0) {
            // Get current price to calculate position value
            const currentPrice = await this.getCurrentTokenPrice(tokenMint);
            const positionValueSOL = balance * currentPrice;
            
            walletsWithValue.push({
              wallet,
              balance,
              positionValueSOL,
              name: wallet.name
            });
            
            console.log(`💰 Wallet ${wallet.name}: ${balance.toFixed(2)} tokens (~${positionValueSOL.toFixed(4)} SOL)`);
          }
        } catch (error) {
          console.log(`⚠️ Error checking wallet ${wallet.name}: ${error.message}`);
        }
      }

      // PHASE 2: Smart Multi-Wallet Selection - Find TOP 5 most profitable wallets
      if (walletsWithValue.length === 0) {
        console.log(`⚠️ No wallets with tokens to sell`);
        return;
      }

      // Sort wallets by position value (largest first)
      walletsWithValue.sort((a, b) => b.positionValueSOL - a.positionValueSOL);
      
      console.log(`📈 WALLET RANKINGS BY POSITION SIZE:`);
      walletsWithValue.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name}: ${item.balance.toFixed(2)} tokens (~${item.positionValueSOL.toFixed(4)} SOL)`);
      });

      // PHASE 3: Execute Smart Multi-Wallet Strategy (TOP 5 MOST PROFITABLE)
      const top5Wallets = walletsWithValue.slice(0, Math.min(5, walletsWithValue.length));
      console.log(`🎯 TARGETING TOP ${top5Wallets.length} MOST PROFITABLE WALLETS:`);
      top5Wallets.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item.name}: ${item.positionValueSOL.toFixed(4)} SOL`);
      });
      
      // Use configured autoDumpPercentage (30% default, distributed across top 5 wallets)
      const totalSellPercentage = this.config.autoDumpPercentage / 100; // Convert percentage to decimal
      
      console.log(`🚀 MULTI-WALLET EXECUTION: Distributing ${this.config.autoDumpPercentage}% sell across TOP ${top5Wallets.length} wallets`);
      console.log(`💡 This avoids suspicious patterns by spreading sells across multiple wallets`);

      // Execute sells across top 5 wallets in parallel
      const sellPromises = [];
      
      for (let i = 0; i < top5Wallets.length; i++) {
        const walletData = top5Wallets[i];
        
        // Calculate this wallet's share of the total sell (equal distribution)
        const walletSellPercentage = totalSellPercentage / top5Wallets.length;
        const tokensToSell = walletData.balance * walletSellPercentage;
        
        console.log(`📤 Wallet ${i + 1} (${walletData.name}): Selling ${(walletSellPercentage * 100).toFixed(1)}% = ${tokensToSell.toFixed(2)} tokens`);
        
        if (tokensToSell > 0.01) { // Only sell if meaningful amount
          sellPromises.push(
            this.executeSell(walletData.wallet, tokenMint, tokensToSell)
              .then(result => {
                if (result.success) {
                  totalSold += tokensToSell;
                  console.log(`✅ ${walletData.name}: Sold ${tokensToSell.toFixed(2)} tokens`);
                } else {
                  console.log(`❌ ${walletData.name}: Sell failed - ${result.error}`);
                }
                return { ...result, walletName: walletData.name, tokensSold: tokensToSell };
              })
              .catch(error => {
                console.log(`❌ ${walletData.name}: Sell error - ${error.message}`);
                return { success: false, error: error.message, walletName: walletData.name };
              })
          );
        }
      }

      // Execute all sells in parallel for maximum speed
      if (sellPromises.length > 0) {
        console.log(`⚡ Executing ${sellPromises.length} sell orders across multiple wallets...`);
        
        try {
          const results = await Promise.all(sellPromises);
          
          const successful = results.filter(r => r.success).length;
          const failed = results.length - successful;
          
          console.log(`📊 MULTI-WALLET AUTO-DUMP COMPLETE:`);
          console.log(`   ✅ Successful sells: ${successful}/${results.length} wallets`);
          console.log(`   ❌ Failed sells: ${failed}/${results.length} wallets`);
          console.log(`   🪙 Total tokens sold: ${totalSold.toFixed(2)}`);
          console.log(`   💰 Distributed across ${successful} wallets for stealth`);
          console.log(`   🎭 Pattern: NATURAL (multi-wallet selling)`);
          
          // Show successful wallet breakdown
          const successfulSells = results.filter(r => r.success);
          if (successfulSells.length > 0) {
            console.log(`📋 SUCCESSFUL SELLS BREAKDOWN:`);
            successfulSells.forEach((result, index) => {
              console.log(`   ${index + 1}. ${result.walletName}: ${result.tokensSold.toFixed(2)} tokens`);
            });
          }
          
        } catch (error) {
          console.log(`❌ Error executing multi-wallet sells: ${error.message}`);
        }
      } else {
        console.log(`⚠️ No wallets with sufficient tokens to sell`);
      }

    } catch (error) {
      console.error(`❌ Error executing proportional auto-dump:`, error.message);
    }
  }

  // Get current token price in SOL (helper method)
  async getCurrentTokenPrice(tokenMint) {
    try {
      // Use Jupiter API to get current price
      const response = await fetch(
        `https://public.jupiterapi.com/quote?inputMint=${tokenMint}&outputMint=So11111111111111111111111111111111111111112&amount=1000000&slippageBps=50`
      );
      
      if (response.ok) {
        const data = await response.json();
        const outputAmount = parseFloat(data.outAmount);
        if (outputAmount > 0) {
          return outputAmount / 1e9; // Convert lamports to SOL
        }
      }
    } catch (error) {
      console.log(`⚠️ Could not get current price: ${error.message}`);
    }
    
    return 0; // Return 0 if price unavailable
  }

  // Execute individual sell order (helper method)
  async executeSell(wallet, tokenMint, tokenAmount) {
    try {
      console.log(`🔄 Executing sell: ${tokenAmount.toFixed(2)} tokens from ${wallet.name}`);
      
      // Convert token amount to smallest unit (assuming 6 decimals like most SPL tokens)
      const tokenAmountLamports = Math.floor(tokenAmount * 1e6);
      
      // Execute actual sell through Jupiter
      const sellResult = await this.jupiter.sellToken(
        wallet.keypair, 
        tokenMint, 
        tokenAmountLamports,
        {
          slippage: 100, // 1% slippage for faster execution (kept low)
          priorityFee: 2000, // Reduced from 10k to 2k lamports
          source: 'smart-sell-outsider',
          session: `outsider_sell_${Date.now()}`
        }
      );
      
      if (sellResult && sellResult.txid) {
        console.log(`✅ ${wallet.name}: Sold ${tokenAmount.toFixed(2)} tokens - TX: ${sellResult.txid.substring(0, 8)}...`);
        return { 
          success: true, 
          tokenseSold: tokenAmount,
          wallet: wallet.name,
          txid: sellResult.txid,
          solReceived: sellResult.outAmount ? (sellResult.outAmount / 1e9) : null
        };
      } else {
        throw new Error('Sell transaction failed - no txid returned');
      }
      
    } catch (error) {
      console.log(`❌ ${wallet.name}: Sell failed - ${error.message}`);
      return { 
        success: false, 
        error: error.message,
        wallet: wallet.name 
      };
    }
  }
}

module.exports = { SmartSellEngine };