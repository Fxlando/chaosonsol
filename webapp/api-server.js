// Production-ready API server for Chaos Bot Control Panel
require('dotenv').config();
const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

const PORT = Number(process.env.WEB_PORT) || 3000;
const NETWORK = process.env.NETWORK || 'mainnet-beta';
const STORAGE_SECRET = process.env.CHAOSBOT_STORAGE_SECRET || process.env.STORAGE_SECRET;

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '5mb' }));

let backendPromise = null;
let priceModulePromise = null;
let warnedAboutPlainStorage = false;
const registeredRoutes = new Set();

function resolveProjectPath(...segments) {
  return path.join(__dirname, '..', ...segments);
}

function ensureParentDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createEncryptedStorage(filePath, secret) {
  ensureParentDirectory(filePath);

  const key = secret
    ? crypto.createHash('sha256').update(String(secret)).digest()
    : null;

  if (!key && !warnedAboutPlainStorage) {
    warnedAboutPlainStorage = true;
    console.warn('⚠️  CHAOSBOT_STORAGE_SECRET not set. Wallets will be stored in plaintext on disk.');
  }

  const readStore = () => {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw);

      if (!key) {
        return parsed;
      }

      if (parsed && parsed.payload && parsed.iv && parsed.authTag) {
        const iv = Buffer.from(parsed.iv, 'base64');
        const authTag = Buffer.from(parsed.authTag, 'base64');
        const payload = Buffer.from(parsed.payload, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
      }

      // File may have been stored in plaintext before enabling encryption
      return parsed || {};
    } catch (error) {
      console.error('Failed to read wallet storage:', error);
      return {};
    }
  };

  const writeStore = (store) => {
    try {
      if (!key) {
        fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
        return true;
      }

      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.from(JSON.stringify(store), 'utf8');
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
      const authTag = cipher.getAuthTag();

      const payload = {
        version: 1,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        payload: encrypted.toString('base64')
      };

      fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8');
      return true;
    } catch (error) {
      console.error('Failed to write wallet storage:', error);
      return false;
    }
  };

  return {
    get: (keyName) => {
      const store = readStore();
      return Object.prototype.hasOwnProperty.call(store, keyName) ? store[keyName] : null;
    },
    set: (keyName, value) => {
      const store = readStore();
      store[keyName] = value;
      return writeStore(store);
    },
    remove: (keyName) => {
      const store = readStore();
      if (Object.prototype.hasOwnProperty.call(store, keyName)) {
        delete store[keyName];
        return writeStore(store);
      }
      return true;
    }
  };
}

async function loadPriceModule() {
  if (!priceModulePromise) {
    const moduleUrl = pathToFileURL(resolveProjectPath('src', 'utils', 'solPrice.js')).href;
    priceModulePromise = import(moduleUrl);
  }
  return priceModulePromise;
}

async function getSolPrice() {
  const { solPriceCache, getRealSOLPrice } = await loadPriceModule();

  try {
    return await solPriceCache.getPrice();
  } catch (error) {
    console.warn('SOL price cache failed, attempting direct fetch:', error.message);
    try {
      return await getRealSOLPrice();
    } catch (fetchError) {
      console.error('Failed to fetch SOL price:', fetchError.message);
      return 0;
    }
  }
}

async function loadBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      const moduleUrl = pathToFileURL(resolveProjectPath('src', 'App.js')).href;
      const appModule = await import(moduleUrl);
      const AppClass = appModule.App || appModule.default;

      const walletStoragePath = resolveProjectPath('.data', 'wallets.json');
      const walletStorage = createEncryptedStorage(walletStoragePath, STORAGE_SECRET);

      const appInstance = new AppClass({
        network: NETWORK,
        walletManager: {
          storage: walletStorage
        }
      });

      await appInstance.initialize();
      console.log('✅ Backend application initialized');
      return appInstance;
    })().catch((error) => {
      backendPromise = null;
      throw error;
    });
  }

  return backendPromise;
}

