// Jupiter v6 API Integration for Real On-Chain Trading
const { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const axios = require('axios');
const RateLimitManager = require('./rate-limit-manager');
const smartCacheManager = require('./smart-cache-manager');
const PumpFunTrading = require('./pump-fun-trading');

class JupiterV6Integration {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      slippage: config.slippage || 100, // 1% (minimal slippage)
      priorityFee: config.priorityFee || 1000, // 1000 lamports (minimal fee)
      maxRetries: config.maxRetries || 3,
      ...config
    };
    this.apiUrl = 'https://public.jupiterapi.com'; // QuickNode public endpoint
    this.alternativeApiUrls = [
      'https://quote-api.jup.ag',
      'https://api.jup.ag',
      'https://public.jupiterapi.com'
    ];
    
    // Alternative DEX aggregator APIs as fallbacks
    this.orcaApiUrl = 'https://api.mainnet.orca.so';
    this.meteoraApiUrl = 'https://dlmm-api.meteora.ag';
    this.solMint = 'So11111111111111111111111111111111111111112';
    this.rateLimitManager = new RateLimitManager();
    
    // Initialize pump.fun trading support
    this.pumpFunTrading = new PumpFunTrading(connection, config);
  }

  /**
   * Check if token is a pump.fun token
   */
  async isPumpFunToken(tokenMint) {
    return await this.pumpFunTrading.isPumpFunToken(tokenMint);
  }

  // Get quote for swap with retry across multiple API endpoints
  async getQuote(inputMint, outputMint, amount, slippage = null, apiUrl = null) {
    const cacheKey = `${inputMint}_${outputMint}_${amount}_${slippage || this.config.slippage}`;
    const urlToUse = apiUrl || this.apiUrl;
    
    return await smartCacheManager.getOrFetch('jupiter-quote', cacheKey, async () => {
      return await this.rateLimitManager.makeRequest('jupiter-quote', async () => {
        try {
          const params = new URLSearchParams({
            inputMint,
            outputMint,
            amount: amount.toString(),
            slippageBps: (slippage || this.config.slippage).toString()
          });

          const quoteUrl = `${urlToUse}/quote?${params}`;
          console.log(`🔍 Jupiter Quote Request: ${quoteUrl}`);
          const response = await axios.get(quoteUrl, {
            timeout: 10000,
            headers: {
              'Accept': 'application/json'
            }
          });
          
          if (!response.data) {
            throw new Error('No quote received from Jupiter');
          }

          return response.data;
        } catch (error) {
          // Log more detailed error information
          if (error.response) {
            console.error(`❌ Jupiter API Error ${error.response.status} (${urlToUse}):`, error.response.data);
            throw new Error(`Jupiter API ${error.response.status}: ${JSON.stringify(error.response.data)}`);
          } else {
            console.error(`❌ Jupiter Request Error (${urlToUse}):`, error.message);
            throw new Error(`Failed to get quote: ${error.message}`);
          }
        }
      });
    });
  }
  
  // Get quote from Orca API
  async getOrcaQuote(inputMint, outputMint, amount, slippage = null) {
    try {
      const slippageDecimal = (slippage || this.config.slippage) / 10000;
      const response = await axios.get(`${this.orcaApiUrl}/v1/quote`, {
        params: {
          inputMint: inputMint,
          outputMint: outputMint,
          amount: amount.toString(),
          slippage: slippageDecimal.toString()
        },
        timeout: 10000
      });
      
      if (response.data && response.data.quote) {
        return {
          inAmount: response.data.quote.inputAmount,
          outAmount: response.data.quote.outputAmount,
          priceImpactPct: response.data.quote.priceImpact || 0,
          route: response.data.quote.route || []
        };
      }
      throw new Error('Invalid Orca quote response');
    } catch (error) {
      throw new Error(`Orca API failed: ${error.message}`);
    }
  }
  
  // Get quote with retry across multiple API endpoints and aggregators
  async getQuoteWithRetry(inputMint, outputMint, amount, slippage = null) {
    const errors = [];
    
    // Strategy 1: Try Jupiter endpoints
    for (const apiUrl of this.alternativeApiUrls) {
      try {
        console.log(`🔄 Trying Jupiter quote from ${apiUrl}...`);
        const quote = await this.getQuote(inputMint, outputMint, amount, slippage, apiUrl);
        console.log(`✅ Successfully got quote from Jupiter (${apiUrl})`);
        return { ...quote, source: 'jupiter', apiUrl };
      } catch (error) {
        console.warn(`⚠️ Jupiter quote failed from ${apiUrl}:`, error.message);
        errors.push({ source: 'Jupiter', apiUrl, error: error.message });
        continue;
      }
    }
    
    // Strategy 2: Try Orca API (currently requires SDK - will be skipped)
    // When Orca SDK is integrated, uncomment this section
    /*
    try {
      console.log(`🔄 Trying Orca quote...`);
      const quote = await this.getOrcaQuote(inputMint, outputMint, amount, slippage);
      console.log(`✅ Successfully got quote from Orca`);
      return { ...quote, source: 'orca' };
    } catch (error) {
      console.warn(`⚠️ Orca quote failed:`, error.message);
      errors.push({ source: 'Orca', error: error.message });
    }
    */
    
    // If all endpoints failed, throw with all errors
    throw new Error(`All swap APIs failed. Errors: ${errors.map(e => `${e.source}${e.apiUrl ? ` (${e.apiUrl})` : ''}: ${e.error}`).join('; ')}`);
  }

  // Get swap transaction with retry across multiple API endpoints
  async getSwapTransaction(wallet, quoteResponse, priorityFee = null, apiUrl = null) {
    const urlToUse = apiUrl || this.apiUrl;
    
    return await this.rateLimitManager.makeRequest('jupiter-swap', async () => {
      try {
        const swapData = {
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          prioritizationFeeLamports: priorityFee || this.config.priorityFee
        };

        const swapUrl = `${urlToUse}/swap`;
        console.log(`🔄 Getting swap transaction from ${swapUrl}...`);
        const response = await axios.post(swapUrl, swapData, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 15000
        });

        if (!response.data || !response.data.swapTransaction) {
          throw new Error('No swap transaction received from Jupiter');
        }

        return response.data.swapTransaction;
      } catch (error) {
        throw new Error(`Failed to get swap transaction from ${urlToUse}: ${error.message}`);
      }
    });
  }
  
  // Get swap transaction with retry across multiple API endpoints
  async getSwapTransactionWithRetry(wallet, quoteResponse, priorityFee = null) {
    const errors = [];
    
    // Try each API endpoint
    for (const apiUrl of this.alternativeApiUrls) {
      try {
        console.log(`🔄 Trying swap transaction from ${apiUrl}...`);
        const swapTx = await this.getSwapTransaction(wallet, quoteResponse, priorityFee, apiUrl);
        console.log(`✅ Successfully got swap transaction from ${apiUrl}`);
        return swapTx;
      } catch (error) {
        console.warn(`⚠️ Failed to get swap transaction from ${apiUrl}:`, error.message);
        errors.push({ apiUrl, error: error.message });
        continue;
      }
    }
    
    // If all endpoints failed, throw with all errors
    throw new Error(`All Jupiter swap endpoints failed. Errors: ${errors.map(e => `${e.apiUrl}: ${e.error}`).join('; ')}`);
  }

  // Execute swap with retries and multiple API endpoints
  async executeSwap(wallet, inputMint, outputMint, amount, options = {}) {
    let retries = 0;
    const maxRetries = options.maxRetries || this.config.maxRetries;
    
    // Try different slippage configurations
    const slippageConfigs = [
      options.slippage || this.config.slippage,  // Original slippage
      (options.slippage || this.config.slippage) * 2,  // 2x slippage
      (options.slippage || this.config.slippage) * 5,  // 5x slippage (for volatile tokens)
      500,  // 5% slippage
      1000  // 10% slippage
    ];
    
    // Try different priority fees
    const priorityFeeConfigs = [
      options.priorityFee || this.config.priorityFee,
      (options.priorityFee || this.config.priorityFee) * 2,
      (options.priorityFee || this.config.priorityFee) * 5,
      5000,  // 5000 lamports
      10000  // 10000 lamports
    ];

    while (retries < maxRetries) {
      for (const slippage of slippageConfigs) {
        for (const priorityFee of priorityFeeConfigs) {
          try {
            console.log(`🔄 Attempt ${retries + 1}/${maxRetries} - Slippage: ${slippage}bps, Priority: ${priorityFee} lamports`);
            
            // Get quote with retry across multiple endpoints and aggregators
            const quote = await this.getQuoteWithRetry(
              inputMint, 
              outputMint, 
              amount, 
              slippage
            );

            const quoteSource = quote.source || 'jupiter';
            console.log(`💱 Swap Quote (${quoteSource}): ${quote.inAmount} → ${quote.outAmount} (${quote.priceImpactPct}% impact)`);

            // Handle Orca quotes - use Jupiter for execution since Orca doesn't have simple swap API
            // The quote gives us price info, but we execute via Jupiter
            // Note: This means we might not get the exact Orca route, but Jupiter should find similar route
            
            // Get swap transaction with retry across multiple endpoints
            // Works for both Jupiter and Orca quotes (Orca quotes fall back to Jupiter execution)
            const swapTransactionBase64 = await this.getSwapTransactionWithRetry(
              wallet, 
              quote, 
              priorityFee,
              quoteSource
            );

        // Deserialize and sign transaction (handle both legacy and versioned transactions)
        const transactionBuffer = Buffer.from(swapTransactionBase64, 'base64');
        let swapTransaction;
        
        // Try multiple deserialization approaches
        const deserializationMethods = [
          {
            name: 'VersionedTransaction',
            method: () => {
              // For newer versions of @solana/web3.js, use the correct deserialization
              const tx = VersionedTransaction.deserialize(transactionBuffer);
              // Check if the transaction is properly formed
              if (!tx.message || !tx.message.header) {
                throw new Error('Invalid versioned transaction structure');
              }
              tx.sign([wallet]);
              return tx;
            }
          },
          {
            name: 'LegacyTransaction',
            method: () => {
              const tx = Transaction.from(transactionBuffer);
              tx.sign(wallet);
              return tx;
            }
          }
        ];
        
        let lastError = null;
        for (const method of deserializationMethods) {
          try {
            console.log(`Trying ${method.name} deserialization...`);
            swapTransaction = method.method();
            console.log(`✅ Successfully deserialized as ${method.name}`);
            break;
          } catch (error) {
            console.log(`❌ ${method.name} failed: ${error.message}`);
            lastError = error;
            continue;
          }
        }
        
        if (!swapTransaction) {
          throw new Error(`All deserialization methods failed. Last error: ${lastError?.message || 'Unknown error'}`);
        }
        
        console.log(`🔐 Transaction signed successfully, sending to network...`);

        // Send transaction
        let signature;
        // Send the signed transaction
        signature = await this.connection.sendRawTransaction(
          swapTransaction.serialize(),
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
          console.log(`❌ Transaction failed with error: ${JSON.stringify(confirmation.value.err)}`);
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log(`✅ Transaction confirmed on-chain: ${signature}`);

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
        console.error(`❌ Swap attempt ${retries}/${maxRetries} failed:`, error.message);
        
        if (retries >= maxRetries) {
          throw new Error(`Swap failed after ${maxRetries} retries: ${error.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }

  // Buy token with SOL
  async buyToken(wallet, tokenMint, solAmount, options = {}) {
    const errors = [];
    
    // Strategy 1: Try pump.fun first if applicable
    try {
      const isPumpFun = await this.isPumpFunToken(tokenMint);
      if (isPumpFun) {
        console.log('🎯 Detected pump.fun token - using bonding curve swap');
        const result = await this.pumpFunTrading.buyToken(wallet, tokenMint, solAmount, options);
        if (result && result.success) {
          return result;
        }
        errors.push({ method: 'pump.fun', error: result?.error || 'Unknown error' });
      }
    } catch (error) {
      console.warn('⚠️ Pump.fun buy attempt failed:', error.message);
      errors.push({ method: 'pump.fun', error: error.message });
    }
    
    // Strategy 2: Try Jupiter with DEX swap
    let result = null;
    try {
      console.log('🔄 Attempting Jupiter DEX swap...');
      const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
      result = await this.executeSwap(
        wallet,
        this.solMint,
        tokenMint,
        lamports,
        { ...options, maxRetries: 3 }
      );
      
      if (result && result.success) {
        // Log trade for P&L tracking
        try {
          const tradeTracker = require('./trade-tracker');
          tradeTracker.recordBuy({
            wallet: wallet.publicKey.toString(),
            tokenMint: tokenMint,
            solAmount: solAmount,
            tokensReceived: parseFloat(result.outAmount) / 1e6, // Assume 6 decimals
            txSignature: result.signature,
            source: options.source || 'manual',
            session: options.session || null
          });
        } catch (trackError) {
          console.log('⚠️ Failed to track buy trade:', trackError.message);
        }
        
        return result;
      }
      errors.push({ method: 'Jupiter DEX', error: result?.error || 'Unknown error' });
    } catch (error) {
      console.warn('⚠️ Jupiter DEX buy attempt failed:', error.message);
      errors.push({ method: 'Jupiter DEX', error: error.message });
    }
    
    // If all strategies failed, return error with details
    return {
      success: false,
      error: `All buy strategies failed. Errors: ${errors.map(e => `${e.method}: ${e.error}`).join('; ')}`
    };
  }

  // Sell token for SOL with multiple retry strategies
  async sellToken(wallet, tokenMint, tokenAmount, options = {}) {
    const errors = [];
    
    // Strategy 1: Try pump.fun first if applicable
    try {
      const isPumpFun = await this.isPumpFunToken(tokenMint);
      if (isPumpFun) {
        console.log('🎯 Detected pump.fun token - using bonding curve swap');
        const result = await this.pumpFunTrading.sellToken(wallet, tokenMint, tokenAmount, options);
        if (result && result.success) {
          return result;
        }
        errors.push({ method: 'pump.fun', error: result?.error || 'Unknown error' });
      }
    } catch (error) {
      console.warn('⚠️ Pump.fun sell attempt failed:', error.message);
      errors.push({ method: 'pump.fun', error: error.message });
    }
    
    // Strategy 2: Try Jupiter with DEX swap
    // Convert human-readable token amount to base units (Jupiter expects base units)
    let amountInBaseUnits = tokenAmount;
    
    // Check if tokenAmount looks like human-readable format (has decimal places or is large)
    // If amount is less than 1e12, it might be human-readable, convert it
    if (tokenAmount < 1e12) {
      try {
        // Get token mint info to determine decimals
        const { PublicKey } = require('@solana/web3.js');
        const { getMint } = require('@solana/spl-token');
        
        const mintPublicKey = new PublicKey(tokenMint);
        const mintInfo = await getMint(this.connection, mintPublicKey);
        const decimals = mintInfo.decimals || 6; // Default to 6 if not found
        
        // Convert human-readable amount to base units
        amountInBaseUnits = Math.floor(tokenAmount * Math.pow(10, decimals));
        console.log(`💰 Converted token amount: ${tokenAmount} → ${amountInBaseUnits} (${decimals} decimals)`);
      } catch (error) {
        console.warn(`⚠️ Could not get mint info for ${tokenMint}, assuming 6 decimals:`, error.message);
        // Default to 6 decimals if we can't fetch mint info
        amountInBaseUnits = Math.floor(tokenAmount * 1e6);
      }
    }
    
    // Try Jupiter with retry logic
    let result = null;
    try {
      console.log('🔄 Attempting Jupiter DEX swap...');
      result = await this.executeSwap(
        wallet,
        tokenMint,
        this.solMint,
        amountInBaseUnits,
        { ...options, maxRetries: 3 }
      );
      
      if (result && result.success) {
        // Log trade for P&L tracking
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
            tokensSold: tokenAmount, // Keep original human-readable amount for tracking
            solReceived: parseFloat(result.outAmount) / LAMPORTS_PER_SOL,
            txSignature: result.signature,
            source: options.source || 'manual',
            session: options.session || null,
            solPriceUSD: solPriceUSD
          });
        } catch (trackError) {
          console.log('⚠️ Failed to track sell trade:', trackError.message);
        }
        
        return result;
      }
      errors.push({ method: 'Jupiter DEX', error: result?.error || 'Unknown error' });
    } catch (error) {
      console.warn('⚠️ Jupiter DEX sell attempt failed:', error.message);
      errors.push({ method: 'Jupiter DEX', error: error.message });
    }
    
    // If all strategies failed, return error with details
    return {
      success: false,
      error: `All sell strategies failed. Errors: ${errors.map(e => `${e.method}: ${e.error}`).join('; ')}`
    };
  }

  // Get token price in SOL with caching
  async getTokenPrice(tokenMint, amount = LAMPORTS_PER_SOL) {
    const cacheKey = `price_${tokenMint}_${amount}`;
    
    return await smartCacheManager.getOrFetch('jupiter-price', cacheKey, async () => {
      try {
        const quote = await this.getQuote(this.solMint, tokenMint, amount);
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

  // Volume trading - coordinated buy/sell across multiple wallets with multi-session support
  async executeVolumeTrading(wallets, tokenMint, volumeConfig, sessionId = null) {
    const results = [];
    const {
      totalVolume = 1.0, // Total SOL volume
      sessions = 5,      // Number of buy/sell cycles (ignored if continuous)
      delayBetween = 3000, // Delay between operations (ms)
      randomizeAmounts = true,
      randomizeDelay = true,
      continuous = true, // Keep trading until stopped
      customTimingMin = null, // Custom timing minimum (seconds)
      customTimingMax = null, // Custom timing maximum (seconds)
      mode = null, // Trading mode (fomo, delayed, etc.)
      fomoSettings = null, // FOMO mode configuration
      walletGroup = 'Unknown', // Wallet group name for identification
      fixedAmount = null // Fixed amount per trade (if using fixed amounts)
    } = volumeConfig;

    // Generate session ID if not provided
    if (!sessionId) {
      sessionId = `vol_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    // Initialize session tracking
    if (!global.activeVolumeSessions) {
      global.activeVolumeSessions = new Map();
    }

    const sessionData = {
      id: sessionId,
      walletGroup: walletGroup,
      mode: mode || 'standard',
      wallets: wallets.map(w => w.name || w.pubkey?.toString().substring(0, 8) || 'Unknown'),
      tokenMint: tokenMint,
      startTime: Date.now(),
      isActive: true,
      config: volumeConfig,
      stats: {
        cyclesCompleted: 0,
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalVolume: 0
      }
    };

    global.activeVolumeSessions.set(sessionId, sessionData);

    console.log(`🚀 Starting volume trading session: ${sessionId}`);
    console.log(`📊 Group: ${walletGroup} | Mode: ${mode || 'standard'} | Wallets: ${wallets.length}`);
    
    // Handle FOMO mode separately
    if (mode === 'fomo') {
      console.log(`🔥 FOMO Mode - Creating artificial FOMO patterns`);
      return this.executeFomoTrading(wallets, tokenMint, fomoSettings, results, sessionId);
    }
    
    if (continuous) {
      console.log(`🔄 Continuous trading mode - will run until stopped`);
    } else {
      console.log(`💰 Total volume: ${totalVolume} SOL across ${sessions} sessions`);
    }

    // Helper function to get random delay based on custom timing
    const getRandomDelay = () => {
      if (customTimingMin && customTimingMax) {
        const minMs = customTimingMin * 1000;
        const maxMs = customTimingMax * 1000;
        return minMs + Math.random() * (maxMs - minMs);
      }
      return randomizeDelay ? delayBetween + Math.random() * 2000 : delayBetween;
    };

    let session = 0;
    const maxSessions = continuous ? Number.MAX_SAFE_INTEGER : sessions;
    
    while (session < maxSessions && sessionData.isActive) {
      session++;
      console.log(continuous ? `🔄 Trading Cycle ${session}` : `📊 Volume Session ${session}/${sessions}`);

      // Calculate amounts for this session
      const sessionVolume = continuous ? totalVolume : totalVolume / sessions;
      const volumePerWallet = sessionVolume / wallets.length;
      
      // Use global amount settings if available
      const useGlobalSettings = global.volumeSettings && global.volumeSettings.amountType === 'random';
      const useFixedAmount = fixedAmount && fixedAmount > 0;
      const minAmount = useGlobalSettings ? global.volumeSettings.minAmount : 0.01;
      const maxAmount = useGlobalSettings ? global.volumeSettings.maxAmount : volumePerWallet;
      
      // Calculate base amount
      let baseAmount;
      if (useFixedAmount) {
        baseAmount = fixedAmount;  // Use the fixed amount from config
      } else if (randomizeAmounts) {
        baseAmount = minAmount + Math.random() * (maxAmount - minAmount);  // Use configured range
      } else {
        baseAmount = volumePerWallet;  // Fallback to calculated volume
      }

      // Execute buys across all wallets
      for (let i = 0; i < wallets.length; i++) {
        // Check if session is still active
        if (!sessionData.isActive) {
          console.log(`🛑 Session ${sessionId} stopped, breaking buy loop`);
          break;
        }

        try {
          const wallet = wallets[i];
          const buyAmount = Math.max(0.001, baseAmount); // Minimum 0.001 SOL (Jupiter minimum)
          
          // Check wallet has enough balance including gas fees
          const balance = await this.connection.getBalance(wallet.keypair.publicKey);
          const requiredBalance = (buyAmount * LAMPORTS_PER_SOL) + (0.002 * LAMPORTS_PER_SOL); // Trade amount + 0.002 SOL gas buffer
          
          if (balance < requiredBalance) {
            console.log(`⚠️ [${sessionId}] Wallet ${i + 1}: Insufficient balance (${(balance/LAMPORTS_PER_SOL).toFixed(6)} SOL) for ${buyAmount} SOL trade + gas`);
            results.push({
              session: session,
              wallet: i + 1,
              operation: 'buy',
              error: `Insufficient balance: ${(balance/LAMPORTS_PER_SOL).toFixed(6)} SOL, need ${(requiredBalance/LAMPORTS_PER_SOL).toFixed(6)} SOL`,
              success: false
            });
            sessionData.stats.failedTrades++;
            continue;
          }

          console.log(`💳 [${sessionId}] Wallet ${i + 1}: Buying ${buyAmount} SOL worth of tokens`);
          
          const buyResult = await this.buyToken(wallet.keypair, tokenMint, buyAmount, {
            slippage: 2500, // 25% slippage for volume trading (pump.fun tokens need higher tolerance)
            source: 'volume',
            session: sessionId
          });

          results.push({
            session: session,
            wallet: i + 1,
            operation: 'buy',
            amount: buyAmount,
            signature: buyResult.signature,
            success: true
          });

          // Update session statistics
          sessionData.stats.totalTrades++;
          sessionData.stats.successfulTrades++;
          sessionData.stats.totalVolume += buyAmount;

          // Wait before next operation using custom timing
          const delay = getRandomDelay();
          console.log(`⏰ [${sessionId}] Waiting ${Math.round(delay/1000)}s before next operation...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Immediately try to sell if we have tokens to create volume
          try {
            const tokenAccount = await getAssociatedTokenAddress(
              new PublicKey(tokenMint),
              wallet.keypair.publicKey
            );

            const balance = await this.connection.getTokenAccountBalance(tokenAccount);
            if (balance.value.uiAmount && balance.value.uiAmount > 0) {
              const sellAmount = Math.floor(balance.value.amount * (0.5 + Math.random() * 0.4)); // Sell 50-90%

              console.log(`💳 [${sessionId}] Wallet ${i + 1}: Selling ${balance.value.uiAmount * (sellAmount / balance.value.amount)} tokens`);

              const sellResult = await this.sellToken(wallet.keypair, tokenMint, sellAmount, {
                slippage: 2500, // 25% slippage for volume trading (pump.fun tokens need higher tolerance)
                source: 'volume',
                session: sessionId
              });

              results.push({
                session: session,
                wallet: i + 1,
                operation: 'sell',
                amount: balance.value.uiAmount * (sellAmount / balance.value.amount),
                signature: sellResult.signature,
                success: true
              });

              // Update session statistics for sell
              sessionData.stats.totalTrades++;
              sessionData.stats.successfulTrades++;
            }
          } catch (sellError) {
            console.error(`⚠️ [${sessionId}] Immediate sell failed for wallet ${i + 1}:`, sellError.message);
            sessionData.stats.failedTrades++;
          }

        } catch (error) {
          console.error(`❌ [${sessionId}] Buy failed for wallet ${i + 1}:`, error.message);
          results.push({
            session: session,
            wallet: i + 1,
            operation: 'buy',
            error: error.message,
            success: false
          });
          sessionData.stats.failedTrades++;
        }
      }

      // Update session statistics
      sessionData.stats.cyclesCompleted = session;

      // Wait between cycles (for continuous mode) or sessions
      if (continuous || session < maxSessions) {
        if (!sessionData.isActive) {
          console.log(`🛑 [${sessionId}] Session stopped by user`);
          break;
        }
        
        const sessionDelay = getRandomDelay();
        console.log(`⏰ [${sessionId}] Waiting ${Math.round(sessionDelay/1000)}s before next cycle...`);
        await new Promise(resolve => setTimeout(resolve, sessionDelay));
      }
    }

    // Session completed - update final statistics
    sessionData.isActive = false;
    sessionData.endTime = Date.now();
    sessionData.duration = sessionData.endTime - sessionData.startTime;

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ [${sessionId}] Volume trading completed: ${successful} successful, ${failed} failed`);
    console.log(`📊 [${sessionId}] Session stats: ${sessionData.stats.totalTrades} trades, ${sessionData.stats.totalVolume.toFixed(4)} SOL volume`);
    
    return {
      sessionId: sessionId,
      totalOperations: results.length,
      successful,
      failed,
      results,
      sessionStats: sessionData.stats,
      duration: sessionData.duration
    };
  }

  // FOMO Mode - Creates pump/dip cycles to trigger artificial FOMO
  async executeFomoTrading(wallets, tokenMint, fomoSettings, results, sessionId = null) {
    if (!fomoSettings) {
      console.error('❌ FOMO settings not configured');
      return { totalOperations: 0, successful: 0, failed: 0, results: [] };
    }

    // Get session data if sessionId provided
    let sessionData = null;
    if (sessionId && global.activeVolumeSessions) {
      sessionData = global.activeVolumeSessions.get(sessionId);
    }

    const {
      buyMin = 0.001,
      buyMax = 0.004,
      buysPerPump = 5,
      sellsPerDip = 2,
      sellPercentage = 12,
      buyInterval = 3,
      sellInterval = 15,
      cycleDelay = 90
    } = fomoSettings;

    console.log(`🔥 FOMO Configuration:`);
    console.log(`💰 Buy Range: ${buyMin}-${buyMax} SOL`);
    console.log(`📈 Buys Per Pump: ${buysPerPump}`);
    console.log(`📉 Sells Per Dip: ${sellsPerDip}`);
    console.log(`💧 Sell Percentage: ${sellPercentage}%`);
    console.log(`⚡ Buy Interval: ${buyInterval}s`);
    console.log(`📊 Sell Interval: ${sellInterval}s`);
    console.log(`🔄 Cycle Delay: ${cycleDelay}s`);

    let cycle = 0;
    while (sessionData ? sessionData.isActive : true) {
      cycle++;
      console.log(`\n🔥 [${sessionId || 'FOMO'}] === FOMO CYCLE ${cycle} ===`);
      
      // PUMP PHASE - Multiple rapid buys
      console.log(`📈 [${sessionId || 'FOMO'}] PUMP PHASE - ${buysPerPump} rapid buys`);
      for (let buy = 1; buy <= buysPerPump; buy++) {
        if (sessionData && !sessionData.isActive) break;
        
        for (let i = 0; i < wallets.length; i++) {
          if (sessionData && !sessionData.isActive) break;
          
          try {
            const wallet = wallets[i];
            
            // Random buy amount in configured range
            const buyAmount = buyMin + Math.random() * (buyMax - buyMin);
            
            // Check wallet has enough balance
            const balance = await this.connection.getBalance(wallet.keypair.publicKey);
            const requiredBalance = (buyAmount * LAMPORTS_PER_SOL) + (0.002 * LAMPORTS_PER_SOL);
            
            if (balance < requiredBalance) {
              console.log(`⚠️ Wallet ${i + 1}: Insufficient balance for ${buyAmount} SOL buy`);
              continue;
            }

            console.log(`🔥 Pump ${buy}/${buysPerPump} - Wallet ${i + 1}: Buying ${buyAmount.toFixed(4)} SOL`);
            
            const buyResult = await this.buyToken(wallet.keypair, tokenMint, buyAmount, {
              slippage: 200, // 2% slippage for FOMO (reduced)
              source: 'volume',
              session: sessionId
            });

            results.push({
              cycle: cycle,
              phase: 'pump',
              wallet: i + 1,
              operation: 'buy',
              amount: buyAmount,
              signature: buyResult.signature,
              success: true
            });

            // Short delay between buys to create rapid pump effect
            await new Promise(resolve => setTimeout(resolve, buyInterval * 1000));

          } catch (error) {
            console.error(`❌ Pump buy failed - Wallet ${i + 1}:`, error.message);
            results.push({
              cycle: cycle,
              phase: 'pump',
              wallet: i + 1,
              operation: 'buy',
              error: error.message,
              success: false
            });
          }
        }
      }

      // Wait before dip phase
      const pumpDipDelay = Math.floor(sellInterval * 1000 / 2); // Half of sell interval
      console.log(`⏰ Waiting ${pumpDipDelay/1000}s before dip phase...`);
      await new Promise(resolve => setTimeout(resolve, pumpDipDelay));

      // DIP PHASE - Small sells to simulate profit-taking
      console.log(`📉 [${sessionId || 'FOMO'}] DIP PHASE - ${sellsPerDip} profit-taking sells`);
      for (let sell = 1; sell <= sellsPerDip; sell++) {
        if (sessionData && !sessionData.isActive) break;
        
        for (let i = 0; i < wallets.length; i++) {
          if (sessionData && !sessionData.isActive) break;
          
          try {
            const wallet = wallets[i];
            
            // Get token balance to sell
            const tokenAccount = await getAssociatedTokenAddress(
              new PublicKey(tokenMint),
              wallet.keypair.publicKey
            );

            const balance = await this.connection.getTokenAccountBalance(tokenAccount);
            if (balance.value.uiAmount && balance.value.uiAmount > 0) {
              // Sell configured percentage
              const sellAmount = Math.floor(balance.value.amount * (sellPercentage / 100));
              
              if (sellAmount > 0) {
                console.log(`📉 Dip ${sell}/${sellsPerDip} - Wallet ${i + 1}: Selling ${sellPercentage}% (${(balance.value.uiAmount * sellPercentage / 100).toFixed(4)} tokens)`);

                const sellResult = await this.sellToken(wallet.keypair, tokenMint, sellAmount, {
                  slippage: 200, // 2% slippage for FOMO (reduced)
                  source: 'volume',
                  session: sessionId
                });

                results.push({
                  cycle: cycle,
                  phase: 'dip',
                  wallet: i + 1,
                  operation: 'sell',
                  amount: balance.value.uiAmount * sellPercentage / 100,
                  signature: sellResult.signature,
                  success: true
                });
              }
            }

            // Delay between sells to create gentle dip effect
            await new Promise(resolve => setTimeout(resolve, sellInterval * 1000));

          } catch (error) {
            console.error(`❌ Dip sell failed - Wallet ${i + 1}:`, error.message);
            results.push({
              cycle: cycle,
              phase: 'dip',
              wallet: i + 1,
              operation: 'sell',
              error: error.message,
              success: false
            });
          }
        }
      }

      // Wait before next cycle
      if (sessionData ? sessionData.isActive : true) {
        console.log(`🔄 [${sessionId || 'FOMO'}] Cycle ${cycle} complete. Waiting ${cycleDelay}s before next FOMO cycle...`);
        await new Promise(resolve => setTimeout(resolve, cycleDelay * 1000));
      }
    }

    console.log(`🛑 [${sessionId || 'FOMO'}] FOMO trading stopped after ${cycle} cycles`);
    
    // Update session data if available
    if (sessionData) {
      sessionData.isActive = false;
      sessionData.endTime = Date.now();
      sessionData.duration = sessionData.endTime - sessionData.startTime;
      sessionData.stats.cyclesCompleted = cycle;
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ [${sessionId || 'FOMO'}] FOMO trading completed: ${successful} successful, ${failed} failed operations`);
    
    return {
      sessionId: sessionId,
      totalOperations: results.length,
      successful,
      failed,
      results,
      cycles: cycle,
      sessionStats: sessionData ? sessionData.stats : null,
      duration: sessionData ? sessionData.duration : null
    };
  }

  // ===========================================
  // SESSION MANAGEMENT METHODS
  // ===========================================

  // Get all active volume sessions
  getActiveVolumeSessions() {
    if (!global.activeVolumeSessions) {
      return [];
    }
    
    const sessions = [];
    for (const [sessionId, sessionData] of global.activeVolumeSessions) {
      sessions.push({
        id: sessionId,
        walletGroup: sessionData.walletGroup,
        mode: sessionData.mode,
        isActive: sessionData.isActive,
        startTime: sessionData.startTime,
        duration: sessionData.isActive ? Date.now() - sessionData.startTime : sessionData.duration,
        stats: sessionData.stats,
        wallets: sessionData.wallets
      });
    }
    
    return sessions;
  }

  // Stop a specific volume session
  stopVolumeSession(sessionId) {
    if (!global.activeVolumeSessions) {
      return { success: false, error: 'No active sessions' };
    }

    const sessionData = global.activeVolumeSessions.get(sessionId);
    if (!sessionData) {
      return { success: false, error: 'Session not found' };
    }

    sessionData.isActive = false;
    console.log(`🛑 Stopped volume session: ${sessionId} (${sessionData.walletGroup})`);
    
    return { 
      success: true, 
      sessionId: sessionId,
      walletGroup: sessionData.walletGroup,
      message: `Session ${sessionId} stopped successfully`
    };
  }

  // Stop all volume sessions
  stopAllVolumeSessions() {
    if (!global.activeVolumeSessions) {
      return { success: false, error: 'No active sessions' };
    }

    let stoppedCount = 0;
    for (const [sessionId, sessionData] of global.activeVolumeSessions) {
      if (sessionData.isActive) {
        sessionData.isActive = false;
        stoppedCount++;
        console.log(`🛑 Stopped volume session: ${sessionId} (${sessionData.walletGroup})`);
      }
    }

    return { 
      success: true, 
      stoppedCount: stoppedCount,
      message: `Stopped ${stoppedCount} active volume sessions`
    };
  }

  // Get session statistics
  getSessionStats(sessionId) {
    if (!global.activeVolumeSessions) {
      return null;
    }

    const sessionData = global.activeVolumeSessions.get(sessionId);
    if (!sessionData) {
      return null;
    }

    return {
      id: sessionId,
      walletGroup: sessionData.walletGroup,
      mode: sessionData.mode,
      isActive: sessionData.isActive,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime,
      duration: sessionData.isActive ? Date.now() - sessionData.startTime : sessionData.duration,
      stats: sessionData.stats,
      wallets: sessionData.wallets,
      config: sessionData.config
    };
  }
}

module.exports = { JupiterV6Integration };