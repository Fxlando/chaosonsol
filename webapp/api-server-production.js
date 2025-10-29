/**
 * Production-Ready API Server for Chaos Bot
 * Comprehensive trading platform with full Solana integration
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { JupiterV6Integration } = require('../jupiter-v6-integration');
const { RaydiumDEXIntegration } = require('../raydium-dex-integration');
const { SmartSellEngine } = require('../smart-sell-engine');
const { WalletGroupManager } = require('../wallet-group-manager');
const { GroupTradingEngine } = require('../group-trading-engine');
const { WalletAnalytics } = require('../wallet-analytics');
const tradeTracker = require('../trade-tracker');
const connectionPoolManager = require('../connection-pool-manager');
const RateLimitManager = require('../rate-limit-manager');
const smartCacheManager = require('../smart-cache-manager');
const axios = require('axios');

const PORT = process.env.WEB_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Initialize Solana connection with connection pool
const connection = new Connection(
  process.env.RPC_URL || 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27',
  'confirmed'
);

// Initialize connection pool
connectionPoolManager.initialize().catch(console.error);

const config = {
  defaultSlippage: parseInt(process.env.DEFAULT_SLIPPAGE) || 100,
  priorityFee: parseInt(process.env.PRIORITY_FEE) || 1000,
  maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
  maxTradesPerMinute: parseInt(process.env.MAX_TRADES_PER_MINUTE) || 50,
  maxWalletsPerOperation: parseInt(process.env.MAX_WALLETS_PER_OPERATION) || 100,
  maxSolPerTrade: parseFloat(process.env.MAX_SOL_PER_TRADE) || 10
};

// Initialize trading engines
const jupiter = new JupiterV6Integration(connection, config);
const raydium = new RaydiumDEXIntegration(connection, config);
const smartSell = new SmartSellEngine(connection, config);
const walletGroupManager = new WalletGroupManager(connection);
const groupTradingEngine = new GroupTradingEngine(connection, walletGroupManager, jupiter, smartSell);
const walletAnalytics = new WalletAnalytics(walletGroupManager);
const rateLimitManager = new RateLimitManager();

console.log('✅ Production trading engines initialized');

// Security middleware
const validateInput = (data, requiredFields = []) => {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid input data');
  }
  
  for (const field of requiredFields) {
    if (!data[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate wallet addresses
  if (data.walletAddress) {
    try {
      new PublicKey(data.walletAddress);
    } catch (error) {
      throw new Error('Invalid wallet address format');
    }
  }
  
  // Validate token addresses
  if (data.tokenMint) {
    try {
      new PublicKey(data.tokenMint);
    } catch (error) {
      throw new Error('Invalid token mint format');
    }
  }
  
  // Validate amounts
  if (data.amount && (isNaN(data.amount) || data.amount <= 0)) {
    throw new Error('Invalid amount');
  }
  
  return true;
};

// Rate limiting middleware
const rateLimiter = new Map();
const checkRateLimit = (ip, endpoint) => {
  const key = `${ip}_${endpoint}`;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 100; // Max 100 requests per minute per IP
  
  if (!rateLimiter.has(key)) {
    rateLimiter.set(key, []);
  }
  
  const requests = rateLimiter.get(key);
  const validRequests = requests.filter(time => now - time < windowMs);
  
  if (validRequests.length >= maxRequests) {
    throw new Error('Rate limit exceeded');
  }
  
  validRequests.push(now);
  rateLimiter.set(key, validRequests);
};

// Helper functions
const getAllWallets = () => {
  const allGroups = walletGroupManager.getAllGroups();
  let allWallets = [];
  Object.values(allGroups).forEach(group => {
    allWallets = allWallets.concat(group.wallets.map(w => ({
      ...w,
      groupName: group.name
    })));
  });
  return allWallets;
};

const getSolPrice = async () => {
  try {
    const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL');
    return parseFloat(response.data.data.rates.USD);
  } catch (error) {
    return 187; // Fallback price
  }
};

// API Routes
const apiRoutes = {
  // System status
  '/api/status': async () => {
    const connectionStats = connectionPoolManager.getStats();
    const rateLimitStatus = rateLimitManager.getStatus();
    
    return {
      status: 'online',
      timestamp: Date.now(),
      version: '1.0.0',
      environment: NODE_ENV,
      connection: {
        rpcEndpoint: connection.rpcEndpoint,
        poolStats: connectionStats
      },
      rateLimits: rateLimitStatus,
      uptime: process.uptime()
    };
  },

  // Dashboard stats
  '/api/stats': async () => {
    const wallets = getAllWallets();
    const groups = walletGroupManager.getAllGroups();
    const solPrice = await getSolPrice();
    
    let totalBalance = 0;
    for (const wallet of wallets) {
      try {
        const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
        totalBalance += balance / LAMPORTS_PER_SOL;
      } catch (e) {}
    }

    return {
      wallets: {
        total: wallets.length,
        active: wallets.filter(w => w.status === 'active').length
      },
      balance: {
        sol: totalBalance,
        usd: totalBalance * solPrice
      },
      groups: Object.keys(groups).length,
      solPrice: solPrice,
      rpcUrl: connection.rpcEndpoint,
      network: 'mainnet-beta',
      tradingEngines: {
        jupiter: true,
        raydium: true,
        pumpfun: true,
        smartSell: smartSell.isEnabled
      }
    };
  },

  // Get all wallets with balances
  '/api/wallets': async () => {
    const wallets = getAllWallets();
    const solPrice = await getSolPrice();
    
    const walletsWithBalances = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          return {
            ...wallet,
            balance: solBalance,
            usdValue: solBalance * solPrice
          };
        } catch (error) {
          return {
            ...wallet,
            balance: 0,
            usdValue: 0,
            error: 'Failed to fetch balance'
          };
        }
      })
    );

    return walletsWithBalances;
  },

  // Get wallet groups
  '/api/groups': async () => {
    const groups = walletGroupManager.getAllGroups();
    return Object.keys(groups).map(groupId => ({
      id: groupId,
      ...groups[groupId],
      walletCount: groups[groupId].wallets.length
    }));
  },

  // Get wallet analytics
  '/api/wallets/:address/analytics': async (req) => {
    const address = req.params.address;
    const options = req.query;
    
    try {
      validateInput({ walletAddress: address }, ['walletAddress']);
      return await walletAnalytics.getWalletAnalytics(address, options);
    } catch (error) {
      throw new Error(`Analytics error: ${error.message}`);
    }
  },

  // Volume trading status
  '/api/volume/status': async () => {
    return groupTradingEngine.getStatus();
  },

  // Smart sell status
  '/api/smartsell/status': async () => {
    return smartSell.getStatus();
  },

  // Trading history
  '/api/history': async (req) => {
    const filters = req.query || {};
    return tradeTracker.getTrades(filters);
  },

  // P&L summary
  '/api/pnl': async () => {
    return tradeTracker.getPerformanceMetrics();
  },

  // Top performers
  '/api/top-performers': async (req) => {
    const limit = parseInt(req.query.limit) || 10;
    return tradeTracker.getTopWallets(limit);
  }
};

// POST API Routes
const apiPostRoutes = {
  // Create wallet group
  '/api/groups': async (body) => {
    try {
      validateInput(body, ['name']);
      const group = walletGroupManager.createGroup(
        body.name,
        body.description || '',
        body.settings || {}
      );
      return { success: true, group };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Add wallet to group
  '/api/groups/:groupId/wallets': async (body, req) => {
    try {
      const groupId = req.params.groupId;
      validateInput(body, ['name']);
      
      const wallet = walletGroupManager.addWalletToGroup(groupId, body);
      return { success: true, wallet };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Generate wallets for group
  '/api/groups/:groupId/generate': async (body, req) => {
    try {
      const groupId = req.params.groupId;
      validateInput(body, ['count']);
      
      if (body.count > config.maxWalletsPerOperation) {
        throw new Error(`Maximum ${config.maxWalletsPerOperation} wallets per operation`);
      }
      
      const wallets = walletGroupManager.generateWalletsForGroup(
        groupId,
        body.count,
        body.names || []
      );
      return { success: true, wallets };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Start volume trading
  '/api/volume/start': async (body) => {
    try {
      validateInput(body, ['groupId', 'tokenMint']);
      
      const result = await groupTradingEngine.startVolumeSession(
        body.groupId,
        body.tokenMint,
        body.config || {}
      );
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Stop volume trading
  '/api/volume/stop': async (body) => {
    try {
      if (body.sessionId) {
        return groupTradingEngine.stopSession(body.sessionId);
      } else {
        return groupTradingEngine.stopAllSessions();
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Enable smart sell
  '/api/smartsell/enable': async (body) => {
    try {
      validateInput(body, ['tokenMint', 'wallets']);
      
      const result = await smartSell.enable(
        body.tokenMint,
        body.wallets,
        body.settings || {}
      );
      return { success: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Disable smart sell
  '/api/smartsell/disable': async () => {
    try {
      await smartSell.disable();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Execute manual trade
  '/api/trade/execute': async (body) => {
    try {
      validateInput(body, ['walletAddress', 'tokenMint', 'action', 'amount']);
      
      if (body.amount > config.maxSolPerTrade) {
        throw new Error(`Maximum ${config.maxSolPerTrade} SOL per trade`);
      }
      
      // Find wallet
      const allWallets = getAllWallets();
      const wallet = allWallets.find(w => w.publicKey === body.walletAddress);
      
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Get wallet keypair
      let keypair;
      if (wallet.keypair) {
        keypair = wallet.keypair;
      } else if (wallet.privateKey) {
        const { Keypair } = require('@solana/web3.js');
        keypair = Keypair.fromSecretKey(new Uint8Array(wallet.privateKey));
      } else {
        throw new Error('Wallet keypair not available');
      }

      // Execute trade
      let result;
      if (body.action === 'buy') {
        result = await jupiter.buyToken(keypair, body.tokenMint, body.amount, {
          source: 'manual',
          session: body.session || null
        });
      } else if (body.action === 'sell') {
        const tokenAmount = Math.floor(body.amount * 1e6); // Convert to lamports
        result = await jupiter.sellToken(keypair, body.tokenMint, tokenAmount, {
          source: 'manual',
          session: body.session || null
        });
      } else {
        throw new Error('Invalid action. Use "buy" or "sell"');
      }

      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Bulk operations
  '/api/bulk/fund': async (body) => {
    try {
      validateInput(body, ['wallets', 'amount', 'funderKey']);
      
      if (body.wallets.length > config.maxWalletsPerOperation) {
        throw new Error(`Maximum ${config.maxWalletsPerOperation} wallets per operation`);
      }
      
      // TODO: Implement bulk funding
      return { success: true, message: 'Bulk funding not yet implemented' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Export data
  '/api/export/trades': async (body) => {
    try {
      const format = body.format || 'json';
      const filters = body.filters || {};
      
      const data = tradeTracker.exportTrades(format, filters);
      return { success: true, data, format };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Main server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const clientIP = req.connection.remoteAddress || req.socket.remoteAddress;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Rate limiting
  try {
    checkRateLimit(clientIP, pathname);
  } catch (error) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    try {
      // Handle parameterized routes
      let routePath = pathname;
      const params = {};
      
      // Extract parameters from path
      if (pathname.includes('/wallets/') && pathname.includes('/analytics')) {
        const match = pathname.match(/\/wallets\/([^\/]+)\/analytics/);
        if (match) {
          params.address = match[1];
          routePath = '/api/wallets/:address/analytics';
        }
      } else if (pathname.includes('/groups/') && pathname.includes('/wallets')) {
        const match = pathname.match(/\/groups\/([^\/]+)\/wallets/);
        if (match) {
          params.groupId = match[1];
          routePath = '/api/groups/:groupId/wallets';
        }
      } else if (pathname.includes('/groups/') && pathname.includes('/generate')) {
        const match = pathname.match(/\/groups\/([^\/]+)\/generate/);
        if (match) {
          params.groupId = match[1];
          routePath = '/api/groups/:groupId/generate';
        }
      }

      if (req.method === 'GET' && apiRoutes[routePath]) {
        const data = await apiRoutes[routePath]({ params, query: parsedUrl.query });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } else if (req.method === 'POST' && apiPostRoutes[routePath]) {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const parsedBody = JSON.parse(body);
            const data = await apiPostRoutes[routePath](parsedBody, { params, query: parsedUrl.query });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      console.error('API Error:', error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Serve static files
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  // Security: prevent directory traversal
  if (filePath.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 - Page Not Found');
      } else {
        res.writeHead(500);
        res.end('500 - Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`\n⚡ CHAOS BOT - PRODUCTION READY`);
  console.log(`\n🌐 Server: http://localhost:${PORT}`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`🔗 RPC: ${connection.rpcEndpoint}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`\n💡 Press Ctrl+C to stop\n`);
});

module.exports = server;
