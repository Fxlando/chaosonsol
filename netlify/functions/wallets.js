// Netlify Function to get all wallets with balances
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const axios = require('axios');

// Load wallet data (public keys only - safe for deployment)
const volumeWallets = require('../../volume-wallets-public.json');
const pumpWallets = require('../../pump-wallets-public.json');

const RPC_URL = process.env.RPC_URL || 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27';

exports.handler = async (event, context) => {
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

    // Get SOL price
    let solPrice = 180;
    try {
      const priceResp = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL');
      solPrice = parseFloat(priceResp.data.data.rates.USD);
    } catch (e) {}

    // Process volume wallets
    const volumeWalletsWithBalance = await Promise.all(
      (volumeWallets.wallets || []).map(async (wallet) => {
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          return {
            ...wallet,
            groupName: volumeWallets.groupName || 'Volume',
            balance: solBalance,
            usdValue: solBalance * solPrice
          };
        } catch (error) {
          return {
            ...wallet,
            groupName: volumeWallets.groupName || 'Volume',
            balance: 0,
            usdValue: 0,
            error: 'Failed to fetch'
          };
        }
      })
    );

    // Process pump wallets
    const pumpWalletsWithBalance = await Promise.all(
      (pumpWallets.wallets || []).map(async (wallet) => {
        try {
          const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
          const solBalance = balance / LAMPORTS_PER_SOL;
          return {
            ...wallet,
            groupName: pumpWallets.groupName || 'VolumePump',
            balance: solBalance,
            usdValue: solBalance * solPrice
          };
        } catch (error) {
          return {
            ...wallet,
            groupName: pumpWallets.groupName || 'VolumePump',
            balance: 0,
            usdValue: 0,
            error: 'Failed to fetch'
          };
        }
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
      body: JSON.stringify({ error: error.message })
    };
  }
};

