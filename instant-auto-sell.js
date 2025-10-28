/**
 * Instant Auto-Sell System
 * Pre-computes profit calculations and executes instant sells
 * from top profitable wallets when outsiders are detected
 */

const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const RateLimitManager = require('./rate-limit-manager');
const { JupiterV6Integration } = require('./jupiter-v6-integration');

class InstantAutoSell {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      topWalletsCount: 5, // Sell from top 5 profitable wallets
      minProfitThreshold: 5, // Minimum 5% profit (lowered for testing)
      maxSellPercentage: 100, // Sell 100% of position
      slippageTolerance: 1000, // 10% slippage
      ...config
    };
    
    this.rateLimitManager = new RateLimitManager();
    this.jupiterIntegration = new JupiterV6Integration(connection, config);
    this.walletProfits = new Map(); // Pre-computed profit data
    this.lastUpdateTime = 0;
    this.updateInterval = 10000; // Update profits every 10 seconds
  }

  /**
   * Initialize with wallet data
   */
  async initialize(wallets) {
    if (!wallets || !Array.isArray(wallets)) {
      console.error('❌ Invalid wallets provided to auto-sell:', wallets);
      return;
    }
    
    console.log(`🚀 Initializing instant auto-sell for ${wallets.length} wallets`);
    
    // Debug: Show wallet structure
    console.log('🔍 Wallet structure debug:');
    wallets.slice(0, 3).forEach((wallet, i) => {
      console.log(`   Wallet ${i + 1}:`, {
        address: wallet.address,
        publicKey: wallet.publicKey?.toString(),
        raw: typeof wallet === 'string' ? wallet : 'object'
      });
    });
    
    this.wallets = wallets;
    await this.updateWalletProfits();
    
    // Start periodic profit updates
    this.profitUpdateInterval = setInterval(async () => {
      await this.updateWalletProfits();
    }, this.updateInterval);
    
    console.log('✅ Instant auto-sell initialized');
  }

  /**
   * Update wallet profit calculations
   */
  async updateWalletProfits() {
    try {
      console.log('💰 Updating wallet profit calculations...');
      
      if (!this.wallets || !Array.isArray(this.wallets)) {
        console.error('❌ Wallets not initialized or not an array:', this.wallets);
        return;
      }
      
      // Only check wallets that previously had tokens to avoid rate limiting
      const walletsToCheck = this.wallets.filter((wallet, index) => {
        let walletAddress;
        if (typeof wallet === 'string') {
          walletAddress = wallet;
        } else if (wallet.address) {
          walletAddress = wallet.address;
        } else if (wallet.publicKey) {
          walletAddress = wallet.publicKey.toString();
        } else if (wallet.pubkey) {
          walletAddress = wallet.pubkey.toString();
        } else {
          return false;
        }
        
        // Check if we've seen this wallet before and if it had tokens
        const existingProfit = this.walletProfits.get(walletAddress);
        return !existingProfit || existingProfit.tokenBalance > 0;
      });
      
      console.log(`📊 Processing ${walletsToCheck.length} wallets (${this.wallets.length - walletsToCheck.length} skipped - no previous tokens)`);
      
      const profitPromises = walletsToCheck.map(async (wallet, index) => {
        try {
          // Extract wallet address properly
          let walletAddress;
          if (typeof wallet === 'string') {
            walletAddress = wallet;
          } else if (wallet.address) {
            walletAddress = wallet.address;
          } else if (wallet.publicKey) {
            walletAddress = wallet.publicKey.toString();
          } else if (wallet.pubkey) {
            walletAddress = wallet.pubkey.toString();
          } else {
            console.error(`❌ Cannot extract wallet address from wallet ${index + 1}:`, wallet);
            return null;
          }
          
          console.log(`🔍 Checking wallet ${index + 1}/${walletsToCheck.length}: ${walletAddress.substring(0, 8)}...`);
          
          const profit = await this.calculateWalletProfit(wallet);
          this.walletProfits.set(walletAddress, profit);
          
          if (profit.tokenBalance > 0) {
            console.log(`✅ Wallet ${walletAddress.substring(0, 8)}... has ${profit.tokenBalance} tokens, ${profit.profitPercentage.toFixed(2)}% profit`);
          } else {
            console.log(`⚠️ Wallet ${walletAddress.substring(0, 8)}... has no tokens`);
          }
          
          return profit;
        } catch (error) {
          console.log(`⚠️ Error calculating profit for wallet ${index + 1}:`, error.message);
          return null;
        }
      });

      await Promise.all(profitPromises);
      this.lastUpdateTime = Date.now();
      
      const profitableWallets = Array.from(this.walletProfits.values()).filter(p => p && p.tokenBalance > 0);
      console.log(`✅ Updated profits for ${walletsToCheck.length} wallets, ${profitableWallets.length} have tokens`);
    } catch (error) {
      console.error('❌ Error updating wallet profits:', error.message);
    }
  }

  /**
   * Calculate profit for a single wallet
   */
  async calculateWalletProfit(wallet) {
    try {
      // Extract wallet address properly
      let walletAddress;
      if (typeof wallet === 'string') {
        walletAddress = wallet;
      } else if (wallet.address) {
        walletAddress = wallet.address;
      } else if (wallet.publicKey) {
        walletAddress = wallet.publicKey.toString();
      } else if (wallet.pubkey) {
        walletAddress = wallet.pubkey.toString();
      } else {
        console.error('❌ Cannot extract wallet address from:', wallet);
        return {
          walletAddress: 'unknown',
          tokenBalance: 0,
          profitPercentage: 0,
          profitAmount: 0,
          sellAmount: 0,
          priority: 0
        };
      }
      
      console.log(`🔍 Processing wallet: ${walletAddress.substring(0, 8)}...`);
      
      // Get current token balance
      const tokenBalance = await this.getTokenBalance(walletAddress);
      
      if (tokenBalance <= 0) {
        return {
          walletAddress,
          tokenBalance: 0,
          profitPercentage: 0,
          profitAmount: 0,
          sellAmount: 0,
          priority: 0
        };
      }

      // For testing, assume all wallets are profitable
      // This allows the system to work while we set up proper profit tracking
      const entryPrice = wallet.entryPrice || 0.0001; // Default entry price
      const currentPrice = await this.getCurrentTokenPrice();
      
      // For testing purposes, assume all wallets are profitable
      let profitPercentage = 0;
      if (entryPrice > 0 && currentPrice > 0) {
        profitPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else {
        // Default to 30% profit for testing (lower than before)
        profitPercentage = 30;
        console.log(`💰 Using default 30% profit for wallet ${walletAddress.substring(0, 8)}...`);
      }
      
      const profitAmount = (currentPrice - entryPrice) * tokenBalance;
      
      // Calculate sell amount
      const sellPercentage = this.calculateSellPercentage(profitPercentage);
      const sellAmount = tokenBalance * (sellPercentage / 100);
      
      // Calculate priority (higher profit = higher priority)
      const priority = this.calculatePriority(profitPercentage, profitAmount, tokenBalance);

      return {
        walletAddress,
        tokenBalance,
        profitPercentage,
        profitAmount,
        sellAmount,
        sellPercentage,
        priority,
        currentPrice,
        entryPrice
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
   * Get token balance for a wallet
   */
  async getTokenBalance(walletAddress) {
    try {
      return await this.rateLimitManager.makeRequest('solana-rpc', async () => {
        // Add minimal delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const publicKey = new PublicKey(walletAddress);
        
        // Get the target token mint from global variable
        const targetTokenMint = global.targetToken;
        if (!targetTokenMint) {
          console.log('⚠️ No target token set for balance check');
          return 0;
        }

        const tokenMintPublicKey = new PublicKey(targetTokenMint);
        
        // Get token accounts for the specific token
        const tokenAccounts = await this.connection.getTokenAccountsByOwner(publicKey, {
          mint: tokenMintPublicKey
        });

        if (tokenAccounts.value.length === 0) {
          console.log(`⚠️ No token account found for wallet ${walletAddress.substring(0, 8)}...`);
          return 0;
        }

        // Get balance from the first (and likely only) token account
        const accountInfo = await this.connection.getTokenAccountBalance(tokenAccounts.value[0].pubkey);
        const balance = parseFloat(accountInfo.value.uiAmount || 0);
        
        console.log(`💰 Wallet ${walletAddress.substring(0, 8)}... has ${balance} tokens`);
        return balance;
      });
    } catch (error) {
      console.log(`⚠️ Error getting token balance for ${walletAddress}:`, error.message);
      return 0;
    }
  }

  /**
   * Get current token price (implement based on your token)
   */
  async getCurrentTokenPrice() {
    try {
      // This is a placeholder - implement based on your token's price source
      // You might use Jupiter API, Raydium API, or your own price feed
      return await this.rateLimitManager.makeRequest('jupiter-price', async () => {
        // Placeholder implementation
        // Replace with actual price fetching logic
        return 0.001; // Example price
      });
    } catch (error) {
      console.log('⚠️ Error getting current token price:', error.message);
      return 0;
    }
  }

  /**
   * Calculate sell percentage based on profit
   */
  calculateSellPercentage(profitPercentage) {
    if (profitPercentage < this.config.minProfitThreshold) {
      return 0; // Don't sell if below minimum profit
    }
    
    // Sell more as profit increases
    if (profitPercentage >= 100) return 100; // Sell all if 100%+ profit
    if (profitPercentage >= 50) return 80;   // Sell 80% if 50%+ profit
    if (profitPercentage >= 30) return 60;   // Sell 60% if 30%+ profit
    if (profitPercentage >= 20) return 40;   // Sell 40% if 20%+ profit
    
    return 20; // Sell 20% for minimum profit
  }

  /**
   * Calculate priority for wallet selection
   */
  calculatePriority(profitPercentage, profitAmount, tokenBalance) {
    // Higher profit percentage = higher priority
    // Higher profit amount = higher priority
    // Higher token balance = higher priority
    return (profitPercentage * 0.4) + (profitAmount * 0.3) + (tokenBalance * 0.3);
  }

  /**
   * Get top profitable wallets for instant selling
   */
  getTopProfitableWallets(count = this.config.topWalletsCount) {
    const allProfits = Array.from(this.walletProfits.values())
      .filter(profit => profit && profit.profitPercentage >= this.config.minProfitThreshold)
      .sort((a, b) => b.priority - a.priority);

    return allProfits.slice(0, count);
  }

  /**
   * Execute instant sell from top profitable wallets
   */
  async executeInstantSell(outsiderData) {
    try {
      console.log('🚀 Executing instant sell from top profitable wallets...');
      console.log('🔍 Outsider data received:', {
        tokenMint: outsiderData.tokenMint,
        outsiderCount: outsiderData.outsiderTransactions?.length || 0,
        timestamp: new Date(outsiderData.timestamp).toLocaleString()
      });
      
      // Check if wallets are initialized
      if (!this.wallets || !Array.isArray(this.wallets) || this.wallets.length === 0) {
        console.error('❌ Wallets not initialized in auto-sell system');
        console.log('🔧 Attempting to get wallets from global system...');
        
        // Try to get wallets from the parent system
        if (this.parentSystem && this.parentSystem.wallets) {
          console.log('✅ Found parent system wallets, initializing auto-sell...');
          await this.initialize(this.parentSystem.wallets);
        } else {
          console.error('❌ No wallets available anywhere');
          return { success: false, reason: 'Wallets not initialized' };
        }
      }
      
      // First, update wallet profits to get latest data
      console.log('🔄 Updating wallet profits before sell...');
      await this.updateWalletProfits();
      
      // Get top profitable wallets
      const topWallets = this.getTopProfitableWallets();
      
      console.log(`📊 Found ${topWallets.length} profitable wallets out of ${this.wallets.length} total wallets`);
      
      if (topWallets.length === 0) {
        console.log('⚠️ No profitable wallets found for instant sell');
        console.log('🔍 Debug: Checking all wallet profits...');
        
        // Debug: Show all wallet profits
        for (const [address, profit] of this.walletProfits) {
          console.log(`   Wallet ${address.substring(0, 8)}...: ${profit.tokenBalance} tokens, ${profit.profitPercentage.toFixed(2)}% profit`);
        }
        
        return { success: false, reason: 'No profitable wallets' };
      }

      console.log(`💰 Found ${topWallets.length} profitable wallets for instant sell`);
      
      // Execute sells in parallel for speed
      const sellPromises = topWallets.map(async (wallet) => {
        try {
          const result = await this.executeWalletSell(wallet);
          return { wallet: wallet.walletAddress, result };
        } catch (error) {
          console.error(`❌ Error selling from wallet ${wallet.walletAddress}:`, error.message);
          return { wallet: wallet.walletAddress, result: { success: false, error: error.message } };
        }
      });

      const results = await Promise.all(sellPromises);
      
      // Analyze results
      const successful = results.filter(r => r.result.success).length;
      const failed = results.filter(r => !r.result.success).length;
      
      console.log(`✅ Instant sell completed: ${successful} successful, ${failed} failed`);
      
      return {
        success: successful > 0,
        totalWallets: topWallets.length,
        successful,
        failed,
        results
      };

    } catch (error) {
      console.error('❌ Error in instant sell execution:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute sell for a single wallet
   */
  async executeWalletSell(wallet) {
    try {
      const walletAddress = wallet.walletAddress;
      let sellAmount = wallet.sellAmount;
      
      if (sellAmount <= 0) {
        return { success: false, reason: 'No tokens to sell' };
      }

      // Try selling smaller amounts if the token has liquidity issues
      const sellPercentages = [1.0, 0.5, 0.25, 0.1]; // 100%, 50%, 25%, 10%
      let successfulSell = false;
      let actualSoldAmount = 0;

      for (const percentage of sellPercentages) {
        const currentSellAmount = sellAmount * percentage;
        
        if (currentSellAmount < 1) {
          console.log(`⚠️ Sell amount too small (${currentSellAmount}), skipping`);
          continue;
        }

        console.log(`💸 Attempting to sell ${currentSellAmount} tokens (${(percentage * 100).toFixed(0)}% of total) from wallet ${walletAddress} (${wallet.profitPercentage.toFixed(2)}% profit)`);

      // Create a proper wallet object for Jupiter with the private key
      let keypair;
      if (wallet.secretKey && Array.isArray(wallet.secretKey)) {
        // New format: secretKey as array
        keypair = Keypair.fromSecretKey(Uint8Array.from(wallet.secretKey));
      } else if (wallet.privateKey && typeof wallet.privateKey === 'string') {
        // Old format: privateKey as base58 string
        const secretKey = bs58.decode(wallet.privateKey);
        keypair = Keypair.fromSecretKey(secretKey);
      } else {
        console.log(`❌ Wallet ${walletAddress} has no valid private key, skipping sell`);
        return { success: false, reason: 'No valid private key found' };
      }
      
      const walletObj = keypair;

              // Try to execute the sell through Jupiter using the proper executeSwap method
              try {
                console.log(`🔄 Attempting to sell ${currentSellAmount} tokens (${(percentage * 100).toFixed(0)}% of total)`);
                
                // First, let's check the token's actual decimals
                let tokenDecimals = 9; // Default assumption
                try {
                  const tokenInfo = await this.connection.getParsedAccountInfo(new PublicKey(global.targetToken));
                  if (tokenInfo.value && tokenInfo.value.data && tokenInfo.value.data.parsed) {
                    tokenDecimals = tokenInfo.value.data.parsed.info.decimals;
                    console.log(`🔍 Token decimals: ${tokenDecimals}`);
                  }
                } catch (error) {
                  console.log(`⚠️ Could not get token decimals, using default: ${tokenDecimals}`);
                }
                
                // Convert token amount to the correct format using actual decimals
                const tokenAmountInSmallestUnit = Math.floor(currentSellAmount * Math.pow(10, tokenDecimals));
                console.log(`🔢 Converting ${currentSellAmount} tokens to ${tokenAmountInSmallestUnit} smallest units (decimals: ${tokenDecimals})`);
                
                // Try with much smaller amounts first to test liquidity
                const testAmounts = [
                  tokenAmountInSmallestUnit, // Full amount
                  Math.floor(tokenAmountInSmallestUnit * 0.1), // 10%
                  Math.floor(tokenAmountInSmallestUnit * 0.01), // 1%
                  Math.floor(tokenAmountInSmallestUnit * 0.001), // 0.1%
                ];
                
                let swapResult = null;
                let successfulAmount = 0;
                
                for (const testAmount of testAmounts) {
                  if (testAmount < 1) continue; // Skip if amount is too small
                  
                  console.log(`🧪 Testing with amount: ${testAmount} (${(testAmount / Math.pow(10, tokenDecimals)).toFixed(6)} tokens)`);
                  
                  try {
                    // Use sellToken method - this is the correct method for selling tokens
                    swapResult = await this.jupiterIntegration.sellToken(
                      walletObj,
                      global.targetToken, // tokenMint
                      testAmount, // tokenAmount
                      {
                        slippage: this.config.slippageTolerance || 1000, // 10% slippage for illiquid tokens
                        priorityFee: 5000 // Higher priority fee for better execution
                      }
                    );
                    
                    if (swapResult && swapResult.success) {
                      successfulAmount = testAmount;
                      console.log(`✅ Success with amount: ${testAmount}`);
                      break;
                    }
                  } catch (error) {
                    console.log(`❌ Failed with amount ${testAmount}:`, error.message);
                    if (error.message.includes('COULD_NOT_FIND_ANY_ROUTE')) {
                      console.log(`🔄 Trying smaller amount...`);
                      continue;
                    } else {
                      throw error; // Re-throw if it's not a routing issue
                    }
                  }
                }
          
          if (swapResult && swapResult.success) {
            const actualTokensSold = successfulAmount / Math.pow(10, tokenDecimals);
            console.log(`✅ Successfully sold ${actualTokensSold.toFixed(6)} tokens from ${walletAddress}`);
            console.log(`📝 Transaction: ${swapResult.signature || 'N/A'}`);
            console.log(`💰 Amount sold: ${successfulAmount} smallest units`);
            successfulSell = true;
            actualSoldAmount = actualTokensSold;
            break; // Exit the percentage loop
          } else {
            console.log(`❌ Sell failed for ${(percentage * 100).toFixed(0)}% of tokens - no viable amount found`);
          }
          
        } catch (error) {
          console.log(`❌ Sell attempt failed for ${(percentage * 100).toFixed(0)}%:`, error.message);
          
          // If it's a "no route" error, this token has no liquidity
          if (error.message.includes('COULD_NOT_FIND_ANY_ROUTE') || error.message.includes('Could not find any route')) {
            console.log(`🚨 CRITICAL: Token ${global.targetToken} has NO LIQUIDITY on Jupiter!`);
            console.log(`💡 This means the token cannot be sold through normal DEX routes.`);
            console.log(`🔍 Possible solutions:`);
            console.log(`   • Token may be a scam/rug pull`);
            console.log(`   • Token may have been delisted`);
            console.log(`   • Token may need to be sold on a different DEX`);
            console.log(`   • Token may need manual intervention`);
            
            // Don't try other percentages if there's no liquidity at all
            break;
          }
        }
      }

      if (successfulSell) {
        return {
          success: true,
          amount: actualSoldAmount,
          profitPercentage: wallet.profitPercentage,
          transactionSignature: swapResult.signature
        };
      } else {
        console.log(`❌ Failed to sell any amount from ${walletAddress}`);
        console.log(`🚨 TOKEN LIQUIDITY CRISIS DETECTED!`);
        console.log(`📊 Token: ${global.targetToken}`);
        console.log(`💰 Wallet has: ${wallet.sellAmount} tokens (${wallet.profitPercentage.toFixed(2)}% profit)`);
        console.log(`❌ Problem: Token has NO LIQUIDITY on Jupiter DEX`);
        console.log(`\n🔧 IMMEDIATE ACTION REQUIRED:`);
        console.log(`1. Check if token is a scam/rug pull`);
        console.log(`2. Try selling on other DEXes manually:`);
        console.log(`   • Raydium: https://raydium.io/swap/`);
        console.log(`   • Orca: https://www.orca.so/`);
        console.log(`   • Serum: https://dex.projectserum.com/`);
        console.log(`3. Check token contract for any restrictions`);
        console.log(`4. Consider this a loss and move on`);
        console.log(`\n⚠️  WARNING: This token appears to be UNTRADEABLE!`);
        
        // Send critical alert to Telegram if available
        if (global.telegramBot) {
          try {
            await global.telegramBot.telegram.sendMessage(
              global.adminChatId || 'YOUR_CHAT_ID', // Replace with your actual chat ID
              `🚨 CRITICAL ALERT: Token Liquidity Crisis!\n\n` +
              `Token: ${global.targetToken}\n` +
              `Wallet: ${walletAddress}\n` +
              `Tokens: ${wallet.sellAmount}\n` +
              `Profit: ${wallet.profitPercentage.toFixed(2)}%\n\n` +
              `❌ CANNOT SELL - No liquidity on Jupiter!\n` +
              `🔧 Action required: Manual intervention needed\n` +
              `⚠️ Token may be a scam or delisted`
            );
          } catch (telegramError) {
            console.log('Could not send Telegram alert:', telegramError.message);
          }
        }
        
        return {
          success: false,
          error: 'Token has no liquidity - cannot be sold on Jupiter',
          critical: true,
          actionRequired: 'Manual intervention needed - token may be a scam or delisted'
        };
      }

    } catch (error) {
      console.error(`❌ Error executing wallet sell:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current status and statistics
   */
  getStatus() {
    const topWallets = this.getTopProfitableWallets();
    const totalProfitableWallets = Array.from(this.walletProfits.values())
      .filter(profit => profit && profit.profitPercentage >= this.config.minProfitThreshold).length;

    return {
      isInitialized: this.wallets && this.wallets.length > 0,
      totalWallets: this.wallets ? this.wallets.length : 0,
      totalProfitableWallets,
      topWalletsCount: topWallets.length,
      lastUpdateTime: this.lastUpdateTime,
      topWallets: topWallets.map(w => ({
        walletAddress: w.walletAddress,
        profitPercentage: w.profitPercentage,
        profitAmount: w.profitAmount,
        sellAmount: w.sellAmount
      }))
    };
  }

  /**
   * Stop the auto-sell system
   */
  stop() {
    if (this.profitUpdateInterval) {
      clearInterval(this.profitUpdateInterval);
      this.profitUpdateInterval = null;
    }
    console.log('🛑 Instant auto-sell system stopped');
  }
}

module.exports = InstantAutoSell;
