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
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
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
    const path = event.path.replace('/.netlify/functions/api', '');
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : {};

    // Route handling
    if (path === '/health' && method === 'GET') {
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

    if (path === '/initialize' && method === 'POST') {
      const status = app.getStatus();
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, status })
      };
    }

    // Wallet routes
    if (path === '/wallets/create' && method === 'POST') {
      const result = app.createWallet(body.name || null, body.tags || []);
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    if (path === '/wallets' && method === 'GET') {
      const wallets = await app.getAllWalletsWithBalances();
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, wallets })
      };
    }

    // Trading routes
    if (path === '/trading/buy' && method === 'POST') {
      const result = await app.buyToken(body.walletId, body.tokenMint, body.solAmount, body.options || {});
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    if (path === '/trading/sell' && method === 'POST') {
      const result = await app.sellToken(body.walletId, body.tokenMint, body.tokenAmount, body.options || {});
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    // Token launch routes
    if (path === '/tokens/launch' && method === 'POST') {
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

    // Status routes
    if (path === '/status' && method === 'GET') {
      const status = app.getStatus();
      const rpcStats = app.getRPCStats();
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, status, rpcStats })
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

