/**
 * Instant Outsider Detector
 * Monitors transactions for non-whitelisted buyers
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const RateLimitManager = require('./rate-limit-manager');

class InstantOutsiderDetector {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      monitoringInterval: config.monitoringInterval || 30000, // 30 seconds
      outsiderBuyThreshold: config.outsiderBuyThreshold || 0.01, // 0.01 SOL minimum
      ...config
    };
    
    this.rateLimitManager = new RateLimitManager();
    this.whitelistedWallets = new Set();
    this.isMonitoring = false;
    this.currentToken = null;
    this.monitoringInterval = null;
    this.lastCheckedSlot = null;
    this.callback = null;
    
    this.stats = {
      totalChecks: 0,
      totalDetections: 0,
      lastCheck: null,
      lastDetection: null
    };
  }

  /**
   * Add wallets to whitelist
   */
  addWhitelistedWallets(wallets) {
    wallets.forEach(wallet => {
      if (wallet.publicKey) {
        this.whitelistedWallets.add(wallet.publicKey.toString());
      } else if (wallet.walletAddress) {
        this.whitelistedWallets.add(wallet.walletAddress.toString());
      } else if (typeof wallet === 'string') {
        this.whitelistedWallets.add(wallet);
      }
    });
    console.log(`✅ Added ${wallets.length} wallets to whitelist`);
  }

  /**
   * Start monitoring for outsider transactions
   */
  async startMonitoring(tokenMint, callback) {
    if (this.isMonitoring) {
      console.log('⚠️ Already monitoring, stopping previous session');
      await this.stopMonitoring();
    }

    try {
      this.currentToken = tokenMint;
      this.callback = callback;
      this.isMonitoring = true;
      this.lastCheckedSlot = null;
      
      console.log(`🔍 Starting outsider detection for token: ${tokenMint}`);
      
      // Start monitoring loop
      this.monitoringInterval = setInterval(async () => {
        await this.checkForOutsiderTransactions(tokenMint);
      }, this.config.monitoringInterval);
      
      // Do initial check
      await this.checkForOutsiderTransactions(tokenMint);
      
      return true;
    } catch (error) {
      console.error('❌ Error starting monitoring:', error.message);
      this.isMonitoring = false;
      return false;
    }
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    this.currentToken = null;
    this.callback = null;
    console.log('🛑 Stopped outsider detection');
  }

  /**
   * Check for outsider transactions
   */
  async checkForOutsiderTransactions(tokenMint) {
    if (!this.isMonitoring || !tokenMint) return;

    try {
      this.stats.totalChecks++;
      this.stats.lastCheck = Date.now();

      // Get current slot
      const currentSlot = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        return await this.connection.getSlot('confirmed');
      });

      if (!this.lastCheckedSlot) {
        this.lastCheckedSlot = currentSlot - 10; // Check last 10 slots initially
      }

      // Get signatures for recent slots
      const signatures = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        return await this.connection.getSignaturesForAddress(
          new PublicKey(tokenMint),
          { limit: 50 },
          'confirmed'
        );
      });

      if (!signatures || signatures.length === 0) {
        return;
      }

      // Filter to new signatures
      const newSignatures = signatures.filter(sig => {
        if (!this.lastCheckedSlot) return true;
        return sig.slot > this.lastCheckedSlot;
      });

      if (newSignatures.length === 0) {
        this.lastCheckedSlot = currentSlot;
        return;
      }

      // Analyze transactions for outsider buys
      const outsiderTransactions = [];

      for (const sigInfo of newSignatures.slice(0, 10)) { // Limit to 10 to avoid rate limits
        const analysis = await this.analyzeTransaction(tokenMint, sigInfo);
        if (analysis && analysis.isOutsider) {
          outsiderTransactions.push({
            signature: sigInfo.signature,
            timestamp: sigInfo.blockTime ? sigInfo.blockTime * 1000 : Date.now(),
            outsiders: analysis.outsiders,
            analysis: analysis
          });
        }
      }

      if (outsiderTransactions.length > 0) {
        this.stats.totalDetections++;
        this.stats.lastDetection = Date.now();

        const outsiderData = {
          tokenMint,
          outsiderTransactions,
          timestamp: Date.now(),
          totalOutsiders: outsiderTransactions.reduce((sum, tx) => sum + tx.outsiders.length, 0)
        };

        if (this.callback) {
          await this.callback(outsiderData);
        }
      }

      this.lastCheckedSlot = currentSlot;

    } catch (error) {
      console.error('❌ Error checking for outsider transactions:', error.message);
    }
  }

  /**
   * Analyze transaction for outsider buy
   */
  async analyzeTransaction(tokenMint, signatureInfo) {
    try {
      const signature = signatureInfo.signature;
      
      // Get transaction
      const transaction = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        return await this.connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
      });

      if (!transaction || transaction.meta?.err) {
        return null;
      }

      // Check token balances
      const preTokenBalances = transaction.meta.preTokenBalances || [];
      const postTokenBalances = transaction.meta.postTokenBalances || [];

      const outsiders = [];
      let totalAmount = 0;

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

      // Find token purchases
      for (const postBalance of postTokenBalances) {
        if (postBalance.mint === tokenMint && postBalance.uiTokenAmount.uiAmount > 0) {
          if (postBalance.accountIndex >= accountKeys.length) continue;

          const accountPubkey = accountKeys[postBalance.accountIndex];
          const buyerAddress = accountPubkey.toString();

          // Check if buyer is whitelisted
          if (!this.whitelistedWallets.has(buyerAddress)) {
            // Check if this is a buy (token increase)
            const preBalance = preTokenBalances.find(pb => 
              pb.accountIndex === postBalance.accountIndex && pb.mint === tokenMint
            );
            
            const tokenIncrease = postBalance.uiTokenAmount.uiAmount - 
              (preBalance ? preBalance.uiTokenAmount.uiAmount : 0);

            if (tokenIncrease > 0) {
              // Estimate SOL spent
              const solSpent = this.estimateSOLSpent(transaction, postBalance.accountIndex);
              
              if (solSpent >= this.config.outsiderBuyThreshold) {
                outsiders.push(buyerAddress);
                totalAmount += solSpent;
              }
            }
          }
        }
      }

      if (outsiders.length > 0) {
        return {
          isOutsider: true,
          outsiders,
          amount: totalAmount,
          signature
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ Error analyzing transaction ${signatureInfo.signature}:`, error.message);
      return null;
    }
  }

  /**
   * Estimate SOL spent in transaction
   */
  estimateSOLSpent(transaction, accountIndex) {
    try {
      const preBalances = transaction.meta.preBalances || [];
      const postBalances = transaction.meta.postBalances || [];
      
      if (accountIndex >= preBalances.length || accountIndex >= postBalances.length) {
        return 0;
      }

      const solDecrease = (preBalances[accountIndex] - postBalances[accountIndex]) / 1e9;
      return Math.max(0, solDecrease);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      isMonitoring: this.isMonitoring,
      currentToken: this.currentToken,
      whitelistedCount: this.whitelistedWallets.size
    };
  }
}

module.exports = InstantOutsiderDetector;

