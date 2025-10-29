/**
 * Group Trading Engine
 * Coordinates trading operations across wallet groups
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { JupiterV6Integration } = require('./jupiter-v6-integration');
const { RaydiumDEXIntegration } = require('./raydium-dex-integration');
const { SmartSellEngine } = require('./smart-sell-engine');
const { WalletGroupManager } = require('./wallet-group-manager');
const RateLimitManager = require('./rate-limit-manager');

class GroupTradingEngine {
  constructor(connection, walletGroupManager, jupiter, smartSell) {
    this.connection = connection;
    this.walletGroupManager = walletGroupManager;
    this.jupiter = jupiter;
    this.raydium = new RaydiumDEXIntegration(connection);
    this.smartSell = smartSell;
    this.rateLimitManager = new RateLimitManager();
    
    this.isActive = false;
    this.activeSessions = new Map();
    this.sessionStats = new Map();
  }

  /**
   * Start volume trading session for a group
   */
  async startVolumeSession(groupId, tokenMint, config = {}) {
    try {
      console.log(`🚀 Starting volume session for group ${groupId}`);
      
      const group = this.walletGroupManager.getGroup(groupId);
      if (!group) {
        throw new Error(`Group ${groupId} not found`);
      }

      const sessionId = `vol_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      
      const sessionConfig = {
        groupId,
        tokenMint,
        cycles: config.cycles || 10,
        buyAmount: config.buyAmount || 0.01,
        sellAmount: config.sellAmount || 0.005,
        delayBetween: config.delayBetween || 3000,
        randomizeAmounts: config.randomizeAmounts || true,
        randomizeDelay: config.randomizeDelay || true,
        continuous: config.continuous || false,
        mode: config.mode || 'standard',
        ...config
      };

      const sessionData = {
        id: sessionId,
        groupId,
        tokenMint,
        config: sessionConfig,
        startTime: Date.now(),
        isActive: true,
        stats: {
          cyclesCompleted: 0,
          totalTrades: 0,
          successfulTrades: 0,
          failedTrades: 0,
          totalVolume: 0
        }
      };

      this.activeSessions.set(sessionId, sessionData);
      this.isActive = true;

      // Start volume trading
      this.executeVolumeSession(sessionId, group.wallets, tokenMint, sessionConfig);

      console.log(`✅ Volume session started: ${sessionId}`);
      return { sessionId, success: true };
    } catch (error) {
      console.error('❌ Error starting volume session:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute volume trading session
   */
  async executeVolumeSession(sessionId, wallets, tokenMint, config) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) return;

    try {
      console.log(`📊 Executing volume session ${sessionId} with ${wallets.length} wallets`);

      let cycle = 0;
      const maxCycles = config.continuous ? Number.MAX_SAFE_INTEGER : config.cycles;

      while (cycle < maxCycles && sessionData.isActive) {
        cycle++;
        console.log(`🔄 Volume Cycle ${cycle}/${config.cycles || '∞'}`);

        // Execute buys across all wallets
        for (let i = 0; i < wallets.length; i++) {
          if (!sessionData.isActive) break;

          try {
            const wallet = wallets[i];
            const buyAmount = this.calculateBuyAmount(config);
            
            // Check wallet balance
            const balance = await this.connection.getBalance(new PublicKey(wallet.publicKey));
            const requiredBalance = (buyAmount * LAMPORTS_PER_SOL) + (0.002 * LAMPORTS_PER_SOL);
            
            if (balance < requiredBalance) {
              console.log(`⚠️ Wallet ${i + 1}: Insufficient balance for ${buyAmount} SOL trade`);
              sessionData.stats.failedTrades++;
              continue;
            }

            console.log(`💳 Wallet ${i + 1}: Buying ${buyAmount} SOL worth of tokens`);
            
            // Execute buy
            const buyResult = await this.executeBuy(wallet, tokenMint, buyAmount, sessionId);
            
            if (buyResult.success) {
              sessionData.stats.successfulTrades++;
              sessionData.stats.totalVolume += buyAmount;
            } else {
              sessionData.stats.failedTrades++;
            }
            
            sessionData.stats.totalTrades++;

            // Wait before next operation
            const delay = this.calculateDelay(config);
            if (delay > 0) {
              await new Promise(resolve => setTimeout(resolve, delay));
            }

            // Immediate sell to create volume
            if (buyResult.success) {
              await this.executeImmediateSell(wallet, tokenMint, sessionId);
            }

          } catch (error) {
            console.error(`❌ Volume trade failed for wallet ${i + 1}:`, error.message);
            sessionData.stats.failedTrades++;
          }
        }

        sessionData.stats.cyclesCompleted = cycle;

        // Wait between cycles
        if (sessionData.isActive && cycle < maxCycles) {
          const cycleDelay = this.calculateDelay(config);
          console.log(`⏰ Waiting ${Math.round(cycleDelay/1000)}s before next cycle...`);
          await new Promise(resolve => setTimeout(resolve, cycleDelay));
        }
      }

      // Session completed
      sessionData.isActive = false;
      sessionData.endTime = Date.now();
      sessionData.duration = sessionData.endTime - sessionData.startTime;

      console.log(`✅ Volume session ${sessionId} completed`);
      console.log(`📊 Final stats: ${sessionData.stats.successfulTrades}/${sessionData.stats.totalTrades} successful trades`);

    } catch (error) {
      console.error(`❌ Volume session ${sessionId} error:`, error.message);
      sessionData.isActive = false;
    }
  }

  /**
   * Execute buy trade
   */
  async executeBuy(wallet, tokenMint, amount, sessionId) {
    try {
      const keypair = this.getWalletKeypair(wallet);
      if (!keypair) {
        throw new Error('Could not get wallet keypair');
      }

      // Try Jupiter first, fallback to Raydium
      let result;
      try {
        result = await this.jupiter.buyToken(keypair, tokenMint, amount, {
          source: 'volume',
          session: sessionId
        });
      } catch (jupiterError) {
        console.log(`⚠️ Jupiter buy failed, trying Raydium: ${jupiterError.message}`);
        result = await this.raydium.buyToken(keypair, tokenMint, amount, {
          source: 'volume',
          session: sessionId
        });
      }

      return result;
    } catch (error) {
      console.error(`❌ Buy failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute immediate sell for volume
   */
  async executeImmediateSell(wallet, tokenMint, sessionId) {
    try {
      const keypair = this.getWalletKeypair(wallet);
      if (!keypair) return { success: false, error: 'No keypair' };

      // Get token balance
      const tokenAccount = await this.connection.getTokenAccountsByOwner(
        keypair.publicKey,
        { mint: new PublicKey(tokenMint) }
      );

      if (tokenAccount.value.length === 0) {
        return { success: false, error: 'No token account' };
      }

      const balance = await this.connection.getTokenAccountBalance(tokenAccount.value[0].pubkey);
      if (!balance.value.uiAmount || balance.value.uiAmount <= 0) {
        return { success: false, error: 'No tokens to sell' };
      }

      // Sell 50-90% of tokens
      const sellPercentage = 0.5 + Math.random() * 0.4;
      const sellAmount = Math.floor(balance.value.amount * sellPercentage);

      console.log(`💳 Selling ${(balance.value.uiAmount * sellPercentage).toFixed(2)} tokens`);

      // Try Jupiter first, fallback to Raydium
      let result;
      try {
        result = await this.jupiter.sellToken(keypair, tokenMint, sellAmount, {
          source: 'volume',
          session: sessionId
        });
      } catch (jupiterError) {
        console.log(`⚠️ Jupiter sell failed, trying Raydium: ${jupiterError.message}`);
        result = await this.raydium.sellToken(keypair, tokenMint, sellAmount, {
          source: 'volume',
          session: sessionId
        });
      }

      return result;
    } catch (error) {
      console.error(`❌ Immediate sell failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate buy amount based on config
   */
  calculateBuyAmount(config) {
    if (config.randomizeAmounts) {
      const min = config.buyAmount * 0.5;
      const max = config.buyAmount * 1.5;
      return min + Math.random() * (max - min);
    }
    return config.buyAmount;
  }

  /**
   * Calculate delay between operations
   */
  calculateDelay(config) {
    if (config.randomizeDelay) {
      const baseDelay = config.delayBetween || 3000;
      return baseDelay + Math.random() * 2000; // Add up to 2 seconds random delay
    }
    return config.delayBetween || 3000;
  }

  /**
   * Get wallet keypair
   */
  getWalletKeypair(wallet) {
    try {
      if (wallet.keypair) {
        return wallet.keypair;
      } else if (wallet.privateKey) {
        const { Keypair } = require('@solana/web3.js');
        return Keypair.fromSecretKey(new Uint8Array(wallet.privateKey));
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting wallet keypair:', error.message);
      return null;
    }
  }

  /**
   * Stop a specific session
   */
  stopSession(sessionId) {
    const sessionData = this.activeSessions.get(sessionId);
    if (sessionData) {
      sessionData.isActive = false;
      console.log(`🛑 Stopped session: ${sessionId}`);
      return { success: true, sessionId };
    }
    return { success: false, error: 'Session not found' };
  }

  /**
   * Stop all sessions
   */
  stopAllSessions() {
    let stoppedCount = 0;
    for (const [sessionId, sessionData] of this.activeSessions) {
      if (sessionData.isActive) {
        sessionData.isActive = false;
        stoppedCount++;
      }
    }
    
    this.isActive = false;
    console.log(`🛑 Stopped ${stoppedCount} active sessions`);
    return { success: true, stoppedCount };
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId) {
    const sessionData = this.activeSessions.get(sessionId);
    if (!sessionData) {
      return null;
    }

    return {
      id: sessionData.id,
      groupId: sessionData.groupId,
      tokenMint: sessionData.tokenMint,
      isActive: sessionData.isActive,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime,
      duration: sessionData.isActive ? Date.now() - sessionData.startTime : sessionData.duration,
      stats: sessionData.stats,
      config: sessionData.config
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    const sessions = [];
    for (const [sessionId, sessionData] of this.activeSessions) {
      sessions.push(this.getSessionStatus(sessionId));
    }
    return sessions.filter(s => s !== null);
  }

  /**
   * Get engine status
   */
  getStatus() {
    const activeSessions = this.getActiveSessions().filter(s => s.isActive);
    
    return {
      isActive: this.isActive,
      totalSessions: this.activeSessions.size,
      activeSessions: activeSessions.length,
      sessions: activeSessions
    };
  }

  /**
   * Start smart sell for a group
   */
  async startSmartSell(groupId, tokenMint, settings = {}) {
    try {
      const group = this.walletGroupManager.getGroup(groupId);
      if (!group) {
        throw new Error(`Group ${groupId} not found`);
      }

      const wallets = group.wallets.map(w => ({
        ...w,
        keypair: this.getWalletKeypair(w)
      }));

      const result = await this.smartSell.enable(tokenMint, wallets, settings);
      
      if (result) {
        console.log(`🧠 Smart Sell enabled for group ${groupId}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error starting smart sell:', error.message);
      return false;
    }
  }

  /**
   * Stop smart sell
   */
  async stopSmartSell() {
    try {
      await this.smartSell.disable();
      console.log('🧠 Smart Sell disabled');
      return true;
    } catch (error) {
      console.error('❌ Error stopping smart sell:', error.message);
      return false;
    }
  }

  /**
   * Get smart sell status
   */
  getSmartSellStatus() {
    return this.smartSell.getStatus();
  }

  /**
   * Execute bulk operation on group
   */
  async executeBulkOperation(groupId, operation, params = {}) {
    try {
      const group = this.walletGroupManager.getGroup(groupId);
      if (!group) {
        throw new Error(`Group ${groupId} not found`);
      }

      const results = [];
      
      for (const wallet of group.wallets) {
        try {
          const keypair = this.getWalletKeypair(wallet);
          if (!keypair) {
            results.push({ wallet: wallet.publicKey, success: false, error: 'No keypair' });
            continue;
          }

          let result;
          switch (operation) {
            case 'buy':
              result = await this.executeBuy(wallet, params.tokenMint, params.amount, 'bulk');
              break;
            case 'sell':
              result = await this.executeSell(wallet, params.tokenMint, params.amount, 'bulk');
              break;
            default:
              result = { success: false, error: 'Unknown operation' };
          }

          results.push({ wallet: wallet.publicKey, ...result });
        } catch (error) {
          results.push({ wallet: wallet.publicKey, success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Error executing bulk operation:', error.message);
      return [];
    }
  }

  /**
   * Execute sell trade
   */
  async executeSell(wallet, tokenMint, amount, sessionId) {
    try {
      const keypair = this.getWalletKeypair(wallet);
      if (!keypair) {
        throw new Error('Could not get wallet keypair');
      }

      // Try Jupiter first, fallback to Raydium
      let result;
      try {
        result = await this.jupiter.sellToken(keypair, tokenMint, amount, {
          source: 'bulk',
          session: sessionId
        });
      } catch (jupiterError) {
        console.log(`⚠️ Jupiter sell failed, trying Raydium: ${jupiterError.message}`);
        result = await this.raydium.sellToken(keypair, tokenMint, amount, {
          source: 'bulk',
          session: sessionId
        });
      }

      return result;
    } catch (error) {
      console.error(`❌ Sell failed:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = { GroupTradingEngine };