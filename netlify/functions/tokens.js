// Netlify Function to get tokens from user wallets (on-chain data)
const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// Load wallet data
const volumeWallets = require('../../volume-wallets-public.json');
const pumpWallets = require('../../pump-wallets-public.json');

const RPC_URL = 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27';

// Initialize Solana connection
const connection = new Connection(RPC_URL, 'confirmed');

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

    if (allWallets.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          tokens: [],
          message: 'No wallets configured. Add wallets to see tokens.'
        })
      };
    }

    // Get all tokens from all wallets
    const tokenMap = new Map(); // Use map to deduplicate by mint address
    
    // Process wallets (limit to first 20 to avoid timeout)
    const walletsToProcess = allWallets.slice(0, 20);
    
    for (const wallet of walletsToProcess) {
      try {
        const walletAddress = wallet.publicKey || wallet.pubkey || wallet.address;
        if (!walletAddress) continue;

        const publicKey = new PublicKey(walletAddress);
        
        // Get all token accounts for this wallet
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );

        for (const account of tokenAccounts.value) {
          const mint = account.account.data.parsed.info.mint;
          const tokenAmount = account.account.data.parsed.info.tokenAmount;
          
          // Only include tokens with balance > 0
          if (parseFloat(tokenAmount.uiAmountString) > 0) {
            if (!tokenMap.has(mint)) {
              tokenMap.set(mint, {
                mint: mint,
                symbol: mint.substring(0, 8) + '...', // Will be updated with metadata if available
                name: mint.substring(0, 8) + '...',
                decimals: tokenAmount.decimals,
                totalBalance: 0,
                holders: []
              });
            }
            
            const token = tokenMap.get(mint);
            token.totalBalance += parseFloat(tokenAmount.uiAmountString);
            token.holders.push({
              wallet: walletAddress,
              balance: parseFloat(tokenAmount.uiAmountString)
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching tokens for wallet ${wallet.address || wallet.publicKey}:`, error.message);
        // Continue with other wallets
      }
    }

    // Convert map to array and format for frontend
    const tokens = Array.from(tokenMap.values()).map(token => ({
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      balance: token.totalBalance,
      holders: token.holders.length,
      status: 'ACTIVE' // Can be enhanced with more status detection
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        tokens: tokens,
        total: tokens.length
      })
    };
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        tokens: [],
        error: error.message
      })
    };
  }
};

