/**
 * Production-Ready Trading Engine
 * Complete integration of PumpFun, Raydium DEX, and wallet management
 */

const { Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
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
        
        this.isTrading = true;
        console.log('🤖 Auto-trading started');
        
        // Auto-trading logic would go here
        // This is a placeholder for the actual implementation
        
        while (this.isTrading) {
            try {
                // Check for trading opportunities
                // Execute trades based on strategy
                // Update balances
                
                await this.delay(5000); // Check every 5 seconds
            } catch (error) {
                console.error('Auto-trading error:', error.message);
                await this.delay(10000); // Wait 10 seconds on error
            }
        }
    }

    stopAutoTrading() {
        this.isTrading = false;
        console.log('🛑 Auto-trading stopped');
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
