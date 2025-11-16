/**
 * Volume Bot
 * Generates organic trading volume across multiple wallets
 */

import { LAMPORTS_PER_SOL } from '@solana/web3.js';
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
    const guardrailDefaults = TRADING_CONFIG.VOLUME_BOT_GUARDRAILS || {};
    const guardrailOverrides = config.guardrails || {};

    const minDelay = this.normalizeDelayValue(
      config.minDelay,
      TRADING_CONFIG.VOLUME_BOT_MIN_DELAY
    );
    const maxDelay = this.normalizeDelayValue(
      config.maxDelay,
      TRADING_CONFIG.VOLUME_BOT_MAX_DELAY
    );
    const defaultDelay = this.normalizeDelayValue(
      config.defaultDelay,
      TRADING_CONFIG.VOLUME_BOT_DEFAULT_DELAY
    );

    this.config = {
      minAmount: this.normalizePositiveNumber(
        config.minAmount,
        TRADING_CONFIG.MIN_TRADE_AMOUNT
      ),
      maxAmount: this.normalizePositiveNumber(
        config.maxAmount,
        Math.max(config.minAmount || TRADING_CONFIG.MIN_TRADE_AMOUNT, 0.1)
      ),
      minDelay,
      maxDelay,
      defaultDelay,
      buyInterval: this.buildIntervalConfig(
        {
          default: config.buyInterval ?? config.delayBetween ?? TRADING_CONFIG.VOLUME_BOT_DEFAULT_BUY_INTERVAL,
          min: config.buyIntervalMin ?? config.minDelay,
          max: config.buyIntervalMax ?? config.maxDelay
        },
        {
          min: minDelay,
          max: maxDelay,
          default: this.normalizeDelayValue(
            config.buyInterval ?? config.delayBetween,
            TRADING_CONFIG.VOLUME_BOT_DEFAULT_BUY_INTERVAL
          )
        }
      ),
      sellInterval: this.buildIntervalConfig(
        {
          default: config.sellInterval ?? config.sellDelay ?? TRADING_CONFIG.VOLUME_BOT_DEFAULT_SELL_INTERVAL,
          min: config.sellIntervalMin ?? config.minDelay,
          max: config.sellIntervalMax ?? config.maxDelay
        },
        {
          min: minDelay,
          max: maxDelay,
          default: this.normalizeDelayValue(
            config.sellInterval ?? config.sellDelay,
            TRADING_CONFIG.VOLUME_BOT_DEFAULT_SELL_INTERVAL
          )
        }
      ),
      sellPercentage: this.buildPercentageRange(
        config.sellPercentageMin,
        config.sellPercentageMax
      ),
      randomizeAmounts: config.randomizeAmounts !== false,
      randomizeDelay: config.randomizeDelay !== false,
      enabled: config.enabled !== false,
      guardrails: this.mergeGuardrails(guardrailDefaults, guardrailOverrides)
    };

    if (this.config.minAmount > this.config.maxAmount) {
      const average = (this.config.minAmount + this.config.maxAmount) / 2;
      this.config.minAmount = Math.min(this.config.minAmount, average);
      this.config.maxAmount = Math.max(this.config.maxAmount, average);
    }

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
      const sessionConfig = this.buildSessionConfig(config);
      
      const session = {
        id: sessionId,
        walletIds: walletIds,
        tokenMint: tokenMint,
        config: sessionConfig,
        stats: {
          cyclesCompleted: 0,
          totalTrades: 0,
          successfulTrades: 0,
          failedTrades: 0,
          totalVolume: 0,
          realizedPnL: 0,
          netTokenPosition: 0,
          guardrailTriggered: false,
          guardrailReason: null
        },
        isActive: true,
      guardrailState: this.createGuardrailState(
        this.usesNetGuardrails(sessionConfig.guardrails)
      ),
        startedAt: new Date().toISOString()
      };

      this.sessions.set(sessionId, session);
      
      // Start session execution with proper error handling
      this.executeSession(session).catch(error => {
        logger.error(`Session ${sessionId} failed:`, error);
        // Mark session as inactive on error
        session.isActive = false;
        session.error = error.message;
        session.completedAt = new Date().toISOString();
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
      const cycles = config.continuous ? Number.MAX_SAFE_INTEGER : Math.max(1, config.cycles || 1);

      if (session.guardrailState.trackNetPosition) {
        await this.refreshGuardrailBalances(session);
      }
      
      for (let cycle = 0; cycle < cycles && session.isActive; cycle++) {
        session.stats.cyclesCompleted = cycle + 1;
        
        logger.info(`Volume session ${session.id}: Cycle ${cycle + 1}/${cycles}`);
        
        // Execute buys across all wallets
        for (const walletId of walletIds) {
          if (!session.isActive) break;
          
          try {
            // Calculate buy amount
            const buyAmount = this.calculateBuyAmount(config);
            const buyDelay = this.resolveIntervalDelay(
              config.buyInterval,
              config.randomizeDelay,
              this.config.defaultDelay
            );
            
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

              const solSpent = this.extractSolAmount(buyResult, 'input', buyAmount);
              this.applyCashFlow(session, -solSpent);
              if (session.guardrailState.trackNetPosition) {
                await this.updateGuardrailTokenHoldings(session, walletId, tokenMint);
              }
              this.updateStatsFromGuardrails(session);

              if (this.evaluateGuardrails(session, 'post-buy')) {
                break;
              }
            } else {
              session.stats.totalTrades++;
              session.stats.failedTrades++;
              logger.warn(`Buy failed: ${buyResult.error}`);
            }
            
            // Wait before next operation
            if (session.isActive && buyDelay > 0) {
              await this.sleep(buyDelay);
            }
            if (!session.isActive) {
              break;
            }
            
            // Try to sell immediately (if we have tokens)
            try {
              const wallet = this.walletManager.getWallet(walletId);
              if (!wallet) {
                logger.warn(`Wallet ${walletId} not found`);
                continue;
              }
              
              // Note: getTokenBalance returns a number (uiAmount), not an object
              const balance = await this.tradingEngine.solanaCore.getTokenBalance(
                wallet.publicKey,
                tokenMint
              );
              
              // Validate balance - it's a number representing uiAmount
              if (Number.isFinite(balance) && balance > 0) {
                const sellPercentage = this.calculateSellPercentage(config);
                
                // Get token decimals to convert UI amount to base units
                let decimals = 9; // Default for SOL
                try {
                  const { PublicKey } = await import('@solana/web3.js');
                  const { getMint } = await import('@solana/spl-token');
                  const mintPublicKey = new PublicKey(tokenMint);
                  const mintInfo = await getMint(this.tradingEngine.solanaCore.getConnection(), mintPublicKey);
                  decimals = mintInfo.decimals || 9;
                } catch (error) {
                  logger.warn(`Could not get mint info for ${tokenMint}, assuming 9 decimals:`, error.message);
                  // Default to 9 decimals if we can't fetch mint info
                }
                
                // Convert UI balance to base units for calculateSellAmount
                // Use Math.round for better precision instead of Math.floor to avoid truncation
                // Validate balance is large enough to avoid precision loss
                if (balance < 1e-9) {
                  logger.warn(`Balance too small for conversion: ${balance}, skipping sell`);
                  continue;
                }
                const balanceInBaseUnits = Math.round(balance * Math.pow(10, decimals));
                if (balanceInBaseUnits <= 0) {
                  logger.warn(`Converted balance is zero or negative: ${balanceInBaseUnits}, skipping sell`);
                  continue;
                }
                const balanceObj = {
                  uiAmount: balance,
                  amount: balanceInBaseUnits // Base units (integer)
                };
                const sellAmount = this.calculateSellAmount(balanceObj, sellPercentage);
                
                logger.info(`Volume bot: Wallet ${walletId} selling ${sellPercentage.toFixed(1)}% of tokens (${(balance * sellPercentage / 100).toFixed(6)} UI units, ${sellAmount} base units)`);
                
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
                  const solReceived = this.extractSolAmount(sellResult, 'output', 0);
                  session.stats.totalVolume += Math.max(solReceived, 0);
                  logger.info(`✅ Sell successful: ${sellResult.signature}`);

                  this.applyCashFlow(session, solReceived);
                  if (session.guardrailState.trackNetPosition) {
                    await this.updateGuardrailTokenHoldings(session, walletId, tokenMint);
                  }
                  this.updateStatsFromGuardrails(session);

                  if (this.evaluateGuardrails(session, 'post-sell')) {
                    break;
                  }
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
            if (!session.isActive) {
              break;
            }

            const sellDelay = this.resolveIntervalDelay(
              config.sellInterval,
              config.randomizeDelay,
              this.config.defaultDelay
            );
            if (sellDelay > 0) {
              await this.sleep(sellDelay);
            }
          } catch (error) {
            logger.error(`Volume bot error for wallet ${walletId}:`, error);
            session.stats.failedTrades++;
          }
        }
        
        // Wait between cycles
        if (cycle < cycles - 1 && session.isActive) {
          const cycleDelay = this.resolveIntervalDelay(
            config.cycleInterval || {
              default: (config.sellInterval?.default || this.config.defaultDelay) * 2,
              min: config.sellInterval?.min || this.config.minDelay,
              max: (config.sellInterval?.max || this.config.maxDelay) * 2
            },
            config.randomizeDelay,
            (config.sellInterval?.default || this.config.defaultDelay) * 2
          );

          if (cycleDelay > 0) {
            await this.sleep(cycleDelay);
          }
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

  calculateBuyAmount(sessionConfig = {}) {
    const min = this.normalizePositiveNumber(
      sessionConfig.minAmount,
      this.config.minAmount
    );
    const max = this.normalizePositiveNumber(
      sessionConfig.maxAmount,
      this.config.maxAmount
    );
    const randomize = sessionConfig.randomizeAmounts ?? this.config.randomizeAmounts;
    const fixed = this.normalizePositiveNumber(sessionConfig.buyAmount, null);

    const lower = Math.min(min, max);
    const upper = Math.max(min, max);

    if (!randomize && fixed !== null) {
      return fixed;
    }

    if (!randomize) {
      return (lower + upper) / 2;
    }

    return lower + Math.random() * (upper - lower);
  }

  calculateSellPercentage(sessionConfig = {}) {
    const percentageRange =
      sessionConfig.sellPercentage || this.config.sellPercentage || { min: 50, max: 90 };
    const min = Math.max(0, Math.min(percentageRange.min ?? 0, 100));
    const max = Math.max(min, Math.min(percentageRange.max ?? 100, 100));

    if (min === max) {
      return min;
    }

    return min + Math.random() * (max - min);
  }

  calculateSellAmount(balanceInfo, percentage) {
    if (!balanceInfo) return 0;

    const basisPoints = Math.floor(Math.max(0, Math.min(percentage, 100)) * 100);
    let balanceBigInt = BigInt(0);

    if (typeof balanceInfo.amount === 'string') {
      balanceBigInt = BigInt(balanceInfo.amount);
    } else if (typeof balanceInfo.amount === 'bigint') {
      balanceBigInt = balanceInfo.amount;
    } else if (typeof balanceInfo.amount === 'number') {
      balanceBigInt = BigInt(Math.floor(balanceInfo.amount));
    }

    if (balanceBigInt <= 0n) {
      return 0;
    }

    const sellAmount = (balanceBigInt * BigInt(basisPoints)) / 10000n;
    return Number(sellAmount);
  }

  resolveIntervalDelay(interval = {}, randomize = true, fallback = this.config.defaultDelay) {
    const min = Math.max(0, Math.floor(interval.min ?? fallback ?? this.config.minDelay));
    const maxCandidate = Math.max(min, Math.floor(interval.max ?? fallback ?? this.config.maxDelay));
    const max = Math.max(maxCandidate, min);
    const defaultValue = Math.min(
      Math.max(Math.floor(interval.default ?? fallback ?? this.config.defaultDelay), min),
      max
    );

    if (!randomize) {
      return defaultValue;
    }

    if (max === min) {
      return min;
    }

    return min + Math.floor(Math.random() * (max - min));
  }

  extractSolAmount(result, direction = 'input', fallback = 0) {
    if (!result || typeof result !== 'object') {
      return fallback;
    }

    if (typeof result.solAmount === 'number') {
      return result.solAmount;
    }

    if (typeof result.solAmount === 'string') {
      const parsed = Number(result.solAmount);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    const amountKey = direction === 'output' ? 'outputAmount' : 'inputAmount';
    const raw = result[amountKey] ?? (result.quote && typeof result.quote === 'object' ? result.quote[amountKey] : undefined);

    if (typeof raw === 'number') {
      return raw / LAMPORTS_PER_SOL;
    }

    if (typeof raw === 'string') {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed / LAMPORTS_PER_SOL : fallback;
    }

    if (typeof raw === 'bigint') {
      return Number(raw) / LAMPORTS_PER_SOL;
    }

    return fallback;
  }

  applyCashFlow(session, deltaSol) {
    if (!session || !Number.isFinite(deltaSol) || deltaSol === 0) {
      return;
    }

    session.guardrailState.realizedPnL += deltaSol;
    session.guardrailState.lastCashFlowAt = new Date().toISOString();
    this.updateStatsFromGuardrails(session);
  }

  async updateGuardrailTokenHoldings(session, walletId, tokenMint) {
    if (
      !session ||
      !session.guardrailState?.trackNetPosition ||
      !walletId ||
      !tokenMint
    ) {
      return;
    }

    try {
      const wallet = this.walletManager.getWallet(walletId);
      if (!wallet) {
        return;
      }

      // Note: getTokenBalance returns a number (uiAmount), not an object
      const balance = await this.tradingEngine.solanaCore.getTokenBalance(
        wallet.publicKey,
        tokenMint
      );

      // Handle both number and object return types for safety
      const uiAmount = typeof balance === 'number'
        ? (Number.isFinite(balance) ? balance : 0)
        : (typeof balance === 'object' && balance !== null
          ? (typeof balance.uiAmount === 'number'
            ? (Number.isFinite(balance.uiAmount) ? balance.uiAmount : 0)
            : (balance.uiAmountString
              ? (Number.isFinite(Number(balance.uiAmountString)) ? Number(balance.uiAmountString) : 0)
              : 0))
          : 0);

      session.guardrailState.tokenHoldings.set(walletId, Number.isFinite(uiAmount) ? uiAmount : 0);
      session.guardrailState.tokenHoldingsSnapshot = Object.fromEntries(
        session.guardrailState.tokenHoldings.entries()
      );

      const netPosition = Array.from(session.guardrailState.tokenHoldings.values()).reduce(
        (sum, value) => sum + (Number.isFinite(value) ? value : 0),
        0
      );

      session.guardrailState.netTokenPosition = netPosition;
      this.updateStatsFromGuardrails(session);
    } catch (error) {
      logger.warn(`Guardrail balance update failed for wallet ${walletId}: ${error.message}`);
    }
  }

  updateStatsFromGuardrails(session) {
    if (!session) return;

    const realizedPnL = session.guardrailState.realizedPnL ?? 0;
    const netTokenPosition = session.guardrailState.netTokenPosition ?? 0;

    session.stats.realizedPnL = this.roundToPrecision(realizedPnL);
    session.stats.netTokenPosition = this.roundToPrecision(netTokenPosition);
  }

  evaluateGuardrails(session, phase = 'unknown') {
    const guardrails = session?.config?.guardrails;
    if (!guardrails?.enabled) {
      return false;
    }

    const { realizedPnL, netTokenPosition } = session.guardrailState;
    let triggerReason = null;

    const trackingNet = session.guardrailState.trackNetPosition;

    if (
      trackingNet &&
      guardrails?.maxNetPosition != null &&
      netTokenPosition > guardrails.maxNetPosition
    ) {
      triggerReason = `Net position ${netTokenPosition.toFixed(4)} exceeds maximum ${guardrails.maxNetPosition}`;
    } else if (
      trackingNet &&
      guardrails?.minNetPosition != null &&
      netTokenPosition < guardrails.minNetPosition
    ) {
      triggerReason = `Net position ${netTokenPosition.toFixed(4)} below minimum ${guardrails.minNetPosition}`;
    } else if (
      trackingNet &&
      guardrails?.targetNetPosition != null &&
      netTokenPosition >= guardrails.targetNetPosition
    ) {
      triggerReason = `Target net position ${guardrails.targetNetPosition} reached`;
    } else if (
      guardrails.realizedProfitTarget !== null &&
      realizedPnL >= guardrails.realizedProfitTarget
    ) {
      triggerReason = `Realized PnL ${realizedPnL.toFixed(4)} SOL meets profit target ${guardrails.realizedProfitTarget} SOL`;
    } else if (
      guardrails.realizedLossLimit !== null &&
      realizedPnL <= -Math.abs(guardrails.realizedLossLimit)
    ) {
      triggerReason = `Realized PnL ${realizedPnL.toFixed(4)} SOL breaches loss limit ${guardrails.realizedLossLimit} SOL`;
    }

    if (!triggerReason) {
      return false;
    }

    session.isActive = false;
    session.guardrailState.stopReason = triggerReason;
    session.guardrailState.stopPhase = phase;
    session.guardrailState.triggeredAt = new Date().toISOString();
    session.stats.guardrailTriggered = true;
    session.stats.guardrailReason = triggerReason;

    logger.warn(`Guardrail triggered for session ${session.id}: ${triggerReason}`);
    return true;
  }

  async refreshGuardrailBalances(session) {
    if (!session?.guardrailState?.trackNetPosition) {
      return;
    }
    if (!session?.walletIds || !Array.isArray(session.walletIds)) {
      return;
    }

    for (const walletId of session.walletIds) {
      await this.updateGuardrailTokenHoldings(session, walletId, session.tokenMint);
    }
  }

  buildSessionConfig(overrides = {}) {
    const totalVolume = this.normalizePositiveNumber(overrides.totalVolume, 1.0);
    const cycles = Number.isFinite(overrides.cycles)
      ? Math.max(1, Math.floor(overrides.cycles))
      : 10;

    const randomizeAmounts =
      overrides.randomizeAmounts !== undefined
        ? Boolean(overrides.randomizeAmounts)
        : this.config.randomizeAmounts;

    const randomizeDelay =
      overrides.randomizeDelay !== undefined
        ? Boolean(overrides.randomizeDelay)
        : this.config.randomizeDelay;

    const minAmount = this.normalizePositiveNumber(
      overrides.minAmount ?? overrides.minBuyAmount,
      this.config.minAmount
    );
    const maxAmount = this.normalizePositiveNumber(
      overrides.maxAmount ?? overrides.maxBuyAmount,
      this.config.maxAmount
    );

    const buyInterval = this.buildIntervalConfig(
      {
        default:
          overrides.buyInterval ??
          overrides.buyIntervalSeconds ??
          overrides.delayBetween ??
          overrides.sellDelay ??
          this.config.buyInterval.default,
        min:
          overrides.buyIntervalMin ??
          overrides.buyIntervalMinSeconds ??
          overrides.minDelay ??
          this.config.buyInterval.min,
        max:
          overrides.buyIntervalMax ??
          overrides.buyIntervalMaxSeconds ??
          overrides.maxDelay ??
          this.config.buyInterval.max
      },
      this.config.buyInterval
    );

    const sellInterval = this.buildIntervalConfig(
      {
        default:
          overrides.sellInterval ??
          overrides.sellIntervalSeconds ??
          overrides.sellDelay ??
          this.config.sellInterval.default,
        min:
          overrides.sellIntervalMin ??
          overrides.sellIntervalMinSeconds ??
          overrides.minDelay ??
          this.config.sellInterval.min,
        max:
          overrides.sellIntervalMax ??
          overrides.sellIntervalMaxSeconds ??
          overrides.maxDelay ??
          this.config.sellInterval.max
      },
      this.config.sellInterval
    );

    const cycleInterval = this.buildIntervalConfig(
      {
        default:
          overrides.cycleInterval ??
          overrides.cycleIntervalSeconds ??
          (sellInterval.default || this.config.defaultDelay) * 2,
        min:
          overrides.cycleIntervalMin ??
          overrides.cycleIntervalMinSeconds ??
          sellInterval.min ??
          this.config.minDelay,
        max:
          overrides.cycleIntervalMax ??
          overrides.cycleIntervalMaxSeconds ??
          (sellInterval.max || this.config.maxDelay) * 2
      },
      {
        min: sellInterval.min ?? this.config.minDelay,
        max: (sellInterval.max || this.config.maxDelay) * 2,
        default: (sellInterval.default || this.config.defaultDelay) * 2
      }
    );

    const sellPercentage = this.buildPercentageRange(
      overrides.sellPercentageMin ?? overrides.sellPercentMin,
      overrides.sellPercentageMax ?? overrides.sellPercentMax,
      this.config.sellPercentage.min,
      this.config.sellPercentage.max
    );

    return {
      totalVolume,
      cycles,
      continuous: Boolean(overrides.continuous),
      randomizeAmounts,
      randomizeDelay,
      minAmount,
      maxAmount,
      buyAmount: this.normalizePositiveNumber(overrides.buyAmount, null),
      buyInterval,
      sellInterval,
      cycleInterval,
      sellPercentage,
      guardrails: this.mergeGuardrails(
        this.config.guardrails,
        overrides.guardrails || {}
      ),
      delayBetween: overrides.delayBetween
    };
  }

  createGuardrailState(trackNetPosition = false) {
    return {
      realizedPnL: 0,
      netTokenPosition: 0,
      stopReason: null,
      stopPhase: null,
      triggeredAt: null,
      lastCashFlowAt: null,
      tokenHoldings: new Map(),
      tokenHoldingsSnapshot: {},
      trackNetPosition
    };
  }

  normalizePositiveNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return fallback;
    }

    return numeric;
  }

  normalizeDelayValue(value, fallback) {
    if (value === undefined || value === null || value === '') {
      const fallbackValue = Number(fallback ?? 0);
      return fallbackValue > 0 ? Math.floor(fallbackValue) : 0;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      const fallbackValue = Number(fallback ?? 0);
      return fallbackValue > 0 ? Math.floor(fallbackValue) : 0;
    }

    if (numeric === 0) {
      return 0;
    }

    if (numeric >= 1000) {
      return Math.floor(numeric);
    }

    return Math.floor(numeric * 1000);
  }

  buildIntervalConfig(candidate = {}, fallback = {}) {
    const minFallback = fallback.min ?? this.config?.minDelay ?? TRADING_CONFIG.VOLUME_BOT_MIN_DELAY;
    const maxFallback = fallback.max ?? this.config?.maxDelay ?? TRADING_CONFIG.VOLUME_BOT_MAX_DELAY;
    const defaultFallback =
      fallback.default ??
      this.config?.defaultDelay ??
      TRADING_CONFIG.VOLUME_BOT_DEFAULT_DELAY;

    const min = Math.max(
      0,
      this.normalizeDelayValue(candidate.min, minFallback)
    );
    const max = Math.max(
      min,
      this.normalizeDelayValue(candidate.max, maxFallback)
    );
    const defaultValue = Math.min(
      Math.max(this.normalizeDelayValue(candidate.default, defaultFallback), min),
      max
    );

    return {
      min,
      max,
      default: defaultValue
    };
  }

  buildPercentageRange(minValue, maxValue, fallbackMin, fallbackMax) {
    const defaultMin =
      fallbackMin ?? TRADING_CONFIG.VOLUME_BOT_MIN_SELL_PERCENT ?? 45;
    const defaultMax =
      fallbackMax ?? TRADING_CONFIG.VOLUME_BOT_MAX_SELL_PERCENT ?? 95;

    let min = this.normalizeNullableNumber(minValue, defaultMin);
    let max = this.normalizeNullableNumber(maxValue, defaultMax);

    min = Math.max(0, Math.min(100, min ?? defaultMin));
    max = Math.max(min, Math.min(100, max ?? defaultMax));

    return {
      min,
      max
    };
  }

  mergeGuardrails(defaults = {}, overrides = {}) {
    const defaultEnabled =
      defaults.enabled ??
      defaults.ENABLED ??
      TRADING_CONFIG.VOLUME_BOT_GUARDRAILS?.ENABLED ??
      true;

    const enabled =
      overrides.enabled !== undefined ? Boolean(overrides.enabled) : Boolean(defaultEnabled);

    const realizedProfitTarget = this.normalizeNullableNumber(
      overrides.realizedProfitTarget ?? overrides.profitTarget,
      defaults.realizedProfitTarget ?? TRADING_CONFIG.VOLUME_BOT_GUARDRAILS?.REALIZED_PROFIT_TARGET ?? null
    );

    const rawLossLimit =
      overrides.realizedLossLimit ??
      overrides.lossLimit ??
      overrides.maxRealizedLoss ??
      defaults.realizedLossLimit ??
      TRADING_CONFIG.VOLUME_BOT_GUARDRAILS?.REALIZED_LOSS_LIMIT ??
      null;

    const realizedLossLimit =
      rawLossLimit === null ? null : Math.abs(Number(rawLossLimit));

    return {
      enabled,
      realizedProfitTarget,
      realizedLossLimit
    };
  }

  usesNetGuardrails(guardrails = {}) {
    if (!guardrails) return false;
    return (
      guardrails.minNetPosition != null ||
      guardrails.maxNetPosition != null ||
      guardrails.targetNetPosition != null
    );
  }

  normalizeNullableNumber(value, fallback = null) {
    if (value === undefined || value === null || value === '') {
      return fallback ?? null;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback ?? null;
    }

    return numeric;
  }

  roundToPrecision(value, decimals = 6) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
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

