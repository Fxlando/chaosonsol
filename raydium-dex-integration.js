/**
 * Raydium DEX Integration
 * Direct integration with Raydium AMM for trading
 */

const { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const axios = require('axios');
const RateLimitManager = require('./rate-limit-manager');
const smartCacheManager = require('./smart-cache-manager');

class RaydiumDEXIntegration {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      slippage: config.slippage || 100, // 1% slippage
      priorityFee: config.priorityFee || 1000, // 1k lamports
      maxRetries: config.maxRetries || 3,
      ...config
    };
    
    this.rateLimitManager = new RateLimitManager();
    
    // Raydium program IDs
    this.RAYDIUM_AMM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
    this.RAYDIUM_LIQUIDITY_POOL_V4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
    this.RAYDIUM_LIQUIDITY_POOL_V5 = new PublicKey('5quBtoiQqxF9Jv6KYKctB59NT3gtJDz6E1Yj7b3kh8WA');
    
    // Token mints
    this.RAY_MINT = new PublicKey('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R');
    this.SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    this.USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    
    // API endpoints
    this.RAYDIUM_API_BASE = 'https://api.raydium.io/v2';
    this.RAYDIUM_POOLS_API = 'https://api.raydium.io/v2/sdk/liquidity/mainnet.json';
  }

  /**
   * Get all available pools from Raydium
   */
  async getPools() {
    const cacheKey = 'raydium_pools';
    
    return await smartCacheManager.getOrFetch('raydium-pools', cacheKey, async () => {
      return await this.rateLimitManager.makeRequest('raydium-api', async () => {
        try {
          const response = await axios.get(this.RAYDIUM_POOLS_API);
          return response.data;
        } catch (error) {
          console.error('❌ Error fetching Raydium pools:', error.message);
          throw error;
        }
      });
    });
  }

  /**
   * Find pool for token pair
   */
  async findPool(tokenA, tokenB) {
    try {
      const pools = await this.getPools();
      
      // Find pool with both tokens
      const pool = pools.find(p => 
        (p.baseMint === tokenA && p.quoteMint === tokenB) ||
        (p.baseMint === tokenB && p.quoteMint === tokenA)
      );
      
      if (!pool) {
        throw new Error(`No Raydium pool found for ${tokenA}/${tokenB}`);
      }
      
      return pool;
    } catch (error) {
      console.error('❌ Error finding Raydium pool:', error.message);
      throw error;
    }
  }

  /**
   * Get pool information
   */
  async getPoolInfo(poolId) {
    const cacheKey = `raydium_pool_${poolId}`;
    
    return await smartCacheManager.getOrFetch('raydium-pool', cacheKey, async () => {
      return await this.rateLimitManager.makeRequest('raydium-api', async () => {
        try {
          const response = await axios.get(`${this.RAYDIUM_API_BASE}/pool/${poolId}`);
          return response.data;
        } catch (error) {
          console.error('❌ Error fetching pool info:', error.message);
          throw error;
        }
      });
    });
  }

  /**
   * Get quote for swap
   */
  async getQuote(inputMint, outputMint, amount, slippage = null) {
    try {
      const pool = await this.findPool(inputMint, outputMint);
      const poolInfo = await this.getPoolInfo(pool.id);
      
      // Calculate swap amount based on pool reserves
      const inputReserve = poolInfo.baseReserve;
      const outputReserve = poolInfo.quoteReserve;
      
      if (inputMint === pool.baseMint) {
        // Swapping base to quote
        const outputAmount = this.calculateSwapOutput(amount, inputReserve, outputReserve);
        const priceImpact = this.calculatePriceImpact(amount, inputReserve, outputReserve);
        
        return {
          inputMint,
          outputMint,
          inAmount: amount.toString(),
          outAmount: outputAmount.toString(),
          priceImpactPct: priceImpact,
          poolId: pool.id,
          poolInfo
        };
      } else {
        // Swapping quote to base
        const outputAmount = this.calculateSwapOutput(amount, outputReserve, inputReserve);
        const priceImpact = this.calculatePriceImpact(amount, outputReserve, inputReserve);
        
        return {
          inputMint,
          outputMint,
          inAmount: amount.toString(),
          outAmount: outputAmount.toString(),
          priceImpactPct: priceImpact,
          poolId: pool.id,
          poolInfo
        };
      }
    } catch (error) {
      console.error('❌ Error getting Raydium quote:', error.message);
      throw error;
    }
  }

  /**
   * Calculate swap output using constant product formula
   */
  calculateSwapOutput(inputAmount, inputReserve, outputReserve) {
    // AMM formula: output = (input * outputReserve) / (inputReserve + input)
    const numerator = BigInt(inputAmount) * BigInt(outputReserve);
    const denominator = BigInt(inputReserve) + BigInt(inputAmount);
    return numerator / denominator;
  }

  /**
   * Calculate price impact
   */
  calculatePriceImpact(inputAmount, inputReserve, outputReserve) {
    const outputAmount = this.calculateSwapOutput(inputAmount, inputReserve, outputReserve);
    const spotPrice = Number(outputReserve) / Number(inputReserve);
    const effectivePrice = Number(outputAmount) / Number(inputAmount);
    return ((effectivePrice - spotPrice) / spotPrice) * 100;
  }

  /**
   * Execute swap on Raydium
   */
  async executeSwap(wallet, inputMint, outputMint, amount, options = {}) {
    let retries = 0;
    const maxRetries = options.maxRetries || this.config.maxRetries;

    while (retries < maxRetries) {
      try {
        console.log(`🔄 Raydium swap: ${amount} ${inputMint} → ${outputMint}`);
        
        // Get quote
        const quote = await this.getQuote(
          inputMint, 
          outputMint, 
          amount, 
          options.slippage
        );

        console.log(`💱 Raydium Quote: ${quote.inAmount} → ${quote.outAmount} (${quote.priceImpactPct.toFixed(2)}% impact)`);

        // Create swap transaction
        const transaction = await this.createSwapTransaction(
          wallet,
          quote,
          options
        );

        // Sign and send transaction
        transaction.sign(wallet);
        
        const signature = await this.connection.sendRawTransaction(
          transaction.serialize(),
          { 
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
          }
        );

        // Confirm transaction
        const confirmation = await this.connection.confirmTransaction(
          signature,
          'confirmed'
        );

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log(`✅ Raydium swap successful: ${signature}`);

        return {
          signature,
          quote,
          success: true,
          inAmount: quote.inAmount,
          outAmount: quote.outAmount,
          priceImpact: quote.priceImpactPct
        };

      } catch (error) {
        retries++;
        console.error(`❌ Raydium swap attempt ${retries}/${maxRetries} failed:`, error.message);
        
        if (retries >= maxRetries) {
          throw new Error(`Raydium swap failed after ${maxRetries} retries: ${error.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }

  /**
   * Create swap transaction
   */
  async createSwapTransaction(wallet, quote, options = {}) {
    const transaction = new Transaction();
    
    // Get token accounts
    const inputTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(quote.inputMint),
      wallet.publicKey
    );
    
    const outputTokenAccount = await getAssociatedTokenAddress(
      new PublicKey(quote.outputMint),
      wallet.publicKey
    );

    // Check if output token account exists, create if not
    try {
      await this.connection.getAccountInfo(outputTokenAccount);
    } catch (error) {
      // Create associated token account
      const createATAInstruction = createAssociatedTokenAccountInstruction(
        wallet.publicKey, // payer
        outputTokenAccount, // ata
        wallet.publicKey, // owner
        new PublicKey(quote.outputMint) // mint
      );
      transaction.add(createATAInstruction);
    }

    // Add swap instruction (simplified - would need actual Raydium instruction)
    // This is a placeholder - real implementation would use Raydium's swap instruction
    const swapInstruction = this.createSwapInstruction(
      wallet.publicKey,
      inputTokenAccount,
      outputTokenAccount,
      quote,
      options
    );
    
    transaction.add(swapInstruction);

    // Set recent blockhash
    const { blockhash } = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    return transaction;
  }

  /**
   * Create swap instruction (placeholder - needs actual Raydium instruction)
   */
  createSwapInstruction(wallet, inputTokenAccount, outputTokenAccount, quote, options) {
    // This is a simplified placeholder
    // Real implementation would create the actual Raydium swap instruction
    // using the Raydium program's swap instruction format
    
    console.log('⚠️ Raydium swap instruction creation - placeholder implementation');
    console.log('   Real implementation would use Raydium program instructions');
    
    // For now, return a simple transfer instruction as placeholder
    return SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: wallet.publicKey, // Placeholder
      lamports: 0
    });
  }

  /**
   * Buy token with SOL
   */
  async buyToken(wallet, tokenMint, solAmount, options = {}) {
    const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
    const result = await this.executeSwap(
      wallet,
      this.SOL_MINT.toString(),
      tokenMint,
      lamports,
      options
    );

    // Log trade for P&L tracking
    if (result && result.success) {
      try {
        const tradeTracker = require('./trade-tracker');
        tradeTracker.recordBuy({
          wallet: wallet.publicKey.toString(),
          tokenMint: tokenMint,
          solAmount: solAmount,
          tokensReceived: parseFloat(result.outAmount) / 1e6, // Assume 6 decimals
          txSignature: result.signature,
          source: options.source || 'raydium',
          session: options.session || null
        });
      } catch (trackError) {
        console.log('⚠️ Failed to track buy trade:', trackError.message);
      }
    }

    return result;
  }

  /**
   * Sell token for SOL
   */
  async sellToken(wallet, tokenMint, tokenAmount, options = {}) {
    const result = await this.executeSwap(
      wallet,
      tokenMint,
      this.SOL_MINT.toString(),
      tokenAmount,
      options
    );

    // Log trade for P&L tracking
    if (result && result.success) {
      try {
        const tradeTracker = require('./trade-tracker');
        const axios = require('axios');
        
        // Get current SOL price for USD conversion
        let solPriceUSD = 187; // Default fallback
        try {
          const priceResponse = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL');
          solPriceUSD = parseFloat(priceResponse.data.data.rates.USD);
        } catch (e) {
          // Use fallback price
        }

        tradeTracker.recordSell({
          wallet: wallet.publicKey.toString(),
          tokenMint: tokenMint,
          tokensSold: tokenAmount / 1e6, // Convert from lamports
          solReceived: parseFloat(result.outAmount) / LAMPORTS_PER_SOL,
          txSignature: result.signature,
          source: options.source || 'raydium',
          session: options.session || null,
          solPriceUSD: solPriceUSD
        });
      } catch (trackError) {
        console.log('⚠️ Failed to track sell trade:', trackError.message);
      }
    }

    return result;
  }

  /**
   * Get token price in SOL
   */
  async getTokenPrice(tokenMint, amount = LAMPORTS_PER_SOL) {
    const cacheKey = `raydium_price_${tokenMint}_${amount}`;
    
    return await smartCacheManager.getOrFetch('raydium-price', cacheKey, async () => {
      try {
        const quote = await this.getQuote(this.SOL_MINT.toString(), tokenMint, amount);
        return {
          price: parseFloat(quote.outAmount) / amount,
          formatted: `${(parseFloat(quote.outAmount) / amount).toFixed(8)} tokens per SOL`,
          impact: quote.priceImpactPct
        };
      } catch (error) {
        throw new Error(`Failed to get token price: ${error.message}`);
      }
    });
  }

  /**
   * Get pool liquidity information
   */
  async getPoolLiquidity(poolId) {
    try {
      const poolInfo = await this.getPoolInfo(poolId);
      return {
        poolId,
        baseReserve: poolInfo.baseReserve,
        quoteReserve: poolInfo.quoteReserve,
        totalLiquidity: poolInfo.baseReserve + poolInfo.quoteReserve,
        baseMint: poolInfo.baseMint,
        quoteMint: poolInfo.quoteMint,
        volume24h: poolInfo.volume24h || 0,
        fee: poolInfo.fee || 0.25 // Default 0.25% fee
      };
    } catch (error) {
      console.error('❌ Error getting pool liquidity:', error.message);
      throw error;
    }
  }

  /**
   * Check if token has Raydium liquidity
   */
  async hasLiquidity(tokenMint) {
    try {
      await this.findPool(this.SOL_MINT.toString(), tokenMint);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all pools for a token
   */
  async getTokenPools(tokenMint) {
    try {
      const pools = await this.getPools();
      return pools.filter(pool => 
        pool.baseMint === tokenMint || pool.quoteMint === tokenMint
      );
    } catch (error) {
      console.error('❌ Error getting token pools:', error.message);
      return [];
    }
  }

  /**
   * Get best pool for trading
   */
  async getBestPool(tokenA, tokenB) {
    try {
      const pools = await this.getPools();
      const relevantPools = pools.filter(pool => 
        (pool.baseMint === tokenA && pool.quoteMint === tokenB) ||
        (pool.baseMint === tokenB && pool.quoteMint === tokenA)
      );

      if (relevantPools.length === 0) {
        throw new Error(`No pools found for ${tokenA}/${tokenB}`);
      }

      // Sort by liquidity (highest first)
      relevantPools.sort((a, b) => {
        const liquidityA = (a.baseReserve || 0) + (a.quoteReserve || 0);
        const liquidityB = (b.baseReserve || 0) + (b.quoteReserve || 0);
        return liquidityB - liquidityA;
      });

      return relevantPools[0];
    } catch (error) {
      console.error('❌ Error getting best pool:', error.message);
      throw error;
    }
  }
}

module.exports = { RaydiumDEXIntegration };
