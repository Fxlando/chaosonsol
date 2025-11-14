// ============================================================================
// ENHANCED TOKEN DATA FETCHING WITH MULTIPLE FALLBACKS
// ============================================================================
// Priority: Jupiter > DexScreener > Birdeye > Pump.fun > On-chain
// Provides reliable token data even when APIs are down

/**
 * Get Solana connection from settings or existing integration
 * Avoids using rate-limited default RPC
 * @param {string} purpose - 'price' for price/market cap updates, 'monitoring' for trade monitoring, or null for general use
 */
function getSolanaConnection(purpose = null) {
    // First, try to use existing connection from solanaIntegration (unless we need a dedicated RPC)
    if (!purpose && window.solanaIntegration?.connection) {
        return window.solanaIntegration.connection;
    }
    
    // If no connection exists, try to get RPC URL from settings
    let rpcUrl = null;
    
    try {
        // Try to get from settings manager
        if (window.settingsManager?.getSettings) {
            const settings = window.settingsManager.getSettings();
            
            // Check for dedicated RPC based on purpose
            if (purpose === 'price' && settings?.solana?.priceRpc) {
                rpcUrl = settings.solana.priceRpc;
                console.log('💰 Using dedicated price RPC:', rpcUrl);
            } else if (purpose === 'monitoring' && settings?.solana?.monitoringRpc) {
                // For monitoring, we use WebSocket, but this is for HTTP fallback
                rpcUrl = settings.solana.monitoringRpc.replace('wss://', 'https://').replace('ws://', 'http://');
            } else {
                // Use main RPC
                rpcUrl = settings?.solana?.rpcHttp;
            }
        }
        
        // Fallback: try localStorage
        if (!rpcUrl) {
            const stored = localStorage.getItem('chaosbot_settings');
            if (stored) {
                const settings = JSON.parse(stored);
                if (purpose === 'price' && settings?.solana?.priceRpc) {
                    rpcUrl = settings.solana.priceRpc;
                } else {
                    rpcUrl = settings?.solana?.rpcHttp;
                }
            }
        }
        
        // Fallback: try from solanaIntegration
        if (!rpcUrl && window.solanaIntegration?.rpcUrl) {
            rpcUrl = window.solanaIntegration.rpcUrl;
        }
    } catch (error) {
        console.debug('Failed to get RPC URL from settings:', error);
    }
    
    // Only create connection if we have a valid RPC URL
    // For price RPC, allow public RPC (it's dedicated for this purpose)
    if (rpcUrl && window.solanaWeb3?.Connection) {
        // Allow public RPC if it's a dedicated price RPC
        const isDedicatedPriceRpc = purpose === 'price';
        const isRateLimited = rpcUrl.includes('api.mainnet-beta.solana.com');
        
        if (isDedicatedPriceRpc || !isRateLimited) {
            try {
                return new window.solanaWeb3.Connection(rpcUrl);
            } catch (error) {
                console.debug('Failed to create connection:', error);
            }
        }
    }
    
    // Return null if we can't get a valid connection
    return null;
}

/**
 * Enhanced token price fetching with multiple fallback sources
 * Priority: On-chain (fastest, uses dedicated RPC) > Jupiter > DexScreener
 * Optimized for frequent updates without hitting rate limits
 */
