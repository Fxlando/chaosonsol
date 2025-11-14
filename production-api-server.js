/**
 * Production-Ready API Server
 * Complete integration with all trading systems
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { ProductionTradingEngine } = require('../production-trading-engine');
const { ProductionSolanaCore } = require('../production-solana-core');
const { ProductionPumpFunIntegration } = require('../production-pumpfun-integration');
const { ProductionRaydiumIntegration } = require('../production-raydium-integration');
const { ProductionWalletManager } = require('../production-wallet-manager');

class ProductionAPIServer {
    constructor(config = {}) {
        this.config = {
            port: config.port || process.env.PORT || 3000,
            host: config.host || '0.0.0.0',
            ...config
        };
        
        this.tradingEngine = null;
        this.solanaCore = null;
        this.pumpFun = null;
        this.raydium = null;
        this.walletManager = null;
        
        this.isInitialized = false;
        this.server = null;
        
        this.initialize();
    }

    async initialize() {
        console.log('🚀 Initializing Production API Server...');
        
        try {
            // Initialize Solana Core
            // Get RPC URLs with proper fallback order: RPC_URL (Shyft) -> RPC_URL_2/3 -> Public -> Ankr
            const rpcUrls = [];
            if (process.env.RPC_URL) rpcUrls.push(process.env.RPC_URL);
            if (process.env.RPC_URL_2) rpcUrls.push(process.env.RPC_URL_2);
            if (process.env.RPC_URL_3) rpcUrls.push(process.env.RPC_URL_3);
            rpcUrls.push('https://api.mainnet-beta.solana.com');
            rpcUrls.push('https://solana-api.projectserum.com');
            rpcUrls.push('https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27');
            
            this.solanaCore = new ProductionSolanaCore({
                rpcUrls: rpcUrls,
                network: process.env.NETWORK || 'mainnet-beta',
                defaultSlippage: parseFloat(process.env.DEFAULT_SLIPPAGE) || 1.0,
                priorityFee: parseInt(process.env.PRIORITY_FEE) || 1000,
                maxRetries: parseInt(process.env.MAX_RETRIES) || 3
            });
            
            // Initialize integrations
            this.pumpFun = new ProductionPumpFunIntegration(this.solanaCore);
            this.raydium = new ProductionRaydiumIntegration(this.solanaCore);
            
            // Initialize wallet manager
            this.walletManager = new ProductionWalletManager(this.solanaCore);
            
            // Initialize trading engine
            this.tradingEngine = new ProductionTradingEngine({
                autoTrade: process.env.AUTO_TRADE === 'true',
                maxConcurrentTrades: parseInt(process.env.MAX_CONCURRENT_TRADES) || 5,
                defaultSlippage: parseFloat(process.env.DEFAULT_SLIPPAGE) || 1.0,
                priorityFee: parseInt(process.env.PRIORITY_FEE) || 1000,
                maxRetries: parseInt(process.env.MAX_RETRIES) || 3
            });
            
            this.isInitialized = true;
            console.log('✅ Production API Server Ready');
            
        } catch (error) {
            console.error('Failed to initialize API server:', error.message);
            throw error;
        }
    }

    async start() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        
        this.server.listen(this.config.port, this.config.host, () => {
            console.log(`🌐 Production API Server running on http://${this.config.host}:${this.config.port}`);
        });
    }

    async handleRequest(req, res) {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        const method = req.method;
        
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        if (method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        try {
            // Route handling
            if (pathname.startsWith('/api/')) {
                await this.handleAPIRequest(req, res, pathname, method, parsedUrl.query);
            } else if (pathname === '/' || pathname === '/index.html') {
                this.serveFile(res, 'chaosonsol-complete.html');
            } else if (pathname.endsWith('.html')) {
                this.serveFile(res, pathname.substring(1));
            } else if (pathname.endsWith('.js')) {
                this.serveFile(res, pathname.substring(1), 'application/javascript');
            } else if (pathname.endsWith('.css')) {
                this.serveFile(res, pathname.substring(1), 'text/css');
            } else {
                res.writeHead(404);
                res.end('Not Found');
            }
        } catch (error) {
            console.error('Request error:', error.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
        }
    }

    async handleAPIRequest(req, res, pathname, method, query) {
        const endpoint = pathname.replace('/api/', '');
        
        try {
            let result;
            
            switch (endpoint) {
                case 'health':
                    result = await this.getHealth();
                    break;
                    
                case 'stats':
                    result = await this.getStats();
                    break;
                    
                case 'wallets':
                    if (method === 'GET') {
                        result = await this.getWallets(query);
                    } else if (method === 'POST') {
                        const body = await this.getRequestBody(req);
                        result = await this.createWallet(body);
                    }
                    break;
                    
                case 'wallet':
                    if (method === 'GET') {
                        result = await this.getWallet(query.address);
                    } else if (method === 'PUT') {
                        const body = await this.getRequestBody(req);
                        result = await this.updateWallet(query.address, body);
                    } else if (method === 'DELETE') {
                        result = await this.deleteWallet(query.address);
                    }
                    break;
                    
                case 'groups':
                    if (method === 'GET') {
                        result = await this.getGroups();
                    } else if (method === 'POST') {
                        const body = await this.getRequestBody(req);
                        result = await this.createGroup(body);
                    }
                    break;
                    
                case 'group':
                    if (method === 'GET') {
                        result = await this.getGroup(query.id);
                    } else if (method === 'PUT') {
                        const body = await this.getRequestBody(req);
                        result = await this.updateGroup(query.id, body);
                    } else if (method === 'DELETE') {
                        result = await this.deleteGroup(query.id);
                    }
                    break;
                    
                case 'tokens':
                    if (method === 'GET') {
                        result = await this.getTokens(query);
                    }
                    break;
                    
                case 'token':
                    if (method === 'GET') {
                        result = await this.getToken(query.mint);
                    }
                    break;
                    
                case 'search':
                    if (method === 'GET') {
                        result = await this.searchTokens(query.q, query.limit);
                    }
                    break;
                    
                case 'trending':
                    if (method === 'GET') {
                        result = await this.getTrendingTokens(query.limit);
                    }
                    break;
                    
                case 'price':
                    if (method === 'GET') {
                        result = await this.getTokenPrice(query.mint);
                    }
                    break;
                    
                case 'buy':
                    if (method === 'POST') {
                        const body = await this.getRequestBody(req);
                        result = await this.buyToken(body);
                    }
                    break;
                    
                case 'sell':
                    if (method === 'POST') {
                        const body = await this.getRequestBody(req);
                        result = await this.sellToken(body);
                    }
                    break;
                    
                case 'swap':
                    if (method === 'POST') {
                        const body = await this.getRequestBody(req);
                        result = await this.swapTokens(body);
                    }
                    break;
                    
                case 'group-trade':
                    if (method === 'POST') {
                        const body = await this.getRequestBody(req);
                        result = await this.executeGroupTrade(body);
                    }
                    break;
                    
                case 'balance':
                    if (method === 'GET') {
                        result = await this.getWalletBalance(query.address);
                    }
                    break;
                    
                case 'trades':
                    if (method === 'GET') {
                        result = await this.getTradeHistory(query.limit);
                    }
                    break;
                    
                case 'rpc-health':
                    result = await this.getRPCHealth();
                    break;
                    
                default:
                    result = { error: 'Endpoint not found', success: false };
            }
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            
        } catch (error) {
            console.error(`API Error [${endpoint}]:`, error.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message, success: false }));
        }
    }

    // API Endpoints
    async getHealth() {
        return {
            status: 'healthy',
            timestamp: Date.now(),
            uptime: process.uptime(),
            isInitialized: this.isInitialized,
            success: true
        };
    }

    async getStats() {
        if (!this.tradingEngine) {
            return { error: 'Trading engine not initialized', success: false };
        }
        
        const stats = this.tradingEngine.getStats();
        const walletStats = await this.walletManager.getGroupStats('all');
        
        return {
            ...stats,
            walletStats: walletStats,
            success: true
        };
    }

    async getWallets(query) {
        try {
            let wallets = this.walletManager.getAllWallets();
            
            if (query.group) {
                wallets = wallets.filter(w => w.group === query.group);
            }
            
            if (query.search) {
                wallets = await this.walletManager.searchWallets(query.search);
            }
            
            if (query.sort) {
                wallets = await this.walletManager.sortWallets(wallets, query.sort, query.direction || 'desc');
            }
            
            if (query.limit) {
                wallets = wallets.slice(0, parseInt(query.limit));
            }
            
            return {
                wallets: wallets,
                count: wallets.length,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async createWallet(body) {
        try {
            const { name, group, privateKey } = body;
            
            let wallet;
            if (privateKey) {
                wallet = this.walletManager.importWallet(privateKey, name, group);
            } else {
                wallet = this.walletManager.generateWallet(name, group);
            }
            
            return {
                wallet: wallet,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getWallet(address) {
        try {
            const wallet = this.walletManager.getWallet(address);
            if (!wallet) {
                return { error: 'Wallet not found', success: false };
            }
            
            const balance = await this.solanaCore.getWalletInfo(address);
            const stats = await this.walletManager.getWalletStats(address);
            
            return {
                wallet: wallet,
                balance: balance,
                stats: stats,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async updateWallet(address, body) {
        try {
            const wallet = this.walletManager.getWallet(address);
            if (!wallet) {
                return { error: 'Wallet not found', success: false };
            }
            
            // Update wallet properties
            if (body.name) wallet.name = body.name;
            if (body.group) wallet.group = body.group;
            if (body.isActive !== undefined) wallet.isActive = body.isActive;
            
            this.walletManager.wallets.set(address, wallet);
            await this.walletManager.saveWallets();
            
            return {
                wallet: wallet,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async deleteWallet(address) {
        try {
            const wallet = this.walletManager.getWallet(address);
            if (!wallet) {
                return { error: 'Wallet not found', success: false };
            }
            
            this.walletManager.wallets.delete(address);
            await this.walletManager.saveWallets();
            
            return { success: true };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getGroups() {
        try {
            const groups = this.walletManager.getAllGroups();
            return {
                groups: groups,
                count: groups.length,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async createGroup(body) {
        try {
            const { id, name, description, settings } = body;
            const group = this.walletManager.createGroup(id, name, description, settings);
            
            return {
                group: group,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getGroup(id) {
        try {
            const group = this.walletManager.getGroup(id);
            if (!group) {
                return { error: 'Group not found', success: false };
            }
            
            const stats = await this.walletManager.getGroupStats(id);
            const wallets = group.wallets.map(addr => this.walletManager.getWallet(addr)).filter(Boolean);
            
            return {
                group: group,
                stats: stats,
                wallets: wallets,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async updateGroup(id, body) {
        try {
            const group = this.walletManager.getGroup(id);
            if (!group) {
                return { error: 'Group not found', success: false };
            }
            
            // Update group properties
            if (body.name) group.name = body.name;
            if (body.description) group.description = body.description;
            if (body.settings) group.settings = { ...group.settings, ...body.settings };
            if (body.isActive !== undefined) group.isActive = body.isActive;
            
            this.walletManager.groups.set(id, group);
            await this.walletManager.saveGroups();
            
            return {
                group: group,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async deleteGroup(id) {
        try {
            const group = this.walletManager.getGroup(id);
            if (!group) {
                return { error: 'Group not found', success: false };
            }
            
            this.walletManager.groups.delete(id);
            await this.walletManager.saveGroups();
            
            return { success: true };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getTokens(query) {
        try {
            const { type = 'trending', limit = 20 } = query;
            
            let result;
            if (type === 'trending') {
                result = await this.tradingEngine.getTrendingTokens(parseInt(limit));
            } else if (type === 'popular') {
                result = await this.raydium.getPopularTokens(parseInt(limit));
            } else {
                result = { tokens: [], success: false, error: 'Invalid type' };
            }
            
            return result;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getToken(mint) {
        try {
            const tokenInfo = await this.tradingEngine.getTokenInfo(mint);
            const price = await this.tradingEngine.getTokenPrice(mint);
            
            return {
                ...tokenInfo,
                price: price.price,
                success: tokenInfo.success && price.success
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async searchTokens(query, limit = 10) {
        try {
            const result = await this.tradingEngine.searchTokens(query, parseInt(limit));
            return result;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getTrendingTokens(limit = 20) {
        try {
            const result = await this.tradingEngine.getTrendingTokens(parseInt(limit));
            return result;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getTokenPrice(mint) {
        try {
            const result = await this.tradingEngine.getTokenPrice(mint);
            return result;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async buyToken(body) {
        try {
            const { walletAddress, tokenMint, amount, options = {} } = body;
            
            if (!walletAddress || !tokenMint || !amount) {
                return { error: 'Missing required parameters', success: false };
            }
            
            const result = await this.tradingEngine.buyToken(walletAddress, tokenMint, amount, options);
            return result;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async sellToken(body) {
        try {
            const { walletAddress, tokenMint, tokenAmount, options = {} } = body;
            
            if (!walletAddress || !tokenMint || !tokenAmount) {
                return { error: 'Missing required parameters', success: false };
            }
            
            const result = await this.tradingEngine.sellToken(walletAddress, tokenMint, tokenAmount, options);
            return result;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async swapTokens(body) {
        try {
            const { walletAddress, inputMint, outputMint, inputAmount, options = {} } = body;
            
            if (!walletAddress || !inputMint || !outputMint || !inputAmount) {
                return { error: 'Missing required parameters', success: false };
            }
            
            const result = await this.tradingEngine.swapTokens(walletAddress, inputMint, outputMint, inputAmount, options);
            return result;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async executeGroupTrade(body) {
        try {
            const { groupId, tokenMint, amount, tradeType, options = {} } = body;
            
            if (!groupId || !tokenMint || !amount || !tradeType) {
                return { error: 'Missing required parameters', success: false };
            }
            
            const result = await this.tradingEngine.executeGroupTrade(groupId, tokenMint, amount, tradeType, options);
            return result;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getWalletBalance(address) {
        try {
            const balance = await this.solanaCore.getWalletInfo(address);
            return balance;
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getTradeHistory(limit = 100) {
        try {
            const history = this.tradingEngine.getTradeHistory(parseInt(limit));
            return {
                trades: history,
                count: history.length,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    async getRPCHealth() {
        try {
            const health = await this.solanaCore.healthCheck();
            return {
                connections: health,
                success: true
            };
        } catch (error) {
            return { error: error.message, success: false };
        }
    }

    // Utility methods
    async getRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    serveFile(res, filename, contentType = 'text/html') {
        const filePath = path.join(__dirname, filename);
        
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        } else {
            res.writeHead(404);
            res.end('File not found');
        }
    }
}

// Start server if run directly
if (require.main === module) {
    const server = new ProductionAPIServer();
    server.start().catch(console.error);
}

module.exports = { ProductionAPIServer };
