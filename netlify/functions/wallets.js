// Netlify Function to get all wallets with balances (simplified)
const axios = require('axios');

// Load wallet data
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
    const solPrice = await getSolPrice();

    // Process volume wallets
    const volumeWalletsWithBalance = await Promise.all(
      (volumeWallets.wallets || []).slice(0, 10).map(async (wallet) => {
        const balance = await getBalance(wallet.publicKey);
        return {
          ...wallet,
          groupName: 'Volume',
          balance: balance,
          usdValue: balance * solPrice
        };
      })
    );

    // Process pump wallets
    const pumpWalletsWithBalance = await Promise.all(
      (pumpWallets.wallets || []).slice(0, 10).map(async (wallet) => {
        const balance = await getBalance(wallet.publicKey);
        return {
          ...wallet,
          groupName: 'VolumePump',
          balance: balance,
          usdValue: balance * solPrice
        };
      })
    );

    const allWallets = [...volumeWalletsWithBalance, ...pumpWalletsWithBalance];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(allWallets)
    };
  } catch (error) {
    console.error('Error in wallets function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        message: 'Failed to fetch wallets'
      })
    };
  }
};