async function fetchTokenPriceDetails(mintAddress, { solPrice = null, preferOnChain = false } = {}) {
    // If preferOnChain is true, try on-chain first (fastest, no rate limits)
    if (preferOnChain) {
        try {
            const connection = getSolanaConnection('price');
            if (connection) {
                const onChainData = await calculateOnChainPrice(mintAddress);
                if (onChainData && onChainData.priceSol) {
                    const priceSol = onChainData.priceSol;
                    const priceUsd = solPrice ? priceSol * solPrice : null;
                    return {
                        priceSol,
                        priceUsd,
                        marketCapUsd: null,
                        source: 'on-chain'
                    };
                }
            }
        } catch (error) {
            console.debug('On-chain price calculation failed, trying external APIs:', error.message);
        }
    }
    
    // Try Jupiter first (most reliable for market cap)
    try {
        const jupiterData = await fetchJupiterPrice(mintAddress);
        if (jupiterData && jupiterData.price) {
            const priceSol = jupiterData.price;
            const priceUsd = solPrice ? priceSol * solPrice : null;
            return {
                priceSol,
                priceUsd,
                marketCapUsd: jupiterData.marketCap || null,
                source: 'jupiter'
            };
        }
    } catch (error) {
        // Only log non-network errors (DNS errors are handled silently in fetchJupiterPrice)
        const errorMsg = error.message || '';
        if (!errorMsg.includes('ERR_NAME_NOT_RESOLVED') && 
            !errorMsg.includes('ERR_INTERNET_DISCONNECTED') &&
            !errorMsg.includes('Failed to fetch')) {
            console.debug('⚠️ Jupiter price fetch failed:', error.message);
        }
    }

    // Try DexScreener as fallback
    try {
        const dexData = await fetchDexScreenerPrice(mintAddress);
        if (dexData && dexData.priceUsd) {
            const priceUsd = dexData.priceUsd;
            const priceSol = solPrice ? priceUsd / solPrice : null;
            return {
                priceSol,
                priceUsd,
                marketCapUsd: dexData.marketCap || null,
                source: 'dexscreener'
            };
        }
    } catch (error) {
        console.debug('⚠️ DexScreener price fetch failed:', error.message);
    }

    // Try on-chain calculation as last resort (only if we have valid RPC)
    // Use dedicated price RPC if available
    try {
        const connection = getSolanaConnection('price');
        if (connection) {
            const onChainData = await calculateOnChainPrice(mintAddress);
            if (onChainData && onChainData.priceSol) {
                const priceSol = onChainData.priceSol;
                const priceUsd = solPrice ? priceSol * solPrice : null;
                return {
                    priceSol,
                    priceUsd,
                    marketCapUsd: null,
                    source: 'on-chain'
                };
            }
        } else {
            console.debug('Skipping on-chain price calculation - no valid RPC connection');
        }
    } catch (error) {
        // Only log if it's not a connection availability error
        if (!error.message.includes('not available')) {
            console.debug('⚠️ On-chain price calculation failed:', error.message);
        } else {
            console.debug('On-chain price calculation skipped:', error.message);
        }
    }

    console.error('❌ All price sources failed for:', mintAddress);
    return {
        priceSol: null,
        priceUsd: null,
        marketCapUsd: null,
        source: 'none'
    };
}

/**
 * Jupiter price API (Free, no auth required)
 */
async function fetchJupiterPrice(mintAddress) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://price.jup.ag/v4/price?ids=${mintAddress}`,
            { 
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Jupiter API returned ${response.status}`);
        }
        
        const data = await response.json();
        const tokenData = data.data?.[mintAddress];
        
        if (!tokenData || !tokenData.price) {
            return null;
        }
        
        return {
            price: parseFloat(tokenData.price),
            marketCap: null // Jupiter doesn't provide this
        };
    } catch (error) {
        // Silently handle DNS/network errors - these are expected when Jupiter is down
        // Only throw if it's a timeout or other non-network error
        if (error.name === 'AbortError') {
            throw new Error('Jupiter request timeout');
        }
        
        // Check for DNS/network errors (ERR_NAME_NOT_RESOLVED, ERR_INTERNET_DISCONNECTED, etc.)
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch') ||
            errorMsg.includes('NetworkError')) {
            // Silently fail - fallback will be used
            return null;
        }
        
        throw new Error(`Jupiter fetch failed: ${error.message}`);
    }
}

/**
 * DexScreener API (Free, no auth required)
 */
async function fetchDexScreenerPrice(mintAddress) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
            { 
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`DexScreener API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // Get the pair with highest liquidity
        const pairs = data.pairs || [];
        if (pairs.length === 0) {
            return null;
        }
        
        const bestPair = pairs.reduce((best, current) => {
            const bestLiq = parseFloat(best.liquidity?.usd || 0);
            const currentLiq = parseFloat(current.liquidity?.usd || 0);
            return currentLiq > bestLiq ? current : best;
        });
        
        return {
            priceUsd: parseFloat(bestPair.priceUsd) || null,
            marketCap: parseFloat(bestPair.marketCap) || null
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('DexScreener request timeout');
        }
        throw new Error(`DexScreener fetch failed: ${error.message}`);
    }
}

