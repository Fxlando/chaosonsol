/**
 * Instant Auto Sell
 * Executes instant sells from top profitable wallets
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const RateLimitManager = require('./rate-limit-manager');

class InstantAutoSell {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      minProfitThreshold: config.minProfitThreshold || 20, // 20% minimum profit
      topWalletsCount: config.topWalletsCount || 5, // Top 5 wallets
      sellPercentage: config.sellPercentage || 50, // Sell 50% of position
      ...config
    };
    
    this.rateLimitManager = new RateLimitManager();
    this.wallets = [];
    this.parentSystem = null; // Reference to parent trading system
    this.isInitialized = false;
    
    this.stats = {
      totalSells: 0,
      successfulSells: 0,
      failedSells: 0,
      lastSell: null
    };
  }

  /**
   * Initialize with wallets
   */
  async initialize(wallets) {
    try {
      this.wallets = wallets;
      this.isInitialized = true;
      console.log(`✅ Instant Auto Sell initialized with ${wallets.length} wallets`);
      return true;
    } catch (error) {
      console.error('❌ Error initializing auto sell:', error.message);
      return false;
    }
  }

  /**
   * Stop auto sell
   */
  stop() {
    this.isInitialized = false;
    console.log('🛑 Instant Auto Sell stopped');
  }

  /**
   * Execute instant sell from top profitable wallets
   */
  async executeInstantSell(outsiderData) {
    if (!this.isInitialized) {
      return { success: false, error: 'Not initialized' };
    }

    try {
      const tokenMint = outsiderData.tokenMint;
      
      // Get top profitable wallets
      const topWallets = await this.getTopProfitableWallets(tokenMint, this.config.topWalletsCount);
      
      if (topWallets.length === 0) {
        return { 
          success: false, 
          reason: 'No profitable wallets found',
          totalWallets: 0,
          successful: 0,
          failed: 0
        };
      }

      console.log(`💰 Executing instant sell from ${topWallets.length} top wallets...`);

      // Execute sells
      const results = [];
      let successful = 0;
      let failed = 0;

      for (const walletData of topWallets) {
        try {
          const result = await this.sellFromWallet(
            walletData.wallet,
            tokenMint,
            walletData.sellAmount
          );

          results.push({
            wallet: walletData.walletAddress,
            result: result
          });

          if (result.success) {
            successful++;
            this.stats.successfulSells++;
          } else {
            failed++;
            this.stats.failedSells++;
          }
        } catch (error) {
          failed++;
          results.push({
            wallet: walletData.walletAddress,
            result: { success: false, error: error.message }
          });
        }
      }

      this.stats.totalSells++;
      this.stats.lastSell = Date.now();

      return {
        success: successful > 0,
        totalWallets: topWallets.length,
        successful,
        failed,
        results
      };

    } catch (error) {
      console.error('❌ Error executing instant sell:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get top profitable wallets
   */
  async getTopProfitableWallets(tokenMint, count = 5) {
    try {
      const walletProfits = [];

      for (const wallet of this.wallets) {
        try {
          const profitData = await this.calculateWalletProfit(wallet, tokenMint);
          
          if (profitData && profitData.profitPercentage >= this.config.minProfitThreshold) {
            walletProfits.push({
              wallet,
              walletAddress: wallet.publicKey?.toString() || wallet.walletAddress || wallet.toString(),
              profitPercentage: profitData.profitPercentage,
              profitAmount: profitData.profitAmount,
              tokenBalance: profitData.tokenBalance,
              sellAmount: profitData.tokenBalance * (this.config.sellPercentage / 100),
              priority: profitData.profitPercentage
            });
          }
        } catch (error) {
          console.error(`❌ Error calculating profit for wallet:`, error.message);
        }
      }

      // Sort by profit percentage (descending)
      walletProfits.sort((a, b) => b.profitPercentage - a.profitPercentage);

      // Return top wallets
      return walletProfits.slice(0, count);
    } catch (error) {
      console.error('❌ Error getting top profitable wallets:', error.message);
      return [];
    }
  }

  /**
   * Calculate wallet profit
   */
  async calculateWalletProfit(wallet, tokenMint) {
    try {
      // Get wallet address
      const walletAddress = wallet.publicKey?.toString() || wallet.walletAddress || wallet;
      const pubkey = new PublicKey(walletAddress);

      // Get token balance
      const tokenBalance = await this.getTokenBalance(pubkey, tokenMint);
      
      if (tokenBalance === 0) {
        return null;
      }

      // Get current token price (using parent system if available)
      let currentPrice = 0;
      let entryPrice = 0;

      if (this.parentSystem && this.parentSystem.getTokenPrice) {
        try {
          currentPrice = await this.parentSystem.getTokenPrice(tokenMint);
        } catch (error) {
          // Fallback to simple price calculation
        }
      }

      // If we can't get price, estimate from entry (assume 100% profit for now)
      if (currentPrice === 0) {
        // Try to get entry price from wallet history or assume 1x
        entryPrice = 1;
        currentPrice = 2; // Assume 2x for now (100% profit)
      }

      const profitPercentage = entryPrice > 0 
        ? ((currentPrice - entryPrice) / entryPrice) * 100 
        : 100; // Default to 100% if we can't calculate

      const profitAmount = (currentPrice - entryPrice) * tokenBalance;

      return {
        tokenBalance,
        entryPrice,
        currentPrice,
        profitPercentage,
        profitAmount
      };
    } catch (error) {
      console.error('❌ Error calculating wallet profit:', error.message);
      return null;
    }
  }

  /**
   * Get token balance for wallet
   */
  async getTokenBalance(walletPubkey, tokenMint) {
    try {
      const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
      
      const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        walletPubkey
      );

      const accountInfo = await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        return await getAccount(this.connection, tokenAccount);
      });

      if (!accountInfo) {
        return 0;
      }

      return Number(accountInfo.amount) / Math.pow(10, accountInfo.mint.decimals || 9);
    } catch (error) {
      // Account doesn't exist or error
      return 0;
    }
  }

  /**
   * Sell from wallet
   */
  async sellFromWallet(wallet, tokenMint, tokenAmount) {
    try {
      // Use parent system's sell method if available
      if (this.parentSystem && this.parentSystem.sellToken) {
        const walletId = wallet.id || wallet.walletAddress || wallet.publicKey?.toString();
        return await this.parentSystem.sellToken(walletId, tokenMint, tokenAmount);
      }

      // Fallback: use Jupiter directly if available
      if (this.parentSystem && this.parentSystem.jupiter) {
        const walletKeypair = this.getWalletKeypair(wallet);
        if (!walletKeypair) {
          return { success: false, error: 'Could not get wallet keypair' };
        }

        return await this.parentSystem.jupiter.executeSwap(
          walletKeypair,
          tokenMint,
          'So11111111111111111111111111111111111111112', // SOL
          tokenAmount,
          { slippage: 500 } // 5% slippage
        );
      }

      return { 
        success: false, 
        error: 'No sell method available. Parent system must provide sellToken or jupiter.executeSwap' 
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get wallet keypair
   */
  getWalletKeypair(wallet) {
    try {
      if (wallet.keypair) {
        return wallet.keypair;
      }
      if (wallet.secretKey) {
        const { Keypair } = require('@solana/web3.js');
        return Keypair.fromSecretKey(wallet.secretKey);
      }
      if (wallet.privateKey) {
        const { Keypair } = require('@solana/web3.js');
        const bs58 = require('bs58');
        return Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      walletCount: this.wallets.length,
      stats: { ...this.stats }
    };
  }
}

module.exports = InstantAutoSell;

