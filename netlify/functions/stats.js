// Netlify Function to get wallet stats (simplified)
const axios = require('axios');

// Load wallet data (public keys only)
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

async function getSolPrice() {
  try {
    const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL', {
      timeout: 3000
    });
    return parseFloat(response.data.data.rates.USD);
  } catch (error) {
    console.error('Error fetching SOL price:', error.message);
    return 180; // fallback price
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
    const solPrice = await getSolPrice();

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
