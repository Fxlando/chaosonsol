// Fixed API Server for Chaos Bot Control Panel
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
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
  // Return empty array - no fake wallets
  // User must add wallets through the interface
  return [];
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

    return {
      wallets: {
        total: wallets.length,
        active: 0,
        sampled: 0
      },
      balance: {
        sol: 0,
        usd: 0
      },
      groups: 0,
      solPrice: solPrice,
      rpcUrl: connection.rpcEndpoint,
      network: 'mainnet-beta',
      message: 'No wallets configured. Add wallets to get started.'
    };
  },

  // Get all wallets with balances
  '/api/wallets': async () => {
    const wallets = getAllWallets();
    const solPrice = await getSolPrice();

    return {
      wallets: [],
      total: 0,
      displayed: 0,
      solPrice: solPrice,
      message: 'No wallets found. Add wallets to get started.'
    };
  },

  // Get wallet groups
  '/api/groups': async () => {
    return [];
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
  },

  // Get tokens from user wallets (on-chain data)
  '/api/tokens': async (req) => {
    try {
      const wallets = getAllWallets();
      
      if (wallets.length === 0) {
        return {
          tokens: [],
          message: 'No wallets configured. Add wallets to see tokens.'
        };
      }

      // Get all tokens from all wallets
      const tokenMap = new Map(); // Use map to deduplicate by mint address
      
      for (const wallet of wallets) {
        try {
          const walletAddress = wallet.pubkey || wallet.publicKey || wallet.address;
          if (!walletAddress) continue;

          const publicKey = new PublicKey(walletAddress);
          
          // Get all token accounts for this wallet
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            publicKey,
            { programId: TOKEN_PROGRAM_ID }
          );

          for (const account of tokenAccounts.value) {
            const mint = account.account.data.parsed.info.mint;
            const tokenAmount = account.account.data.parsed.info.tokenAmount;
            
            // Only include tokens with balance > 0
            if (parseFloat(tokenAmount.uiAmountString) > 0) {
              if (!tokenMap.has(mint)) {
                tokenMap.set(mint, {
                  mint: mint,
                  symbol: mint.substring(0, 8) + '...', // Will be updated with metadata if available
                  name: mint.substring(0, 8) + '...',
                  decimals: tokenAmount.decimals,
                  totalBalance: 0,
                  holders: []
                });
              }
              
              const token = tokenMap.get(mint);
              token.totalBalance += parseFloat(tokenAmount.uiAmountString);
              token.holders.push({
                wallet: walletAddress,
                balance: parseFloat(tokenAmount.uiAmountString)
              });
            }
          }
        } catch (error) {
          console.error(`Error fetching tokens for wallet ${wallet.address}:`, error.message);
          // Continue with other wallets
        }
      }

      // Convert map to array and format for frontend
      const tokens = Array.from(tokenMap.values()).map(token => ({
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        balance: token.totalBalance,
        holders: token.holders.length,
        status: 'ACTIVE' // Can be enhanced with more status detection
      }));

      return {
        tokens: tokens,
        total: tokens.length
      };
    } catch (error) {
      console.error('Error fetching tokens:', error);
      return {
        tokens: [],
        error: error.message
      };
    }
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
    // Pass req to route handler if it needs request data
    const routeHandler = apiRoutes[pathname];
    Promise.resolve(routeHandler(req))
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
  console.log(`   GET /api/tokens`);
  console.log(`   GET /api/volume/status`);
  console.log(`   GET /api/smartsell/status`);
});

module.exports = server;
