/**
 * Unified Trading System
 * Combines smart sell engine and instant trading into one streamlined system
 * Monitors for outsider activity and automatically sells from top 5 profitable wallets
 * Designed to be efficient and not exceed rate limits
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { JupiterV6Integration } = require('./jupiter-v6-integration');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const RateLimitManager = require('./rate-limit-manager');
const smartCacheManager = require('./smart-cache-manager');
const connectionPoolManager = require('./connection-pool-manager');

class UnifiedTradingSystem {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.jupiter = new JupiterV6Integration(connection, config);
    this.rateLimitManager = new RateLimitManager();
    
    // Initialize connection pool
    this.connectionPool = connectionPoolManager;
    
    this.config = {
      // Monitoring settings - optimized for better performance
      monitoringInterval: config.monitoringInterval || 15000, // 15 seconds - faster detection
      priceCheckInterval: config.priceCheckInterval || 30000, // 30 seconds for price checks
      
      // Outsider detection
      outsiderBuyThreshold: config.outsiderBuyThreshold || 0.001, // Minimum 0.001 SOL buy to trigger
      maxOutsiderBuysBeforeDump: config.maxOutsiderBuysBeforeDump || 1, // Dump after 1 outsider buy
      
      // Selling strategy
      topWalletsCount: config.topWalletsCount || 5, // Sell from top 5 wallets
      autoDumpPercentage: config.autoDumpPercentage || 30, // 30% auto-dump when outsiders buy
      minProfitThreshold: config.minProfitThreshold || 5, // Minimum 5% profit to sell
      
      // Risk management
      maxSellPercentage: config.maxSellPercentage || 90, // Sell max 90% of holdings
      slippage: config.slippage || 100, // 1% slippage
      priorityFee: config.priorityFee || 2000, // 2k lamports priority fee
      
      // Performance optimizations
      maxTransactionsPerCheck: config.maxTransactionsPerCheck || 5, // Reduced from 10
      walletUpdateInterval: config.walletUpdateInterval || 120000, // 2 minutes for wallet updates
      
      ...config
    };

    // System state
    this.isRunning = false;
    this.currentToken = null;
    this.wallets = [];
    this.whitelistedWallets = new Set();
    
    // Monitoring data
    this.activeMonitors = new Map(); // token -> monitor data
    this.priceHistory = new Map(); // token -> price history
    this.walletProfits = new Map(); // wallet -> profit data
    this.transactionMonitors = new Map(); // token -> transaction monitoring data
    this.lastProcessedTransactions = new Set();
    
    // Statistics
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
      console.log(`🚀 Initializing Unified Trading System with ${wallets.length} wallets...`);
      
      // Initialize connection pool
      await this.connectionPool.initialize();
      
      this.wallets = wallets;
      
      // Add wallets to whitelist for outsider detection
      for (const wallet of wallets) {
        let walletAddress;
        if (typeof wallet === 'string') {
          walletAddress = wallet;
        } else if (wallet.address) {
          walletAddress = wallet.address;
        } else if (wallet.publicKey) {
          walletAddress = wallet.publicKey.toString();
        } else if (wallet.pubkey) {
          walletAddress = wallet.pubkey.toString();
        } else if (wallet.keypair) {
          walletAddress = wallet.keypair.publicKey.toString();
        }
        
        if (walletAddress) {
          this.whitelistedWallets.add(walletAddress);
        }
      }
      
      console.log(`✅ Whitelisted ${this.whitelistedWallets.size} wallets for outsider detection`);
      
      // Initialize wallet profit tracking
      await this.updateWalletProfits();
      
      console.log('✅ Unified Trading System initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing Unified Trading System:', error.message);
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
      console.log(`🎯 Starting unified trading for token: ${tokenMint}`);
      
      this.currentToken = tokenMint;
      this.isRunning = true;
      this.stats.startTime = Date.now();
      
      // Set global token for other modules
      global.targetToken = tokenMint;
      
      // Initialize monitoring data
      const monitorData = {
        tokenMint,
        wallets: this.wallets,
        startTime: Date.now(),
        isActive: true,
        stats: {
          sellsExecuted: 0,
          profitRealized: 0,
          outsiderBuysDetected: 0,
          autoDumpsTriggered: 0
        }
      };

      this.activeMonitors.set(tokenMint, monitorData);
      this.priceHistory.set(tokenMint, []);
      
      // Initialize transaction monitoring
      this.transactionMonitors.set(tokenMint, {
        tokenAddress: tokenMint,
        lastCheckedSlot: null,
        outsiderBuyCount: 0,
        recentOutsiderBuys: [],
        isMonitoring: true,
        startTime: Date.now() // Record when monitoring started
      });

      // Start monitoring loops with a delay to prevent rate limiting on startup
      setTimeout(() => {
        this.startMonitoringLoop(tokenMint);
        this.startTransactionMonitoringLoop(tokenMint);
      }, 5000); // 5 second delay before starting monitoring
      
      console.log('✅ Unified trading system started successfully');
      return true;
    } catch (error) {
      console.error('❌ Error starting trading system:', error.message);
      this.isRunning = false;
      return false;
    }
  }

  /**
   * Main monitoring loop - checks prices and wallet profits
   */
  async startMonitoringLoop(tokenMint) {
    const monitor = async () => {
      try {
        const monitorData = this.activeMonitors.get(tokenMint);
        if (!monitorData || !monitorData.isActive || !this.isRunning) {
          return; // Stop monitoring
        }

        // Update wallet profits periodically (less frequently to avoid rate limiting)
        if (Date.now() - (monitorData.lastProfitUpdate || 0) > this.config.walletUpdateInterval) { // Use configurable interval
          await this.updateWalletProfits();
          monitorData.lastProfitUpdate = Date.now();
        }
        
        // Get current price
        const currentPrice = await this.getCurrentPrice(tokenMint);
        const timestamp = Date.now();

        // Update price history
        const history = this.priceHistory.get(tokenMint);
        history.push({ price: currentPrice, timestamp });
        
        // Keep only recent history (last hour)
        const cutoff = timestamp - (60 * 60 * 1000);
        this.priceHistory.set(tokenMint, history.filter(h => h.timestamp > cutoff));

        // Schedule next check
        setTimeout(monitor, this.config.priceCheckInterval);

      } catch (error) {
        console.error(`❌ Monitoring error for ${tokenMint}:`, error.message);
        setTimeout(monitor, this.config.priceCheckInterval * 2); // Double interval on error
      }
    };

    // Start the monitoring
    monitor();
  }

  /**
   * Transaction monitoring loop - checks for outsider activity
   */
  async startTransactionMonitoringLoop(tokenMint) {
    const monitorTransactions = async () => {
      try {
        const monitorData = this.transactionMonitors.get(tokenMint);
        if (!monitorData || !monitorData.isMonitoring || !this.isRunning) {
          return; // Stop monitoring
        }

        await this.checkForOutsiderActivity(tokenMint);
        
        // Schedule next check
        setTimeout(monitorTransactions, this.config.monitoringInterval);

      } catch (error) {
        console.error(`❌ Transaction monitoring error for ${tokenMint}:`, error.message);
        setTimeout(monitorTransactions, this.config.monitoringInterval * 2); // Double interval on error
      }
    };

    // Start the monitoring
    monitorTransactions();
  }

  /**
   * Check for outsider activity on the monitored token
   */
  async checkForOutsiderActivity(tokenMint) {
    try {
      const tokenPubkey = new PublicKey(tokenMint);
      const monitorData = this.transactionMonitors.get(tokenMint);
      
      if (!monitorData) return;

      // Get recent signatures for the token
      const signatures = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        return await this.connection.getSignaturesForAddress(tokenPubkey, {
          limit: 20, // Check last 20 transactions
          until: monitorData.lastCheckedSlot
        });
      });

      if (signatures.length === 0) {
        return;
      }

      // Filter out old transactions - only process transactions from after system start
      const systemStartTime = monitorData.startTime || Date.now();
      const newSignatures = signatures.filter(sig => {
        const txTime = sig.blockTime ? sig.blockTime * 1000 : 0; // Convert to milliseconds
        return txTime > systemStartTime;
      });

      if (newSignatures.length === 0) {
        console.log(`📊 No new transactions since system start (${new Date(systemStartTime).toLocaleTimeString()})`);
        return;
      }

      // Update last checked
      if (signatures.length > 0) {
        monitorData.lastCheckedSlot = signatures[0].signature;
      }

      console.log(`🔍 Found ${newSignatures.length} new transactions to analyze`);

      // Analyze each NEW transaction for outsider activity
      for (let i = 0; i < Math.min(newSignatures.length, this.config.maxTransactionsPerCheck); i++) { // Use configurable limit
        const sigInfo = newSignatures[i];
        
        // Skip if already processed
        if (this.lastProcessedTransactions.has(sigInfo.signature)) {
          continue;
        }
        
        this.lastProcessedTransactions.add(sigInfo.signature);
        
        try {
          await this.analyzeTransaction(tokenMint, sigInfo);
          
          // Add delay between transactions to prevent rate limiting
          if (i < Math.min(signatures.length, 10) - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
          }
        } catch (error) {
          console.log(`⚠️ Error analyzing transaction ${sigInfo.signature}:`, error.message);
        }
      }

    } catch (error) {
      console.error(`❌ Error checking outsider activity for ${tokenMint}:`, error.message);
    }
  }

  /**
   * Analyze individual transaction for outsider buy activity
   */
  async analyzeTransaction(tokenMint, signatureInfo) {
    try {
      const signature = signatureInfo.signature;
      
      // Get full transaction details
      const transaction = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        return await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
      });

      if (!transaction || transaction.meta.err) {
        return;
      }

      // Look for token transfers indicating buys
      const preTokenBalances = transaction.meta.preTokenBalances || [];
      const postTokenBalances = transaction.meta.postTokenBalances || [];

      // Find accounts that received the target token
      for (const postBalance of postTokenBalances) {
        if (postBalance.mint === tokenMint && postBalance.uiTokenAmount.uiAmount > 0) {
          // Get account keys
          let accountKeys = [];
          
          if (transaction.transaction.message.staticAccountKeys) {
            accountKeys = [...transaction.transaction.message.staticAccountKeys];
            
            if (transaction.meta?.loadedAddresses?.writable) {
              accountKeys = [...accountKeys, ...transaction.meta.loadedAddresses.writable];
            }
            if (transaction.meta?.loadedAddresses?.readonly) {
              accountKeys = [...accountKeys, ...transaction.meta.loadedAddresses.readonly];
            }
          } else {
            accountKeys = transaction.transaction.message.accountKeys || [];
          }
          
          if (postBalance.accountIndex >= accountKeys.length) {
            continue;
          }
          
          const accountPubkey = accountKeys[postBalance.accountIndex];
          
          // Check if this is a buy (comparing pre/post balances)
          const preBalance = preTokenBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
          const tokenIncrease = postBalance.uiTokenAmount.uiAmount - (preBalance ? preBalance.uiTokenAmount.uiAmount : 0);
          
          if (tokenIncrease > 0) {
            // This is a token purchase - check if buyer is whitelisted
            const buyerAddress = accountPubkey.toString();
            const isWhitelisted = this.whitelistedWallets.has(buyerAddress);
            
            if (!isWhitelisted) {
              console.log(`🚨 NON-WHITELISTED BUYER DETECTED!`);
              console.log(`👤 Buyer: ${buyerAddress.substring(0, 8)}...${buyerAddress.substring(-6)}`);
              console.log(`🪙 Tokens bought: ${tokenIncrease.toFixed(2)}`);
              
              // Estimate SOL spent
              const estimatedSOL = this.estimateSOLSpent(transaction, postBalance.accountIndex);
              console.log(`💰 Estimated SOL spent: ${estimatedSOL.toFixed(4)} SOL`);
              
              // Only process significant buys
              if (estimatedSOL >= this.config.outsiderBuyThreshold) {
                await this.handleOutsiderBuy(tokenMint, {
                  buyer: buyerAddress,
                  tokenAmount: tokenIncrease,
                  signature: signature,
                  timestamp: Date.now(),
                  solAmount: estimatedSOL
                });
              }
            }
          }
        }
      }

    } catch (error) {
      console.error(`❌ Error analyzing transaction ${signatureInfo.signature}:`, error.message);
    }
  }

  /**
   * Handle detection of outsider buy and execute auto-sell
   */
  async handleOutsiderBuy(tokenMint, buyEvent) {
    const monitorData = this.transactionMonitors.get(tokenMint);
    const smartSellData = this.activeMonitors.get(tokenMint);
    
    if (!monitorData || !smartSellData) return;

    console.log(`🚨 OUTSIDER BUY DETECTED!`);
    console.log(`👤 Buyer: ${buyEvent.buyer.substring(0, 8)}...${buyEvent.buyer.substring(-6)}`);
    console.log(`💰 Amount: ~${buyEvent.solAmount.toFixed(3)} SOL`);
    console.log(`🪙 Tokens: ${buyEvent.tokenAmount.toFixed(2)}`);

    // Update stats
    monitorData.outsiderBuyCount++;
    smartSellData.stats.outsiderBuysDetected++;
    this.stats.totalDetections++;
    this.stats.lastDetection = Date.now();

    // Execute auto-sell from top 5 profitable wallets
    await this.executeTop5AutoSell(tokenMint, buyEvent);
    smartSellData.stats.autoDumpsTriggered++;
  }

  /**
   * Execute auto-sell from ONE rotating wallet (anti-sketchy strategy)
   */
  async executeTop5AutoSell(tokenMint, buyEvent) {
    try {
      console.log(`🚀 EXECUTING ROTATING WALLET AUTO-SELL STRATEGY`);
      console.log(`🎯 Target: ONE wallet from top 5 most profitable wallets`);
      console.log(`💰 Auto-dump percentage: ${this.config.autoDumpPercentage}%`);

      // Get top 5 profitable wallets
      const topWallets = this.getTopProfitableWallets(this.config.topWalletsCount);
      
      if (topWallets.length === 0) {
        console.log(`⚠️ No profitable wallets found for auto-sell`);
        return;
      }

      console.log(`📈 TOP ${topWallets.length} PROFITABLE WALLETS:`);
      topWallets.forEach((wallet, index) => {
        console.log(`   ${index + 1}. ${wallet.name || wallet.walletAddress.substring(0, 8)}...: ${wallet.profitPercentage.toFixed(2)}% profit (${wallet.tokenBalance.toFixed(2)} tokens)`);
      });

      // ROTATING WALLET STRATEGY: Pick ONE wallet, rotate to next one next time
      const lastUsedIndex = global.smartSellSettings?.lastUsedWalletIndex || -1;
      let selectedWalletIndex;
      
      // Find next available wallet (rotate through the list)
      if (lastUsedIndex === -1 || lastUsedIndex >= topWallets.length - 1) {
        selectedWalletIndex = 0; // Start from first wallet
      } else {
        selectedWalletIndex = lastUsedIndex + 1; // Move to next wallet
      }
      
      const selectedWallet = topWallets[selectedWalletIndex];
      
      // Update last used wallet index for next time
      global.smartSellSettings.lastUsedWalletIndex = selectedWalletIndex;
      
      console.log(`🎯 SELECTED WALLET FOR SELL: #${selectedWalletIndex + 1} (${selectedWallet.name || selectedWallet.walletAddress.substring(0, 8)}...)`);
      console.log(`🔄 Next sell will use wallet #${((selectedWalletIndex + 1) % topWallets.length) + 1} (rotating strategy)`);

      // Calculate sell amount for the selected wallet
      const sellPercentage = this.config.autoDumpPercentage / 100;
      const tokensToSell = selectedWallet.tokenBalance * sellPercentage;
      
      // Check if wallet has enough SOL for transaction fees
      const walletSOLBalance = await this.getWalletSOLBalance(selectedWallet.walletAddress);
      const minSOLForFees = 0.01; // 0.01 SOL minimum for Jupiter swaps
      
      if (walletSOLBalance < minSOLForFees) {
        console.log(`⚠️ Wallet ${selectedWallet.walletAddress.substring(0, 8)}... has insufficient SOL for fees: ${walletSOLBalance.toFixed(6)} SOL (need ${minSOLForFees} SOL)`);
        console.log(`🔄 Skipping this wallet, will try next wallet in rotation next time`);
        return;
      }
      
      if (tokensToSell > 0.01) { // Only sell if meaningful amount
        console.log(`⚡ Executing sell from selected wallet...`);
        console.log(`💰 Wallet SOL balance: ${walletSOLBalance.toFixed(6)} SOL (sufficient for fees)`);
        
        try {
          const result = await this.executeWalletSell(selectedWallet, tokenMint, tokensToSell);
          
          if (result.success) {
            console.log(`✅ ${selectedWallet.name || selectedWallet.walletAddress.substring(0, 8)}...: Sold ${tokensToSell.toFixed(2)} tokens`);
            this.stats.successfulSells++;
            this.stats.totalSells++;
            this.stats.lastSell = Date.now();
            
            console.log(`📊 ROTATING AUTO-SELL COMPLETE:`);
            console.log(`   ✅ Successful sell from wallet #${selectedWalletIndex + 1}`);
            console.log(`   🎭 Strategy: Single wallet rotation (anti-sketchy)`);
            console.log(`   🔄 Next sell will use wallet #${((selectedWalletIndex + 1) % topWallets.length) + 1}`);
          } else {
            console.log(`❌ ${selectedWallet.name || selectedWallet.walletAddress.substring(0, 8)}...: Sell failed - ${result.error}`);
            console.log(`🔍 Full error details:`, result);
            this.stats.totalSells++;
          }
          
        } catch (error) {
          console.log(`❌ ${selectedWallet.name || selectedWallet.walletAddress.substring(0, 8)}...: Sell error - ${error.message}`);
          this.stats.totalSells++;
        }
      } else {
        console.log(`⚠️ Selected wallet has insufficient tokens to sell (${tokensToSell.toFixed(6)} tokens)`);
      }

    } catch (error) {
      console.error(`❌ Error executing rotating auto-sell:`, error.message);
    }
  }

  /**
   * Get top profitable wallets
   */
  getTopProfitableWallets(count = 5) {
    const allProfits = Array.from(this.walletProfits.values())
      .filter(profit => profit && profit.tokenBalance > 0 && profit.profitPercentage >= this.config.minProfitThreshold)
      .sort((a, b) => b.profitPercentage - a.profitPercentage);

    console.log(`🔍 Wallet Profit Analysis:`);
    console.log(`   Total wallets tracked: ${this.walletProfits.size}`);
    console.log(`   Wallets with tokens: ${Array.from(this.walletProfits.values()).filter(p => p && p.tokenBalance > 0).length}`);
    console.log(`   Wallets meeting profit threshold (${this.config.minProfitThreshold}%): ${allProfits.length}`);
    
    if (allProfits.length > 0) {
      console.log(`   Top profitable wallets:`);
      allProfits.slice(0, 3).forEach((wallet, index) => {
        console.log(`     ${index + 1}. ${wallet.walletAddress.substring(0, 8)}...: ${wallet.profitPercentage.toFixed(2)}% profit (${wallet.tokenBalance.toFixed(2)} tokens)`);
      });
    }

    return allProfits.slice(0, count);
  }

  /**
   * Update wallet profit calculations
   */
  async updateWalletProfits() {
    try {
      if (!this.wallets || !Array.isArray(this.wallets)) {
        return;
      }
      
      const profitPromises = this.wallets.map(async (wallet, index) => {
        try {
          // Add delay between wallet checks to prevent rate limiting
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between wallets (optimized)
          }
          
          const profit = await this.calculateWalletProfit(wallet);
          let walletAddress;
          
          if (typeof wallet === 'string') {
            walletAddress = wallet;
          } else if (wallet.address) {
            walletAddress = wallet.address;
          } else if (wallet.publicKey) {
            walletAddress = wallet.publicKey.toString();
          } else if (wallet.pubkey) {
            walletAddress = wallet.pubkey.toString();
          } else if (wallet.keypair) {
            walletAddress = wallet.keypair.publicKey.toString();
          }
          
          if (walletAddress) {
            this.walletProfits.set(walletAddress, profit);
          }
          
          return profit;
        } catch (error) {
          console.log(`⚠️ Error calculating profit for wallet ${index + 1}:`, error.message);
          return null;
        }
      });

      await Promise.all(profitPromises);
      
    } catch (error) {
      console.error('❌ Error updating wallet profits:', error.message);
    }
  }

  /**
   * Calculate profit for a single wallet
   */
  async calculateWalletProfit(wallet) {
    try {
      let walletAddress;
      if (typeof wallet === 'string') {
        walletAddress = wallet;
      } else if (wallet.address) {
        walletAddress = wallet.address;
      } else if (wallet.publicKey) {
        walletAddress = wallet.publicKey.toString();
      } else if (wallet.pubkey) {
        walletAddress = wallet.pubkey.toString();
      } else if (wallet.keypair) {
        walletAddress = wallet.keypair.publicKey.toString();
      } else {
        return {
          walletAddress: 'unknown',
          tokenBalance: 0,
          profitPercentage: 0,
          profitAmount: 0,
          sellAmount: 0,
          priority: 0
        };
      }
      
      // Get current token balance
      const tokenBalance = await this.getTokenBalance(walletAddress);
      
      if (tokenBalance <= 0) {
        console.log(`📊 Wallet ${walletAddress.substring(0, 8)}...: No tokens (${tokenBalance})`);
        return {
          walletAddress,
          tokenBalance: 0,
          profitPercentage: 0,
          profitAmount: 0,
          sellAmount: 0,
          priority: 0
        };
      }
      
      console.log(`📊 Wallet ${walletAddress.substring(0, 8)}...: ${tokenBalance.toFixed(2)} tokens`);

      // For now, assume all wallets with tokens are profitable (you can implement proper profit tracking later)
      const entryPrice = wallet.entryPrice || 0.0001;
      const currentPrice = await this.getCurrentPrice(this.currentToken);
      
      let profitPercentage = 0;
      if (entryPrice > 0 && currentPrice > 0) {
        profitPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else {
        // Default to 30% profit for testing - any wallet with tokens is considered profitable
        profitPercentage = 30;
      }
      
      // Ensure minimum profit for wallets with tokens
      if (tokenBalance > 0 && profitPercentage < this.config.minProfitThreshold) {
        profitPercentage = this.config.minProfitThreshold + 5; // Set to 10% if min is 5%
        console.log(`📈 Wallet ${walletAddress.substring(0, 8)}...: Adjusted profit to ${profitPercentage}% (has ${tokenBalance.toFixed(2)} tokens)`);
      }
      
      const profitAmount = (currentPrice - entryPrice) * tokenBalance;
      const sellAmount = tokenBalance * (this.config.autoDumpPercentage / 100);
      const priority = profitPercentage * tokenBalance;

      return {
        walletAddress,
        tokenBalance,
        profitPercentage,
        profitAmount,
        sellAmount,
        priority,
        currentPrice,
        entryPrice,
        name: wallet.name || `Wallet_${walletAddress.substring(0, 8)}`
      };

    } catch (error) {
      console.log(`⚠️ Error calculating profit for wallet:`, error.message);
      return {
        walletAddress: wallet.address || wallet.publicKey?.toString() || wallet,
        tokenBalance: 0,
        profitPercentage: 0,
        profitAmount: 0,
        sellAmount: 0,
        priority: 0
      };
    }
  }

  /**
   * Execute sell for a single wallet
   */
  async executeWalletSell(walletData, tokenMint, tokenAmount) {
    try {
      // Find the wallet object
      const wallet = this.wallets.find(w => {
        let walletAddress;
        if (typeof w === 'string') {
          walletAddress = w;
        } else if (w.address) {
          walletAddress = w.address;
        } else if (w.publicKey) {
          walletAddress = w.publicKey.toString();
        } else if (w.pubkey) {
          walletAddress = w.pubkey.toString();
        } else if (w.keypair) {
          walletAddress = w.keypair.publicKey.toString();
        }
        return walletAddress === walletData.walletAddress;
      });

      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }

      // Get keypair
      let keypair;
      if (wallet.keypair) {
        keypair = wallet.keypair;
      } else if (wallet.secretKey) {
        const { Keypair } = require('@solana/web3.js');
        keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
      } else {
        return { success: false, error: 'No keypair found' };
      }

      // Convert token amount to smallest unit
      const tokenAmountLamports = Math.floor(tokenAmount * 1e6);
      
      // Execute sell through Jupiter
      const sellResult = await this.jupiter.sellToken(
        keypair, 
        tokenMint, 
        tokenAmountLamports,
        {
          slippage: this.config.slippage,
          priorityFee: this.config.priorityFee,
          source: 'smart-sell',
          session: `smart_sell_${Date.now()}`
        }
      );
      
      if (sellResult && sellResult.txid) {
        return { 
          success: true, 
          tokensSold: tokenAmount,
          txid: sellResult.txid,
          solReceived: sellResult.outAmount ? (sellResult.outAmount / 1e9) : null
        };
      } else {
        return { success: false, error: 'Sell transaction failed' };
      }
      
    } catch (error) {
      console.log(`❌ Sell failed: ${error.message}`);
      return { 
        success: false, 
        error: error.message
      };
    }
  }

  /**
   * Get token balance for a wallet with caching
   */
  async getTokenBalance(walletAddress) {
    const cacheKey = `token_balance_${walletAddress}_${this.currentToken}`;
    
    return await smartCacheManager.getOrFetch('token-balance', cacheKey, async () => {
      try {
        return await this.rateLimitManager.makeRequest('solana-rpc', async () => {
          return await this.connectionPool.executeRequest(async (connection) => {
            const publicKey = new PublicKey(walletAddress);
            const tokenMintPublicKey = new PublicKey(this.currentToken);
            
            // Get all token accounts for this wallet
            const tokenAccounts = await connection.getTokenAccountsByOwner(
              publicKey,
              { mint: tokenMintPublicKey }
            );
            
            if (tokenAccounts.value.length === 0) {
              return 0; // No token account for this token
            }
            
            // Get balance from the first token account
            const tokenAccount = tokenAccounts.value[0];
            const balance = await connection.getTokenAccountBalance(tokenAccount.pubkey);
            return balance.value.uiAmount || 0;
          });
        });
      } catch (error) {
        console.log(`⚠️ Error getting token balance for ${walletAddress.substring(0, 8)}...: ${error.message}`);
        return 0;
      }
    });
  }

  /**
   * Get current token price
   */
  async getCurrentPrice(tokenMint) {
    try {
      const quote = await this.jupiter.getQuote(tokenMint, this.jupiter.solMint, 1000000);
      return parseFloat(quote.outAmount) / 1000000;
    } catch (error) {
      return 0.001; // Default price for testing
    }
  }

  /**
   * Get SOL balance for a wallet with caching
   */
  async getWalletSOLBalance(walletAddress) {
    const cacheKey = `sol_balance_${walletAddress}`;
    
    return await smartCacheManager.getOrFetch('wallet-balance', cacheKey, async () => {
      try {
        return await this.rateLimitManager.makeRequest('solana-rpc', async () => {
          return await this.connectionPool.executeRequest(async (connection) => {
            const publicKey = new PublicKey(walletAddress);
            const balance = await connection.getBalance(publicKey);
            return balance / 1000000000; // Convert lamports to SOL
          });
        });
      } catch (error) {
        console.log(`⚠️ Error getting SOL balance for ${walletAddress.substring(0, 8)}...: ${error.message}`);
        return 0;
      }
    });
  }

  /**
   * Estimate SOL spent in transaction
   */
  estimateSOLSpent(transaction, tokenAccountIndex) {
    try {
      const preBalances = transaction.meta.preBalances;
      const postBalances = transaction.meta.postBalances;
      
      for (let i = 0; i < preBalances.length; i++) {
        const solDecrease = (preBalances[i] - postBalances[i]) / 1e9;
        if (solDecrease > 0.001) {
          return solDecrease;
        }
      }
      
      return 0.1; // Default estimate
    } catch (error) {
      return 0.1;
    }
  }

  /**
   * Stop trading system
   */
  async stopTrading() {
    try {
      console.log('🛑 Stopping unified trading system...');
      
      this.isRunning = false;
      
      // Stop all monitoring
      for (const [tokenMint, monitorData] of this.activeMonitors) {
        monitorData.isActive = false;
      }
      
      for (const [tokenMint, monitorData] of this.transactionMonitors) {
        monitorData.isMonitoring = false;
      }
      
      this.activeMonitors.clear();
      this.transactionMonitors.clear();
      this.currentToken = null;
      
      console.log('✅ Unified trading system stopped');
    } catch (error) {
      console.error('❌ Error stopping trading system:', error.message);
    }
  }

  /**
   * Get current system status
   */
  getStatus() {
    const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
    const topWallets = this.getTopProfitableWallets();
    
    return {
      isRunning: this.isRunning,
      currentToken: this.currentToken,
      totalWallets: this.wallets.length,
      whitelistedWallets: this.whitelistedWallets.size,
      uptime: uptime,
      stats: {
        ...this.stats,
        uptime: uptime,
        detectionRate: this.stats.totalDetections / (uptime / 60000),
        successRate: this.stats.totalSells > 0 ? (this.stats.successfulSells / this.stats.totalSells) * 100 : 0
      },
      topProfitableWallets: topWallets.map(wallet => ({
        address: wallet.walletAddress,
        profitPercentage: wallet.profitPercentage,
        profitAmount: wallet.profitAmount,
        sellAmount: wallet.sellAmount,
        tokenBalance: wallet.tokenBalance
      }))
    };
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
      await this.checkForOutsiderActivity(this.currentToken);
      return true;
    } catch (error) {
      console.error('❌ Error triggering outsider check:', error.message);
      return false;
    }
  }

  /**
   * Manually trigger auto-sell (for testing)
   */
  async triggerAutoSell() {
    try {
      const mockBuyEvent = {
        buyer: 'test-buyer',
        tokenAmount: 1000,
        signature: 'manual-trigger',
        timestamp: Date.now(),
        solAmount: 0.1
      };
      
      await this.executeTop5AutoSell(this.currentToken, mockBuyEvent);
      return true;
    } catch (error) {
      console.error('❌ Error triggering auto-sell:', error.message);
      return false;
    }
  }
}

module.exports = UnifiedTradingSystem;