function createHandler(handler) {
  return async (req, res) => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent && result !== undefined) {
        res.json(result);
      }
    } catch (error) {
      console.error(`API ${req.method} ${req.originalUrl} failed:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error'
        });
      }
    }
  };
}

function register(method, route, handler) {
  const wrapped = createHandler(handler);
  app[method](route, wrapped);
  registeredRoutes.add(`${method.toUpperCase()} ${route}`);

  if (!route.startsWith('/api')) {
    const apiRoute = route === '/' ? '/api' : `/api${route}`;
    app[method](apiRoute, wrapped);
    registeredRoutes.add(`${method.toUpperCase()} ${apiRoute}`);
  }
}

register('get', '/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  network: NETWORK
}));

register('post', '/initialize', async () => {
  const backend = await loadBackend();
  return {
    success: true,
    status: backend.getStatus()
  };
});

register('get', '/status', async () => {
  const backend = await loadBackend();
  return {
    success: true,
    status: backend.getStatus(),
    rpc: backend.getRPCStats()
  };
});

register('get', '/wallets', async () => {
  const backend = await loadBackend();
  const solPrice = await getSolPrice();
  const wallets = await backend.getAllWalletsWithBalances();

  const enriched = wallets.map((wallet) => {
    const balance = Number(wallet.balance || 0);
    return {
      ...wallet,
      balance,
      usdValue: solPrice > 0 ? balance * solPrice : 0
    };
  });

  const totalSol = enriched.reduce((sum, wallet) => sum + (wallet.balance || 0), 0);

  return {
    success: true,
    wallets: enriched,
    totals: {
      count: enriched.length,
      sol: totalSol,
      usd: solPrice > 0 ? totalSol * solPrice : 0
    },
    solPrice,
    network: NETWORK
  };
});

register('get', '/wallets/:walletId', async (req, res) => {
  const backend = await loadBackend();
  const { walletId } = req.params;
  const wallet = backend.walletManager.getWallet(walletId);

  if (!wallet) {
    res.status(404);
    return {
      success: false,
      error: 'Wallet not found'
    };
  }

  const solPrice = await getSolPrice();
  const balanceInfo = await backend.walletManager.getWalletBalance(walletId);
  const balance = balanceInfo.success ? Number(balanceInfo.balance || 0) : 0;

  return {
    success: true,
    wallet: {
      ...wallet,
      balance,
      usdValue: solPrice > 0 ? balance * solPrice : 0
    }
  };
});

register('post', '/wallets/create', async (req, res) => {
  const backend = await loadBackend();
  const { name, tags } = req.body || {};
  const result = backend.createWallet(name || null, Array.isArray(tags) ? tags : []);

  if (!result.success) {
    res.status(400);
  }

  return result;
});

register('post', '/wallets/import', async (req, res) => {
  const backend = await loadBackend();
  const { privateKey, name, tags } = req.body || {};

  if (!privateKey) {
    res.status(400);
    return {
      success: false,
      error: 'privateKey is required'
    };
  }

  const result = backend.importWallet(privateKey, name || null, Array.isArray(tags) ? tags : []);

  if (!result.success) {
    res.status(400);
  }

  return result;
});

register('delete', '/wallets/:walletId', async (req, res) => {
  const backend = await loadBackend();
  const { walletId } = req.params;
  const result = backend.walletManager.deleteWallet(walletId);

  if (!result.success) {
    res.status(404);
  }

  return result;
});

register('get', '/tokens', async () => {
  const backend = await loadBackend();
  const connection = backend.solanaCore.getConnection();
  const wallets = backend.walletManager.getAllWallets();

  if (!wallets.length) {
    return {
      success: true,
      tokens: [],
      total: 0,
      message: 'No wallets configured'
    };
  }

  const tokenMap = new Map();

  for (const wallet of wallets) {
    try {
      const owner = new PublicKey(wallet.publicKey);
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID
      });

      for (const account of accounts.value) {
        const parsed = account.account.data.parsed.info;
        const tokenMint = parsed.mint;
        const amountInfo = parsed.tokenAmount;
        const balance = Number(amountInfo.uiAmount || 0);

        if (!Number.isFinite(balance) || balance <= 0) {
          continue;
        }

        if (!tokenMap.has(tokenMint)) {
          tokenMap.set(tokenMint, {
            mint: tokenMint,
            name: tokenMint.slice(0, 8),
            symbol: tokenMint.slice(0, 4),
            decimals: amountInfo.decimals,
            totalBalance: 0,
            holders: []
          });
        }

        const token = tokenMap.get(tokenMint);
        token.totalBalance += balance;
        token.holders.push({
          walletId: wallet.id,
          publicKey: wallet.publicKey,
          balance
        });
      }
    } catch (error) {
      console.error(`Failed to load tokens for wallet ${wallet.publicKey}:`, error.message);
    }
  }

  const tokens = Array.from(tokenMap.values()).map((token) => ({
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    balance: token.totalBalance,
    holders: token.holders.length
  }));

  return {
    success: true,
    tokens,
    total: tokens.length
  };
});

register('post', '/trading/buy', async (req, res) => {
  const backend = await loadBackend();
  const { walletId, tokenMint, solAmount, options } = req.body || {};

  if (!walletId || !tokenMint || !solAmount) {
    res.status(400);
    return {
      success: false,
      error: 'walletId, tokenMint, and solAmount are required'
    };
  }

  return backend.buyToken(walletId, tokenMint, Number(solAmount), options || {});
});

register('post', '/trading/sell', async (req, res) => {
  const backend = await loadBackend();
  const { walletId, tokenMint, tokenAmount, options } = req.body || {};

  if (!walletId || !tokenMint || !tokenAmount) {
    res.status(400);
    return {
      success: false,
      error: 'walletId, tokenMint, and tokenAmount are required'
    };
  }

  return backend.sellToken(walletId, tokenMint, Number(tokenAmount), options || {});
});

register('post', '/trading/swap', async (req, res) => {
  const backend = await loadBackend();
  const { walletId, inputMint, outputMint, inputAmount, options } = req.body || {};

  if (!walletId || !inputMint || !outputMint || !inputAmount) {
    res.status(400);
    return {
      success: false,
      error: 'walletId, inputMint, outputMint, and inputAmount are required'
    };
  }

  return backend.tradingEngine.swapTokens(
    walletId,
    inputMint,
    outputMint,
    Number(inputAmount),
    options || {}
  );
});

register('get', '/trading/quote', async (req, res) => {
  const backend = await loadBackend();
  const { inputMint, outputMint, amount } = req.query;

  if (!inputMint || !outputMint || !amount) {
    res.status(400);
    return {
      success: false,
      error: 'inputMint, outputMint, and amount are required'
    };
  }

  return backend.getQuote(inputMint, outputMint, Number(amount));
});

register('get', '/trading/price/:mint', async (req, res) => {
  const backend = await loadBackend();
  const { mint } = req.params;

  if (!mint) {
    res.status(400);
    return {
      success: false,
      error: 'Token mint is required'
    };
  }

  return backend.getTokenPrice(mint);
});

register('post', '/tokens/launch', async (req, res) => {
  const backend = await loadBackend();
  const { walletId, metadata, initialBuy, options } = req.body || {};

  if (!walletId || !metadata) {
    res.status(400);
    return {
      success: false,
      error: 'walletId and metadata are required'
    };
  }

  return backend.launchToken(walletId, metadata, Number(initialBuy || 0), options || {});
});

register('post', '/tokens/create', async (req, res) => {
  const backend = await loadBackend();
  const { walletId, metadata, options } = req.body || {};

  if (!walletId || !metadata) {
    res.status(400);
    return {
      success: false,
      error: 'walletId and metadata are required'
    };
  }

  return backend.createToken(walletId, metadata, options || {});
});

register('post', '/tokens/copy', async (req, res) => {
  const backend = await loadBackend();
  const { walletId, sourceMint, options } = req.body || {};

  if (!walletId || !sourceMint) {
    res.status(400);
    return {
      success: false,
      error: 'walletId and sourceMint are required'
    };
  }

  return backend.copyToken(walletId, sourceMint, options || {});
});

register('post', '/tokens/import', async (req, res) => {
  const backend = await loadBackend();
  const { tokenMint, options } = req.body || {};

  if (!tokenMint) {
    res.status(400);
    return {
      success: false,
      error: 'tokenMint is required'
    };
  }

  return backend.importToken(tokenMint, options || {});
});

register('post', '/tagging/run', async (req) => {
  const backend = await loadBackend();
  return backend.tagWallets(req.body || {});
});

register('post', '/warm/run', async (req) => {
  const backend = await loadBackend();
  return backend.warmWallets(req.body || {});
});

register('post', '/smartsell/add', async (req, res) => {
  const backend = await loadBackend();
  const { walletId, tokenMint, entryPrice, amount, options } = req.body || {};

  if (!walletId || !tokenMint || !entryPrice || !amount) {
    res.status(400);
    return {
      success: false,
      error: 'walletId, tokenMint, entryPrice, and amount are required'
    };
  }

  return backend.addSmartSellPosition(
    walletId,
    tokenMint,
    Number(entryPrice),
    Number(amount),
    options || {}
  );
});

register('get', '/smartsell/positions', async () => {
  const backend = await loadBackend();
  const positions = Array.from(backend.smartSell.monitoring.values());
  return {
    success: true,
    positions
  };
});

register('delete', '/smartsell/positions/:walletId/:tokenMint', async (req) => {
  const backend = await loadBackend();
  const { walletId, tokenMint } = req.params;
  return backend.smartSell.removePosition(walletId, tokenMint);
});

register('get', '/smartsell/status', async () => {
  const backend = await loadBackend();
  return {
    success: true,
    enabled: backend.smartSell.config.enabled,
    monitoring: backend.smartSell.monitoring.size
  };
});

register('post', '/volumebot/start', async (req, res) => {
  const backend = await loadBackend();
  const { walletIds, tokenMint, config } = req.body || {};

  if (!Array.isArray(walletIds) || !walletIds.length || !tokenMint) {
    res.status(400);
    return {
      success: false,
      error: 'walletIds (array) and tokenMint are required'
    };
  }

  return backend.startVolumeSession(walletIds, tokenMint, config || {});
});

register('get', '/volumebot/sessions', async () => {
  const backend = await loadBackend();
  return {
    success: true,
    sessions: backend.volumeBot.getAllSessions()
  };
});

register('post', '/volumebot/stop/:sessionId', async (req, res) => {
  const backend = await loadBackend();
  const { sessionId } = req.params;
  const result = backend.volumeBot.stopSession(sessionId);

  if (!result.success) {
    res.status(404);
  }

  return result;
});

register('get', '/volume/status', async () => {
  const backend = await loadBackend();
  const sessions = backend.volumeBot.getAllSessions();
  const active = sessions.filter((session) => session.isActive);

  return {
    success: true,
    isActive: active.length > 0,
    sessions,
    stats: {
      active: active.length,
      total: sessions.length
    }
  };
});

register('get', '/pumpfun/token/:mint', async (req, res) => {
  const backend = await loadBackend();
  const { mint } = req.params;

  if (!mint) {
    res.status(400);
    return {
      success: false,
      error: 'Token mint is required'
    };
  }

  return backend.tradingEngine.pumpFun.getTokenInfo(mint);
});

register('get', '/pumpfun/trending', async (req) => {
  const backend = await loadBackend();
  const limit = Number(req.query.limit || 20);
  return backend.tradingEngine.pumpFun.getTrendingTokens(limit);
});

register('get', '/jupiter/tokens', async () => {
  const backend = await loadBackend();
  return backend.tradingEngine.jupiter.getTokenList();
});

register('get', '/stats', async () => {
  const backend = await loadBackend();
  const solPrice = await getSolPrice();
  const wallets = await backend.getAllWalletsWithBalances();
  const balanceSol = wallets.reduce((sum, wallet) => sum + (wallet.balance || 0), 0);
  const activeWallets = wallets.filter((wallet) => (wallet.balance || 0) > 0).length;

  return {
    success: true,
    wallets: {
      total: wallets.length,
      active: activeWallets,
      evaluated: wallets.length
    },
    balance: {
      sol: balanceSol,
      usd: solPrice > 0 ? balanceSol * solPrice : 0
    },
    solPrice,
    rpc: backend.getRPCStats(),
    network: NETWORK
  };
});

const server = app.listen(PORT, () => {
  console.log(`🌐 Chaos Bot API server running on port ${PORT}`);
  console.log('📡 Registered endpoints:');
  Array.from(registeredRoutes)
    .sort()
    .forEach((route) => console.log(`   ${route}`));
});

module.exports = server;
