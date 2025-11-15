/**
 * Pump.Fun Trading Integration
 * Uses the official pumpfun-sdk for bonding curve trading
 */

const { 
  pumpFunBuy,
  pumpFunSell,
  getBuyPriceQuote,
  getCoinData,
  TransactionMode
} = require('pumpfun-sdk');
const { PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

class PumpFunTrading {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      slippage: config.slippage || 2500, // 25% default (in bps) - higher for pump.fun volatility
      priorityFee: config.priorityFee || 5000, // 5k lamports
      maxRetries: config.maxRetries || 3,
      // Use RPC_URL (Shyft) as primary, with proper fallback order
      rpcUrl: process.env.RPC_URL || 
        process.env.RPC_URL_2 || 
        process.env.RPC_URL_3 || 
        'https://api.mainnet-beta.solana.com',
      ...config
    };
  }

  /**
   * Check if a token is a pump.fun token
   */
  async isPumpFunToken(tokenMint) {
    try {
      const mintStr = tokenMint.toString();
      
      // Check if it ends with "pump" pattern
      if (/[a-zA-Z0-9]{4,8}pump$/.test(mintStr)) {
        console.log('🎯 Detected pump.fun token by address pattern');
        return true;
      }
      
      // Try to get coin data from pump.fun
      try {
        const coinData = await getCoinData(mintStr);
        if (coinData && coinData.mint) {
          console.log('🎯 Detected pump.fun token by API data');
          return true;
        }
      } catch (error) {
        // Not found on pump.fun
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get bonding curve PDA for a token
   */
  async getBondingCurveAddress(tokenMint) {
    const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    const [bondingCurve] = await PublicKey.findProgramAddress(
      [
        Buffer.from('bonding-curve'),
        new PublicKey(tokenMint).toBuffer()
      ],
      PUMP_PROGRAM
    );
    return bondingCurve;
  }

  /**
   * Buy tokens on pump.fun bonding curve
   */
  async buyToken(wallet, tokenMint, solAmount, options = {}) {
    try {
      console.log(`\n🚀 Pump.Fun Buy: ${solAmount} SOL for ${tokenMint}`);
      
      // Convert wallet to Keypair if needed
      let keypair;
      if (wallet instanceof Keypair) {
        keypair = wallet;
      } else if (wallet.secretKey) {
        keypair = Keypair.fromSecretKey(
          wallet.secretKey instanceof Uint8Array ? wallet.secretKey : new Uint8Array(wallet.secretKey)
        );
      } else {
        throw new Error('Invalid wallet format');
      }
      
      // Encode the full 64-byte secret key to base58
      // pumpfun-sdk expects the full secret key in base58 format
      const privateKeyBase58 = bs58.encode(keypair.secretKey);
      
      console.log('🔑 Using wallet:', keypair.publicKey.toString());
      console.log('🔍 DEBUG: secretKey length:', keypair.secretKey.length, 'bytes');
      console.log('🔍 DEBUG: privateKey base58 length:', privateKeyBase58.length, 'chars');
      
      // Convert slippage from bps to decimal (e.g., 100 bps -> 0.01)
      const slippageDecimal = (options.slippage || this.config.slippage) / 10000;
      
      // Convert priority fee from lamports to SOL
      const priorityFeeSol = (options.priorityFee || this.config.priorityFee) / 1e9;
      
      console.log(`💰 Amount: ${solAmount} SOL`);
      console.log(`⚙️ Slippage: ${(slippageDecimal * 100).toFixed(2)}%`);
      console.log(`⚡ Priority Fee: ${priorityFeeSol} SOL`);
      
      // Execute buy using SDK (TransactionMode.Execution is required as first param)
      const result = await pumpFunBuy(
        TransactionMode.Execution,
        privateKeyBase58,
        tokenMint.toString(),
        solAmount,
        priorityFeeSol,
        slippageDecimal,
        {
          rpcUrl: this.config.rpcUrl,
          commitment: 'confirmed',
          trackTx: true
        }
      );
      
      console.log(`✅ Pump.Fun buy successful!`);
      console.log(`   Transaction: https://solscan.io/tx/${result.signature}`);
      console.log(`   Tokens received: ${result.expectedOutput || 'Unknown'}`);
      
      return {
        success: true,
        txid: result.signature,
        inputAmount: solAmount,
        outputAmount: result.expectedOutput,
        tokenMint: tokenMint.toString()
      };
      
    } catch (error) {
      console.error(`❌ Pump.Fun buy failed:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sell tokens on pump.fun bonding curve
   */
  async sellToken(wallet, tokenMint, tokenAmount, options = {}) {
    try {
      console.log(`\n💰 Pump.Fun Sell: ${tokenAmount} tokens of ${tokenMint}`);
      
      // Convert wallet to Keypair if needed
      let keypair;
      if (wallet instanceof Keypair) {
        keypair = wallet;
      } else if (wallet.secretKey) {
        keypair = Keypair.fromSecretKey(
          wallet.secretKey instanceof Uint8Array ? wallet.secretKey : new Uint8Array(wallet.secretKey)
        );
      } else {
        throw new Error('Invalid wallet format');
      }
      
      // Convert token amount if it's in human-readable format
      // Pump.fun SDK expects the amount in base units (with decimals)
      let amountInBaseUnits = tokenAmount;
      
      // If amount is less than 1e12, it's likely human-readable format, convert it
      if (tokenAmount < 1e12) {
        try {
          const { PublicKey } = require('@solana/web3.js');
          const { getMint } = require('@solana/spl-token');
          
          const mintPublicKey = new PublicKey(tokenMint);
          const mintInfo = await getMint(this.connection, mintPublicKey);
          const decimals = mintInfo.decimals || 6; // Default to 6 decimals
          
          // Convert human-readable amount to base units
          amountInBaseUnits = Math.floor(tokenAmount * Math.pow(10, decimals));
          console.log(`💰 Converted token amount for pump.fun: ${tokenAmount} → ${amountInBaseUnits} (${decimals} decimals)`);
        } catch (error) {
          console.warn(`⚠️ Could not get mint info for pump.fun sell, assuming 6 decimals:`, error.message);
          // Default to 6 decimals if we can't fetch mint info
          amountInBaseUnits = Math.floor(tokenAmount * 1e6);
        }
      }
      
      // Encode the full 64-byte secret key to base58
      // pumpfun-sdk expects the full secret key in base58 format
      const privateKeyBase58 = bs58.encode(keypair.secretKey);
      
      // Convert slippage: if in percentage (<= 100), convert to decimal; if in bps (> 100), convert to decimal
      let slippageDecimal;
      if (options.slippage) {
        if (options.slippage <= 100) {
          // Percentage format (e.g., 10 = 10%)
          slippageDecimal = options.slippage / 100;
        } else {
          // Basis points format (e.g., 1000 = 10%)
          slippageDecimal = options.slippage / 10000;
        }
      } else {
        slippageDecimal = (this.config.slippage || 1000) / 10000; // Default 10%
      }
      
      // Convert priority fee from lamports to SOL
      const priorityFeeSol = options.priorityFee ? 
        (options.priorityFee > 1e6 ? options.priorityFee / 1e9 : options.priorityFee) : 
        (this.config.priorityFee || 500000) / 1e9;
      
      console.log(`⚙️ Pump.fun sell params: amount=${amountInBaseUnits}, slippage=${slippageDecimal * 100}%, priorityFee=${priorityFeeSol} SOL`);
      
      // Execute sell using SDK (TransactionMode.Execution is required as first param)
      const result = await pumpFunSell(
        TransactionMode.Execution,
        privateKeyBase58,
        tokenMint.toString(),
        amountInBaseUnits,
        priorityFeeSol,
        slippageDecimal,
        {
          rpcUrl: this.config.rpcUrl,
          commitment: 'confirmed',
          trackTx: true
        }
      );
      
      console.log(`✅ Pump.Fun sell successful!`);
      console.log(`   Transaction: https://solscan.io/tx/${result.signature}`);
      console.log(`   SOL received: ${result.expectedOutput || 'Unknown'}`);
      
      return {
        success: true,
        txid: result.signature,
        tokenAmount: tokenAmount,
        outputAmount: result.expectedOutput,
        tokenMint: tokenMint.toString()
      };
      
    } catch (error) {
      console.error(`❌ Pump.Fun sell failed:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get bonding curve info
   */
  async getBondingCurveInfo(tokenMint) {
    try {
      const coinData = await getCoinData(tokenMint.toString());
      
      if (!coinData) {
        return { exists: false };
      }
      
      return {
        exists: true,
        name: coinData.name,
        symbol: coinData.symbol,
        mint: coinData.mint,
        price: coinData.price_sol,
        marketCap: coinData.market_cap
      };
    } catch (error) {
      console.error('Error getting bonding curve info:', error.message);
      return { exists: false, error: error.message };
    }
  }
}

module.exports = PumpFunTrading;
