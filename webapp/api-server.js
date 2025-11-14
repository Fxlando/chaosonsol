// Production-ready API server for Chaos Bot Control Panel
import dotenv from 'dotenv';
import cors from 'cors';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import BlueprintStore from '../src/server/BlueprintStore.js';
import BlueprintExecutor from '../src/server/BlueprintExecutor.js';
import MetadataStore from '../src/storage/MetadataStore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.WEB_PORT) || 3000;
const NETWORK = process.env.NETWORK || 'mainnet-beta';
const STORAGE_SECRET = process.env.CHAOSBOT_STORAGE_SECRET || process.env.STORAGE_SECRET;
const METADATA_BASE_URL = process.env.METADATA_BASE_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const DEBUG_LOG_PATH = path.join(__dirname, 'api-debug.log');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '5mb' }));
app.use((req, _res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});
app.use((err, req, res, next) => {
  if (err) {
    console.error('❌ JSON/body parse error:', err);
    res.status(400).json({
      success: false,
      error: 'Invalid request body',
      details: {
        message: err.message,
        stack: err.stack
      }
    });
  } else {
    next();
  }
});

function normalizeMetadataId(rawId) {
  if (!rawId) return null;
  return String(rawId).replace(/\.json$/i, '');
}

app.get(['/metadata/:id', '/metadata/:id.json'], (req, res) => {
  const id = normalizeMetadataId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, error: 'Invalid metadata id' });
  }
  
  // Check if ID is a mint address (starts with 'mint_' or is a 32-44 char base58 string)
  let record = null;
  if (id.startsWith('mint_')) {
    const mint = id.replace(/^mint_/, '');
    record = metadataStore.getByMint ? metadataStore.getByMint(mint) : null;
  } else if (id.length >= 32 && id.length <= 44 && /^[A-Za-z0-9]+$/.test(id)) {
    // Looks like a mint address, try getByMint
    if (metadataStore.getByMint) {
      record = metadataStore.getByMint(id);
    }
  }
  
  // Fallback to regular ID lookup
  if (!record) {
    record = metadataStore.get(id);
  }
  
  if (!record) {
    return res.status(404).json({ success: false, error: 'Metadata not found' });
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.json(record);
});

let backendPromise = null;
let priceModulePromise = null;
let warnedAboutPlainStorage = false;
const registeredRoutes = new Set();
const metadataStore = new MetadataStore({
  storageDir: resolveProjectPath('.data', 'metadata'),
  baseUrl: METADATA_BASE_URL
});

function buildPumpPortalConfig() {
  const cfg = {};
  const apiKey = process.env.PUMPPORTAL_API_KEY || process.env.PUMP_PORTAL_API_KEY;
  if (apiKey) cfg.apiKey = apiKey;
  if (process.env.PUMPPORTAL_SLIPPAGE) cfg.slippage = Number(process.env.PUMPPORTAL_SLIPPAGE);
  if (process.env.PUMPPORTAL_PRIORITY_FEE) cfg.priorityFee = Number(process.env.PUMPPORTAL_PRIORITY_FEE);
  if (process.env.PUMPPORTAL_POOL) cfg.pool = process.env.PUMPPORTAL_POOL;
  if (process.env.PUMPPORTAL_MAYHEM_MODE) {
    cfg.isMayhemMode = process.env.PUMPPORTAL_MAYHEM_MODE === 'true';
  }
  return cfg;
}

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
        metadataFallback: {
          async save(metadataJson) {
            const saved = metadataStore.save(metadataJson);
            if (!saved.uri) {
              throw new Error('Metadata base URL is not configured (METADATA_BASE_URL)');
            }
            return saved;
          }
        },
        pumpPortal: buildPumpPortalConfig(),
        walletManager: {
          storage: walletStorage
        }
      });

      await appInstance.initialize();
      console.log('✅ Backend application initialized');
      return appInstance;
    })().catch((error) => {
      backendPromise = null;
      console.error('❌ Failed to initialize backend application:', error);
      console.error(error.stack);
      throw error;
    });
  }

  return backendPromise;
}

const blueprintStore = new BlueprintStore();
const blueprintExecutor = new BlueprintExecutor({
  store: blueprintStore,
  loadBackend
});

