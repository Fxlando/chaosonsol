/**
 * Main Application Class
 * Unified entry point that initializes and manages all components
 */

import { SolanaCore } from './core/SolanaCore.js';
import { WalletManager } from './wallet/WalletManager.js';
import { TradingEngine } from './trading/TradingEngine.js';
import { SmartSell } from './trading/SmartSell.js';
import { VolumeBot } from './trading/VolumeBot.js';
import { Security } from './wallet/Security.js';
import { loggerManager } from './utils/logger.js';

const logger = loggerManager.getLogger('App');
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const PLATFORM_MINT_PREFERENCES = {
  gmgn: [
    { mint: 'F7pB3ZdfBnyFw2LRHydWEn9BmhEa5XihXLjhySFRpump', symbol: 'GMGN', source: 'gmgn' }
  ],
  axiom: [
    { mint: 'DfWGKkDHaDoWJJYVVXkhXYYUXDyKT2qW1BZwxdogpump', symbol: 'AXIOM', source: 'axiom' }
  ],
  photon: [
    { mint: 'GBjyFeDB47mo2zGGPpduGZuqckpjLKMb3ybiWHZtyTMF', symbol: 'PHOTON', source: 'photon' }
  ]
};

/**
 * Main Application Class
 */
export class App {
  constructor(config = {}) {
    this.config = {
      ...config,
      network: config.network || 'mainnet-beta',
      rpc: { ...(config.rpc || {}) },
      solanaCore: { ...(config.solanaCore || {}) },
      trading: { ...(config.trading || {}) },
      smartSell: { ...(config.smartSell || {}) },
      volumeBot: { ...(config.volumeBot || {}) },
      walletManager: { ...(config.walletManager || {}) }
    };
    this.config.metadataFallback = config.metadataFallback || null;
    this.config.pumpPortal = config.pumpPortal || {};

    // Core components
    this.solanaCore = null;
    this.walletManager = null;
    this.tradingEngine = null;
    this.smartSell = null;
    this.volumeBot = null;
    this.security = null;

    this.isInitialized = false;
  }

  /**
   * Initialize application
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('App already initialized');
      return;
    }

    logger.info('🚀 Initializing Chaos Bot Application...');

    try {
      // Initialize Security first
      this.security = new Security();
      await this.security.initialize();

      // Initialize Solana Core
      this.solanaCore = new SolanaCore(this.config.network, {
        rpc: this.config.rpc,
        ...this.config.solanaCore
      });
      await this.solanaCore.initialize();

      // Initialize Wallet Manager
      const walletStorage = this.config.walletManager?.storage || null;
      this.walletManager = new WalletManager(this.solanaCore, walletStorage);
      await this.walletManager.initialize();

      // Initialize Trading Engine
      this.tradingEngine = new TradingEngine(this.solanaCore, this.walletManager, {
        ...this.config.trading,
        metadataFallback: this.config.metadataFallback,
        pumpPortal: this.config.pumpPortal
      });
      await this.tradingEngine.initialize();

      // Initialize Smart Sell
      this.smartSell = new SmartSell(this.tradingEngine, this.walletManager, {
        ...this.config.smartSell
      });
      await this.smartSell.initialize();

      // Initialize Volume Bot
      this.volumeBot = new VolumeBot(this.tradingEngine, this.walletManager, {
        ...this.config.volumeBot
      });
      await this.volumeBot.initialize();

      this.isInitialized = true;
      logger.info('✅ Chaos Bot Application initialized successfully');
      
      return { success: true };
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  /**
   * Get application status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      network: this.config.network,
      components: {
        solanaCore: !!this.solanaCore,
        walletManager: !!this.walletManager,
        tradingEngine: !!this.tradingEngine,
        smartSell: !!this.smartSell,
        volumeBot: !!this.volumeBot,
        security: !!this.security
      },
      stats: {
        wallets: this.walletManager?.wallets.size || 0,
        monitoringPositions: this.smartSell?.monitoring.size || 0,
        activeSessions: this.volumeBot?.getActiveSessions().length || 0
      }
    };
  }

  /**
   * Get RPC statistics
   */
  getRPCStats() {
    if (!this.solanaCore) {
      return null;
    }
    return this.solanaCore.getRPCStats();
  }

