// Netlify Function for Complete Wallet Management
import axios from 'axios';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getStore } from '@netlify/blobs';
import bs58 from 'bs58';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

const PROJECT_ROOT = process.env.LAMBDA_TASK_ROOT || process.cwd();
const MAIN_WALLET_FILE = 'wallets-main.json';
const MAIN_WALLET_BLOB_KEY = 'wallets-main';
const isBlobStorageAvailable = Boolean(
  process.env.NETLIFY ||
    process.env.NETLIFY_LOCAL ||
    process.env.NETLIFY_DEV ||
    process.env.NETLIFY_BLOBS_CONTEXT
);

function loadJson(relativePath) {
  try {
    const absolutePath = path.resolve(PROJECT_ROOT, relativePath);
    const raw = readFileSync(absolutePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to load ${relativePath}:`, error.message);
    return { wallets: [] };
  }
}

// Load wallet data
const volumeWallets = loadJson('volume-wallets-public.json');
const pumpWallets = loadJson('pump-wallets-public.json');

// In-memory wallet storage (in production, use a database)
let walletStorage = new Map();
let blobStore = null;
let storageInitPromise = null;
let storageInitialized = false;

function ensureMainWalletFileExists() {
  try {
    const absolutePath = path.resolve(PROJECT_ROOT, MAIN_WALLET_FILE);
    if (!existsSync(absolutePath)) {
      writeFileSync(absolutePath, JSON.stringify({ wallets: [] }, null, 2), 'utf-8');
    }
  } catch (error) {
    console.error('Failed to ensure main wallet file exists:', error.message);
  }
}

async function getBlobStoreInstance() {
  if (!isBlobStorageAvailable) {
    return null;
  }

  if (!blobStore) {
    try {
      blobStore = getStore({ name: 'chaosbot-wallets', consistency: 'strong' });
    } catch (error) {
      console.error('Failed to initialize Netlify Blob store:', error.message);
      blobStore = null;
    }
  }

  return blobStore;
}

async function loadPersistentMainWalletSeed() {
  const store = await getBlobStoreInstance();
  if (store) {
    try {
      const data = await store.get(MAIN_WALLET_BLOB_KEY, { type: 'json' });
      if (data && Array.isArray(data.wallets)) {
        return data;
      }
    } catch (error) {
      console.error('Failed to load wallets from Netlify Blob store:', error.message);
    }
  }

  ensureMainWalletFileExists();
  return loadJson(MAIN_WALLET_FILE);
}

function normalizeWalletRecord(wallet, defaults = {}) {
  const now = new Date().toISOString();
  const address = wallet?.address || wallet?.publicKey || defaults.address || defaults.publicKey || '';
  const publicKey = wallet?.publicKey || wallet?.address || defaults.publicKey || defaults.address || address;

  return {
    id: wallet?.id || defaults.id || publicKey || `wallet_${Date.now()}`,
    name: wallet?.name || defaults.name || 'Wallet',
    address,
    publicKey,
    privateKey: wallet?.privateKey || defaults.privateKey || null,
    group: wallet?.group || defaults.group || 'default',
    groupName: wallet?.groupName || defaults.groupName || wallet?.group || defaults.group || 'default',
    status: wallet?.status || defaults.status || 'active',
    tags: Array.isArray(wallet?.tags) ? wallet.tags : (Array.isArray(defaults.tags) ? defaults.tags : []),
    balance: typeof wallet?.balance === 'number' ? wallet.balance : (typeof defaults.balance === 'number' ? defaults.balance : 0),
    tokenHoldings: typeof wallet?.tokenHoldings === 'number' ? wallet.tokenHoldings : (typeof defaults.tokenHoldings === 'number' ? defaults.tokenHoldings : 0),
    unclaimedRent: typeof wallet?.unclaimedRent === 'number' ? wallet.unclaimedRent : (typeof defaults.unclaimedRent === 'number' ? defaults.unclaimedRent : 0),
    createdAt: wallet?.createdAt || defaults.createdAt || now,
    updatedAt: wallet?.updatedAt || wallet?.createdAt || defaults.updatedAt || defaults.createdAt || now,
    source: wallet?.source || defaults.source || 'main'
  };
}

async function persistMainWallets() {
  const payload = {
    wallets: Array.from(walletStorage.values())
      .filter((wallet) => wallet?.source === 'main')
      .map((wallet) => ({
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey,
        group: wallet.group,
        groupName: wallet.groupName,
        status: wallet.status,
        tags: wallet.tags,
        balance: wallet.balance,
        tokenHoldings: wallet.tokenHoldings,
        unclaimedRent: wallet.unclaimedRent,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
      }))
  };

  const store = await getBlobStoreInstance();
  if (store) {
    try {
      await store.set(MAIN_WALLET_BLOB_KEY, payload, { type: 'json' });
      return;
    } catch (error) {
      console.error('Failed to persist wallets to Netlify Blob store:', error.message);
    }
  }

  try {
    const absolutePath = path.resolve(PROJECT_ROOT, MAIN_WALLET_FILE);
    writeFileSync(absolutePath, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to persist main wallets to filesystem:', error.message);
  }
}

function sanitizeWallet(wallet) {
  if (!wallet || typeof wallet !== 'object') {
    return null;
  }
  const sanitized = { ...wallet };
  // Never expose private keys in API responses
  if (sanitized.privateKey) {
    delete sanitized.privateKey;
  }
  return sanitized;
}

// Initialize wallet storage from persistent sources
async function initializeWalletStorage() {
  walletStorage = new Map();

  if (volumeWallets.wallets) {
    volumeWallets.wallets.forEach((wallet, index) => {
      const record = normalizeWalletRecord(wallet, {
        id: `volume_${index}`,
        name: wallet.name || `Volume_${index + 1}`,
        group: 'Volume',
        groupName: 'Volume',
        source: 'volume'
      });
      walletStorage.set(record.id, record);
    });
  }

  if (pumpWallets.wallets) {
    pumpWallets.wallets.forEach((wallet, index) => {
      const record = normalizeWalletRecord(wallet, {
        id: `pump_${index}`,
        name: wallet.name || `Pump_${index + 1}`,
        group: 'VolumePump',
        groupName: 'VolumePump',
        source: 'pump'
      });
      walletStorage.set(record.id, record);
    });
  }

  try {
    const mainWalletSeed = await loadPersistentMainWalletSeed();
    const rootWallets = Array.isArray(mainWalletSeed.wallets) ? mainWalletSeed.wallets : [];
    rootWallets.forEach((wallet, index) => {
      const record = normalizeWalletRecord(wallet, {
        id: wallet?.id || `wallet_${index}`,
        group: wallet?.group || wallet?.groupName || 'default',
        groupName: wallet?.groupName || wallet?.group || 'default',
        source: 'main'
      });
      walletStorage.set(record.id, record);
    });
  } catch (error) {
    console.error('Failed to load main wallets:', error.message);
  }

  storageInitialized = true;
}

async function ensureWalletStorageInitialized() {
  if (storageInitialized) {
    return;
  }

  if (!storageInitPromise) {
    storageInitPromise = initializeWalletStorage().catch((error) => {
      storageInitialized = false;
      storageInitPromise = null;
      console.error('Failed to initialize wallet storage:', error.message);
      throw error;
    });
  }

  return storageInitPromise;
}

const RPC_URL = process.env.RPC_URL || 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27';
const connection = new Connection(RPC_URL, 'confirmed');

async function getSolPrice() {
  try {
    const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL', {
      timeout: 3000
    });
    const price = Number(response?.data?.data?.rates?.USD);
    return Number.isFinite(price) && price > 0 ? price : 0;
  } catch (error) {
    console.error('SOL price fetch failed:', error.message);
    return 0;
  }
}

async function getAllWalletsWithBalances() {
  await ensureWalletStorageInitialized();
  const wallets = Array.from(walletStorage.values());

  if (wallets.length === 0) {
    return [];
  }

  try {
    const entries = wallets.map((wallet) => {
      const keyString = wallet.publicKey || wallet.address;

      if (!keyString) {
        return { wallet, publicKey: null, keyString: null };
      }

      try {
        const publicKey = new PublicKey(keyString);
        return { wallet, publicKey, keyString: publicKey.toBase58() };
      } catch (error) {
        console.error(`Invalid public key for wallet ${wallet.id || keyString}:`, error.message);
        return { wallet, publicKey: null, keyString: null };
      }
    });

    const publicKeys = entries
      .filter((entry) => entry.publicKey)
      .map((entry) => entry.publicKey);

    const accountsInfoPromise = (async () => {
      if (publicKeys.length === 0) {
        return [];
      }

      try {
        return await connection.getMultipleAccountsInfo(publicKeys, 'confirmed');
      } catch (error) {
        console.error('Error fetching wallet account info:', error.message);
        return new Array(publicKeys.length).fill(null);
      }
    })();

    const solPricePromise = getSolPrice();

    const [accountsInfo, solPrice] = await Promise.all([accountsInfoPromise, solPricePromise]);

    const accountMap = new Map();
    publicKeys.forEach((key, index) => {
      const info = accountsInfo[index] || null;
      accountMap.set(key.toBase58(), info);
    });

    return entries.map((entry) => {
      const accountInfo = entry.keyString ? accountMap.get(entry.keyString) : null;
      const lamports = accountInfo?.lamports ?? 0;
      const balance = lamports / LAMPORTS_PER_SOL;

      return {
        ...entry.wallet,
        balance,
        usdValue: balance * solPrice
      };
    });
  } catch (error) {
    console.error('Error building wallet balances:', error);
    return wallets.map((wallet) => ({
      ...wallet,
      balance: 0,
      usdValue: 0
    }));
  }
}

async function generateWallet(name = null, tags = []) {
  try {
    await ensureWalletStorageInitialized();
    const keypair = Keypair.generate();
    const walletId = `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    const wallet = {
      id: walletId,
      name: name || `Wallet_${walletStorage.size + 1}`,
      address: keypair.publicKey.toString(),
      publicKey: keypair.publicKey.toString(),
      privateKey: bs58.encode(keypair.secretKey),
      group: 'default',
      groupName: 'default',
      status: 'active',
      tags: tags,
      balance: 0,
      tokenHoldings: 0,
      unclaimedRent: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: 'main'
    };
    
    walletStorage.set(walletId, wallet);
    
    return {
      success: true,
      wallet: {
        ...wallet,
        privateKey: wallet.privateKey // Return private key for new wallets
      }
    };
  } catch (error) {
    console.error('Error generating wallet:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function importWallet(privateKey, name = null, tags = []) {
  try {
    await ensureWalletStorageInitialized();
    let secretKey;
    
    // Handle different private key formats
    if (typeof privateKey === 'string') {
      try {
        // Try base58
        secretKey = bs58.decode(privateKey);
      } catch (e) {
        // Try JSON array
        secretKey = new Uint8Array(JSON.parse(privateKey));
      }
    } else if (Array.isArray(privateKey)) {
      secretKey = new Uint8Array(privateKey);
    } else {
      throw new Error('Invalid private key format');
    }
    
    if (secretKey.length !== 64) {
      throw new Error('Invalid private key length');
    }
    
    const keypair = Keypair.fromSecretKey(secretKey);
    const walletId = `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if wallet already exists
    for (const [id, existing] of walletStorage) {
      if (existing.publicKey === keypair.publicKey.toString()) {
        return {
          success: false,
          error: 'Wallet already exists',
          wallet: existing
        };
      }
    }
    
    const timestamp = new Date().toISOString();
    const wallet = {
      id: walletId,
      name: name || `Imported_${walletStorage.size + 1}`,
      address: keypair.publicKey.toString(),
      publicKey: keypair.publicKey.toString(),
      privateKey: bs58.encode(keypair.secretKey),
      group: 'default',
      groupName: 'default',
      status: 'active',
      tags: tags,
      balance: 0,
      tokenHoldings: 0,
      unclaimedRent: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: 'main'
    };
    
    walletStorage.set(walletId, wallet);
    await persistMainWallets();
    
    return {
      success: true,
      wallet: {
        ...wallet,
        privateKey: wallet.privateKey
      }
    };
  } catch (error) {
    console.error('Error importing wallet:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const method = event.httpMethod || 'GET';

    const originalPath =
      typeof event.path === 'string'
        ? event.path
        : (event.rawUrl ? new URL(event.rawUrl).pathname : '');

    const path = (originalPath || '')
      .replace('/.netlify/functions/wallets', '')
      .replace('/wallets', '');

    let body = {};
    if (typeof event.body === 'string' && event.body.trim().length > 0) {
      try {
        body = JSON.parse(event.body);
      } catch (parseError) {
        console.error('Failed to parse request body:', parseError.message);
        body = {};
      }
    }

    await ensureWalletStorageInitialized();

    // GET /wallets - Get all wallets
    if ((path === '' || path === '/') && method === 'GET') {
      const wallets = await getAllWalletsWithBalances();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(wallets)
      };
    }

    // POST /wallets/generate - Generate new wallets
    if ((path === '/generate' || path === 'generate') && method === 'POST') {
      const count = body.count || 1;
      const name = body.name || null;
      const tags = body.tags || [];
      
      const results = [];
      for (let i = 0; i < count; i++) {
        const result = await generateWallet(
          name ? `${name}_${i + 1}` : null,
          tags
        );
        if (result.success) {
          results.push(result.wallet);
        }
      }

      await persistMainWallets();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          count: results.length,
          wallets: results
        })
      };
    }

    // POST /wallets/import - Import wallet
    if ((path === '/import' || path === 'import') && method === 'POST') {
      const result = await importWallet(
        body.privateKey,
        body.name || null,
        body.tags || []
      );
      
      return {
        statusCode: result.success ? 200 : 400,
        headers,
        body: JSON.stringify(result)
      };
    }

    // POST /wallets/deactivate - Deactivate wallets
    if ((path === '/deactivate' || path === 'deactivate') && method === 'POST') {
      const walletIds = body.walletIds || [];
      let deactivated = 0;
      let touchedMainWallet = false;
      
      walletIds.forEach(walletId => {
        const wallet = walletStorage.get(walletId);
        if (wallet) {
          wallet.status = 'inactive';
          wallet.updatedAt = new Date().toISOString();
          walletStorage.set(walletId, wallet);
          deactivated++;
          if (wallet.source === 'main') {
            touchedMainWallet = true;
          }
        }
      });
      
      if (touchedMainWallet) {
        await persistMainWallets();
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          deactivated
        })
      };
    }

    // POST /wallets/activate - Activate wallets
    if ((path === '/activate' || path === 'activate') && method === 'POST') {
      const walletIds = body.walletIds || [];
      let activated = 0;
      let touchedMainWallet = false;
      
      walletIds.forEach(walletId => {
        const wallet = walletStorage.get(walletId);
        if (wallet) {
          wallet.status = 'active';
          wallet.updatedAt = new Date().toISOString();
          walletStorage.set(walletId, wallet);
          activated++;
          if (wallet.source === 'main') {
            touchedMainWallet = true;
          }
        }
      });
      
      if (touchedMainWallet) {
        await persistMainWallets();
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          activated
        })
      };
    }

    // POST /wallets/tag - Tag wallets
    if ((path === '/tag' || path === 'tag') && method === 'POST') {
      const walletIds = body.walletIds || [];
      const tags = body.tags || [];
      let tagged = 0;
      let touchedMainWallet = false;
      
      walletIds.forEach(walletId => {
        const wallet = walletStorage.get(walletId);
        if (wallet) {
          wallet.tags = [...new Set([...wallet.tags, ...tags])];
          wallet.updatedAt = new Date().toISOString();
          walletStorage.set(walletId, wallet);
          tagged++;
          if (wallet.source === 'main') {
            touchedMainWallet = true;
          }
        }
      });
      
      if (touchedMainWallet) {
        await persistMainWallets();
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tagged
        })
      };
    }

    // POST /wallets/group - Group wallets
    if ((path === '/group' || path === 'group') && method === 'POST') {
      const walletIds = body.walletIds || [];
      const groupName = body.groupName || 'default';
      let grouped = 0;
      let touchedMainWallet = false;
      
      walletIds.forEach(walletId => {
        const wallet = walletStorage.get(walletId);
        if (wallet) {
          wallet.group = groupName;
          wallet.groupName = groupName;
          wallet.updatedAt = new Date().toISOString();
          walletStorage.set(walletId, wallet);
          grouped++;
          if (wallet.source === 'main') {
            touchedMainWallet = true;
          }
        }
      });
      
      if (touchedMainWallet) {
        await persistMainWallets();
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          grouped
        })
      };
    }

    // POST /wallets/rename - Rename wallet
    if ((path === '/rename' || path === 'rename') && method === 'POST') {
      const walletId = (body.walletId || '').toString().trim();
      const newName = (body.newName || body.name || '').toString().trim();

      if (!walletId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'WALLET_ID_REQUIRED'
          })
        };
      }

      if (newName.length < 2 || newName.length > 64) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'INVALID_NAME_LENGTH',
            message: 'Name must be between 2 and 64 characters.'
          })
        };
      }

      const wallet = walletStorage.get(walletId);
      if (!wallet) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'WALLET_NOT_FOUND'
          })
        };
      }

      wallet.name = newName;
      wallet.updatedAt = new Date().toISOString();
      walletStorage.set(walletId, wallet);

      if (wallet.source === 'main') {
        await persistMainWallets();
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          wallet: sanitizeWallet(wallet)
        })
      };
    }

    // Default: return all wallets
    const wallets = await getAllWalletsWithBalances();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(wallets)
    };
  } catch (error) {
    console.error('Error in wallets function:', error);
    const fallbackWallets = Array.from(walletStorage.values()).map((wallet) => ({
      ...wallet,
      balance: wallet.balance || 0,
      usdValue: wallet.usdValue || 0
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to process wallet request, returning cached data.',
        wallets: fallbackWallets
      })
    };
  }
};
