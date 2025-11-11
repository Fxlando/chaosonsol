// Netlify Function to get wallet stats (simplified)
const axios = require('axios');

// Load wallet data (public keys only)
const volumeWallets = require('../../volume-wallets-public.json');
const pumpWallets = require('../../pump-wallets-public.json');

const RPC_URL = 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27';
const LAMPORTS_PER_SOL = 1000000000;

const JUPITER_PRICE_ENDPOINTS = [
  'https://price.jup.ag/v6/price?ids=SOL',
  'https://price.jup.ag/v4/price?ids=SOL'
];

const SOL_PRICE_KEYS = [
  'SOL',
  'So11111111111111111111111111111111111111112'
];

async function getBalance(publicKey) {
  try {
    const response = await axios.post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [publicKey]
    }, {
      timeout: 5000
    });
    
    if (response.data && response.data.result && response.data.result.value !== undefined) {
      return response.data.result.value / LAMPORTS_PER_SOL;
    }
    return 0;
  } catch (error) {
    console.error(`Error fetching balance for ${publicKey}:`, error.message);
    return 0;
  }
}

function extractPriceFromResponse(responseData) {
  if (!responseData || typeof responseData !== 'object') {
    return null;
  }

  const data = responseData.data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  for (const key of SOL_PRICE_KEYS) {
    const entry = data[key];
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    if (entry.price !== undefined) {
      const price = Number(entry.price);
      if (!Number.isNaN(price)) {
        return price;
      }
    }

    if (entry.usd !== undefined) {
      const price = Number(entry.usd);
      if (!Number.isNaN(price)) {
        return price;
      }
    }
  }

  return null;
}

async function getSolPriceFromJupiter() {
  let lastError;

  for (const endpoint of JUPITER_PRICE_ENDPOINTS) {
    try {
      const response = await axios.get(endpoint, {
        timeout: 5000
      });

      const price = extractPriceFromResponse(response.data);
      if (price !== null) {
        return price;
      }

      lastError = new Error(`No SOL price returned from Jupiter endpoint ${endpoint}`);
    } catch (error) {
      lastError = error;
      console.error(`Error fetching SOL price from Jupiter (${endpoint}):`, error.message);
    }
  }

  throw lastError || new Error('Unable to fetch SOL price from Jupiter');
}

async function getSolPriceFromCoinbase() {
  try {
    const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL', {
      timeout: 5000
    });

    if (
      response.data &&
      response.data.data &&
      response.data.data.rates &&
      response.data.data.rates.USD
    ) {
      const price = Number(response.data.data.rates.USD);
      if (!Number.isNaN(price)) {
        return price;
      }
    }

    throw new Error('Invalid response from Coinbase rate endpoint');
  } catch (error) {
    console.error('Error fetching SOL price from Coinbase:', error.message);
    throw error;
  }
}

async function getSolPrice() {
  try {
    const price = await getSolPriceFromJupiter();
    return { price, source: 'jupiter' };
  } catch (jupiterError) {
    console.error('Jupiter price fetch failed, attempting Coinbase fallback:', jupiterError.message);

    const fallbackPrice = await getSolPriceFromCoinbase();
    return { price: fallbackPrice, source: 'coinbase' };
  }
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Combine all wallets
    const allWallets = [
      ...(volumeWallets.wallets || []),
      ...(pumpWallets.wallets || [])
    ];

    // Get SOL price
    const { price: solPrice, source: priceSource } = await getSolPrice();

    // Fetch balances (limit to first 10 to avoid timeout)
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
        evaluated: balances.length
      },
      balance: {
        sol: totalBalance,
        usd: totalBalance * solPrice
      },
      groups: 2,
      solPrice,
      priceSource,
      network: 'mainnet-beta'
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(stats)
    };
  } catch (error) {
    console.error('Error in stats function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        message: 'Failed to fetch stats'
      })
    };
  }
};