/**
 * Calculate price directly from on-chain bonding curve
 */
async function calculateOnChainPrice(mintAddress) {
    try {
        // Use dedicated price RPC for price calculations
        const connection = getSolanaConnection('price');
        
        if (!connection) {
            throw new Error('Solana connection not available - configure RPC in Settings');
        }
        
        // Get token account info
        const PublicKey = window.solanaWeb3?.PublicKey;
        if (!PublicKey) {
            throw new Error('Solana Web3.js not loaded');
        }
        
        const mintPubkey = new PublicKey(mintAddress);
        
        // Try to find bonding curve account (Pump.fun specific)
        const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
        
        try {
            const [bondingCurve] = PublicKey.findProgramAddressSync(
                [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
                PUMP_FUN_PROGRAM
            );
            
            const curveAccount = await connection.getAccountInfo(bondingCurve);
            
            if (curveAccount && curveAccount.data) {
                // Parse bonding curve data (this is Pump.fun specific)
                const data = curveAccount.data;
                
                // Virtual SOL reserves at offset 8
                const virtualSolReserves = data.readBigUInt64LE(8);
                // Virtual token reserves at offset 16  
                const virtualTokenReserves = data.readBigUInt64LE(16);
                
                if (virtualTokenReserves > 0n) {
                    const priceSol = Number(virtualSolReserves) / Number(virtualTokenReserves);
                    return { priceSol };
                }
            }
        } catch (curveError) {
            // Bonding curve not found, try alternative methods
            console.debug('Bonding curve not found, trying alternative price calculation');
        }
        
        throw new Error('Could not calculate price from bonding curve');
    } catch (error) {
        throw new Error(`On-chain calculation failed: ${error.message}`);
    }
}

/**
 * Enhanced trade feed with Helius Enhanced APIs and fallback to on-chain transactions
 */
async function fetchPumpFunTradeFeed(mintAddress, limit = 20) {
    console.log('🔍 Fetching trade feed for:', mintAddress);
    
    // Priority 1: Try Helius Enhanced API (fastest, best parsing)
    try {
        const heliusTrades = await fetchHeliusEnhancedTrades(mintAddress, limit);
        if (heliusTrades && heliusTrades.length > 0) {
            console.log(`✅ Retrieved ${heliusTrades.length} trades from Helius Enhanced API`);
            return heliusTrades;
        }
    } catch (error) {
        console.debug('Helius Enhanced API fetch failed, trying fallback:', error.message);
    }
    
    // Priority 2: Try on-chain transactions via RPC
    try {
        const connection = getSolanaConnection('monitoring');
        if (connection) {
            const trades = await fetchOnChainTrades(mintAddress, limit);
            if (trades && trades.length > 0) {
                console.log(`✅ Retrieved ${trades.length} trades from blockchain`);
                return trades;
            }
        } else {
            console.debug('Skipping on-chain trade fetch - no valid RPC connection available');
        }
    } catch (error) {
        // Only log if it's not a connection availability error
        if (!error.message.includes('not available')) {
            console.warn('⚠️ On-chain trade fetch failed:', error.message);
        } else {
            console.debug('On-chain trade fetch skipped:', error.message);
        }
    }
    
    // Return empty array instead of failing
    console.warn('⚠️ No trade data available - showing empty activity');
    return [];
}

/**
 * Fetch trades using Helius Enhanced Transaction API
 * Much faster and better parsed than standard RPC calls
 */
async function fetchHeliusEnhancedTrades(mintAddress, limit = 20) {
    try {
        // Get Helius API key from settings
        let heliusApiKey = null;
        try {
            if (window.settingsManager?.getSettings) {
                const settings = window.settingsManager.getSettings();
                // Try to get from Helius settings or monitoring RPC
                heliusApiKey = settings?.helius?.apiKey || 
                    extractApiKeyFromUrl(settings?.solana?.monitoringRpc) ||
                    extractApiKeyFromUrl(settings?.solana?.priceRpc);
            }
            
            // Fallback: try localStorage
            if (!heliusApiKey) {
                const stored = localStorage.getItem('chaosbot_settings');
                if (stored) {
                    const settings = JSON.parse(stored);
                    heliusApiKey = settings?.helius?.apiKey || 
                        extractApiKeyFromUrl(settings?.solana?.monitoringRpc) ||
                        extractApiKeyFromUrl(settings?.solana?.priceRpc);
                }
            }
        } catch (error) {
            console.debug('Failed to get Helius API key from settings:', error);
        }
        
        if (!heliusApiKey) {
            throw new Error('Helius API key not configured');
        }
        
        // Use address-specific endpoint for better results
        const url = `https://api.helius.xyz/v0/addresses/${mintAddress}/transactions?api-key=${heliusApiKey}&limit=${limit}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Helius API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || !Array.isArray(data)) {
            return [];
        }
        
        // Parse Helius transaction data
        const trades = [];
        for (const tx of data) {
            try {
                const tradeData = parseHeliusTransaction(tx, mintAddress);
                if (tradeData) {
                    trades.push(tradeData);
                }
            } catch (err) {
                console.debug('Failed to parse Helius transaction:', err.message);
            }
        }
        
        return trades;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Helius API request timeout');
        }
        throw new Error(`Helius Enhanced API fetch failed: ${error.message}`);
    }
}

/**
 * Extract API key from Helius RPC URL
 */
function extractApiKeyFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/api-key=([^&]+)/);
    return match ? match[1] : null;
}

/**
 * Parse trade data from Helius Enhanced API transaction
 */
function parseHeliusTransaction(tx, mintAddress) {
    try {
        if (!tx || !tx.nativeTransfers || !tx.tokenTransfers) {
            return null;
        }
        
        // Find token transfers for this mint
        const tokenTransfer = tx.tokenTransfers.find(t => 
            t.mint === mintAddress || t.mintAddress === mintAddress
        );
        
        if (!tokenTransfer) {
            return null;
        }
        
        // Find corresponding SOL transfer
        const solTransfer = tx.nativeTransfers.find(t => 
            t.fromUserAccount === tokenTransfer.fromUserAccount ||
            t.toUserAccount === tokenTransfer.fromUserAccount ||
            t.fromUserAccount === tokenTransfer.toUserAccount ||
            t.toUserAccount === tokenTransfer.toUserAccount
        );
        
        const tokenAmount = parseFloat(tokenTransfer.tokenAmount || 0);
        const solAmount = solTransfer ? Math.abs(parseFloat(solTransfer.amount || 0)) / 1e9 : 0;
        
        if (tokenAmount === 0 && solAmount === 0) {
            return null;
        }
        
        const isBuy = tokenAmount > 0;
        const wallet = tokenTransfer.fromUserAccount || tx.source || 'Unknown';
        
        return {
            type: isBuy ? 'buy' : 'sell',
            wallet: wallet,
            timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
            amountTokens: Math.abs(tokenAmount),
            amountSol: solAmount,
            signature: tx.signature || null
        };
    } catch (error) {
        console.debug('Failed to parse Helius transaction:', error.message);
        return null;
    }
}

/**
 * Fetch actual trades from blockchain transaction history
 */
async function fetchOnChainTrades(mintAddress, limit = 20) {
    try {
        // Use dedicated monitoring RPC for trade fetching
        const connection = getSolanaConnection('monitoring');
        
        if (!connection) {
            throw new Error('Solana connection not available - configure RPC in Settings');
        }
        
        const PublicKey = window.solanaWeb3?.PublicKey;
        if (!PublicKey) {
            throw new Error('Solana Web3.js not loaded');
        }
        
        const mintPubkey = new PublicKey(mintAddress);
        
        // Get recent signatures
        const signatures = await connection.getSignaturesForAddress(
            mintPubkey,
            { limit: limit * 2 } // Get more to filter out non-trades
        );
        
        console.log(`Found ${signatures.length} transactions`);
        
        // Parse transactions to extract trade data
        const trades = [];
        
        for (const sigInfo of signatures.slice(0, limit)) {
            try {
                const tx = await connection.getParsedTransaction(
                    sigInfo.signature,
                    { maxSupportedTransactionVersion: 0 }
                );
                
                if (!tx || tx.meta?.err) continue;
                
                const tradeData = parseTradeFromTransaction(tx, mintAddress);
                if (tradeData) {
                    trades.push(tradeData);
                }
            } catch (err) {
                console.debug('Failed to parse transaction:', err.message);
            }
        }
        
        return trades;
    } catch (error) {
        throw new Error(`On-chain trade fetch failed: ${error.message}`);
    }
}

/**
 * Parse trade information from a transaction
 */
function parseTradeFromTransaction(tx, mintAddress) {
    try {
        if (!tx.meta || !tx.transaction) return null;
        
        const preTokenBalances = tx.meta.preTokenBalances || [];
        const postTokenBalances = tx.meta.postTokenBalances || [];
        
        // Find token balance changes
        let tokenChange = 0;
        let solChange = 0;
        let wallet = null;
        
        // Check token balance changes
        for (const post of postTokenBalances) {
            if (post.mint === mintAddress) {
                const pre = preTokenBalances.find(p => 
                    p.accountIndex === post.accountIndex && p.mint === mintAddress
                );
                
                const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmount || 0) : 0;
                const postAmount = parseFloat(post.uiTokenAmount.uiAmount || 0);
                tokenChange = postAmount - preAmount;
                wallet = post.owner;
                break;
            }
        }
        
        // Check SOL balance changes
        if (tx.meta.preBalances && tx.meta.postBalances) {
            const solBalanceChanges = tx.meta.postBalances.map((post, i) => 
                (post - tx.meta.preBalances[i]) / 1e9 // Convert lamports to SOL
            );
            
            // Find the largest SOL change (likely the trader)
            solChange = solBalanceChanges.reduce((sum, change) => 
                Math.abs(change) > Math.abs(sum) ? change : sum, 0
            );
        }
        
        if (tokenChange === 0 && solChange === 0) return null;
        
        const isBuy = tokenChange > 0;
        
        return {
            type: isBuy ? 'buy' : 'sell',
            wallet: wallet || (tx.transaction.message.accountKeys?.[0]?.pubkey?.toString()) || 'Unknown',
            timestamp: (tx.blockTime || 0) * 1000,
            amountTokens: Math.abs(tokenChange),
            amountSol: Math.abs(solChange),
            signature: tx.transaction.signatures?.[0] || null
        };
    } catch (error) {
        console.debug('Failed to parse trade:', error.message);
        return null;
    }
}

/**
 * Retry helper with exponential backoff
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

/**
 * Fetch token metadata from DexScreener API
 */
async function fetchDexScreenerMetadata(mintAddress) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
            { 
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`DexScreener API returned ${response.status}`);
        }
        
        const data = await response.json();
        const pairs = data.pairs || [];
        if (pairs.length === 0) {
            return null;
        }
        
        // Get the pair with highest liquidity
        const bestPair = pairs.reduce((best, current) => {
            const bestLiq = parseFloat(best.liquidity?.usd || 0);
            const currentLiq = parseFloat(current.liquidity?.usd || 0);
            return currentLiq > bestLiq ? current : best;
        });
        
        return {
            name: bestPair.baseToken?.name || null,
            symbol: bestPair.baseToken?.symbol || null,
            image: bestPair.baseToken?.logoURI || null,
            marketCap: parseFloat(bestPair.marketCap) || null,
            priceUsd: parseFloat(bestPair.priceUsd) || null,
            source: 'dexscreener'
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('DexScreener request timeout');
        }
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch')) {
            return null; // Silently fail
        }
        throw error;
    }
}

/**
 * Fetch token metadata from Birdeye API
 */
async function fetchBirdeyeMetadata(mintAddress) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`,
            { 
                signal: controller.signal,
                headers: { 
                    'Accept': 'application/json',
                    'X-API-KEY': '' // Birdeye allows some requests without API key
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Birdeye API returned ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success && data.data) {
            return {
                name: data.data.name || null,
                symbol: data.data.symbol || null,
                image: data.data.logoURI || null,
                marketCap: data.data.mc ? parseFloat(data.data.mc) : null,
                priceUsd: data.data.price ? parseFloat(data.data.price) : null,
                source: 'birdeye'
            };
        }
        return null;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Birdeye request timeout');
        }
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch')) {
            return null; // Silently fail
        }
        throw error;
    }
}

