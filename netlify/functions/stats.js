// Netlify Function to get wallet stats
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');

// Load wallet data (public keys only - safe for deployment)
const volumeWallets = require('../../volume-wallets-public.json');
const pumpWallets = require('../../pump-wallets-public.json');

const RPC_URL = process.env.RPC_URL || 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27';

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    
    // Combine all wallets
    const allWallets = [
      ...(volumeWallets.wallets || []),
      ...(pumpWallets.wallets || [])
    ];

    // Get SOL price
    let solPrice = 180; // default
    try {
      const priceResp = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL');
      solPrice = parseFloat(priceResp.data.data.rates.USD);
    } catch (e) {}

    // Fetch balances for all wallets
    let totalBalance = 0;
    let activeWallets = 0;

    for (const wallet of allWallets) {
      try {
        const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
        const solBalance = balance / LAMPORTS_PER_SOL;
        totalBalance += solBalance;
        if (solBalance > 0) activeWallets++;
      } catch (e) {
        console.error(`Error fetching balance for ${wallet.name}:`, e.message);
      }
    }

    const stats = {
      wallets: {
        total: allWallets.length,
        active: activeWallets
      },
      balance: {
        sol: totalBalance,
        usd: totalBalance * solPrice
      },
      groups: 2, // Volume and VolumePump
      solPrice: solPrice,
      rpcUrl: RPC_URL,
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
      body: JSON.stringify({ error: error.message })
    };
  }
};

