/**
 * Production-Ready Trading Engine
 * Complete integration of PumpFun, Raydium DEX, and wallet management
 */

const { Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
const { ProductionSolanaCore } = require('./production-solana-core');
const { ProductionPumpFunIntegration } = require('./production-pumpfun-integration');
const { ProductionRaydiumIntegration } = require('./production-raydium-integration');
const { ProductionWalletManager } = require('./production-wallet-manager');

class ProductionTradingEngine {
    constructor(config = {}) {
        this.config = {
            autoTrade: config.autoTrade || false,
            maxConcurrentTrades: config.maxConcurrentTrades || 5,
            defaultSlippage: config.defaultSlippage || 1.0,
            priorityFee: config.priorityFee || 1000,
            maxRetries: config.maxRetries || 3,
            autoTradeCheckInterval: config.autoTradeCheckInterval || 15000,
            autoTradeMinBalance: config.autoTradeMinBalance || 0.05,
            autoTradeMinTrade: config.autoTradeMinTrade || 0.02,
            autoTradeAllocation: config.autoTradeAllocation || 0.1,
            autoTradeMaxPerTrade: config.autoTradeMaxPerTrade || 0.5,
            autoTradeProfitTarget: config.autoTradeProfitTarget || 0.25,
            autoTradeStopLoss: config.autoTradeStopLoss || 0.15,
            autoTradeCooldownMs: config.autoTradeCooldownMs || 5 * 60 * 1000,
            ...config
        };
        
        this.solanaCore = null;
        this.pumpFun = null;
        this.raydium = null;
        this.walletManager = null;
        
        this.isInitialized = false;
        this.isTrading = false;
        this.activeTrades = new Map();
        this.tradeHistory = [];
        this.recentOpportunities = new Map();
        this.autoTradeLoop = null;
        this.stats = {
            totalTrades: 0,
            successfulTrades: 0,
            totalVolume: 0,
            totalFees: 0,
            profitLoss: 0,
            startTime: Date.now()
        };
        
        this.initialize();
    }

    async initialize() {
        console.log('🚀 Initializing Production Trading Engine...');
        
        try {
            // Initialize Solana Core
            this.solanaCore = new ProductionSolanaCore(this.config);
            await this.solanaCore.initializeConnections();
            
            // Initialize integrations
            this.pumpFun = new ProductionPumpFunIntegration(this.solanaCore, this.config);
            this.raydium = new ProductionRaydiumIntegration(this.solanaCore, this.config);
            
            // Initialize wallet manager
            this.walletManager = new ProductionWalletManager(this.solanaCore, this.config);
            await this.walletManager.initialize();
            
            this.isInitialized = true;
            console.log('✅ Production Trading Engine Ready');
            
            // Start monitoring if auto-trade is enabled
            if (this.config.autoTrade) {
                this.startAutoTrading();
            }
            
        } catch (error) {
            console.error('Failed to initialize trading engine:', error.message);
            throw error;
        }
    }

    async buyToken(walletAddress, tokenMint, amount, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Trading engine not initialized');
        }
        
        const tradeId = this.generateTradeId();
        const startTime = Date.now();
        
        try {
            // Get wallet
            const wallet = this.walletManager.getWallet(walletAddress);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            // Create keypair from private key
            const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
            
            // Determine if token is on PumpFun or Raydium
            const tokenInfo = await this.pumpFun.getTokenInfo(tokenMint);
            const isPumpFunToken = tokenInfo.success && !tokenInfo.isComplete;
            
            let result;
            
            if (isPumpFunToken) {
                // Trade on PumpFun
                result = await this.pumpFun.buyToken(keypair, tokenMint, amount, options);
            } else {
                // Trade on Raydium DEX
                const solMint = 'So11111111111111111111111111111111111111112';
                result = await this.raydium.swapSOLToToken(keypair, tokenMint, amount, options);
            }
            
            // Update wallet balance
            await this.walletManager.updateWalletBalance(walletAddress);
            
            // Record trade
            const tradeData = {
                id: tradeId,
                type: 'buy',
                walletAddress: walletAddress,
                tokenMint: tokenMint,
                amount: amount,
                result: result,
                platform: isPumpFunToken ? 'pumpfun' : 'raydium',
                timestamp: startTime,
                duration: Date.now() - startTime,
                success: result.success
            };
            
            this.recordTrade(tradeData);
            
            return {
                tradeId: tradeId,
                success: result.success,
                signature: result.signature,
                amount: result.tokenAmount || result.outputAmount,
                platform: isPumpFunToken ? 'pumpfun' : 'raydium',
                error: result.error
            };
            
        } catch (error) {
            const tradeData = {
                id: tradeId,
                type: 'buy',
                walletAddress: walletAddress,
                tokenMint: tokenMint,
                amount: amount,
                result: { success: false, error: error.message },
                platform: 'unknown',
                timestamp: startTime,
                duration: Date.now() - startTime,
                success: false
            };
            
            this.recordTrade(tradeData);
            
            return {
                tradeId: tradeId,
                success: false,
                signature: null,
                amount: 0,
                platform: 'unknown',
                error: error.message
            };
        }
    }

    async sellToken(walletAddress, tokenMint, tokenAmount, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Trading engine not initialized');
        }
        
        const tradeId = this.generateTradeId();
        const startTime = Date.now();
        
        try {
            // Get wallet
            const wallet = this.walletManager.getWallet(walletAddress);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            // Create keypair from private key
            const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
            
            // Determine if token is on PumpFun or Raydium
            const tokenInfo = await this.pumpFun.getTokenInfo(tokenMint);
            const isPumpFunToken = tokenInfo.success && !tokenInfo.isComplete;
            
            let result;
            
            if (isPumpFunToken) {
                // Trade on PumpFun
                result = await this.pumpFun.sellToken(keypair, tokenMint, tokenAmount, options);
            } else {
                // Trade on Raydium DEX
                const solMint = 'So11111111111111111111111111111111111111112';
                result = await this.raydium.swapTokenToSOL(keypair, tokenMint, tokenAmount, options);
            }
            
            // Update wallet balance
            await this.walletManager.updateWalletBalance(walletAddress);
            
            // Record trade
            const tradeData = {
                id: tradeId,
                type: 'sell',
                walletAddress: walletAddress,
                tokenMint: tokenMint,
                amount: tokenAmount,
                result: result,
                platform: isPumpFunToken ? 'pumpfun' : 'raydium',
                timestamp: startTime,
                duration: Date.now() - startTime,
                success: result.success
            };
            
            this.recordTrade(tradeData);
            this.clearActivePosition(walletAddress, tokenMint);
            
            return {
                tradeId: tradeId,
                success: result.success,
                signature: result.signature,
                amount: result.solAmount || result.outputAmount,
                platform: isPumpFunToken ? 'pumpfun' : 'raydium',
                error: result.error
            };
            
        } catch (error) {
            const tradeData = {
                id: tradeId,
                type: 'sell',
                walletAddress: walletAddress,
                tokenMint: tokenMint,
                amount: tokenAmount,
                result: { success: false, error: error.message },
                platform: 'unknown',
                timestamp: startTime,
                duration: Date.now() - startTime,
                success: false
            };
            
            this.recordTrade(tradeData);
            this.clearActivePosition(walletAddress, tokenMint);
            
            return {
                tradeId: tradeId,
                success: false,
                signature: null,
                amount: 0,
                platform: 'unknown',
                error: error.message
            };
        }
    }

    async swapTokens(walletAddress, inputMint, outputMint, inputAmount, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Trading engine not initialized');
        }
        
        const tradeId = this.generateTradeId();
        const startTime = Date.now();
        
        try {
            // Get wallet
            const wallet = this.walletManager.getWallet(walletAddress);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            // Create keypair from private key
            const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
            
            // Use Raydium DEX for token-to-token swaps
            const result = await this.raydium.swapTokenToToken(keypair, inputMint, outputMint, inputAmount, options);
            
            // Update wallet balance
            await this.walletManager.updateWalletBalance(walletAddress);
            
            // Record trade
            const tradeData = {
                id: tradeId,
                type: 'swap',
                walletAddress: walletAddress,
                inputMint: inputMint,
                outputMint: outputMint,
                amount: inputAmount,
                result: result,
                platform: 'raydium',
                timestamp: startTime,
                duration: Date.now() - startTime,
                success: result.success
            };
            
            this.recordTrade(tradeData);
            
            return {
                tradeId: tradeId,
                success: result.success,
                signature: result.signature,
                inputAmount: result.inputAmount,
                outputAmount: result.outputAmount,
                platform: 'raydium',
                error: result.error
            };
            
        } catch (error) {
            const tradeData = {
                id: tradeId,
                type: 'swap',
                walletAddress: walletAddress,
                inputMint: inputMint,
                outputMint: outputMint,
                amount: inputAmount,
                result: { success: false, error: error.message },
                platform: 'raydium',
                timestamp: startTime,
                duration: Date.now() - startTime,
                success: false
            };
            
            this.recordTrade(tradeData);
            
            return {
                tradeId: tradeId,
                success: false,
                signature: null,
                inputAmount: 0,
                outputAmount: 0,
                platform: 'raydium',
                error: error.message
            };
        }
    }

    async getTokenPrice(tokenMint) {
        try {
            // Try PumpFun first
            const pumpFunPrice = await this.pumpFun.getTokenPrice(tokenMint);
            if (pumpFunPrice.success) {
                return pumpFunPrice;
            }
            
            // Fallback to Raydium
            const raydiumPrice = await this.raydium.getTokenPrice(tokenMint);
            if (raydiumPrice.success) {
                return raydiumPrice;
            }
            
            // Fallback to Solana Core
            return await this.solanaCore.getTokenPrice(tokenMint);
            
        } catch (error) {
            return {
                price: 0,
                success: false,
                error: error.message
            };
        }
    }

    async getTokenInfo(tokenMint) {
        try {
            // Try PumpFun first
            const pumpFunInfo = await this.pumpFun.getTokenInfo(tokenMint);
            if (pumpFunInfo.success) {
                return pumpFunInfo;
            }
            
            // Fallback to Raydium
            const raydiumInfo = await this.raydium.searchTokens(tokenMint, 1);
            if (raydiumInfo.success && raydiumInfo.tokens.length > 0) {
                const token = raydiumInfo.tokens[0];
                return {
                    mint: token.address,
                    name: token.name,
                    symbol: token.symbol,
                    decimals: token.decimals,
                    image: token.logoURI,
                    success: true
                };
            }
            
            return {
                mint: tokenMint,
                name: 'Unknown Token',
                symbol: 'UNK',
                decimals: 9,
                image: '',
                success: false,
                error: 'Token not found'
            };
            
        } catch (error) {
            return {
                mint: tokenMint,
                name: 'Unknown Token',
                symbol: 'UNK',
                decimals: 9,
                image: '',
                success: false,
                error: error.message
            };
        }
    }

    async getTrendingTokens(limit = 20) {
        try {
            const pumpFunTrending = await this.pumpFun.getTrendingTokens(limit);
            if (pumpFunTrending.success) {
                return pumpFunTrending;
            }
            
            const raydiumPopular = await this.raydium.getPopularTokens(limit);
            if (raydiumPopular.success) {
                return {
                    tokens: raydiumPopular.tokens.map(token => ({
                        mint: token.address,
                        name: token.name,
                        symbol: token.symbol,
                        price: 0, // Will be fetched separately
                        marketCap: 0,
                        image: token.logoURI,
                        createdTimestamp: 0
                    })),
                    success: true
                };
            }
            
            return {
                tokens: [],
                success: false,
                error: 'Unable to fetch trending tokens'
            };
            
        } catch (error) {
            return {
                tokens: [],
                success: false,
                error: error.message
            };
        }
    }

    async searchTokens(query, limit = 10) {
        try {
            const pumpFunResults = await this.pumpFun.searchTokens(query, limit);
            const raydiumResults = await this.raydium.searchTokens(query, limit);
            
            const allTokens = [
                ...pumpFunResults.tokens,
                ...raydiumResults.tokens
            ];
            
            // Remove duplicates based on mint address
            const uniqueTokens = allTokens.filter((token, index, self) => 
                index === self.findIndex(t => t.mint === token.mint)
            );
            
            return {
                tokens: uniqueTokens.slice(0, limit),
                success: true
            };
            
        } catch (error) {
            return {
                tokens: [],
                success: false,
                error: error.message
            };
        }
    }

    async getWalletInfo(walletAddress) {
        try {
            const wallet = this.walletManager.getWallet(walletAddress);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            const balanceInfo = await this.solanaCore.getWalletInfo(walletAddress);
            const stats = await this.walletManager.getWalletStats(walletAddress);
            
            return {
                wallet: wallet,
                balance: balanceInfo,
                stats: stats,
                success: true
            };
            
        } catch (error) {
            return {
                wallet: null,
                balance: null,
                stats: null,
                success: false,
                error: error.message
            };
        }
    }

    async getGroupInfo(groupId) {
        try {
            const group = this.walletManager.getGroup(groupId);
            if (!group) {
                throw new Error('Group not found');
            }
            
            const stats = await this.walletManager.getGroupStats(groupId);
            const wallets = group.wallets.map(addr => this.walletManager.getWallet(addr)).filter(Boolean);
            
            return {
                group: group,
                stats: stats,
                wallets: wallets,
                success: true
            };
            
        } catch (error) {
            return {
                group: null,
                stats: null,
                wallets: [],
                success: false,
                error: error.message
            };
        }
    }

    async executeGroupTrade(groupId, tokenMint, amount, tradeType = 'buy', options = {}) {
        try {
            const groupInfo = await this.getGroupInfo(groupId);
            if (!groupInfo.success) {
                throw new Error(groupInfo.error);
            }
            
            const results = [];
            const wallets = groupInfo.wallets.filter(w => w.isActive);
            
            for (const wallet of wallets) {
                let result;
                
                if (tradeType === 'buy') {
                    result = await this.buyToken(wallet.address, tokenMint, amount, options);
                } else if (tradeType === 'sell') {
                    result = await this.sellToken(wallet.address, tokenMint, amount, options);
                } else {
                    throw new Error('Invalid trade type');
                }
                
                results.push({
                    walletAddress: wallet.address,
                    result: result
                });
                
                // Add delay between trades to avoid rate limiting
                await this.delay(500);
            }
            
            return {
                groupId: groupId,
                tradeType: tradeType,
                tokenMint: tokenMint,
                amount: amount,
                results: results,
                success: true
            };
            
        } catch (error) {
            return {
                groupId: groupId,
                tradeType: tradeType,
                tokenMint: tokenMint,
                amount: amount,
                results: [],
                success: false,
                error: error.message
            };
        }
    }

    recordTrade(tradeData) {
        this.tradeHistory.push(tradeData);
        
        // Update stats
        this.stats.totalTrades++;
        if (tradeData.success) {
            this.stats.successfulTrades++;
        }
        
        this.stats.totalVolume += tradeData.amount || 0;
        this.stats.totalFees += tradeData.result.fees || 0;
        this.stats.profitLoss += tradeData.result.profitLoss || 0;
        
        // Update wallet stats
        this.walletManager.updateWalletStats(tradeData.walletAddress, {
            volume: tradeData.amount || 0,
            fees: tradeData.result.fees || 0,
            profitLoss: tradeData.result.profitLoss || 0,
            success: tradeData.success
        });
        
        // Keep only last 1000 trades
        if (this.tradeHistory.length > 1000) {
            this.tradeHistory = this.tradeHistory.slice(-1000);
        }
    }

    generateTradeId() {
        return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async startAutoTrading() {
        if (this.isTrading) {
            return;
        }

        if (!this.isInitialized) {
            throw new Error('Trading engine not initialized');
        }

        this.isTrading = true;
        console.log('🤖 Auto-trading started');

        if (!this.autoTradeLoop) {
            this.autoTradeLoop = this.runAutoTradeLoop().catch((error) => {
                console.error('Auto-trading loop terminated unexpectedly:', error);
            });
        }
    }

    async stopAutoTrading() {
        if (!this.isTrading && !this.autoTradeLoop) {
            return;
        }

        this.isTrading = false;
        console.log('🛑 Auto-trading stopping...');

        if (this.autoTradeLoop) {
            try {
                await this.autoTradeLoop;
            } catch (error) {
                console.error('Auto-trading loop exited with error:', error.message);
            } finally {
                this.autoTradeLoop = null;
            }
        }

        console.log('🛑 Auto-trading stopped');
    }

    async runAutoTradeLoop() {
        while (this.isTrading) {
            const iterationStart = Date.now();

            try {
                this.pruneOpportunityCache();

                await this.walletManager.updateAllWalletBalances();
                await this.evaluateOpenPositions();

                if (this.isTrading && this.getOpenTradeCount() < this.config.maxConcurrentTrades) {
                    await this.findAndExecuteNewTrades();
                }
            } catch (error) {
                console.error('Auto-trading loop error:', error.message);
            }

            if (!this.isTrading) {
                break;
            }

            const elapsed = Date.now() - iterationStart;
            const waitTime = Math.max(this.config.autoTradeCheckInterval - elapsed, 1000);
            await this.delay(waitTime);
        }
    }

    pruneOpportunityCache() {
        const cutoff = Date.now() - this.config.autoTradeCooldownMs;
        for (const [mint, timestamp] of this.recentOpportunities.entries()) {
            if (timestamp < cutoff) {
                this.recentOpportunities.delete(mint);
            }
        }
    }

    getOpenTradeCount() {
        let count = 0;
        for (const position of this.activeTrades.values()) {
            if (position && (position.status === 'open' || position.status === 'pending')) {
                count++;
            }
        }
        return count;
    }

    getAutoTradeGroups() {
        if (!this.walletManager) {
            return [];
        }

        return this.walletManager
            .getAllGroups()
            .filter((group) => {
                if (group.isActive === false) {
                    return false;
                }
                const settings = group.settings || {};
                const autoTradeSetting = settings.autoTrade;

                if (typeof autoTradeSetting === 'object') {
                    return autoTradeSetting.enabled !== false;
                }

                return Boolean(autoTradeSetting);
            });
    }

    resolveGroupSetting(settings = {}, key, fallback) {
        if (!settings) {
            return fallback;
        }

        const autoTradeSettings =
            typeof settings.autoTrade === 'object' ? settings.autoTrade : undefined;

        if (autoTradeSettings && autoTradeSettings[key] !== undefined) {
            return autoTradeSettings[key];
        }

        if (settings[key] !== undefined) {
            return settings[key];
        }

        return fallback;
    }

    calculateTradeAllocation(wallet, settings = {}) {
        const availableBalance = wallet.balance || 0;
        const minBalance = this.resolveGroupSetting(
            settings,
            'minBalance',
            this.config.autoTradeMinBalance
        );

        if (availableBalance < minBalance) {
            return null;
        }

        const reserveBalance = this.resolveGroupSetting(settings, 'reserveBalance', 0);
        const spendable = Math.max(availableBalance - reserveBalance, 0);
        if (spendable <= 0) {
            return null;
        }

        const allocationPct = this.resolveGroupSetting(
            settings,
            'allocation',
            this.config.autoTradeAllocation
        );
        const maxPerTrade = this.resolveGroupSetting(
            settings,
            'maxPerTrade',
            this.config.autoTradeMaxPerTrade
        );
        const minTrade = this.resolveGroupSetting(
            settings,
            'minTrade',
            this.config.autoTradeMinTrade
        );

        const tradeAmount = Math.min(spendable * allocationPct, maxPerTrade);
        if (tradeAmount < minTrade) {
            return null;
        }

        return Number(tradeAmount.toFixed(6));
    }

    shouldSkipToken(tokenMint, wallet) {
        const positionKey = this.getPositionKey(wallet.address, tokenMint);

        if (this.activeTrades.has(positionKey)) {
            return true;
        }

        const recentTimestamp = this.recentOpportunities.get(tokenMint);
        if (recentTimestamp && Date.now() - recentTimestamp < this.config.autoTradeCooldownMs) {
            return true;
        }

        const tokenBalances = wallet.tokenBalances || {};
        const holding = tokenBalances[tokenMint];
        if (holding && (holding.uiAmount || holding.amount || 0) > 0) {
            return true;
        }

        return false;
    }

    registerRecentOpportunity(tokenMint) {
        this.recentOpportunities.set(tokenMint, Date.now());
    }

    async findAndExecuteNewTrades() {
        const groups = this.getAutoTradeGroups();

        if (groups.length === 0) {
            return;
        }

        const trending = await this.pumpFun.getTrendingTokens(20);

        if (!trending.success || !Array.isArray(trending.tokens) || trending.tokens.length === 0) {
            return;
        }

        for (const group of groups) {
            if (!this.isTrading) {
                break;
            }

            const groupWallets = this.walletManager
                .getWalletsByGroup(group.id)
                .filter((wallet) => wallet && wallet.isActive !== false);

            for (const wallet of groupWallets) {
                if (!this.isTrading || this.getOpenTradeCount() >= this.config.maxConcurrentTrades) {
                    return;
                }

                const refreshedWallet = this.walletManager.getWallet(wallet.address) || wallet;
                const allocation = this.calculateTradeAllocation(refreshedWallet, group.settings || {});

                if (allocation === null) {
                    continue;
                }

                for (const token of trending.tokens) {
                    if (!this.isTrading || this.getOpenTradeCount() >= this.config.maxConcurrentTrades) {
                        return;
                    }

                    if (this.shouldSkipToken(token.mint, refreshedWallet)) {
                        continue;
                    }

                    const executed = await this.executeAutoTrade(refreshedWallet, token, allocation, group);
                    if (executed) {
                        break;
                    }

                    await this.delay(250);
                }
            }
        }
    }

    getPositionKey(walletAddress, tokenMint) {
        return `${walletAddress}:${tokenMint}`;
    }

    async executeAutoTrade(wallet, token, allocation, group) {
        const positionKey = this.getPositionKey(wallet.address, token.mint);

        if (this.activeTrades.has(positionKey)) {
            return false;
        }

        this.activeTrades.set(positionKey, {
            status: 'pending',
            walletAddress: wallet.address,
            tokenMint: token.mint,
            groupId: group.id,
            createdAt: Date.now()
        });

        try {
            const priceInfo =
                token.price && token.price > 0
                    ? { price: token.price, success: true }
                    : await this.getTokenPrice(token.mint);

            if (!priceInfo.success || priceInfo.price <= 0) {
                throw new Error('Unable to determine token price');
            }

            const slippage = this.resolveGroupSetting(
                group.settings || {},
                'slippage',
                this.config.defaultSlippage
            );

            const buyResult = await this.buyToken(wallet.address, token.mint, allocation, {
                slippage,
                priorityFee: this.config.priorityFee
            });

            if (!buyResult.success) {
                throw new Error(buyResult.error || 'Auto-buy failed');
            }

            const tokenAmount = buyResult.amount || 0;
            if (tokenAmount <= 0) {
                throw new Error('Invalid token amount received from buy');
            }

            const position = {
                status: 'open',
                walletAddress: wallet.address,
                tokenMint: token.mint,
                tokenAmount,
                solSpent: allocation,
                entryPrice: priceInfo.price,
                targetProfit: this.resolveGroupSetting(
                    group.settings || {},
                    'targetProfit',
                    this.config.autoTradeProfitTarget
                ),
                stopLoss: this.resolveGroupSetting(
                    group.settings || {},
                    'stopLoss',
                    this.config.autoTradeStopLoss
                ),
                slippage,
                lastEvaluated: 0,
                createdAt: Date.now(),
                groupId: group.id
            };

            this.activeTrades.set(positionKey, position);
            this.registerRecentOpportunity(token.mint);

            console.log(
                `🤖 Auto-trade opened for ${token.symbol || token.mint} using ${
                    wallet.name || wallet.address
                } - spent ${allocation} SOL @ ${priceInfo.price} USD`
            );

            return true;
        } catch (error) {
            console.warn(
                `Auto trade skipped for ${token.symbol || token.mint}:`,
                error.message
            );
            this.activeTrades.delete(positionKey);
            return false;
        }
    }

    async evaluateOpenPositions() {
        const entries = Array.from(this.activeTrades.entries());

        for (const [key, position] of entries) {
            if (!this.isTrading) {
                break;
            }

            if (!position || position.status !== 'open') {
                continue;
            }

            const now = Date.now();
            if (position.lastEvaluated && now - position.lastEvaluated < 5000) {
                continue;
            }

            try {
                const priceInfo = await this.getTokenPrice(position.tokenMint);
                if (!priceInfo.success || priceInfo.price <= 0) {
                    position.lastEvaluated = now;
                    this.activeTrades.set(key, position);
                    continue;
                }

                const change = (priceInfo.price - position.entryPrice) / position.entryPrice;
                const takeProfit = change >= position.targetProfit;
                const hitStopLoss = change <= -position.stopLoss;

                if (takeProfit || hitStopLoss) {
                    const exitSnapshot = { ...position };
                    const sellResult = await this.sellToken(
                        position.walletAddress,
                        position.tokenMint,
                        position.tokenAmount,
                        {
                            slippage: position.slippage,
                            priorityFee: this.config.priorityFee
                        }
                    );

                    if (sellResult.success) {
                        const outcome =
                            sellResult.amount !== undefined
                                ? sellResult.amount - exitSnapshot.solSpent
                                : null;

                        console.log(
                            `🤖 Auto-trade closed (${takeProfit ? 'target' : 'stop'}) for ${
                                exitSnapshot.tokenMint
                            } using ${exitSnapshot.walletAddress}. PnL: ${
                                outcome !== null ? outcome.toFixed(4) : 'n/a'
                            } SOL`
                        );
                        this.registerRecentOpportunity(exitSnapshot.tokenMint);
                    } else {
                        console.warn(
                            `Auto-trade exit failed for ${exitSnapshot.tokenMint}:`,
                            sellResult.error
                        );
                    }
                } else {
                    position.lastEvaluated = now;
                    this.activeTrades.set(key, position);
                }
            } catch (error) {
                console.error(`Auto position evaluation error (${key}):`, error.message);
            }

            await this.delay(250);
        }
    }

    clearActivePosition(walletAddress, tokenMint) {
        const key = this.getPositionKey(walletAddress, tokenMint);
        const position = this.activeTrades.get(key);
        if (position) {
            this.activeTrades.delete(key);
        }
        return position || null;
    }

    getStats() {
        return {
            ...this.stats,
            uptime: Date.now() - this.stats.startTime,
            activeTrades: this.activeTrades.size,
            isTrading: this.isTrading,
            isInitialized: this.isInitialized
        };
    }

    getTradeHistory(limit = 100) {
        return this.tradeHistory.slice(-limit);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { ProductionTradingEngine };