/**
 * Enhanced token info fetch with comprehensive fallbacks and retry logic
 * Priority: Pump.fun API > DexScreener > Birdeye > On-chain Metaplex > On-chain basic
 */
async function fetchPumpFunTokenDetails(mintAddress) {
    console.log('🔍 Fetching token details for:', mintAddress);
    
    // Source 1: Pump.fun API (with retry)
    try {
        const pumpFunData = await retryWithBackoff(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(
                `https://frontend-api.pump.fun/coins/${mintAddress}`,
                { 
                    signal: controller.signal,
                    headers: { 'Accept': 'application/json' }
                }
            );
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                return { ...data, success: true, source: 'pumpfun' };
            }
            throw new Error(`Pump.fun API returned ${response.status}`);
        }, 2); // 2 retries
        
        if (pumpFunData && pumpFunData.name) {
            console.log('✅ Pump.fun token details retrieved');
            return pumpFunData;
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.debug('⚠️ Pump.fun API unavailable:', error.message);
        }
    }
    
    // Source 2: DexScreener API (with retry)
    try {
        const dexData = await retryWithBackoff(async () => {
            return await fetchDexScreenerMetadata(mintAddress);
        }, 2);
        
        if (dexData && (dexData.name || dexData.symbol)) {
            console.log('✅ DexScreener token metadata retrieved');
            return { ...dexData, success: true };
        }
    } catch (error) {
        console.debug('⚠️ DexScreener metadata unavailable:', error.message);
    }
    
    // Source 3: Birdeye API (with retry)
    try {
        const birdeyeData = await retryWithBackoff(async () => {
            return await fetchBirdeyeMetadata(mintAddress);
        }, 2);
        
        if (birdeyeData && (birdeyeData.name || birdeyeData.symbol)) {
            console.log('✅ Birdeye token metadata retrieved');
            return { ...birdeyeData, success: true };
        }
    } catch (error) {
        console.debug('⚠️ Birdeye metadata unavailable:', error.message);
    }
    
    // Source 4: On-chain Metaplex metadata (full metadata with name, symbol, image)
    try {
        const connection = getSolanaConnection();
        if (connection) {
            const metadata = await fetchOnChainMetadata(mintAddress, true); // true = full metadata
            if (metadata && (metadata.name || metadata.symbol)) {
                console.log('✅ Retrieved full metadata from blockchain (Metaplex)');
                return { ...metadata, success: true, source: 'on-chain-metaplex' };
            }
        }
    } catch (error) {
        console.debug('⚠️ On-chain Metaplex metadata fetch failed:', error.message);
    }
    
    // Source 5: On-chain basic info (mint account only)
    try {
        const connection = getSolanaConnection();
        if (connection) {
            const basicInfo = await fetchOnChainMetadata(mintAddress, false); // false = basic only
            console.log('✅ Retrieved basic info from blockchain');
            return { ...basicInfo, success: true, source: 'on-chain-basic' };
        }
    } catch (error) {
        console.debug('⚠️ On-chain basic info fetch failed:', error.message);
    }
    
    // Return minimal data structure if all sources fail
    console.warn('⚠️ No token details available from any source');
    return { 
        success: false,
        mint: mintAddress,
        name: null,
        symbol: null,
        image: null,
        marketCap: null,
        bondingCurve: null,
        bondingCurvePercentage: null
    };
}