function createHandler(handler) {
  return async (req, res) => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent && result !== undefined) {
        res.json(result);
      }
    } catch (error) {
      try {
        fs.appendFileSync(DEBUG_LOG_PATH, `[error] ${req.method} ${req.originalUrl} :: ${error?.message || error} ${new Date().toISOString()}\n`);
      } catch (logError) {
        console.error('Failed to write error log:', logError);
      }
      console.error(`API ${req.method} ${req.originalUrl} failed:`, error);
      if (error && error.stack) {
        console.error(error.stack);
      }
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error',
          details: {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            info: error?.info,
            stack: error?.stack
          }
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
  console.time('api:/wallets');
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `[wallets] handler start ${new Date().toISOString()}\n`);
    console.log('[wallets] handler start');
    const backend = await loadBackend();
    fs.appendFileSync(DEBUG_LOG_PATH, `[wallets] backend loaded ${new Date().toISOString()}\n`);
    console.log('[wallets] backend loaded');

    let solPrice;
    try {
      solPrice = await getSolPrice();
      fs.appendFileSync(DEBUG_LOG_PATH, `[wallets] sol price ${solPrice} ${new Date().toISOString()}\n`);
      console.log('[wallets] sol price', solPrice);
    } catch (error) {
      fs.appendFileSync(DEBUG_LOG_PATH, `[wallets] sol price error ${error?.message} ${new Date().toISOString()}\n`);
      console.error('[wallets] sol price error', error);
      throw new Error(`SOL_PRICE: ${error.message}`);
    }

    let wallets;
    try {
      wallets = await backend.getAllWalletsWithBalances();
      fs.appendFileSync(DEBUG_LOG_PATH, `[wallets] wallet count ${wallets.length} ${new Date().toISOString()}\n`);
      console.log('[wallets] wallet count', wallets.length);
    } catch (error) {
      fs.appendFileSync(DEBUG_LOG_PATH, `[wallets] balance error ${error?.message} ${new Date().toISOString()}\n`);
      console.error('[wallets] balance error', error);
      throw new Error(`WALLET_BALANCES: ${error.message}`);
    }

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
  } finally {
    console.timeEnd('api:/wallets');
  }
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

register('post', '/wallets/generate', async (req, res) => {
  const backend = await loadBackend();
  const { count, prefix, tags } = req.body || {};

  const totalToCreate = Number(count);

  if (!Number.isFinite(totalToCreate) || totalToCreate < 1 || totalToCreate > 100) {
    res.status(400);
    return {
      success: false,
      error: 'count must be a number between 1 and 100'
    };
  }

  const tagList = Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim()).slice(0, 10) : [];
  const namePrefix = typeof prefix === 'string' && prefix.trim().length > 0 ? prefix.trim() : null;

  const generated = [];

  for (let i = 0; i < totalToCreate; i += 1) {
    const walletName = namePrefix ? `${namePrefix}_${i + 1}` : null;
    const result = backend.createWallet(walletName, tagList);

    if (!result?.success) {
      throw new Error(result?.error || 'Failed to create wallet');
    }

    generated.push(result.wallet);
  }

  const allWallets = backend.walletManager.getAllWallets();

  return {
    success: true,
    generatedCount: generated.length,
    wallets: generated,
    totals: {
      count: allWallets.length
    }
  };
});

register('post', '/wallets/rename', async (req, res) => {
  const backend = await loadBackend();
  const { walletId, newName } = req.body || {};

  if (!walletId || typeof walletId !== 'string') {
    res.status(400);
    return {
      success: false,
      error: 'walletId is required'
    };
  }

  if (!newName || typeof newName !== 'string') {
    res.status(400);
    return {
      success: false,
      error: 'newName is required'
    };
  }

  const trimmedName = newName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 64) {
    res.status(400);
    return {
      success: false,
      error: 'newName must be between 2 and 64 characters'
    };
  }

  const result = backend.walletManager.updateWalletName(walletId, trimmedName);

  if (!result?.success) {
    res.status(404);
  }

  return result;
});

register('post', '/wallets/:walletId/tags', async (req, res) => {
  const backend = await loadBackend();
  const { walletId } = req.params;
  const { tags } = req.body || {};

  if (!walletId) {
    res.status(400);
    return {
      success: false,
      error: 'walletId is required'
    };
  }

  if (!Array.isArray(tags)) {
    res.status(400);
    return {
      success: false,
      error: 'tags must be an array of strings'
    };
  }

  const cleanedTags = tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);

  const result = backend.walletManager.updateWalletTags(walletId, cleanedTags);

  if (!result?.success) {
    res.status(404);
  }

  return result;
});

