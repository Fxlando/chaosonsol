/**
 * Instant Outsider Detection System
 * Real-time monitoring for outsider wallet transactions
 * Detects and responds to outsider buys in 2-3 seconds
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const RateLimitManager = require('./rate-limit-manager');

class InstantOutsiderDetector {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      monitoringInterval: 30000, // 30 seconds - fast enough for trading
      confirmationBlocks: 1, // 1 confirmation for speed
      maxRetries: 3,
      ...config
    };
    
    this.rateLimitManager = new RateLimitManager();
    this.isMonitoring = false;
    this.whitelistedWallets = new Set();
    this.monitoredTokens = new Map();
    this.lastProcessedTransactions = new Set();
    this.monitoringInterval = null;
  }

  /**
   * Add wallets to whitelist (your own wallets)
   */
  addWhitelistedWallets(wallets) {
    wallets.forEach(wallet => {
      if (typeof wallet === 'string') {
        this.whitelistedWallets.add(wallet);
      } else if (wallet.address) {
        this.whitelistedWallets.add(wallet.address);
      } else if (wallet.publicKey) {
        this.whitelistedWallets.add(wallet.publicKey.toString());
      }
    });
    
    console.log(`✅ Whitelisted ${wallets.length} wallets for outsider detection`);
  }

  /**
   * Start monitoring a token for outsider transactions
   */
  async startMonitoring(tokenMint, callback) {
    if (this.isMonitoring) {
      console.log('⚠️ Already monitoring, stopping previous session');
      await this.stopMonitoring();
    }

    console.log(`🎯 Starting instant outsider detection for token: ${tokenMint}`);
    
    this.isMonitoring = true;
    this.monitoredTokens.set(tokenMint, {
      callback,
      startTime: Date.now(),
      transactionCount: 0,
      outsiderCount: 0
    });

    // Start monitoring loop
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkForOutsiderTransactions(tokenMint);
      } catch (error) {
        console.error('❌ Error in monitoring loop:', error.message);
        // Continue monitoring even if one check fails
      }
    }, this.config.monitoringInterval);

    console.log('✅ Instant outsider detection started');
    
    // Add periodic status check
    this.statusInterval = setInterval(() => {
      if (this.isMonitoring) {
        console.log(`🔍 Monitoring active - Token: ${tokenMint.substring(0, 8)}...`);
      }
    }, 60000); // Log every minute
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    
    this.isMonitoring = false;
    this.monitoredTokens.clear();
    console.log('🛑 Outsider detection stopped');
  }

  /**
   * Check for outsider transactions on the monitored token
   */
  async checkForOutsiderTransactions(tokenMint) {
    try {
      const tokenInfo = this.monitoredTokens.get(tokenMint);
      if (!tokenInfo) {
        console.log('⚠️ No token info found for monitoring');
        return;
      }

      console.log(`🔍 Checking for transactions on token: ${tokenMint.substring(0, 8)}...`);

      // Get recent transactions for the token
      const transactions = await this.getRecentTokenTransactions(tokenMint);
      
      console.log(`📊 Found ${transactions.length} recent transactions`);
      
      if (transactions.length === 0) {
        console.log('⚠️ No recent transactions found');
        return;
      }

      // Analyze transactions for outsiders
      const outsiderTransactions = await this.analyzeTransactions(transactions);
      
      console.log(`🔍 Analyzed transactions, found ${outsiderTransactions.length} outsider transactions`);
      
      if (outsiderTransactions.length > 0) {
        console.log(`🚨 Detected ${outsiderTransactions.length} outsider transactions!`);
        
        // Update statistics
        tokenInfo.outsiderCount += outsiderTransactions.length;
        tokenInfo.transactionCount += transactions.length;
        
        // Call the callback with outsider data
        if (tokenInfo.callback) {
          try {
            console.log('💰 Calling auto-sell callback...');
            await tokenInfo.callback({
              tokenMint,
              outsiderTransactions,
              timestamp: Date.now(),
              totalOutsiders: tokenInfo.outsiderCount
            });
            console.log('✅ Auto-sell callback completed');
          } catch (callbackError) {
            console.error('❌ Error in outsider callback (auto-sell):', callbackError.message);
            // Don't stop monitoring if callback fails
          }
        } else {
          console.log('⚠️ No callback function set for auto-sell');
        }
      } else {
        console.log('✅ No outsider transactions found in this check');
      }

    } catch (error) {
      console.error('❌ Error in outsider detection:', error.message);
    }
  }

  /**
   * Get recent transactions for a token
   */
  async getRecentTokenTransactions(tokenMint) {
    try {
      return await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        const tokenPublicKey = new PublicKey(tokenMint);
        
        // Get recent transactions for the token
        const signatures = await this.connection.getSignaturesForAddress(tokenPublicKey, {
          limit: 50, // Get last 50 transactions
          commitment: 'confirmed'
        });

        // Filter out already processed transactions
        const newSignatures = signatures.filter(sig => 
          !this.lastProcessedTransactions.has(sig.signature)
        );

        // Add to processed set
        newSignatures.forEach(sig => {
          this.lastProcessedTransactions.add(sig.signature);
        });

        // Get transaction details for new signatures
        const transactions = [];
        for (const signature of newSignatures) {
          try {
            const tx = await this.connection.getTransaction(signature.signature, {
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0
            });
            
            if (tx) {
              transactions.push({
                signature: signature.signature,
                transaction: tx,
                timestamp: signature.blockTime * 1000
              });
            }
          } catch (error) {
            console.log(`⚠️ Could not get transaction ${signature.signature}:`, error.message);
          }
        }

        return transactions;
      });
    } catch (error) {
      console.error('❌ Error getting token transactions:', error.message);
      return [];
    }
  }

  /**
   * Analyze transactions to identify outsiders
   */
  async analyzeTransactions(transactions) {
    const outsiderTransactions = [];

    for (const txData of transactions) {
      try {
        const transaction = txData.transaction;
        if (!transaction || !transaction.meta) continue;

        // Get all wallet addresses involved in the transaction
        const involvedWallets = this.extractWalletAddresses(transaction);
        
        // Check if any wallet is not whitelisted (outsider)
        const outsiders = involvedWallets.filter(wallet => 
          !this.whitelistedWallets.has(wallet)
        );

        if (outsiders.length > 0) {
          // Analyze transaction type and amount
          const analysis = await this.analyzeTransactionDetails(transaction, outsiders);
          
          if (analysis.isOutsiderBuy && analysis.amount > 0) {
            outsiderTransactions.push({
              signature: txData.signature,
              timestamp: txData.timestamp,
              outsiders,
              analysis,
              transaction: transaction
            });
          }
        }

      } catch (error) {
        console.log(`⚠️ Error analyzing transaction ${txData.signature}:`, error.message);
      }
    }

    return outsiderTransactions;
  }

  /**
   * Extract wallet addresses from transaction
   */
  extractWalletAddresses(transaction) {
    const wallets = new Set();
    
    try {
      // Add fee payer
      if (transaction.transaction && transaction.transaction.message && transaction.transaction.message.feePayer) {
        wallets.add(transaction.transaction.message.feePayer.toString());
      }

      // Add account keys
      if (transaction.transaction && transaction.transaction.message && transaction.transaction.message.accountKeys) {
        transaction.transaction.message.accountKeys.forEach(key => {
          wallets.add(key.toString());
        });
      }

      // Add pre/post token balances
      if (transaction.meta && transaction.meta.preTokenBalances) {
        transaction.meta.preTokenBalances.forEach(balance => {
          if (balance.owner) {
            wallets.add(balance.owner);
          }
        });
      }

      if (transaction.meta && transaction.meta.postTokenBalances) {
        transaction.meta.postTokenBalances.forEach(balance => {
          if (balance.owner) {
            wallets.add(balance.owner);
          }
        });
      }
    } catch (error) {
      console.log('⚠️ Error extracting wallet addresses:', error.message);
    }

    return Array.from(wallets);
  }

  /**
   * Analyze transaction details to determine if it's an outsider buy
   */
  async analyzeTransactionDetails(transaction, outsiders) {
    try {
      // Check if transaction and meta exist
      if (!transaction || !transaction.meta) {
        return {
          isOutsiderBuy: false,
          amount: 0,
          outsiderCount: outsiders.length,
          transactionSuccess: false
        };
      }

      const preBalances = transaction.meta.preTokenBalances || [];
      const postBalances = transaction.meta.postTokenBalances || [];
      
      let totalOutsiderBuyAmount = 0;
      let isOutsiderBuy = false;

      // Check each outsider's token balance changes
      for (const outsider of outsiders) {
        const preBalance = preBalances.find(b => b.owner === outsider);
        const postBalance = postBalances.find(b => b.owner === outsider);

        if (preBalance && postBalance) {
          const preAmount = parseFloat(preBalance.uiTokenAmount?.uiAmount || 0);
          const postAmount = parseFloat(postBalance.uiTokenAmount?.uiAmount || 0);
          const change = postAmount - preAmount;

          if (change > 0) {
            // Outsider bought tokens
            totalOutsiderBuyAmount += change;
            isOutsiderBuy = true;
          }
        }
      }

      return {
        isOutsiderBuy,
        amount: totalOutsiderBuyAmount,
        outsiderCount: outsiders.length,
        transactionSuccess: transaction.meta.err === null
      };

    } catch (error) {
      console.log('⚠️ Error analyzing transaction details:', error.message);
      return {
        isOutsiderBuy: false,
        amount: 0,
        outsiderCount: outsiders.length,
        transactionSuccess: false
      };
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats() {
    const stats = {
      isMonitoring: this.isMonitoring,
      whitelistedWallets: this.whitelistedWallets.size,
      monitoredTokens: this.monitoredTokens.size,
      tokenStats: {}
    };

    for (const [tokenMint, info] of this.monitoredTokens) {
      stats.tokenStats[tokenMint] = {
        startTime: info.startTime,
        transactionCount: info.transactionCount,
        outsiderCount: info.outsiderCount,
        uptime: Date.now() - info.startTime
      };
    }

    return stats;
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.rateLimitManager.getStatus();
  }
}

module.exports = InstantOutsiderDetector;
