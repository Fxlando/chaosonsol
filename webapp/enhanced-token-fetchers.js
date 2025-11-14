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
        console.debug('⚠️ Jupiter price fetch failed:', error.message);
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
        if (error.name === 'AbortError') {
            throw new Error('Jupiter request timeout');
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
        const connection = getSolanaConnection();
        
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
 * Enhanced trade feed with fallback to on-chain transactions
 */
async function fetchPumpFunTradeFeed(mintAddress, limit = 20) {
    console.log('🔍 Fetching trade feed for:', mintAddress);
    
    // Try to fetch from on-chain transactions instead of Pump.fun API
    // Only if we have a valid RPC connection (not rate-limited default)
    try {
        const connection = getSolanaConnection();
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
 * Fetch actual trades from blockchain transaction history
 */
async function fetchOnChainTrades(mintAddress, limit = 20) {
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
 * Enhanced token info fetch with error handling
 */
async function fetchPumpFunTokenDetails(mintAddress) {
    console.log('🔍 Fetching token details for:', mintAddress);
    
    // Try Pump.fun API first
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://frontend-api.pump.fun/coins/${mintAddress}`,
            { 
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ Pump.fun token details retrieved');
            return { ...data, success: true };
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.warn('⚠️ Pump.fun API unavailable:', error.message);
        }
    }
    
    // Fallback: try to get basic info from on-chain metadata (only if we have valid RPC)
    try {
        const connection = getSolanaConnection();
        if (connection) {
            const metadata = await fetchOnChainMetadata(mintAddress);
            console.log('✅ Retrieved metadata from blockchain');
            return { ...metadata, success: true };
        } else {
            console.debug('Skipping on-chain metadata fetch - no valid RPC connection');
        }
    } catch (error) {
        // Only log if it's not a connection availability error
        if (!error.message.includes('not available')) {
            console.warn('⚠️ On-chain metadata fetch failed:', error.message);
        } else {
            console.debug('On-chain metadata fetch skipped:', error.message);
        }
    }
    
    // Return minimal data structure
    console.warn('⚠️ No token details available from any source');
    return { 
        success: false,
        marketCap: null,
        bondingCurve: null,
        bondingCurvePercentage: null
    };
}

/**
 * Fetch token metadata from blockchain
 */
async function fetchOnChainMetadata(mintAddress) {
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
        
        // Get mint account info
        const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
        
        if (!mintInfo.value) {
            throw new Error('Token account not found');
        }
        
        const supply = mintInfo.value.data?.parsed?.info?.supply;
        
        return {
            supply: supply ? parseInt(supply) : null,
            decimals: mintInfo.value.data?.parsed?.info?.decimals || 9
        };
    } catch (error) {
        throw new Error(`Metadata fetch failed: ${error.message}`);
    }
}

// ============================================================================
// EXPORT / MAKE AVAILABLE GLOBALLY
// ============================================================================

// Attach to window for global access
window.enhancedTokenFetchers = {
    fetchTokenPriceDetails,
    fetchPumpFunTradeFeed,
    fetchPumpFunTokenDetails,
    fetchJupiterPrice,
    fetchDexScreenerPrice,
    calculateOnChainPrice,
    fetchOnChainTrades,
    parseTradeFromTransaction
};

console.log('✅ Enhanced token data fetchers loaded with fallbacks');

