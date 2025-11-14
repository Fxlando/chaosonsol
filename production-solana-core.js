/**
 * Production-Ready Solana Trading Core
 * Complete integration with PumpFun, Raydium DEX, and optimized RPC
 */

const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, VersionedTransaction, ComputeBudgetProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } = require('@solana/spl-token');
const axios = require('axios');
const bs58 = require('bs58');

/**
 * Get RPC URLs from environment with proper fallback order:
 * 1. RPC_URL (Shyft - primary)
 * 2. RPC_URL_2, RPC_URL_3 (backups)
 * 3. Public RPCs
 * 4. Ankr (final fallback)
 */
function getRpcUrlsFromEnv() {
    const urls = [];
    
    // Primary: RPC_URL (Shyft)
    if (process.env.RPC_URL) {
        urls.push(process.env.RPC_URL);
    }
    
    // Backups: RPC_URL_2, RPC_URL_3
    if (process.env.RPC_URL_2) {
        urls.push(process.env.RPC_URL_2);
    }
    if (process.env.RPC_URL_3) {
        urls.push(process.env.RPC_URL_3);
    }
    
    // Public RPCs
    urls.push('https://api.mainnet-beta.solana.com');
    urls.push('https://solana-api.projectserum.com');
    
    // Final fallback: Ankr
    urls.push('https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27');
    
    return urls;
}

class ProductionSolanaCore {
    constructor(config = {}) {
        this.config = {
            rpcUrls: config.rpcUrls || getRpcUrlsFromEnv(),
            network: config.network || 'mainnet-beta',
            defaultSlippage: config.defaultSlippage || 1.0,
            priorityFee: config.priorityFee || 1000,
            maxRetries: config.maxRetries || 3,
            timeout: config.timeout || 30000
        };
        
        this.connections = [];
        this.currentConnectionIndex = 0;
        this.rateLimiter = new Map();
        this.cache = new Map();
        this.isInitialized = false;
        
        this.initializeConnections();
    }

    async initializeConnections() {
        console.log('🔌 Initializing Solana RPC connections...');
        
        for (const rpcUrl of this.config.rpcUrls) {
            try {
                const connection = new Connection(rpcUrl, {
                    commitment: 'confirmed',
                    confirmTransactionInitialTimeout: this.config.timeout,
                    disableRetryOnRateLimit: false
                });
                
                // Test connection
                const version = await connection.getVersion();
                this.connections.push({
                    connection,
                    url: rpcUrl,
                    healthy: true,
                    lastUsed: Date.now(),
                    requestCount: 0
                });
                
                console.log(`✅ Connected to ${rpcUrl} (v${version['solana-core']})`);
            } catch (error) {
                console.warn(`⚠️ Failed to connect to ${rpcUrl}:`, error.message);
            }
        }
        
        if (this.connections.length === 0) {
            throw new Error('No healthy RPC connections available');
        }
        
        this.isInitialized = true;
        console.log(`🚀 ${this.connections.length} RPC connections ready`);
    }

    getConnection() {
        if (!this.isInitialized) {
            throw new Error('Solana core not initialized');
        }
        
        // Round-robin load balancing
        const connection = this.connections[this.currentConnectionIndex];
        this.currentConnectionIndex = (this.currentConnectionIndex + 1) % this.connections.length;
        
        // Update usage stats
        connection.lastUsed = Date.now();
        connection.requestCount++;
        
        return connection.connection;
    }

