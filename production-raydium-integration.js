/**
 * Production-Ready Raydium DEX Integration
 * Complete DEX trading with Jupiter Aggregator v6
 */

const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } = require('@solana/spl-token');
const axios = require('axios');
const bs58 = require('bs58');

class ProductionRaydiumIntegration {
    constructor(solanaCore, config = {}) {
        this.solanaCore = solanaCore;
        this.config = {
            jupiterApiUrl: 'https://quote-api.jup.ag/v6',
            jupiterProgramId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
            raydiumProgramId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
            defaultSlippage: config.defaultSlippage || 1.0,
            maxRetries: config.maxRetries || 3,
            ...config
        };
        
        this.cache = new Map();
        this.isInitialized = false;
        
        this.initialize();
    }

    async initialize() {
        console.log('🔄 Initializing Raydium DEX Integration...');
        this.isInitialized = true;
        console.log('✅ Raydium DEX Integration Ready');
    }

    async getQuote(inputMint, outputMint, amount, slippageBps = 50) {
        const cacheKey = `quote_${inputMint}_${outputMint}_${amount}_${slippageBps}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < 10000) { // 10 second cache
            return cached.data;
        }

        try {
            const response = await axios.get(`${this.config.jupiterApiUrl}/quote`, {
                params: {
                    inputMint: inputMint,
                    outputMint: outputMint,
                    amount: amount,
                    slippageBps: slippageBps,
                    onlyDirectRoutes: false,
                    asLegacyTransaction: false
                },
                timeout: 10000
            });

            if (response.data) {
                const quote = {
                    inputMint: response.data.inputMint,
                    outputMint: response.data.outputMint,
                    inputAmount: response.data.inAmount,
                    outputAmount: response.data.outAmount,
                    otherAmountThreshold: response.data.otherAmountThreshold,
                    swapMode: response.data.swapMode,
                    slippageBps: response.data.slippageBps,
                    platformFee: response.data.platformFee,
                    priceImpactPct: response.data.priceImpactPct,
                    routePlan: response.data.routePlan,
                    contextSlot: response.data.contextSlot,
                    timeTaken: response.data.timeTaken,
                    success: true
                };

                this.cache.set(cacheKey, { data: quote, timestamp: Date.now() });
                return quote;
            }
        } catch (error) {
            console.warn('Jupiter quote API failed:', error.message);
        }

        return {
            inputMint: inputMint,
            outputMint: outputMint,
            inputAmount: 0,
            outputAmount: 0,
            otherAmountThreshold: 0,
            swapMode: 'ExactIn',
            slippageBps: slippageBps,
            platformFee: null,
            priceImpactPct: 0,
            routePlan: [],
            contextSlot: 0,
            timeTaken: 0,
            success: false,
            error: 'Unable to get quote'
        };
    }

    async getSwapTransaction(quote, userPublicKey, options = {}) {
        try {
            const response = await axios.post(`${this.config.jupiterApiUrl}/swap`, {
                quoteResponse: quote,
                userPublicKey: userPublicKey,
                wrapAndUnwrapSol: options.wrapAndUnwrapSol !== false,
                useSharedAccounts: options.useSharedAccounts !== false,
                feeAccount: options.feeAccount || null,
                trackingAccount: options.trackingAccount || null,
                computeUnitPriceMicroLamports: options.computeUnitPriceMicroLamports || null,
                asLegacyTransaction: options.asLegacyTransaction || false
            }, {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data) {
                return {
                    swapTransaction: response.data.swapTransaction,
                    lastValidBlockHeight: response.data.lastValidBlockHeight,
                    prioritizationFeeLamports: response.data.prioritizationFeeLamports,
                    success: true
                };
            }
        } catch (error) {
            console.warn('Jupiter swap transaction API failed:', error.message);
        }

        return {
            swapTransaction: null,
            lastValidBlockHeight: 0,
            prioritizationFeeLamports: 0,
            success: false,
            error: 'Unable to get swap transaction'
        };
    }

    async executeSwap(walletKeypair, inputMint, outputMint, amount, options = {}) {
        try {
            const slippageBps = options.slippageBps || Math.floor(this.config.defaultSlippage * 100);
            const maxRetries = options.maxRetries || this.config.maxRetries;
            
            // Get quote
            const quote = await this.getQuote(inputMint, outputMint, amount, slippageBps);
            if (!quote.success) {
                throw new Error(quote.error);
            }

            // Get swap transaction
            const swapData = await this.getSwapTransaction(quote, walletKeypair.publicKey.toString(), options);
            if (!swapData.success) {
                throw new Error(swapData.error);
            }

            // Deserialize transaction
            const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
            const transaction = Transaction.from(swapTransactionBuf);

            // Execute transaction
            const result = await this.solanaCore.executeTransaction(transaction, [walletKeypair], {
                maxRetries
            });

            return {
                signature: result.signature,
                inputAmount: quote.inputAmount,
                outputAmount: quote.outputAmount,
                priceImpact: quote.priceImpactPct,
                success: true
            };

        } catch (error) {
            return {
                signature: null,
                inputAmount: 0,
                outputAmount: 0,
                priceImpact: 0,
                success: false,
                error: error.message
            };
        }
    }

    async swapSOLToToken(walletKeypair, outputMint, solAmount, options = {}) {
        const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
        const amount = Math.floor(solAmount * LAMPORTS_PER_SOL);
        
        return await this.executeSwap(walletKeypair, inputMint, outputMint, amount, options);
    }

    async swapTokenToSOL(walletKeypair, inputMint, tokenAmount, options = {}) {
        const outputMint = 'So11111111111111111111111111111111111111112'; // SOL
        
        return await this.executeSwap(walletKeypair, inputMint, outputMint, tokenAmount, options);
    }

    async swapTokenToToken(walletKeypair, inputMint, outputMint, inputAmount, options = {}) {
        return await this.executeSwap(walletKeypair, inputMint, outputMint, inputAmount, options);
    }

    async getTokenPrice(tokenMint) {
        try {
            const solMint = 'So11111111111111111111111111111111111111112';
            const amount = 1000000; // 1 token (assuming 6 decimals)
            
            const quote = await this.getQuote(tokenMint, solMint, amount);
            if (quote.success) {
                return {
                    price: quote.outputAmount / LAMPORTS_PER_SOL,
                    success: true
                };
            }
        } catch (error) {
            console.warn('Token price fetch failed:', error.message);
        }

        return {
            price: 0,
            success: false,
            error: 'Unable to fetch token price'
        };
    }

    async getTokenList() {
        const cacheKey = 'token_list';
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
            return cached.data;
        }

        try {
            const response = await axios.get(`${this.config.jupiterApiUrl}/tokens`, {
                timeout: 10000
            });

            if (response.data) {
                const tokens = response.data.map(token => ({
                    address: token.address,
                    symbol: token.symbol,
                    name: token.name,
                    decimals: token.decimals,
                    logoURI: token.logoURI,
                    tags: token.tags || [],
                    verified: token.verified || false
                }));

                const result = { tokens, success: true };
                this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                return result;
            }
        } catch (error) {
            console.warn('Token list API failed:', error.message);
        }

        return {
            tokens: [],
            success: false,
            error: 'Unable to fetch token list'
        };
    }

    async searchTokens(query, limit = 20) {
        try {
            const tokenList = await this.getTokenList();
            if (!tokenList.success) {
                return tokenList;
            }

            const queryLower = query.toLowerCase();
            const filteredTokens = tokenList.tokens
                .filter(token => 
                    token.symbol.toLowerCase().includes(queryLower) ||
                    token.name.toLowerCase().includes(queryLower) ||
                    token.address.toLowerCase().includes(queryLower)
                )
                .slice(0, limit);

            return {
                tokens: filteredTokens,
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

    async getPopularTokens(limit = 20) {
        try {
            const tokenList = await this.getTokenList();
            if (!tokenList.success) {
                return tokenList;
            }

            // Filter for popular/verified tokens
            const popularTokens = tokenList.tokens
                .filter(token => 
                    token.verified && 
                    (token.tags.includes('community') || 
                     token.tags.includes('verified') ||
                     token.symbol === 'SOL' ||
                     token.symbol === 'USDC' ||
                     token.symbol === 'USDT')
                )
                .slice(0, limit);

            return {
                tokens: popularTokens,
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

    async getRouteInfo(inputMint, outputMint, amount) {
        try {
            const quote = await this.getQuote(inputMint, outputMint, amount);
            if (!quote.success) {
                return quote;
            }

            return {
                inputMint: quote.inputMint,
                outputMint: quote.outputMint,
                inputAmount: quote.inputAmount,
                outputAmount: quote.outputAmount,
                priceImpact: quote.priceImpactPct,
                routePlan: quote.routePlan,
                platformFee: quote.platformFee,
                success: true
            };
        } catch (error) {
            return {
                inputMint: inputMint,
                outputMint: outputMint,
                inputAmount: 0,
                outputAmount: 0,
                priceImpact: 0,
                routePlan: [],
                platformFee: null,
                success: false,
                error: error.message
            };
        }
    }

    async getLiquidityPools(tokenMint) {
        try {
            const response = await axios.get(`${this.config.jupiterApiUrl}/pools`, {
                params: {
                    ids: tokenMint
                },
                timeout: 10000
            });

            if (response.data && response.data.length > 0) {
                return {
                    pools: response.data.map(pool => ({
                        id: pool.id,
                        baseMint: pool.baseMint,
                        quoteMint: pool.quoteMint,
                        lpMint: pool.lpMint,
                        baseDecimals: pool.baseDecimals,
                        quoteDecimals: pool.quoteDecimals,
                        lpDecimals: pool.lpDecimals,
                        version: pool.version,
                        programId: pool.programId,
                        authority: pool.authority,
                        openOrders: pool.openOrders,
                        targetOrders: pool.targetOrders,
                        baseVault: pool.baseVault,
                        quoteVault: pool.quoteVault,
                        withdrawQueue: pool.withdrawQueue,
                        lpVault: pool.lpVault,
                        marketVersion: pool.marketVersion,
                        marketProgramId: pool.marketProgramId,
                        marketId: pool.marketId,
                        marketAuthority: pool.marketAuthority,
                        marketBaseVault: pool.marketBaseVault,
                        marketQuoteVault: pool.marketQuoteVault,
                        marketBids: pool.marketBids,
                        marketAsks: pool.marketAsks,
                        marketEventQueue: pool.marketEventQueue,
                        lookupTableAccount: pool.lookupTableAccount
                    })),
                    success: true
                };
            }
        } catch (error) {
            console.warn('Liquidity pools API failed:', error.message);
        }

        return {
            pools: [],
            success: false,
            error: 'Unable to fetch liquidity pools'
        };
    }
}

module.exports = { ProductionRaydiumIntegration };
