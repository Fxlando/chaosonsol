/**
 * Volume Bot
 * Generates organic trading volume across multiple wallets
 */

import { loggerManager } from '../utils/logger.js';
import { TRADING_CONFIG } from '../config/constants.js';

const logger = loggerManager.getLogger('VolumeBot');

/**
 * Volume Bot Class
 */
export class VolumeBot {
  constructor(tradingEngine, walletManager, config = {}) {
    this.tradingEngine = tradingEngine;
    this.walletManager = walletManager;
    this.config = {
      minAmount: config.minAmount || TRADING_CONFIG.MIN_TRADE_AMOUNT, // 0.001 SOL
      maxAmount: config.maxAmount || 0.1, // 0.1 SOL
      minDelay: config.minDelay || TRADING_CONFIG.VOLUME_BOT_MIN_DELAY, // 1 second
      maxDelay: config.maxDelay || TRADING_CONFIG.VOLUME_BOT_MAX_DELAY, // 60 seconds
      defaultDelay: config.defaultDelay || TRADING_CONFIG.VOLUME_BOT_DEFAULT_DELAY, // 3 seconds
      randomizeAmounts: config.randomizeAmounts !== false,
      randomizeDelay: config.randomizeDelay !== false,
      enabled: config.enabled !== false,
      ...config
    };

    this.sessions = new Map(); // sessionId -> session config
    this.isInitialized = false;
    
    this.initialize();
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info('Initializing Volume Bot...');
    this.isInitialized = true;
    logger.info('✅ Volume Bot initialized');
  }