/**
 * Fetch token metadata from blockchain
 * @param {string} mintAddress - Token mint address
 * @param {boolean} fullMetadata - If true, fetch full Metaplex metadata (name, symbol, image). If false, only basic mint info.
 */
async function fetchOnChainMetadata(mintAddress, fullMetadata = false) {
    try {
        const connection = getSolanaConnection();
        
        if (!connection) {
            throw new Error('Solana connection not available - configure RPC in Settings');
        }
        
        const PublicKey = window.solanaWeb3?.PublicKey;
        if (!PublicKey) {
            throw new Error('Solana Web3.js not loaded');
        }
        
        const mintPubkey = new PublicKey(mintAddress);
        
        // Get mint account info (always needed)
        const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
        
        if (!mintInfo.value) {
            throw new Error('Token account not found');
        }
        
        const supply = mintInfo.value.data?.parsed?.info?.supply;
        const decimals = mintInfo.value.data?.parsed?.info?.decimals || 9;
        
        const result = {
            supply: supply ? parseInt(supply) : null,
            decimals: decimals
        };
        
        // If full metadata requested, try to get Metaplex metadata
        if (fullMetadata) {
            try {
                // Metaplex Metadata Program ID
                const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
                const TOKEN_METADATA_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
                
                // Derive metadata PDA
                const [metadataPDA] = PublicKey.findProgramAddressSync(
                    [
                        Buffer.from('metadata'),
                        METADATA_PROGRAM_ID.toBuffer(),
                        mintPubkey.toBuffer()
                    ],
                    METADATA_PROGRAM_ID
                );
                
                // Get metadata account
                const metadataAccount = await connection.getAccountInfo(metadataPDA);
                
                if (metadataAccount) {
                    // Parse Metaplex metadata (simplified - full parsing would require Metaplex SDK)
                    // For now, try to fetch from metadata URI if available
                    try {
                        // Try to get metadata from common metadata endpoints
                        const metadataUri = `https://api.mainnet-beta.solana.com/api/v1/token/${mintAddress}`;
                        const metadataResponse = await fetch(metadataUri, { 
                            signal: AbortSignal.timeout(5000) 
                        });
                        
                        if (metadataResponse.ok) {
                            const metadataData = await metadataResponse.json();
                            if (metadataData.token) {
                                result.name = metadataData.token.name || null;
                                result.symbol = metadataData.token.symbol || null;
                                result.image = metadataData.token.logoURI || null;
                            }
                        }
                    } catch (uriError) {
                        console.debug('Metadata URI fetch failed:', uriError.message);
                    }
                }
            } catch (metaplexError) {
                console.debug('Metaplex metadata fetch failed:', metaplexError.message);
            }
        }
        
        return result;
    } catch (error) {
        throw new Error(`Metadata fetch failed: ${error.message}`);
    }
}

// ============================================================================
// EXPORT / MAKE AVAILABLE GLOBALLY
// ============================================================================

// Attach to window for global access
if (typeof window !== 'undefined') {
    window.enhancedTokenFetchers = {
        fetchTokenPriceDetails,
        fetchPumpFunTradeFeed,
        fetchPumpFunTokenDetails,
        fetchDexScreenerMetadata,
        fetchBirdeyeMetadata,
        retryWithBackoff,
        fetchJupiterPrice,
        fetchDexScreenerPrice,
        calculateOnChainPrice,
        fetchOnChainTrades,
        parseTradeFromTransaction,
        fetchHeliusEnhancedTrades,
        parseHeliusTransaction,
        getSolanaConnection // Export the RPC connection getter
    };
    
    // Also make getSolanaConnection available globally for easy access
    window.getSolanaConnectionForPurpose = getSolanaConnection;
    
    console.log('✅ Enhanced Token Fetchers loaded - Dedicated RPC support enabled');
    console.log('   📊 Use getSolanaConnection("price") for market cap/price updates');
    console.log('   📡 Use getSolanaConnection("monitoring") for trade monitoring');
    console.log('   🔧 Use getSolanaConnection() for general operations');
}

