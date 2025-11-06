/**
 * Netlify Serverless Function - Production API
 * Wraps the new production backend for Netlify deployment
 * 
 * Note: Netlify functions need CommonJS, but we'll use dynamic import for ES modules
 */

let App = null;

// Initialize app (singleton)
let appInstance = null;

async function getApp() {
  if (!App) {
    // Dynamic import for ES modules
    const appModule = await import('../../src/App.js');
    App = appModule.App || appModule.default;
  }
  
  if (!appInstance) {
    appInstance = new App({
      network: process.env.NETWORK || 'mainnet-beta'
    });
    await appInstance.initialize();
  }
  return appInstance;
}

exports.handler = async (event, context) => {
  // Set longer timeout for Netlify functions (up to 10s free tier, 26s pro)
  context.callbackWaitsForEmptyEventLoop = false;
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff'
  };

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const app = await getApp();
    // Handle both /api/* and /.netlify/functions/api/* paths
    let path = event.path.replace('/.netlify/functions/api', '');
    // Also handle /api/* redirects
    if (path.startsWith('/api')) {
      path = path.replace('/api', '');
    }
    // Remove leading slash
    if (path.startsWith('/')) {
      path = path.substring(1);
    }
    // Add leading slash back for consistency
    if (path && !path.startsWith('/')) {
      path = '/' + path;
    }
    if (!path) {
      path = '/';
    }
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    // Route handling
    if ((path === '/health' || path === '/api/health') && method === 'GET') {
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: 'ok', 
          timestamp: new Date().toISOString(),
          network: 'mainnet-beta'
        })
      };
    }

    // Stats route - proxy to stats function or handle directly
    if ((path === '/stats' || path === '/api/stats') && method === 'GET') {
      // Try to use the stats function, but also provide fallback
      try {
        // Import stats function logic (CommonJS context, so use require)
        const axios = require('axios');
        const volumeWallets = require('../../volume-wallets-public.json');
        const pumpWallets = require('../../pump-wallets-public.json');
        
        const RPC_URL = 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27';
        const LAMPORTS_PER_SOL = 1000000000;
        
        async function getBalance(publicKey) {
          try {
            const response = await axios.post(RPC_URL, {
              jsonrpc: '2.0',
              id: 1,
              method: 'getBalance',
              params: [publicKey]
            }, { timeout: 5000 });
            
            if (response.data && response.data.result && response.data.result.value !== undefined) {
              return response.data.result.value / LAMPORTS_PER_SOL;
            }
            return 0;
          } catch (error) {
            return 0;
          }
        }
        
        async function getSolPrice() {
          try {
            const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL', {
              timeout: 3000
            });
            return parseFloat(response.data.data.rates.USD);
          } catch (error) {
            return 180;
          }
        }
        
        const allWallets = [
          ...(volumeWallets.wallets || []),
          ...(pumpWallets.wallets || [])
        ];
        
        const solPrice = await getSolPrice();
        let totalBalance = 0;
        let activeWallets = 0;
        
        const balancePromises = allWallets.slice(0, 10).map(wallet => getBalance(wallet.publicKey));
        const balances = await Promise.all(balancePromises);
        
        balances.forEach(balance => {
          totalBalance += balance;
          if (balance > 0) activeWallets++;
        });
        
        const stats = {
          wallets: {
            total: allWallets.length,
            active: activeWallets,
            sampled: 10
          },
          balance: {
            sol: totalBalance,
            usd: totalBalance * solPrice
          },
          groups: 2,
          solPrice: solPrice,
          network: 'mainnet-beta'
        };
        
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(stats)
        };
      } catch (error) {
        // Fallback stats
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallets: { total: 0, active: 0 },
            balance: { sol: 0, usd: 0 },
            groups: 0,
            solPrice: 180,
            network: 'mainnet-beta'
          })
        };
      }
    }

    if ((path === '/initialize' || path === '/api/initialize') && method === 'POST') {
      const status = app.getStatus();
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, status })
      };
    }

    // Wallet routes - proxy to wallets function or handle directly
    if ((path === '/wallets/create' || path === '/api/wallets/create') && method === 'POST') {
      try {
        // Try to use App class if available
        if (app && typeof app.createWallet === 'function') {
          const result = app.createWallet(body.name || null, body.tags || []);
          return {
            statusCode: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
          };
        }
      } catch (error) {
        console.error('Error using App.createWallet:', error);
      }
      
      // Fallback: return error suggesting to use wallets function
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: false, 
          error: 'Use /.netlify/functions/wallets/generate endpoint',
          message: 'Wallet creation should use the wallets function'
        })
      };
    }

    if ((path === '/wallets' || path === '/api/wallets') && method === 'GET') {
      try {
        // Try to use App class if available
        if (app && typeof app.getAllWalletsWithBalances === 'function') {
          const wallets = await app.getAllWalletsWithBalances();
          return {
            statusCode: 200,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, wallets })
          };
        }
      } catch (error) {
        console.error('Error using App.getAllWalletsWithBalances:', error);
      }
      
      // Fallback: return empty array
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          success: true, 
          wallets: [],
          message: 'Use /.netlify/functions/wallets endpoint for wallet data'
        })
      };
    }

    // Trading routes
    if ((path === '/trading/buy' || path === '/api/trading/buy') && method === 'POST') {
      const result = await app.buyToken(body.walletId, body.tokenMint, body.solAmount, body.options || {});
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    if ((path === '/trading/sell' || path === '/api/trading/sell') && method === 'POST') {
      const result = await app.sellToken(body.walletId, body.tokenMint, body.tokenAmount, body.options || {});
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    // Token launch routes
    if ((path === '/tokens/launch' || path === '/api/tokens/launch') && method === 'POST') {
      const result = await app.launchToken(
        body.walletId,
        body.metadata,
        body.initialBuy || 0,
        body.options || {}
      );
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    // Get tokens from wallets (on-chain data)
    if (path === '/tokens' && method === 'GET') {
      // This will be handled by the tokens.js function
      // But we can also add it here as a fallback
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tokens: [],
          message: 'Use /.netlify/functions/tokens endpoint'
        })
      };
    }

    // Status routes
    if ((path === '/status' || path === '/api/status') && method === 'GET') {
      const status = app.getStatus();
      const rpcStats = app.getRPCStats();
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, status, rpcStats })
      };
    }

    // Instant trading status
    if ((path === '/instant-trading/status' || path === '/api/instant-trading/status') && method === 'GET') {
      // Return status - in production this would connect to the bot instance
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          available: true,
          connected: false,
          isRunning: false,
          currentToken: null,
          message: 'Instant trading system available. Start the bot to activate.',
          stats: {
            totalDetections: 0,
            totalSells: 0,
            successfulSells: 0
          }
        })
      };
    }

    // 404 for unknown routes
    return {
      statusCode: 404,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: 'Route not found' })
    };

  } catch (error) {
    console.error('API Error:', error);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      })
    };
  }
};

