// Fixed API Server for Chaos Bot Control Panel
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');

const PORT = process.env.WEB_PORT || 3000;

// Initialize Solana connection
const connection = new Connection(
  process.env.RPC_URL || 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27',
  'confirmed'
);

console.log('✅ Fixed API server initialized');

// Helper functions
const getAllWallets = () => {
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
    return 180; // fallback price
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
      groups: 2,
      solPrice: solPrice,
      rpcUrl: connection.rpcEndpoint,
      network: 'mainnet-beta'
    };
  },

  // Get all wallets with balances
  '/api/wallets': async () => {
    const wallets = getAllWallets();
    const solPrice = await getSolPrice();
    
    // Limit to first 20 wallets to avoid timeout
    const limitedWallets = wallets.slice(0, 20);
    
    const walletsWithBalances = await Promise.all(
      limitedWallets.map(async (wallet) => {
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          return {
            ...wallet,
            balance: solBalance,
            usdValue: solBalance * solPrice,
            lastUpdated: new Date().toISOString()
          };
        } catch (error) {
          return {
            ...wallet,
            balance: 0,
            usdValue: 0,
            lastUpdated: new Date().toISOString(),
            error: 'Failed to fetch balance'
          };
        }
      })
    );

    return {
      wallets: walletsWithBalances,
      total: wallets.length,
      displayed: walletsWithBalances.length,
      solPrice: solPrice
    };
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
      isActive: false,
      sessions: [],
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
      isEnabled: false,
      activeMonitors: [],
      stats: {
        totalSells: 0,
        totalProfit: 0,
        successRate: 0
      }
    };
  }
};

// Create server
const server = http.createServer((req, res) => {
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

  // Handle API routes
  if (apiRoutes[pathname]) {
    apiRoutes[pathname]()
      .then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      })
      .catch(error => {
        console.error('API Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`🌐 Fixed API server running on port ${PORT}`);
  console.log(`📊 Available endpoints:`);
  console.log(`   GET /api/stats`);
  console.log(`   GET /api/wallets`);
  console.log(`   GET /api/groups`);
  console.log(`   GET /api/volume/status`);
  console.log(`   GET /api/smartsell/status`);
});

module.exports = server;
