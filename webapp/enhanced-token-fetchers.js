// ============================================================================
// ENHANCED TOKEN DATA FETCHING WITH MULTIPLE FALLBACKS
// ============================================================================
// Priority: Jupiter > DexScreener > Birdeye > Pump.fun > On-chain
// Provides reliable token data even when APIs are down

/**
 * Safe number conversion helper
 */
function safeNumber(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/**
 * Get Solana connection from RPC Pool Manager with automatic failover
 * Uses intelligent rotation: Free RPCs first → Paid RPCs last
 * Automatically handles rate limits and failover
 * @param {string} purpose - 'price' for price/market cap updates, 'monitoring' for trade monitoring, or null for general use
 */
function getSolanaConnection(purpose = null) {
    // Use RPC Pool Manager if available (intelligent rotation & failover)
    if (window.rpcPoolManager) {
        try {
            const connection = window.rpcPoolManager.getConnection(purpose);
            if (connection) {
                return connection;
            }
        } catch (error) {
            console.debug('RPC Pool Manager failed, falling back to legacy method:', error);
        }
    }
    
    // Fallback to legacy method if pool manager not available
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
 * Enhanced token price fetching with API Pool Manager
 * Uses intelligent rotation: Fastest APIs first → Free APIs prioritized
 * Supports parallel requests for fastest response
 */
async function fetchTokenPriceDetails(mintAddress, { solPrice = null, preferOnChain = false } = {}) {
    // Use API Pool Manager if available (intelligent rotation & parallel requests)
    // This tries ALL APIs in parallel for fastest response
    if (window.apiPoolManager) {
        try {
            const result = await window.apiPoolManager.executeWithFailover('price', async (api) => {
                switch (api.url) {
                    case 'jupiter':
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
                        // Return null instead of throwing - allows silent fallback
                        return null;
                        
                    case 'dexscreener':
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
                        throw new Error('DexScreener returned no price data');
                        
                    case 'coingecko':
                        const cgData = await fetchCoinGeckoPrice(mintAddress);
                        if (cgData && cgData.priceUsd) {
                            const priceUsd = cgData.priceUsd;
                            const priceSol = solPrice ? priceUsd / solPrice : null;
                            return {
                                priceSol,
                                priceUsd,
                                marketCapUsd: cgData.marketCap || null,
                                source: 'coingecko'
                            };
                        }
                        throw new Error('CoinGecko returned no price data');
                        
                    case 'moralis':
                        const moralisPriceData = await fetchMoralisPrice(mintAddress);
                        if (moralisPriceData && moralisPriceData.priceUsd) {
                            const priceUsd = moralisPriceData.priceUsd;
                            const priceSol = solPrice ? priceUsd / solPrice : null;
                            return {
                                priceSol,
                                priceUsd,
                                marketCapUsd: moralisPriceData.marketCap || null,
                                source: 'moralis'
                            };
                        }
                        throw new Error('Moralis returned no price data');
                        
                    case 'onchain':
                        try {
                            console.log('🔄 Attempting on-chain price calculation for:', mintAddress);
                            const connection = getSolanaConnection('price');
                            if (!connection) {
                                console.debug('⚠️ No RPC connection available for on-chain price calculation');
                                return null; // Return null instead of throwing
                            }
                            const onChainData = await calculateOnChainPrice(mintAddress);
                            if (onChainData && onChainData.priceSol) {
                                const priceSol = onChainData.priceSol;
                                const priceUsd = solPrice ? priceSol * solPrice : null;
                                console.log('✅ On-chain price calculation successful:', priceSol, 'SOL');
                                return {
                                    priceSol,
                                    priceUsd,
                                    marketCapUsd: null,
                                    source: 'on-chain'
                                };
                            }
                            console.debug('⚠️ On-chain price calculation returned no price data');
                            // Return null instead of throwing - allows other APIs to be tried
                            return null;
                        } catch (error) {
                            console.warn('⚠️ On-chain price calculation error:', error.message);
                            return null; // Return null to allow fallback to other APIs
                        }
                        
                    default:
                        throw new Error(`Unknown price API: ${api.url}`);
                }
            }, { parallel: true }); // Try ALL APIs in parallel for fastest response
            
            // If we got a result but no market cap, try to get market cap from another source
            if (result && result.priceUsd !== null && result.marketCapUsd === null) {
                // Market cap is missing - try to get it from another API that provides it
                try {
                    // Try CoinGecko or Moralis for market cap (they usually have it)
                    const marketCapSources = ['coingecko', 'moralis'];
                    for (const source of marketCapSources) {
                        try {
                            let marketCapData = null;
                            if (source === 'coingecko') {
                                marketCapData = await fetchCoinGeckoPrice(mintAddress);
                            } else if (source === 'moralis') {
                                marketCapData = await fetchMoralisPrice(mintAddress);
                            }
                            
                            if (marketCapData && marketCapData.marketCap) {
                                result.marketCapUsd = marketCapData.marketCap;
                                result.source = `${result.source}+${source}`;
                                break; // Found market cap, stop trying
                            }
                        } catch (error) {
                            // Silently continue to next source
                        }
                    }
                } catch (error) {
                    // Ignore market cap fetch errors - we already have price
                }
            }
            
            return result;
        } catch (error) {
            console.debug('API Pool Manager price fetch failed, using legacy fallback:', error.message);
        }
    }
    
    // Legacy fallback: If preferOnChain is true, try on-chain first (fastest, no rate limits)
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
    
    // Legacy fallback (if API Pool Manager not available)
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
        // Only log non-network errors (network errors are handled silently in fetchDexScreenerPrice)
        const errorMsg = error.message || '';
        if (!errorMsg.includes('ERR_NAME_NOT_RESOLVED') && 
            !errorMsg.includes('ERR_INTERNET_DISCONNECTED') &&
            !errorMsg.includes('Failed to fetch') &&
            !errorMsg.includes('temporarily unavailable')) {
            console.debug('⚠️ DexScreener price fetch failed:', error.message);
        }
    }

    // Try on-chain calculation as last resort
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
        console.debug('On-chain price calculation skipped:', error.message);
    }

    // Log as debug instead of error - this is expected when all external APIs are down
    console.debug('⚠️ All price sources unavailable for:', mintAddress, '- This is normal if external APIs are down');
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
 * CoinGecko API (Free, no auth required)
 * Note: CoinGecko uses contract addresses, not mint addresses directly
 * For Solana tokens, we need to use the contract address format
 */
async function fetchCoinGeckoPrice(mintAddress) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        // CoinGecko uses contract addresses in format: solana:{mintAddress}
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${mintAddress}&vs_currencies=usd&include_market_cap=true`,
            { 
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            // CoinGecko returns 404 if token not found - this is normal
            if (response.status === 404) {
                return null;
            }
            throw new Error(`CoinGecko API returned ${response.status}`);
        }
        
        const data = await response.json();
        const tokenData = data[mintAddress.toLowerCase()];
        
        if (!tokenData || !tokenData.usd) {
            return null;
        }
        
        return {
            priceUsd: parseFloat(tokenData.usd),
            marketCap: tokenData.usd_market_cap ? parseFloat(tokenData.usd_market_cap) : null
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('CoinGecko request timeout');
        }
        
        // Silently handle DNS/network errors
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch') ||
            errorMsg.includes('NetworkError')) {
            return null;
        }
        
        throw new Error(`CoinGecko fetch failed: ${error.message}`);
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
            // Properly handle rate limit errors (429) so API Pool Manager can detect them
            if (response.status === 429) {
                const error = new Error(`DexScreener rate limit exceeded (429)`);
                error.status = 429;
                error.code = 429;
                throw error;
            }
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
        // Check for network/DNS errors
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch') ||
            errorMsg.includes('temporarily unavailable')) {
            // Silently fail - fallback will be used
            return null;
        }
        throw new Error(`DexScreener fetch failed: ${error.message}`);
    }
}

/**
 * Calculate price directly from on-chain bonding curve
 */
async function calculateOnChainPrice(mintAddress) {
    try {
        console.log('🔧 Starting on-chain price calculation for:', mintAddress);
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
            console.log('🔍 Looking for Pump.fun bonding curve account...');
            
            // Browser-compatible Buffer alternative
            const encoder = new TextEncoder();
            const bondingCurveSeed = encoder.encode('bonding-curve');
            
            const [bondingCurve] = PublicKey.findProgramAddressSync(
                [bondingCurveSeed, mintPubkey.toBuffer()],
                PUMP_FUN_PROGRAM
            );
            
            console.log('🔍 Bonding curve address:', bondingCurve.toBase58());
            const curveAccount = await connection.getAccountInfo(bondingCurve);
            
            if (curveAccount && curveAccount.data) {
                console.log('✅ Bonding curve account found, parsing price data...');
                // Parse bonding curve data (this is Pump.fun specific)
                const data = curveAccount.data;
                
                // Browser-compatible readBigUInt64LE function
                function readBigUInt64LE(buffer, offset) {
                    let result = 0n;
                    for (let i = 0; i < 8; i++) {
                        result |= BigInt(buffer[offset + i]) << BigInt(i * 8);
                    }
                    return result;
                }
                
                // Virtual SOL reserves at offset 8
                const virtualSolReserves = readBigUInt64LE(data, 8);
                // Virtual token reserves at offset 16  
                const virtualTokenReserves = readBigUInt64LE(data, 16);
                
                console.log('📊 Bonding curve reserves:', {
                    virtualSolReserves: virtualSolReserves.toString(),
                    virtualTokenReserves: virtualTokenReserves.toString()
                });
                
                if (virtualTokenReserves > 0n) {
                    // Convert virtual SOL reserves from lamports to SOL, then divide by token reserves
                    const virtualSolReservesSol = Number(virtualSolReserves) / 1_000_000_000; // Convert lamports to SOL
                    const priceSol = virtualSolReservesSol / Number(virtualTokenReserves);
                    console.log('✅ Calculated price from bonding curve:', priceSol, 'SOL per token');
                    return { priceSol };
                } else {
                    console.debug('⚠️ Virtual token reserves is 0, cannot calculate price');
                }
            } else {
                console.debug('⚠️ Bonding curve account not found or has no data');
            }
        } catch (curveError) {
            // Bonding curve not found, try alternative methods
            console.debug('⚠️ Bonding curve lookup failed:', curveError.message);
        }
        
        throw new Error('Could not calculate price from bonding curve');
    } catch (error) {
        console.debug('❌ On-chain price calculation failed:', error.message);
        throw new Error(`On-chain calculation failed: ${error.message}`);
    }
}

/**
 * Enhanced trade feed with Helius Enhanced APIs and fallback to on-chain transactions
 */
async function fetchPumpFunTradeFeed(mintAddress, limit = 20) {
    console.log('🔍 Fetching trade feed for:', mintAddress);
    
    // Use API Pool Manager if available (intelligent rotation)
    if (window.apiPoolManager) {
        try {
            return await window.apiPoolManager.executeWithFailover('trade', async (api) => {
                switch (api.url) {
                    case 'helius':
                        const heliusTrades = await fetchHeliusEnhancedTrades(mintAddress, limit);
                        if (heliusTrades && heliusTrades.length > 0) {
                            return heliusTrades;
                        }
                        throw new Error('Helius returned no trades');
                        
                    case 'moralis':
                        const moralisTrades = await fetchMoralisTrades(mintAddress, limit);
                        if (moralisTrades && moralisTrades.length > 0) {
                            return moralisTrades;
                        }
                        throw new Error('Moralis returned no trades');
                        
                    case 'pumpportal':
                        // PumpPortal is WebSocket-based, not suitable for one-time fetch
                        throw new Error('PumpPortal is WebSocket-based');
                        
                    case 'onchain':
                        const connection = getSolanaConnection('monitoring');
                        if (!connection) {
                            throw new Error('No RPC connection available');
                        }
                        const onChainTrades = await fetchOnChainTrades(mintAddress, limit);
                        if (onChainTrades && onChainTrades.length > 0) {
                            return onChainTrades;
                        }
                        throw new Error('On-chain returned no trades');
                        
                    default:
                        throw new Error(`Unknown trade API: ${api.url}`);
                }
            }, { parallel: false }); // Sequential for trades (Helius is fastest, try it first)
        } catch (error) {
            console.debug('API Pool Manager trade fetch failed, using legacy fallback:', error.message);
        }
    }
    
    // Legacy fallback (if API Pool Manager not available)
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
            // Properly handle rate limit errors (429) so API Pool Manager can detect them
            if (response.status === 429) {
                const error = new Error(`DexScreener rate limit exceeded (429)`);
                error.status = 429;
                error.code = 429;
                throw error;
            }
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
 * Get Moralis API key from settings
 */
function getMoralisApiKey() {
    try {
        // Try settingsManager first
        if (window.settingsManager?.settings?.moralis?.apiKey) {
            return window.settingsManager.settings.moralis.apiKey.trim();
        }
        
        // Fallback to localStorage
        const saved = localStorage.getItem('chaosbot_settings');
        if (saved) {
            const settings = JSON.parse(saved);
            if (settings.moralis?.apiKey) {
                return settings.moralis.apiKey.trim();
            }
        }
        
        return null; // No default - requires user to provide API key
    } catch (error) {
        console.debug('Error getting Moralis API key:', error);
        return null;
    }
}

/**
 * Fetch token price from Moralis Pump.fun API
 */
async function fetchMoralisPrice(mintAddress) {
    try {
        const apiKey = getMoralisApiKey();
        if (!apiKey) {
            throw new Error('Moralis API key not configured');
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://solana-gateway.moralis.io/token/mainnet/${mintAddress}/price`,
            { 
                signal: controller.signal,
                headers: {
                    'accept': 'application/json',
                    'X-API-Key': apiKey
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Moralis API key invalid');
            }
            if (response.status === 404) {
                return null; // Token not found
            }
            throw new Error(`Moralis API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.usdPrice) {
            return {
                priceUsd: parseFloat(data.usdPrice),
                marketCap: data.marketCap ? parseFloat(data.marketCap) : null
            };
        }
        
        return null;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Moralis request timeout');
        }
        
        // Silently handle network errors
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch')) {
            return null;
        }
        
        throw error;
    }
}

/**
 * Fetch token metadata from Moralis Pump.fun API
 */
async function fetchMoralisMetadata(mintAddress) {
    try {
        const apiKey = getMoralisApiKey();
        if (!apiKey) {
            throw new Error('Moralis API key not configured');
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://solana-gateway.moralis.io/token/mainnet/${mintAddress}/metadata`,
            { 
                signal: controller.signal,
                headers: {
                    'accept': 'application/json',
                    'X-API-Key': apiKey
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Moralis API key invalid');
            }
            if (response.status === 404) {
                return null; // Token not found
            }
            throw new Error(`Moralis API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.name || data.symbol) {
            return {
                name: data.name || null,
                symbol: data.symbol || null,
                image: data.logo || data.logoURI || null,
                marketCap: data.marketCap ? parseFloat(data.marketCap) : null,
                priceUsd: data.priceUsd ? parseFloat(data.priceUsd) : null,
                source: 'moralis'
            };
        }
        
        return null;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Moralis request timeout');
        }
        
        // Silently handle network errors
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch')) {
            return null;
        }
        
        throw error;
    }
}

/**
 * Fetch bonding curve data from Moralis Pump.fun API
 * Tries multiple endpoints to get bonding curve percentage
 */
async function fetchMoralisBondingCurve(mintAddress) {
    try {
        const apiKey = getMoralisApiKey();
        if (!apiKey) {
            return null;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        // Strategy 1: Try individual token price endpoint (might include bonding data)
        try {
            const response = await fetch(
                `https://solana-gateway.moralis.io/token/mainnet/${mintAddress}/price`,
                {
                    signal: controller.signal,
                    headers: {
                        'accept': 'application/json',
                        'X-API-Key': apiKey
                    }
                }
            );
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                // Check if response includes bonding curve data
                if (data.bondingProgress !== undefined) {
                    const percent = safeNumber(data.bondingProgress);
                    if (percent !== null) {
                        console.log('✅ Moralis bonding curve from price endpoint:', percent + '%');
                        return {
                            bondingCurvePercentage: percent,
                            bondingCurve: {
                                percentComplete: percent,
                                isComplete: percent >= 100
                            },
                            isComplete: percent >= 100,
                            source: 'moralis-price'
                        };
                    }
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.debug('Moralis price endpoint failed, trying bonding list:', error.message);
            }
        }
        
        // Strategy 2: Query bonding tokens list and find our token
        const listController = new AbortController();
        const listTimeoutId = setTimeout(() => listController.abort(), 8000);
        
        try {
            const listResponse = await fetch(
                `https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding?limit=100`,
                {
                    signal: listController.signal,
                    headers: {
                        'accept': 'application/json',
                        'X-API-Key': apiKey
                    }
                }
            );
            
            clearTimeout(listTimeoutId);
            
            if (listResponse.ok) {
                const listData = await listResponse.json();
                
                // Find our token in the bonding list
                if (listData.result && Array.isArray(listData.result)) {
                    const token = listData.result.find(t => 
                        t.address?.toLowerCase() === mintAddress.toLowerCase() ||
                        t.mint?.toLowerCase() === mintAddress.toLowerCase()
                    );
                    
                    if (token && token.bondingProgress !== undefined) {
                        const percent = safeNumber(token.bondingProgress);
                        if (percent !== null) {
                            console.log('✅ Moralis bonding curve from bonding list:', percent + '%');
                            return {
                                bondingCurvePercentage: percent,
                                bondingCurve: {
                                    percentComplete: percent,
                                    isComplete: percent >= 100
                                },
                                isComplete: percent >= 100,
                                source: 'moralis-bonding-list'
                            };
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.debug('Moralis bonding list endpoint failed:', error.message);
            }
        }
        
        return null;
    } catch (error) {
        if (error.name === 'AbortError') {
            return null; // Timeout - silent fail
        }
        
        // Silently handle network errors
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch')) {
            return null;
        }
        
        // Only log non-network errors
        if (error.message && !error.message.includes('401') && !error.message.includes('404')) {
            console.debug('Moralis bonding curve fetch error:', error.message);
        }
        
        return null;
    }
}

/**
 * Fetch trades from Moralis Pump.fun API
 */
async function fetchMoralisTrades(mintAddress, limit = 20) {
    try {
        const apiKey = getMoralisApiKey();
        if (!apiKey) {
            throw new Error('Moralis API key not configured');
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(
            `https://solana-gateway.moralis.io/token/mainnet/${mintAddress}/swaps?limit=${limit}`,
            { 
                signal: controller.signal,
                headers: {
                    'accept': 'application/json',
                    'X-API-Key': apiKey
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Moralis API key invalid');
            }
            if (response.status === 404) {
                return []; // Token not found
            }
            throw new Error(`Moralis API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.result || !Array.isArray(data.result)) {
            return [];
        }
        
        // Parse Moralis swap format to our trade format
        return data.result.map(swap => ({
            type: swap.type === 'buy' ? 'buy' : 'sell',
            wallet: swap.wallet || swap.user || 'Unknown',
            timestamp: swap.timestamp ? swap.timestamp * 1000 : Date.now(),
            amountTokens: swap.tokenAmount ? Math.abs(parseFloat(swap.tokenAmount)) : 0,
            amountSol: swap.solAmount ? Math.abs(parseFloat(swap.solAmount)) : 0,
            signature: swap.signature || null
        })).slice(0, limit);
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Moralis request timeout');
        }
        
        // Silently handle network errors
        const errorMsg = error.message || '';
        if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
            errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
            errorMsg.includes('Failed to fetch')) {
            return [];
        }
        
        throw error;
    }
}

/**
 * Get Birdeye API key from settings
 */
function getBirdeyeApiKey() {
    try {
        // Try settingsManager first
        if (window.settingsManager?.settings?.birdeye?.apiKey) {
            return window.settingsManager.settings.birdeye.apiKey.trim();
        }
        
        // Fallback to localStorage
        const saved = localStorage.getItem('chaosbot_settings');
        if (saved) {
            const settings = JSON.parse(saved);
            if (settings.birdeye?.apiKey) {
                return settings.birdeye.apiKey.trim();
            }
        }
        
        // Default API key
        return '9ddbf4282f714067a229ad9caedd1b41';
    } catch (error) {
        console.debug('Error getting Birdeye API key:', error);
        return '9ddbf4282f714067a229ad9caedd1b41'; // Default fallback
    }
}

/**
 * Fetch token metadata from Birdeye API
 */
async function fetchBirdeyeMetadata(mintAddress) {
    try {
        const apiKey = getBirdeyeApiKey();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`,
            { 
                signal: controller.signal,
                headers: { 
                    'Accept': 'application/json',
                    'X-API-KEY': apiKey || '' // Use API key from settings
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            // Handle 401 (Unauthorized) gracefully - API key might be invalid/expired
            if (response.status === 401) {
                console.debug('⚠️ Birdeye API key invalid or expired (401) - skipping');
                return null;
            }
            // Silently handle network/DNS errors
            const errorMsg = `Birdeye API returned ${response.status}`;
            if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
                errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
                errorMsg.includes('Failed to fetch')) {
                return null;
            }
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
 * Enhanced token info fetch with API Pool Manager
 * Uses intelligent rotation: Fastest APIs first → Free APIs prioritized
 * Supports parallel requests for fastest response
 */
async function fetchPumpFunTokenDetails(mintAddress) {
    console.log('🔍 Fetching token details for:', mintAddress);
    
    // Use API Pool Manager if available (intelligent rotation & parallel requests)
    if (window.apiPoolManager) {
        try {
            return await window.apiPoolManager.executeWithFailover('metadata', async (api) => {
                switch (api.url) {
                    case 'pumpfun':
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
                            
                            // Extract name, symbol, and image from various possible field names
                            const name = data.name || data.token_name || null;
                            const symbol = data.symbol || data.token_symbol || null;
                            const image = data.image_uri || data.imageUri || data.image || data.image_url || data.imageUrl || 
                                         (data.metadata && data.metadata.image) || 
                                         (data.metadata && data.metadata.image_uri) || null;
                            
                            if (data && (name || symbol)) {
                                return { 
                                    ...data,
                                    name: name || data.name,
                                    symbol: symbol || data.symbol,
                                    image: image || data.image,
                                    success: true, 
                                    source: 'pumpfun' 
                                };
                            }
                        }
                        // Handle 530 (Cloudflare service unavailable) gracefully - return null to allow fallback
                        if (response.status === 530) {
                            console.debug('⚠️ Pump.fun API temporarily unavailable (530) - using fallback');
                            return null;
                        }
                        throw new Error(`Pump.fun API returned ${response.status}`);
                        
                    case 'dexscreener':
                        const dexData = await fetchDexScreenerMetadata(mintAddress);
                        if (dexData && (dexData.name || dexData.symbol)) {
                            return { ...dexData, success: true };
                        }
                        throw new Error('DexScreener returned no metadata');
                        
                    case 'moralis':
                        const moralisMetadata = await fetchMoralisMetadata(mintAddress);
                        if (moralisMetadata && (moralisMetadata.name || moralisMetadata.symbol)) {
                            // Also try to get bonding curve data
                            const bondingData = await fetchMoralisBondingCurve(mintAddress);
                            if (bondingData) {
                                return { 
                                    ...moralisMetadata, 
                                    ...bondingData,
                                    success: true, 
                                    source: 'moralis' 
                                };
                            }
                            return { ...moralisMetadata, success: true, source: 'moralis' };
                        }
                        throw new Error('Moralis returned no metadata');
                        
                    case 'birdeye':
                        const birdeyeData = await fetchBirdeyeMetadata(mintAddress);
                        if (birdeyeData && (birdeyeData.name || birdeyeData.symbol)) {
                            return { ...birdeyeData, success: true };
                        }
                        throw new Error('Birdeye returned no metadata');
                        
                    case 'onchain':
                        const connection = getSolanaConnection();
                        if (!connection) {
                            throw new Error('No RPC connection available');
                        }
                        const metadata = await fetchOnChainMetadata(mintAddress, true);
                        if (metadata && (metadata.name || metadata.symbol)) {
                            return { ...metadata, success: true, source: 'on-chain-metaplex' };
                        }
                        // Fallback to basic info
                        const basicInfo = await fetchOnChainMetadata(mintAddress, false);
                        return { ...basicInfo, success: true, source: 'on-chain-basic' };
                        
                    default:
                        throw new Error(`Unknown metadata API: ${api.url}`);
                }
            }, { parallel: true }); // Try fastest APIs in parallel
        } catch (error) {
            console.debug('API Pool Manager metadata fetch failed, using legacy fallback:', error.message);
        }
    }
    
    // Legacy fallback (if API Pool Manager not available)
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
                
                // Extract name, symbol, and image from various possible field names
                const name = data.name || data.token_name || null;
                const symbol = data.symbol || data.token_symbol || null;
                const image = data.image_uri || data.imageUri || data.image || data.image_url || data.imageUrl || 
                             (data.metadata && data.metadata.image) || 
                             (data.metadata && data.metadata.image_uri) || null;
                
                // Normalize bonding curve percentage from various possible field names
                let bondingCurvePercent = null;
                if (data.complete_percent !== undefined) {
                    bondingCurvePercent = safeNumber(data.complete_percent);
                } else if (data.bonding_curve_percent !== undefined) {
                    bondingCurvePercent = safeNumber(data.bonding_curve_percent);
                } else if (data.bondingCurve?.percentComplete !== undefined) {
                    bondingCurvePercent = safeNumber(data.bondingCurve.percentComplete);
                } else if (data.bondingCurvePercentage !== undefined) {
                    bondingCurvePercent = safeNumber(data.bondingCurvePercentage);
                } else if (data.complete !== undefined && typeof data.complete === 'number') {
                    bondingCurvePercent = safeNumber(data.complete);
                }
                
                // Check if token has graduated (complete = true or complete_percent = 100)
                const isComplete = data.complete === true || 
                                  data.complete_percent === 100 || 
                                  bondingCurvePercent === 100 ||
                                  data.graduated === true ||
                                  data.raydium === true;
                
                return { 
                    ...data,
                    name: name || data.name,
                    symbol: symbol || data.symbol,
                    image: image || data.image,
                    success: true, 
                    source: 'pumpfun',
                    bondingCurve: {
                        percentComplete: bondingCurvePercent,
                        isComplete: isComplete
                    },
                    bondingCurvePercentage: bondingCurvePercent
                };
            }
            if (response.status === 530) {
                throw new Error('Pump.fun API temporarily unavailable (530)');
            }
            throw new Error(`Pump.fun API returned ${response.status}`);
        }, 2);
        
        if (pumpFunData && pumpFunData.name) {
            console.log('✅ Pump.fun token details retrieved');
            return pumpFunData;
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            if (error.message && error.message.includes('530')) {
                console.debug('⚠️ Pump.fun API temporarily unavailable (530) - using fallbacks');
            } else {
                console.debug('⚠️ Pump.fun API unavailable:', error.message);
            }
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
        const errorMsg = error.message || '';
        if (!errorMsg.includes('ERR_NAME_NOT_RESOLVED') && 
            !errorMsg.includes('ERR_INTERNET_DISCONNECTED') &&
            !errorMsg.includes('Failed to fetch')) {
            console.debug('⚠️ Birdeye metadata unavailable:', error.message);
        }
    }
    
    // Source 4: On-chain Metaplex metadata
    try {
        const connection = getSolanaConnection();
        if (connection) {
            const metadata = await fetchOnChainMetadata(mintAddress, true);
            if (metadata && (metadata.name || metadata.symbol)) {
                console.log('✅ Retrieved full metadata from blockchain (Metaplex)');
                return { ...metadata, success: true, source: 'on-chain-metaplex' };
            }
        }
    } catch (error) {
        console.debug('⚠️ On-chain Metaplex metadata fetch failed:', error.message);
    }
    
    // Source 5: On-chain basic info
    try {
        const connection = getSolanaConnection();
        if (connection) {
            const basicInfo = await fetchOnChainMetadata(mintAddress, false);
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
        fetchMoralisBondingCurve,
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

