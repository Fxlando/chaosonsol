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

    const app = await getApp();

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
      try {
        const wallets = await app.getAllWalletsWithBalances();
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true, wallets })
        };
      } catch (walletError) {
        console.error('Wallet list error:', walletError);
        return {
          statusCode: 200,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            wallets: [],
            error: walletError.message || 'Unable to load wallets'
          })
        };
      }
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

    if (path === '/tagging/run' && method === 'POST') {
      const result = await app.tagWallets(body || {});
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    // Token launch routes
    if (path === '/tokens/launch' && method === 'POST') {
      const { walletId, metadata, initialBuy, platform, automations, options } = body;

      if (!walletId || !metadata) {
        return {
          statusCode: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'walletId and metadata are required'
          })
        };
      }

      const launchOptions = {
        ...(options || {})
      };

      if (platform) {
        launchOptions.platform = platform;
      }

      if (automations) {
        launchOptions.automations = automations;
      }

      const result = await app.launchToken(
        walletId,
        metadata,
        initialBuy || 0,
        launchOptions
      );

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    if (path === '/tokens/copy' && method === 'POST') {
      const { walletId, sourceMint, options } = body;

      if (!walletId || !sourceMint) {
        return {
          statusCode: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'walletId and sourceMint are required'
          })
        };
      }

      const result = await app.copyToken(walletId, sourceMint, options || {});

      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    if (path === '/tokens/import' && method === 'POST') {
      const { tokenMint, options } = body;

      if (!tokenMint) {
        return {
          statusCode: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'tokenMint is required'
          })
        };
      }

      const result = await app.importToken(tokenMint, options || {});

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
    if (path === '/status' && method === 'GET') {
      const status = app.getStatus();
      const rpcStats = app.getRPCStats();
      return {
        statusCode: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, status, rpcStats })
      };
    }

    // Instant trading status
    if (path === '/instant-trading/status' && method === 'GET') {
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

