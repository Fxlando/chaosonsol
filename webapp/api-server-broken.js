// Web API Server for Chaos Bot Control Panel
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
// Simplified API server - removed broken imports
const axios = require('axios');

const PORT = process.env.WEB_PORT || 3000;

// Initialize Solana connection
const connection = new Connection(
  process.env.RPC_URL || 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27',
  'confirmed'
);

const config = {
  defaultSlippage: 100,
  priorityFee: 1000,
  maxRetries: 3
};

// Simplified - removed broken trading engines
console.log('✅ API server initialized');

// Helper functions - simplified
const getAllWallets = () => {
  // Load from JSON files directly
  try {
    const volumeWallets = require('../volume-wallets-public.json');
    const pumpWallets = require('../pump-wallets-public.json');
    
    const allWallets = [
      ...(volumeWallets.wallets || []).map(w => ({ ...w, groupName: 'Volume' })),
      ...(pumpWallets.wallets || []).map(w => ({ ...w, groupName: 'Pump' }))
    ];
    return allWallets;
  } catch (error) {
    console.error('Error loading wallets:', error);
    return [];
  }
};

const getSolPrice = async () => {
  try {
    const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL');
    return parseFloat(response.data.data.rates.USD);
  } catch (error) {
    return 0;
  }
};

// API Routes
const apiRoutes = {
  // Dashboard stats
  '/api/stats': async () => {
    const wallets = getAllWallets();
    const solPrice = await getSolPrice();
    
    let totalBalance = 0;
    let activeWallets = 0;
    
    // Sample first 10 wallets to avoid timeout
    const sampleWallets = wallets.slice(0, 10);
    for (const wallet of sampleWallets) {
      try {
        const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
        const solBalance = balance / LAMPORTS_PER_SOL;
        totalBalance += solBalance;
        if (solBalance > 0) activeWallets++;
      } catch (e) {
        console.error('Error getting balance for', wallet.publicKey, e.message);
      }
    }

    return {
      wallets: {
        total: wallets.length,
        active: activeWallets,
        sampled: sampleWallets.length
      },
      balance: {
        sol: totalBalance,
        usd: totalBalance * solPrice
      },
      groups: 2, // Volume and Pump groups
      solPrice: solPrice,
      rpcUrl: connection.rpcEndpoint,
      network: 'mainnet-beta'
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
    return [
      {
        id: 'Volume',
        name: 'Volume Wallets',
        description: 'Volume trading wallets',
        walletCount: getAllWallets().filter(w => w.groupName === 'Volume').length
      },
      {
        id: 'Pump',
        name: 'Pump Wallets', 
        description: 'Pump trading wallets',
        walletCount: getAllWallets().filter(w => w.groupName === 'Pump').length
      }
    ];
  },

  // Volume trading status
  '/api/volume/status': async () => {
    return {
      isActive: groupTradingEngine.isActive || false,
      sessions: groupTradingEngine.activeSessions || [],
      stats: {
        totalTrades: 0,
        successRate: 0,
        totalVolume: 0
      }
    };
  },

  // Smart sell status
  '/api/smartsell/status': async () => {
    return {
      isEnabled: smartSell.isEnabled || false,
      settings: {
        profitTarget: 30,
        stopLoss: -15,
        trailingStop: 10,
        emergencyStop: -25
      },
      activeMonitors: smartSell.activeMonitors || 0
    };
  },

  // Get trading history
  '/api/history': async () => {
    try {
      const historyFile = path.join(__dirname, '..', 'trade-history.json');
      if (fs.existsSync(historyFile)) {
        const data = fs.readFileSync(historyFile, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      return [];
    }
  }
};

// POST API Routes
const apiPostRoutes = {
  // Start volume trading
  '/api/volume/start': async (body) => {
    try {
      const { groupId, tokenAddress, cycles } = body;
      
      if (!groupId || !tokenAddress) {
        return { success: false, error: 'Missing required parameters' };
      }

      // Start volume trading session
      const result = await groupTradingEngine.startVolumeSession(groupId, tokenAddress, {
        cycles: cycles || 10,
        buyAmount: 0.01,
        sellAmount: 0.005
      });

      return { success: true, sessionId: result.sessionId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Stop volume trading
  '/api/volume/stop': async (body) => {
    try {
      await groupTradingEngine.stopAllSessions();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Enable smart sell
  '/api/smartsell/enable': async (body) => {
    try {
      const { tokenAddress, wallets } = body;
      await smartSell.enable(tokenAddress, wallets);
      return { success: true };
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
      const { walletAddress, tokenAddress, action, amount } = body;
      
      if (!walletAddress || !tokenAddress || !action || !amount) {
        return { success: false, error: 'Missing required parameters' };
      }

      // Find wallet
      const allWallets = getAllWallets();
      const wallet = allWallets.find(w => w.publicKey === walletAddress);
      
      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }

      // Execute trade via Jupiter
      const result = action === 'buy' 
        ? await jupiter.swap(wallet.privateKey, 'SOL', tokenAddress, amount)
        : await jupiter.swap(wallet.privateKey, tokenAddress, 'SOL', amount);

      return { success: true, signature: result.signature };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Main server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    if (req.method === 'GET' && apiRoutes[pathname]) {
      try {
        const data = await apiRoutes[pathname]();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    } else if (req.method === 'POST' && apiPostRoutes[pathname]) {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const parsedBody = JSON.parse(body);
          const data = await apiPostRoutes[pathname](parsedBody);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    return;
  }

  // Serve static files
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json'
  };

  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('404 - Page Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n⚡ CHAOS BOT CONTROL PANEL`);
  console.log(`\n🌐 Access at: http://localhost:${PORT}`);
  console.log(`\n📡 API Ready | RPC: ${connection.rpcEndpoint}`);
  console.log(`\n💡 Press Ctrl+C to stop\n`);
});