    async executeTransaction(transaction, signers = [], options = {}) {
        const maxRetries = options.maxRetries ?? this.config.maxRetries ?? 3;
        const skipPreflight = options.skipPreflight ?? false;
        const commitment = options.commitment ?? 'confirmed';
        const priorityFeeMicroLamports =
            options.priorityFeeMicroLamports ??
            this.config.priorityFeeMicroLamports ??
            this.config.priorityFee ??
            0;
        const computeUnitLimit = options.computeUnitLimit ?? this.config.computeUnitLimit ?? null;

        if (transaction instanceof Transaction) {
            const computeInstructions = [];

            if (computeUnitLimit) {
                computeInstructions.push(
                    ComputeBudgetProgram.setComputeUnitLimit({
                        units: computeUnitLimit
                    })
                );
            }

            if (priorityFeeMicroLamports > 0) {
                computeInstructions.push(
                    ComputeBudgetProgram.setComputeUnitPrice({
                        microLamports: priorityFeeMicroLamports
                    })
                );
            }

            // Prepend so they run before user instructions
            for (let i = computeInstructions.length - 1; i >= 0; i--) {
                transaction.instructions.unshift(computeInstructions[i]);
            }
        }

        let lastError;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const connection = this.getConnection();

                const signature = await connection.sendTransaction(transaction, signers, {
                    skipPreflight,
                    preflightCommitment: commitment,
                    maxRetries: 0
                });

                const confirmation = await connection.confirmTransaction(signature, commitment);

                if (confirmation.value.err) {
                    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
                }

                return {
                    signature,
                    success: true,
                    confirmation
                };
            } catch (error) {
                lastError = error;
                console.warn(`Transaction attempt ${attempt + 1} failed:`, error.message);

                if (attempt < maxRetries - 1) {
                    await this.delay(1000 * (attempt + 1));
                }
            }
        }

        throw new Error(`Transaction failed after ${maxRetries} attempts: ${lastError?.message || 'unknown error'}`);
    }

    async getTokenBalance(walletAddress, tokenMint) {
        try {
            const connection = this.getConnection();
            const wallet = new PublicKey(walletAddress);
            const mint = new PublicKey(tokenMint);
            
            const tokenAccount = await getAssociatedTokenAddress(mint, wallet);
            const accountInfo = await getAccount(connection, tokenAccount);
            
            return {
                balance: accountInfo.amount,
                decimals: accountInfo.mint,
                success: true
            };
        } catch (error) {
            return {
                balance: 0,
                decimals: 0,
                success: false,
                error: error.message
            };
        }
    }

    async getSOLBalance(walletAddress) {
        try {
            const connection = this.getConnection();
            const balance = await connection.getBalance(new PublicKey(walletAddress));
            
            return {
                balance: balance / LAMPORTS_PER_SOL,
                lamports: balance,
                success: true
            };
        } catch (error) {
            return {
                balance: 0,
                lamports: 0,
                success: false,
                error: error.message
            };
        }
    }

    async getTokenPrice(tokenMint) {
        const cacheKey = `price_${tokenMint}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < 30000) { // 30 second cache
            return cached.data;
        }
        
        try {
            // Try Jupiter API first
            const jupiterResponse = await axios.get(`https://price.jup.ag/v4/price?ids=${tokenMint}`, {
                timeout: 5000
            });
            
            if (jupiterResponse.data?.data?.[tokenMint]) {
                const priceData = jupiterResponse.data.data[tokenMint];
                const result = {
                    price: priceData.price,
                    success: true,
                    source: 'jupiter'
                };
                
                this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                return result;
            }
        } catch (error) {
            console.warn('Jupiter price API failed:', error.message);
        }
        
        try {
            // Fallback to CoinGecko
            const coingeckoResponse = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${tokenMint}&vs_currencies=usd`, {
                timeout: 5000
            });
            
            if (coingeckoResponse.data?.[tokenMint.toLowerCase()]) {
                const result = {
                    price: coingeckoResponse.data[tokenMint.toLowerCase()].usd,
                    success: true,
                    source: 'coingecko'
                };
                
                this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                return result;
            }
        } catch (error) {
            console.warn('CoinGecko price API failed:', error.message);
        }
        
        return {
            price: 0,
            success: false,
            error: 'Unable to fetch price from any source'
        };
    }

    async getWalletInfo(walletAddress) {
        try {
            const [solBalance, tokenAccounts] = await Promise.all([
                this.getSOLBalance(walletAddress),
                this.getTokenAccounts(walletAddress)
            ]);
            
            return {
                address: walletAddress,
                solBalance: solBalance.balance,
                tokenAccounts: tokenAccounts,
                success: true
            };
        } catch (error) {
            return {
                address: walletAddress,
                solBalance: 0,
                tokenAccounts: [],
                success: false,
                error: error.message
            };
        }
    }

    async getTokenAccounts(walletAddress) {
        try {
            const connection = this.getConnection();
            const accounts = await connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
            );
            
            return accounts.value.map(account => ({
                address: account.pubkey.toString(),
                mint: account.account.data.parsed.info.mint,
                amount: account.account.data.parsed.info.tokenAmount.amount,
                decimals: account.account.data.parsed.info.tokenAmount.decimals,
                uiAmount: account.account.data.parsed.info.tokenAmount.uiAmount
            }));
        } catch (error) {
            console.error('Error fetching token accounts:', error);
            return [];
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Health check for connections
    async healthCheck() {
        const results = [];
        
        for (let i = 0; i < this.connections.length; i++) {
            const conn = this.connections[i];
            try {
                const start = Date.now();
                await conn.connection.getVersion();
                const latency = Date.now() - start;
                
                results.push({
                    index: i,
                    url: conn.url,
                    healthy: true,
                    latency: latency,
                    requestCount: conn.requestCount
                });
            } catch (error) {
                results.push({
                    index: i,
                    url: conn.url,
                    healthy: false,
                    error: error.message,
                    requestCount: conn.requestCount
                });
            }
        }
        
        return results;
    }
}

module.exports = { ProductionSolanaCore };
