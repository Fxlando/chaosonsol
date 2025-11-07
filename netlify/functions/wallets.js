// Netlify Function for Complete Wallet Management
import axios from 'axios';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import { readFileSync } from 'fs';
import path from 'path';

const PROJECT_ROOT = process.env.LAMBDA_TASK_ROOT || process.cwd();

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

// Initialize wallet storage from JSON files
function initializeWalletStorage() {
  if (volumeWallets.wallets) {
    volumeWallets.wallets.forEach((wallet, index) => {
      const walletId = `volume_${index}`;
      walletStorage.set(walletId, {
        id: walletId,
        name: wallet.name || `Volume_${index + 1}`,
        address: wallet.publicKey,
        publicKey: wallet.publicKey,
        group: 'Volume',
        groupName: 'Volume',
        status: 'active',
        tags: [],
        balance: 0,
        tokenHoldings: 0,
        unclaimedRent: 0,
        createdAt: new Date().toISOString()
      });
    });
  }
  
  if (pumpWallets.wallets) {
    pumpWallets.wallets.forEach((wallet, index) => {
      const walletId = `pump_${index}`;
      walletStorage.set(walletId, {
        id: walletId,
        name: wallet.name || `Pump_${index + 1}`,
        address: wallet.publicKey,
        publicKey: wallet.publicKey,
        group: 'VolumePump',
        groupName: 'VolumePump',
        status: 'active',
        tags: [],
        balance: 0,
        tokenHoldings: 0,
        unclaimedRent: 0,
        createdAt: new Date().toISOString()
      });
    });
  }
}

// Initialize on module load
initializeWalletStorage();

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
    const keypair = Keypair.generate();
    const walletId = `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
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
      createdAt: new Date().toISOString()
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
      createdAt: new Date().toISOString()
    };
    
    walletStorage.set(walletId, wallet);
    
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
      
      walletIds.forEach(walletId => {
        const wallet = walletStorage.get(walletId);
        if (wallet) {
          wallet.status = 'inactive';
          walletStorage.set(walletId, wallet);
          deactivated++;
        }
      });
      
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
      
      walletIds.forEach(walletId => {
        const wallet = walletStorage.get(walletId);
        if (wallet) {
          wallet.status = 'active';
          walletStorage.set(walletId, wallet);
          activated++;
        }
      });
      
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
      
      walletIds.forEach(walletId => {
        const wallet = walletStorage.get(walletId);
        if (wallet) {
          wallet.tags = [...new Set([...wallet.tags, ...tags])];
          walletStorage.set(walletId, wallet);
          tagged++;
        }
      });
      
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
      
      walletIds.forEach(walletId => {
        const wallet = walletStorage.get(walletId);
        if (wallet) {
          wallet.group = groupName;
          wallet.groupName = groupName;
          walletStorage.set(walletId, wallet);
          grouped++;
        }
      });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          grouped
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