  /**
   * Start volume trading session
   */
  async startSession(walletIds, tokenMint, config = {}) {
    try {
      const sessionId = this.generateSessionId();
      
      const session = {
        id: sessionId,
        walletIds: walletIds,
        tokenMint: tokenMint,
        config: {
          totalVolume: config.totalVolume || 1.0, // Total SOL volume
          cycles: config.cycles || 10, // Number of buy/sell cycles
          delayBetween: config.delayBetween || this.config.defaultDelay,
          randomizeAmounts: config.randomizeAmounts !== false ? this.config.randomizeAmounts : config.randomizeAmounts,
          randomizeDelay: config.randomizeDelay !== false ? this.config.randomizeDelay : config.randomizeDelay,
          continuous: config.continuous || false,
          ...config
        },
        stats: {
          cyclesCompleted: 0,
          totalTrades: 0,
          successfulTrades: 0,
          failedTrades: 0,
          totalVolume: 0
        },
        isActive: true,
        startedAt: new Date().toISOString()
      };

      this.sessions.set(sessionId, session);
      
      // Start session execution
      this.executeSession(session).catch(error => {
        logger.error(`Session ${sessionId} failed:`, error);
      });
      
      logger.info(`Started volume session: ${sessionId} (${walletIds.length} wallets, ${tokenMint})`);
      
      return { success: true, sessionId, session };
    } catch (error) {
      logger.error('Failed to start volume session:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute volume trading session
   */
  async executeSession(session) {
    try {
      const { walletIds, tokenMint, config } = session;
      const cycles = config.continuous ? Number.MAX_SAFE_INTEGER : config.cycles;
      
      for (let cycle = 0; cycle < cycles && session.isActive; cycle++) {
        session.stats.cyclesCompleted = cycle + 1;
        
        logger.info(`Volume session ${session.id}: Cycle ${cycle + 1}/${cycles}`);
        
        // Execute buys across all wallets
        for (const walletId of walletIds) {
          if (!session.isActive) break;
          
          try {
            // Calculate buy amount
            const buyAmount = this.calculateAmount(config.randomizeAmounts);
            
            logger.info(`Volume bot: Wallet ${walletId} buying ${buyAmount} SOL worth of ${tokenMint}`);
            
            // Execute buy
            const buyResult = await this.tradingEngine.buyToken(
              walletId,
              tokenMint,
              buyAmount,
              {
                slippage: 5.0, // 5% slippage for volume trading
                source: 'volume-bot',
                session: session.id
              }
            );

            if (buyResult.success) {
              session.stats.totalTrades++;
              session.stats.successfulTrades++;
              session.stats.totalVolume += buyAmount;
              
              logger.info(`✅ Buy successful: ${buyResult.signature}`);
            } else {
              session.stats.totalTrades++;
              session.stats.failedTrades++;
              logger.warn(`Buy failed: ${buyResult.error}`);
            }
            
            // Wait before next operation
            await this.sleep(this.calculateDelay(config.randomizeDelay, config.delayBetween));
            
            // Try to sell immediately (if we have tokens)
            try {
              const wallet = this.walletManager.getWallet(walletId);
              const balance = await this.tradingEngine.solanaCore.getTokenBalance(
                wallet.publicKey,
                tokenMint
              );
              
              if (balance && balance.uiAmount > 0) {
                // Sell random percentage (50-90%)
                const sellPercentage = 50 + Math.random() * 40;
                const sellAmount = Math.floor(balance.amount * (sellPercentage / 100));
                
                logger.info(`Volume bot: Wallet ${walletId} selling ${sellPercentage.toFixed(1)}% of tokens`);
                
                const sellResult = await this.tradingEngine.sellToken(
                  walletId,
                  tokenMint,
                  sellAmount,
                  {
                    slippage: 5.0,
                    source: 'volume-bot',
                    session: session.id
                  }
                );

                if (sellResult.success) {
                  session.stats.totalTrades++;
                  session.stats.successfulTrades++;
                  logger.info(`✅ Sell successful: ${sellResult.signature}`);
                } else {
                  session.stats.totalTrades++;
                  session.stats.failedTrades++;
                  logger.warn(`Sell failed: ${sellResult.error}`);
                }
              }
            } catch (error) {
              logger.warn(`Sell check failed: ${error.message}`);
            }
            
            // Wait before next wallet
            await this.sleep(this.calculateDelay(config.randomizeDelay, config.delayBetween));
          } catch (error) {
            logger.error(`Volume bot error for wallet ${walletId}:`, error);
            session.stats.failedTrades++;
          }
        }
        
        // Wait between cycles
        if (cycle < cycles - 1 && session.isActive) {
          await this.sleep(this.calculateDelay(config.randomizeDelay, config.delayBetween * 2));
        }
      }
      
      session.isActive = false;
      session.completedAt = new Date().toISOString();
      
      logger.info(`Volume session ${session.id} completed: ${session.stats.successfulTrades}/${session.stats.totalTrades} successful`);
      
    } catch (error) {
      session.isActive = false;
      session.error = error.message;
      logger.error(`Session ${session.id} execution failed:`, error);
    }
  }

  /**
   * Calculate random amount
   */
  calculateAmount(randomize) {
    if (randomize) {
      return this.config.minAmount + Math.random() * (this.config.maxAmount - this.config.minAmount);
    }
    return (this.config.minAmount + this.config.maxAmount) / 2;
  }

  /**
   * Calculate random delay
   */
  calculateDelay(randomize, baseDelay) {
    if (randomize) {
      const min = this.config.minDelay;
      const max = this.config.maxDelay;
      return min + Math.random() * (max - min);
    }
    return baseDelay || this.config.defaultDelay;
  }

  /**
   * Stop session
   */
  stopSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    session.isActive = false;
    logger.info(`Stopped volume session: ${sessionId}`);
    
    return { success: true, sessionId };
  }

  /**
   * Get session
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active sessions
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }

  /**
   * Stop all sessions
   */
  stopAllSessions() {
    let stopped = 0;
    for (const [sessionId, session] of this.sessions) {
      if (session.isActive) {
        session.isActive = false;
        stopped++;
      }
    }
    
    logger.info(`Stopped ${stopped} volume sessions`);
    
    return { success: true, stopped };
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return `vol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopAllSessions();
    this.sessions.clear();
    this.isInitialized = false;
    logger.info('Volume Bot destroyed');
  }
}

export default VolumeBot;