register('post', '/wallets/deactivate', async (req, res) => {
  const backend = await loadBackend();
  const { walletIds } = req.body || {};

  if (!Array.isArray(walletIds) || walletIds.length === 0) {
    res.status(400);
    return {
      success: false,
      error: 'walletIds must be a non-empty array'
    };
  }

  const result = backend.walletManager.updateWalletStatuses(walletIds, 'inactive');

  if (!result.success) {
    res.status(400);
  }

  return result;
});

register('post', '/wallets/activate', async (req, res) => {
  const backend = await loadBackend();
  const { walletIds } = req.body || {};

  if (!Array.isArray(walletIds) || walletIds.length === 0) {
    res.status(400);
    return {
      success: false,
      error: 'walletIds must be a non-empty array'
    };
  }

  const result = backend.walletManager.updateWalletStatuses(walletIds, 'active');

  if (!result.success) {
    res.status(400);
  }

  return result;
});

register('post', '/wallets/export', async (req, res) => {
  const backend = await loadBackend();
  const { walletIds, includePrivateKey = true } = req.body || {};

  const walletManager = backend.walletManager;

  if (!walletManager) {
    res.status(500);
    return {
      success: false,
      error: 'Wallet manager unavailable'
    };
  }

  const walletMap = walletManager.wallets;
  if (!walletMap || !(walletMap instanceof Map)) {
    res.status(500);
    return {
      success: false,
      error: 'Wallet storage unavailable'
    };
  }

  let walletsToExport;
  if (Array.isArray(walletIds) && walletIds.length > 0) {
    walletsToExport = walletIds
      .map((id) => (typeof id === 'string' ? walletMap.get(id) : null))
      .filter(Boolean);
  } else {
    walletsToExport = Array.from(walletMap.values());
  }

  const payload = walletsToExport.map((wallet) => {
    const privateKeyArray = Array.isArray(wallet.privateKey) ? wallet.privateKey : null;
    const privateKeyBase58 =
      includePrivateKey && privateKeyArray
        ? bs58.encode(Uint8Array.from(privateKeyArray))
        : null;

    return {
      id: wallet.id,
      name: wallet.name,
      publicKey: wallet.publicKey,
      tags: wallet.tags || [],
      group: wallet.group || wallet.groupName || null,
      createdAt: wallet.createdAt,
      lastUsed: wallet.lastUsed,
      privateKeyArray: includePrivateKey ? privateKeyArray : null,
      privateKeyBase58,
      privateKeyVisible: includePrivateKey && Boolean(privateKeyBase58)
    };
  });

  return {
    success: true,
    wallets: payload,
    count: payload.length
  };
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

register('get', '/blueprints', async () => ({
  success: true,
  blueprints: blueprintStore.listBlueprints()
}));

register('post', '/blueprints', async (req, res) => {
  const payload = req.body || {};

  if (!payload.name || typeof payload.name !== 'string') {
    res.status(400);
    return {
      success: false,
      error: 'name is required'
    };
  }

  const blueprint = blueprintStore.upsertBlueprint(payload);
  return {
    success: true,
    blueprint
  };
});

register('put', '/blueprints/:blueprintId', async (req, res) => {
  const { blueprintId } = req.params;
  const payload = req.body || {};

  const existing = blueprintStore.getBlueprint(blueprintId);
  if (!existing) {
    res.status(404);
    return {
      success: false,
      error: 'Blueprint not found'
    };
  }

  // Merge existing blueprint with updates
  const updated = blueprintStore.upsertBlueprint({
    ...existing,
    ...payload,
    id: blueprintId, // Ensure ID doesn't change
    updatedAt: Date.now()
  });

  return {
    success: true,
    blueprint: updated
  };
});

register('post', '/blueprints/:blueprintId/execute', async (req, res) => {
  const { blueprintId } = req.params;
  const blueprint = blueprintStore.getBlueprint(blueprintId);

  if (!blueprint) {
    res.status(404);
    return {
      success: false,
      error: 'Blueprint not found'
    };
  }

  const run = blueprintStore.createRun(blueprintId, {
    requestedAt: Date.now(),
    requestedBy: req.body?.requestedBy || null
  });

  blueprint.lastRun = run.requestedAt;
  blueprint.stats = blueprint.stats || {};
  blueprint.stats.totalRuns = (blueprint.stats.totalRuns || 0) + 1;
  blueprintStore.upsertBlueprint(blueprint);

  blueprintExecutor.enqueue({
    blueprint,
    runId: run.id
  });

  return {
    success: true,
    run
  };
});

register('get', '/blueprints/:blueprintId/runs', async (req, res) => {
  const { blueprintId } = req.params;
  const blueprint = blueprintStore.getBlueprint(blueprintId);

  if (!blueprint) {
    res.status(404);
    return {
      success: false,
      error: 'Blueprint not found'
    };
  }

  const limit = Math.max(
    1,
    Math.min(100, Number(req.query?.limit) || 20)
  );

  return {
    success: true,
    runs: blueprintStore.listRuns(blueprintId, limit)
  };
});

register('get', '/blueprints/:blueprintId/runs/:runId', async (req, res) => {
  const { blueprintId, runId } = req.params;
  const run = blueprintStore.getRun(runId);

  if (!run || run.blueprintId !== blueprintId) {
    res.status(404);
    return {
      success: false,
      error: 'Run not found'
    };
  }

  return {
    success: true,
    run
  };
});

register('post', '/blueprints/:blueprintId/applied', async (req, res) => {
  const { blueprintId } = req.params;
  const updated = blueprintStore.markApplied(blueprintId);

  if (!updated) {
    res.status(404);
    return {
      success: false,
      error: 'Blueprint not found'
    };
  }

  return {
    success: true,
    blueprint: updated
  };
});

register('delete', '/blueprints/:blueprintId', async (req, res) => {
  const { blueprintId } = req.params;
  const removed = blueprintStore.deleteBlueprint(blueprintId);

  if (!removed) {
    res.status(404);
    return {
      success: false,
      error: 'Blueprint not found'
    };
  }

  return {
    success: true
  };
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

// API endpoint to get config from .env for webapp settings sync
register('get', '/config', async () => {
  const pumpPortalConfig = buildPumpPortalConfig();
  
  // Get dedicated RPCs from .env (with fallbacks)
  const monitoringRpcWs = process.env.MONITORING_RPC_WSS || 
    (process.env.RPC_URL_2 ? process.env.RPC_URL_2.replace('https://', 'wss://').replace('http://', 'ws://') : '');
  const priceRpcHttp = process.env.PRICE_RPC_HTTP || process.env.RPC_URL_2 || '';
  
  return {
    success: true,
    config: {
      solana: {
        rpcHttp: process.env.RPC_URL || '',
        rpcWebsocket: process.env.RPC_URL ? process.env.RPC_URL.replace('https://', 'wss://').replace('http://', 'ws://') : '',
        monitoringRpc: monitoringRpcWs,
        priceRpc: priceRpcHttp,
        priorityFee: process.env.PRIORITY_FEE ? Number(process.env.PRIORITY_FEE) / 1_000_000_000 : 0.0005
      },
      pumpportal: {
        apiKey: pumpPortalConfig.apiKey || '',
        priorityFee: pumpPortalConfig.priorityFee || 0.000001,
        pool: pumpPortalConfig.pool || 'pump'
      },
      shyft: {
        apiKey: '6AC3vTBB5lObDYTm', // Hard-coded default
        enabled: false
      }
    }
  };
});

const STATIC_ROOT = path.join(__dirname);

app.use(
  express.static(STATIC_ROOT, {
    extensions: ['html'],
    index: 'index.html',
    fallthrough: true,
    maxAge: 0
  })
);

app.get('*', (req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }

  const requestPath = req.path || '';
  if (requestPath.startsWith('/api') || requestPath.startsWith('/.netlify/functions')) {
    return next();
  }

  if (requestPath.includes('.')) {
    return next();
  }

  res.sendFile(path.join(STATIC_ROOT, 'index.html'));
});

app.use((err, req, res, next) => {
  if (!err) {
    return next();
  }

  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `[global-error] ${req?.method} ${req?.originalUrl} :: ${err?.message || err} ${new Date().toISOString()}\n`);
  } catch (logError) {
    console.error('Failed to write global error log:', logError);
  }

  console.error('Unhandled error in API server:', err);

  res.status(err.status || 500).json({
    success: false,
    error: err?.message || 'Internal server error',
    details: {
      name: err?.name,
      message: err?.message,
      stack: err?.stack
    }
  });
});

const server = app.listen(PORT, () => {
  console.log(`🌐 Chaos Bot API server running on port ${PORT}`);
  console.log('📡 Registered endpoints:');
  Array.from(registeredRoutes)
    .sort()
    .forEach((route) => console.log(`   ${route}`));
});

export default server;