  /**
   * Quick buy token (convenience method)
   */
  async buyToken(walletId, tokenMint, solAmount, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.buyToken(walletId, tokenMint, solAmount, options);
  }

  /**
   * Quick sell token (convenience method)
   */
  async sellToken(walletId, tokenMint, tokenAmount, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.sellToken(walletId, tokenMint, tokenAmount, options);
  }

  /**
   * Quick create wallet (convenience method)
   */
  createWallet(name, tags = []) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return this.walletManager.createWallet(name, tags);
  }

  /**
   * Quick import wallet (convenience method)
   */
  importWallet(privateKey, name, tags = []) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return this.walletManager.importWallet(privateKey, name, tags);
  }

  /**
   * Get all wallets with balances
   */
  async getAllWalletsWithBalances() {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.walletManager.getAllWalletsWithBalances();
  }

  /**
   * Execute tagging workflow for multiple wallets
   * Performs a quick buy (tag) and sell, then persists tag metadata on the wallet
   */
  async tagWallets(options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    const {
      walletIds = [],
      tags = [],
      minAmount = 0.1,
      maxAmount = 0.2,
      executor = 'jito',
      slippage = 3.0,
      mintCandidates = [],
      method = 'uniform',
      sellDelaySeconds = 6
    } = options;

    if (!Array.isArray(walletIds) || walletIds.length === 0) {
      return {
        success: false,
        error: 'No wallet IDs provided for tagging',
        results: []
      };
    }

    if (!Array.isArray(mintCandidates) || mintCandidates.length === 0) {
      return {
        success: false,
        error: 'No mint candidates supplied for tagging',
        results: []
      };
    }

    const sanitizedTags = Array.from(
      new Set(
        (tags || [])
          .map(tag => (typeof tag === 'string' ? tag.trim() : ''))
          .filter(Boolean)
      )
    );

    if (sanitizedTags.length === 0) {
      return {
        success: false,
        error: 'At least one platform tag must be selected',
        results: []
      };
    }

    const candidateMap = new Map();
    let candidatePool = mintCandidates.map((mint) => {
      if (mint && typeof mint === 'object') {
        const entry = {
          mint: mint.mint || mint.address || '',
          symbol: mint.symbol || null,
          decimals: mint.decimals,
          source: mint.source || null
        };
        if (entry.mint) {
          candidateMap.set(entry.mint, entry);
        }
        return entry;
      }
      const entry = {
        mint: String(mint || '').trim(),
        symbol: null,
        decimals: undefined,
        source: null
      };
      if (entry.mint) {
        candidateMap.set(entry.mint, entry);
      }
      return entry;
    }).filter(entry => entry.mint);

    const preferredMintSet = new Set();

    sanitizedTags.forEach(tag => {
      const preferredList = PLATFORM_MINT_PREFERENCES[tag];
      if (!preferredList) return;

      preferredList.forEach(preferred => {
        const mint = preferred?.mint ? String(preferred.mint).trim() : '';
        if (!mint) return;

        preferredMintSet.add(mint);

        if (!candidateMap.has(mint)) {
          candidateMap.set(mint, {
            mint,
            symbol: preferred.symbol || null,
            decimals: preferred.decimals,
            source: preferred.source || tag
          });
        } else {
          const existing = candidateMap.get(mint);
          if (!existing.source) {
            existing.source = preferred.source || tag;
          }
          if (!existing.symbol && preferred.symbol) {
            existing.symbol = preferred.symbol;
          }
        }
      });
    });

    candidatePool = Array.from(candidateMap.values());

    if (candidatePool.length === 0) {
      return {
        success: false,
        error: 'Mint candidate list is empty after sanitization',
        results: []
      };
    }

    const results = [];

    const shuffleArray = (array) => {
      const arr = array.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const shuffleCandidates = (candidates) => {
      if (!preferredMintSet.size) {
        return shuffleArray(candidates);
      }

      const preferred = [];
      const others = [];

      candidates.forEach(candidate => {
        if (preferredMintSet.has(candidate.mint)) {
          preferred.push(candidate);
        } else {
          others.push(candidate);
        }
      });

      return shuffleArray(preferred).concat(shuffleArray(others));
    };

    for (const walletId of walletIds) {
      const wallet = this.walletManager.getWallet(walletId);
      if (!wallet) {
        results.push({
          walletId,
          success: false,
          error: 'Wallet not found'
        });
        continue;
      }

      const amountRange = Math.max(0, maxAmount - minAmount);
      const solAmount = Number(
        (minAmount + (amountRange > 0 ? Math.random() * amountRange : 0))
          .toFixed(4)
      );

      const attemptedCandidates = [];
      let selectedCandidate = null;
      let buyResult = null;

      for (const candidate of shuffleCandidates(candidatePool)) {
        const { mint } = candidate;
        if (!mint) {
          attemptedCandidates.push({
            mint: '(invalid)',
            error: 'Mint candidate missing address'
          });
          continue;
        }

        logger.info(`Tagging wallet ${walletId} attempting mint ${mint} with ${solAmount} SOL`);
        attemptedCandidates.push({ mint });

        try {
          const attemptResult = await this.tradingEngine.buyToken(
            walletId,
            mint,
            solAmount,
            {
              slippage,
              executor,
              source: 'tagging',
              tags: sanitizedTags,
              method
            }
          );

          if (attemptResult?.success) {
            selectedCandidate = candidate;
            buyResult = attemptResult;
            logger.info(`✅ Buy successful for wallet ${walletId} via mint ${mint}`);
            break;
          }

          attemptedCandidates[attemptedCandidates.length - 1].error =
            attemptResult?.error || 'Buy transaction failed';
        } catch (attemptError) {
          attemptedCandidates[attemptedCandidates.length - 1].error =
            attemptError?.message || 'Buy attempt threw an exception';
          logger.warn(`Buy attempt failed for mint ${mint}: ${attemptError?.message || attemptError}`);
        }
      }

      if (!selectedCandidate || !buyResult?.success) {
        const failedMints = new Set(attemptedCandidates.map(item => item.mint).filter(Boolean));
        candidatePool = candidatePool.filter(candidate => !failedMints.has(candidate.mint));

        results.push({
          walletId,
          success: false,
          error: 'Unable to execute buy on available mint candidates',
          stage: 'buy',
          details: attemptedCandidates
        });
        continue;
      }

      const { mint, symbol, decimals, source } = selectedCandidate;
      logger.info(`Tagging wallet ${walletId} using mint ${mint} (${symbol || 'unknown'}) with amount ${solAmount} SOL`);

      try {
        if (!buyResult?.success) {
          results.push({
            walletId,
            mint,
            solAmount,
            success: false,
            stage: 'buy',
            error: buyResult?.error || 'Buy transaction failed'
          });
          continue;
        }

        let tokenAmount = null;

        if (buyResult.tokenAmount) {
          tokenAmount = typeof buyResult.tokenAmount === 'string'
            ? parseInt(buyResult.tokenAmount, 10)
            : Math.floor(buyResult.tokenAmount);
        } else if (buyResult.outputAmount) {
          tokenAmount = typeof buyResult.outputAmount === 'string'
            ? parseInt(buyResult.outputAmount, 10)
            : Math.floor(buyResult.outputAmount);
        }

        if (!tokenAmount || Number.isNaN(tokenAmount) || tokenAmount <= 0) {
          // Fallback: fetch balance in UI units and convert using decimals if provided
          const uiBalance = await this.solanaCore.getTokenBalance(wallet.publicKey, mint);
          if (uiBalance && decimals !== undefined) {
            tokenAmount = Math.floor(Number(uiBalance) * Math.pow(10, decimals));
          } else if (uiBalance) {
            tokenAmount = Math.floor(Number(uiBalance));
          }
        }

        if (!tokenAmount || Number.isNaN(tokenAmount) || tokenAmount <= 0) {
          results.push({
            walletId,
            mint,
            solAmount,
            success: false,
            stage: 'prepare-sell',
            error: 'Unable to determine token amount for sell'
          });
          continue;
        }

        // Optional wait to mimic natural tagging behaviour
        const delayMs = Math.max(0, sellDelaySeconds) * 1000;
        if (delayMs > 0) {
          await sleep(delayMs);
        }

        const sellAmount = Math.max(1, Math.floor(tokenAmount * 0.995));

        const sellResult = await this.tradingEngine.sellToken(
          walletId,
          mint,
          sellAmount,
          {
            slippage,
            executor,
            source: 'tagging',
            tags: sanitizedTags,
            method
          }
        );

        if (!sellResult?.success) {
          results.push({
            walletId,
            mint,
            solAmount,
            tokenAmount,
            tokenAmountSold: sellAmount,
            success: false,
            stage: 'sell',
            buy: buyResult,
            error: sellResult?.error || 'Sell transaction failed'
          });
          continue;
        }

        const existingTags = Array.isArray(wallet.tags) ? wallet.tags : [];
        const mergedTags = Array.from(new Set([...existingTags, ...sanitizedTags]));
        this.walletManager.updateWalletTags(walletId, mergedTags);

        results.push({
          walletId,
          mint,
          symbol,
          source,
          solAmount,
          tokenAmount,
          tokenAmountSold: sellAmount,
          success: true,
          buy: buyResult,
          sell: sellResult,
          tags: mergedTags
        });
      } catch (error) {
        logger.error(`Tagging workflow failed for wallet ${walletId}:`, error);
        results.push({
          walletId,
          mint,
          solAmount,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(result => result.success).length;
    const failureCount = results.length - successCount;

    return {
      success: failureCount === 0,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Assign wallets to a named group
   */
  async groupWallets(options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    const {
      walletIds = [],
      groupName = null,
      keepExisting = false
    } = options;

    const result = this.walletManager.updateWalletGroups(walletIds, groupName, {
      keepExisting
    });

    if (!result.success) {
      return result;
    }

    return {
      ...result,
      groups: this.getWalletGroups()
    };
  }

  /**
   * Return summary of wallet groups
   */
  getWalletGroups() {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    const wallets = this.walletManager.getAllWallets();
    const groups = new Map();

    wallets.forEach((wallet) => {
      const groupKey = typeof wallet.group === 'string' && wallet.group.trim().length > 0
        ? wallet.group.trim()
        : null;
      if (!groupKey) {
        return;
      }
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(wallet.id || wallet.publicKey);
    });

    return Array.from(groups.entries()).map(([name, walletIds]) => ({
      id: name,
      name,
      walletIds,
      walletCount: walletIds.length
    }));
  }

  /**
   * Warm wallets by executing randomized buy/sell swaps with delays
   */
  async warmWallets(options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    const {
      walletIds = [],
      minSwaps = 1,
      maxSwaps = 3,
      minAmount = 0.001,
      maxAmount = 0.002,
      minDelay = 10,
      maxDelay = 20,
      mintCandidates = [],
      executor = 'rpc',
      slippage = 2.5,
      priorityFee = 7500,
      mintMode = 'auto'
    } = options;

    if (!Array.isArray(walletIds) || walletIds.length === 0) {
      return {
        success: false,
        error: 'No wallet IDs provided for warming',
        results: []
      };
    }

    if (!Number.isFinite(minSwaps) || !Number.isFinite(maxSwaps) || minSwaps <= 0 || maxSwaps <= 0) {
      return {
        success: false,
        error: 'Swap counts must be greater than zero',
        results: []
      };
    }

    if (maxSwaps < minSwaps) {
      return {
        success: false,
        error: 'Max swaps must be greater than or equal to min swaps',
        results: []
      };
    }

    if (!Number.isFinite(minAmount) || !Number.isFinite(maxAmount) || minAmount <= 0 || maxAmount <= 0) {
      return {
        success: false,
        error: 'Swap amounts must be greater than zero',
        results: []
      };
    }

    if (maxAmount < minAmount) {
      return {
        success: false,
        error: 'Max amount must be greater than or equal to min amount',
        results: []
      };
    }

    if (!Number.isFinite(minDelay) || !Number.isFinite(maxDelay) || minDelay < 0 || maxDelay < 0) {
      return {
        success: false,
        error: 'Delays must be zero or greater',
        results: []
      };
    }

    if (maxDelay < minDelay) {
      return {
        success: false,
        error: 'Max delay must be greater than or equal to min delay',
        results: []
      };
    }

    const candidatePool = (mintCandidates || [])
      .map((candidate) => {
        if (candidate && typeof candidate === 'object') {
          return {
            mint: candidate.mint || candidate.address || '',
            symbol: candidate.symbol || null,
            decimals: candidate.decimals,
            source: candidate.source || null
          };
        }
        return {
          mint: String(candidate || '').trim(),
          symbol: null,
          decimals: undefined,
          source: null
        };
      })
      .filter((entry) => entry.mint);

    if (candidatePool.length === 0) {
      return {
        success: false,
        error: 'Mint candidate list is empty after sanitization',
        results: []
      };
    }

    const randomIntInclusive = (min, max) => {
      const floorMin = Math.floor(min);
      const floorMax = Math.floor(max);
      if (floorMax <= floorMin) {
        return floorMin;
      }
      return Math.floor(Math.random() * (floorMax - floorMin + 1)) + floorMin;
    };

    const randomAmount = () => {
      if (maxAmount <= minAmount) {
        return Number(minAmount.toFixed(6));
      }
      const amount = minAmount + Math.random() * (maxAmount - minAmount);
      return Number(amount.toFixed(6));
    };

    const resolveDelaySeconds = () => {
      if (maxDelay <= minDelay) {
        return Math.max(0, Math.floor(minDelay));
      }
      return randomIntInclusive(Math.max(0, Math.floor(minDelay)), Math.max(0, Math.floor(maxDelay)));
    };

    const priorityFeeLamports = Number.isFinite(priorityFee) && priorityFee > 0
      ? Math.floor(priorityFee)
      : 7500;

    const results = [];

    for (const walletId of walletIds) {
      const wallet = this.walletManager.getWallet(walletId);
      if (!wallet) {
        results.push({
          walletId,
          success: false,
          error: 'Wallet not found'
        });
        continue;
      }

      const plannedSwaps = randomIntInclusive(minSwaps, maxSwaps);
      logger.info(`Warming wallet ${walletId} with ${plannedSwaps} swap(s) (mode: ${mintMode})`);

      for (let swapIndex = 0; swapIndex < plannedSwaps; swapIndex++) {
        const solAmount = randomAmount();
        const candidateIndex = Math.floor(Math.random() * candidatePool.length);
        const { mint, symbol, decimals, source } = candidatePool[candidateIndex];

        if (!mint) {
          results.push({
            walletId,
            swapIndex,
            success: false,
            error: 'Invalid mint candidate'
          });
          break;
        }

        logger.info(
          `Warm swap #${swapIndex + 1}/${plannedSwaps} for wallet ${walletId}: ${solAmount} SOL on mint ${mint} (${symbol || 'unknown'})`
        );

        try {
          const sharedOptions = {
            slippage,
            executor,
            source: 'warm',
            priorityFee: priorityFeeLamports,
            prioritizationFeeLamports: priorityFeeLamports,
            computeUnitPriceMicroLamports: priorityFeeLamports * 1000,
            mintMode
          };

          const buyResult = await this.tradingEngine.buyToken(
            walletId,
            mint,
            solAmount,
            sharedOptions
          );

          if (!buyResult?.success) {
            results.push({
              walletId,
              swapIndex,
              mint,
              solAmount,
              success: false,
              stage: 'buy',
              error: buyResult?.error || 'Buy transaction failed'
            });
            logger.warn(`Warm buy failed for wallet ${walletId}: ${buyResult?.error || 'unknown error'}`);
            break;
          }

          let tokenAmount = null;

          if (buyResult.tokenAmount) {
            tokenAmount = typeof buyResult.tokenAmount === 'string'
              ? parseInt(buyResult.tokenAmount, 10)
              : Math.floor(buyResult.tokenAmount);
          } else if (buyResult.outputAmount) {
            tokenAmount = typeof buyResult.outputAmount === 'string'
              ? parseInt(buyResult.outputAmount, 10)
              : Math.floor(buyResult.outputAmount);
          }

          if (!tokenAmount || Number.isNaN(tokenAmount) || tokenAmount <= 0) {
            const uiBalance = await this.solanaCore.getTokenBalance(wallet.publicKey, mint);
            if (uiBalance && decimals !== undefined) {
              tokenAmount = Math.floor(Number(uiBalance) * Math.pow(10, decimals));
            } else if (uiBalance) {
              tokenAmount = Math.floor(Number(uiBalance));
            }
          }

          if (!tokenAmount || Number.isNaN(tokenAmount) || tokenAmount <= 0) {
            results.push({
              walletId,
              swapIndex,
              mint,
              solAmount,
              success: false,
              stage: 'prepare-sell',
              error: 'Unable to determine token amount for sell'
            });
            logger.warn(`Unable to determine token amount for warm sell on wallet ${walletId}`);
            break;
          }

          const delayBeforeSell = resolveDelaySeconds();
          if (delayBeforeSell > 0) {
            logger.info(`Waiting ${delayBeforeSell}s before selling for wallet ${walletId}`);
            await sleep(delayBeforeSell * 1000);
          }

          const sellResult = await this.tradingEngine.sellToken(
            walletId,
            mint,
            tokenAmount,
            sharedOptions
          );

          if (!sellResult?.success) {
            results.push({
              walletId,
              swapIndex,
              mint,
              solAmount,
              tokenAmount,
              success: false,
              stage: 'sell',
              buy: buyResult,
              error: sellResult?.error || 'Sell transaction failed'
            });
            logger.warn(`Warm sell failed for wallet ${walletId}: ${sellResult?.error || 'unknown error'}`);
            break;
          }

          results.push({
            walletId,
            swapIndex,
            mint,
            symbol,
            source,
            solAmount,
            tokenAmount,
            delayBeforeSell,
            success: true,
            buy: buyResult,
            sell: sellResult
          });

          if (swapIndex < plannedSwaps - 1) {
            const interSwapDelay = resolveDelaySeconds();
            if (interSwapDelay > 0) {
              logger.info(`Waiting ${interSwapDelay}s before next warm swap for wallet ${walletId}`);
              await sleep(interSwapDelay * 1000);
            }
          }
        } catch (error) {
          logger.error(`Warm workflow failed for wallet ${walletId}:`, error);
          results.push({
            walletId,
            swapIndex,
            mint,
            solAmount,
            success: false,
            error: error.message
          });
          break;
        }
      }
    }

    const successCount = results.filter((result) => result.success).length;
    const failureCount = results.length - successCount;

    return {
      success: failureCount === 0,
      successCount,
      failureCount,
      totalWallets: walletIds.length,
      results
    };
  }

  /**
   * Add position to Smart Sell monitoring
   */
  async addSmartSellPosition(walletId, tokenMint, entryPrice, amount, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.smartSell.addPosition(walletId, tokenMint, entryPrice, amount, options);
  }

  /**
   * Start volume trading session
   */
  async startVolumeSession(walletIds, tokenMint, config = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.volumeBot.startSession(walletIds, tokenMint, config);
  }

  /**
   * Get token price
   */
  async getTokenPrice(tokenMint) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.getTokenPrice(tokenMint);
  }

  /**
   * Create token on PumpFun
   */
  async createToken(walletId, metadata, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.createToken(walletId, metadata, options);
  }

  /**
   * Launch token with initial buy
   */
  async launchToken(walletId, metadata, initialBuyAmount = 0, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    const platform = options.platform || 'pumpfun';

    if (platform !== 'pumpfun') {
      return {
        success: false,
        error: `Unsupported launch platform: ${platform}`
      };
    }

    const launchResult = await this.tradingEngine.launchToken(
      walletId,
      metadata,
      initialBuyAmount,
      options
    );

    if (!launchResult.success) {
      return launchResult;
    }

    const automationResults = {};
    const automations = options.automations || {};
    const tokenMint = launchResult.tokenMint;

    // Smart Sell automation
    if (automations.smartSell?.enabled) {
      try {
        const smartConfig = { ...automations.smartSell };
        const wallet = this.walletManager.getWallet(walletId);

        if (!wallet) {
          throw new Error('Creator wallet not found for Smart Sell automation');
        }

        let entryPrice = smartConfig.entryPrice;
        if (!entryPrice || entryPrice <= 0) {
          const priceInfo = await this.getTokenPrice(tokenMint);
          if (priceInfo.success && priceInfo.price > 0) {
            entryPrice = priceInfo.price;
          }
        }

        let amount = smartConfig.amount;
        if (!amount || amount <= 0) {
          const balanceInfo = await this.solanaCore.getTokenBalance(
            wallet.publicKey,
            tokenMint
          );

          if (balanceInfo && typeof balanceInfo.uiAmount === 'number') {
            amount = balanceInfo.uiAmount;
          }
        }

        if (!entryPrice || entryPrice <= 0) {
          throw new Error('Unable to determine entry price for Smart Sell automation');
        }

        if (!amount || amount <= 0) {
          throw new Error('No token balance available for Smart Sell automation');
        }

        const smartOptions = {
          profitTarget: smartConfig.profitTarget,
          stopLoss: smartConfig.stopLoss,
          trailingStop: smartConfig.trailingStop,
          emergencyLoss:
            smartConfig.emergencyLoss !== undefined
              ? smartConfig.emergencyLoss
              : smartConfig.emergencyStop,
          partialSells: smartConfig.partialSells,
          sellPercentages: smartConfig.sellPercentages
        };

        const smartResult = await this.addSmartSellPosition(
          walletId,
          tokenMint,
          entryPrice,
          amount,
          smartOptions
        );

        automationResults.smartSell = {
          ...smartResult,
          config: smartOptions,
          walletId
        };
      } catch (error) {
        logger.error('Smart Sell automation setup failed:', error);
        automationResults.smartSell = {
          success: false,
          error: error.message
        };
      }
    }

    // Volume Bot automation
    if (automations.volumeBot?.enabled) {
      try {
        const volumeConfig = { ...automations.volumeBot };
        const walletIds =
          Array.isArray(volumeConfig.walletIds) && volumeConfig.walletIds.length > 0
            ? volumeConfig.walletIds
            : [walletId];

        // Ensure configuration fields align with VolumeBot expectations
        if (
          volumeConfig.buyAmount &&
          volumeConfig.minAmount === undefined &&
          volumeConfig.maxAmount === undefined
        ) {
          volumeConfig.minAmount = volumeConfig.buyAmount;
          volumeConfig.maxAmount = volumeConfig.buyAmount;
        }

        const sellIntervalSeconds =
          volumeConfig.sellIntervalSeconds ??
          volumeConfig.sellDelay ??
          volumeConfig.delayBetween;

        if (sellIntervalSeconds && !volumeConfig.delayBetween) {
          volumeConfig.delayBetween = sellIntervalSeconds;
        }

        if (!volumeConfig.guardrails) {
          volumeConfig.guardrails = { enabled: false };
        }

        delete volumeConfig.enabled;
        delete volumeConfig.walletIds;

        const volumeResult = await this.startVolumeSession(
          walletIds,
          tokenMint,
          volumeConfig
        );

        automationResults.volumeBot = {
          ...volumeResult,
          walletIds,
          config: volumeConfig
        };
      } catch (error) {
        logger.error('Volume bot automation setup failed:', error);
        automationResults.volumeBot = {
          success: false,
          error: error.message
        };
      }
    }

    return {
      ...launchResult,
      platform,
      automations: automationResults
    };
  }

  /**
   * Copy existing token metadata and launch new token
   */
  async copyToken(walletId, sourceMint, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    if (!walletId) {
      return {
        success: false,
        error: 'walletId is required to copy a token'
      };
    }

    if (!sourceMint) {
      return {
        success: false,
        error: 'sourceMint is required to copy a token'
      };
    }

    const platform = options.platform || 'pumpfun';
    if (platform !== 'pumpfun') {
      return {
        success: false,
        error: `Unsupported launch platform: ${platform}`
      };
    }

    return await this.tradingEngine.copyToken(walletId, sourceMint, {
      ...options,
      platform
    });
  }

  /**
   * Import an existing token from PumpFun
   */
  async importToken(tokenMint, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }

    if (!tokenMint) {
      return {
        success: false,
        error: 'tokenMint is required to import a token'
      };
    }

    const platform = options.platform || 'pumpfun';
    if (platform !== 'pumpfun') {
      return {
        success: false,
        error: `Unsupported token platform: ${platform}`
      };
    }

    return await this.tradingEngine.importToken(tokenMint, {
      ...options,
      platform
    });
  }

  /**
   * Get quote for swap
   */
  async getQuote(inputMint, outputMint, amount, options = {}) {
    if (!this.isInitialized) {
      throw new Error('App not initialized');
    }
    return await this.tradingEngine.getQuote(inputMint, outputMint, amount, options);
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    logger.info('Destroying application...');

    if (this.smartSell) {
      this.smartSell.destroy();
    }

    if (this.volumeBot) {
      this.volumeBot.destroy();
    }

    if (this.solanaCore) {
      this.solanaCore.destroy();
    }

    this.isInitialized = false;
    logger.info('Application destroyed');
  }
}

export default App;

