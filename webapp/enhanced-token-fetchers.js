// ============================================================================
// ENHANCED TOKEN DATA FETCHING WITH MULTIPLE FALLBACKS
// ============================================================================
// Priority: Jupiter > DexScreener > Birdeye > Pump.fun > On-chain
// Provides reliable token data even when APIs are down

/**
 * Enhanced token price fetching with multiple fallback sources
 * Priority: Jupiter > DexScreener > On-chain calculation
 */
async function fetchTokenPriceDetails(mintAddress, { solPrice = null } = {}) {
    console.log('🔍 Fetching price for:', mintAddress);
    
    // Try Jupiter first (most reliable)
    try {
        const jupiterData = await fetchJupiterPrice(mintAddress);
        if (jupiterData && jupiterData.price) {
            const priceSol = jupiterData.price;
            const priceUsd = solPrice ? priceSol * solPrice : null;
            console.log('✅ Jupiter price:', { priceSol, priceUsd });
            return {
                priceSol,
                priceUsd,
                marketCapUsd: jupiterData.marketCap || null,
                source: 'jupiter'
            };
        }
    } catch (error) {
        console.warn('⚠️ Jupiter price fetch failed:', error.message);
    }

    // Try DexScreener as fallback
    try {
        const dexData = await fetchDexScreenerPrice(mintAddress);
        if (dexData && dexData.priceUsd) {
            const priceUsd = dexData.priceUsd;
            const priceSol = solPrice ? priceUsd / solPrice : null;
            console.log('✅ DexScreener price:', { priceSol, priceUsd });
            return {
                priceSol,
                priceUsd,
                marketCapUsd: dexData.marketCap || null,
                source: 'dexscreener'
            };
        }
    } catch (error) {
        console.warn('⚠️ DexScreener price fetch failed:', error.message);
    }

    // Try on-chain calculation as last resort
    try {
        const onChainData = await calculateOnChainPrice(mintAddress);
        if (onChainData && onChainData.priceSol) {
            const priceSol = onChainData.priceSol;
            const priceUsd = solPrice ? priceSol * solPrice : null;
            console.log('✅ On-chain price:', { priceSol, priceUsd });
            return {
                priceSol,
                priceUsd,
                marketCapUsd: null,
                source: 'on-chain'
            };
        }
    } catch (error) {
        console.warn('⚠️ On-chain price calculation failed:', error.message);
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
        // This requires your solana-integration.js connection
        if (!window.solanaIntegration?.connection && !window.solanaWeb3) {
            throw new Error('Solana connection not available');
        }
        
        const connection = window.solanaIntegration?.connection || 
                          (window.solanaWeb3?.Connection ? 
                           new window.solanaWeb3.Connection(
                               window.solanaIntegration?.rpcUrl || 'https://api.mainnet-beta.solana.com'
                           ) : null);
        
        if (!connection) {
            throw new Error('Solana connection not available');
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
    try {
        const trades = await fetchOnChainTrades(mintAddress, limit);
        if (trades && trades.length > 0) {
            console.log(`✅ Retrieved ${trades.length} trades from blockchain`);
            return trades;
        }
    } catch (error) {
        console.warn('⚠️ On-chain trade fetch failed:', error.message);
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
        if (!window.solanaIntegration?.connection && !window.solanaWeb3) {
            throw new Error('Solana connection not available');
        }
        
        const connection = window.solanaIntegration?.connection || 
                          (window.solanaWeb3?.Connection ? 
                           new window.solanaWeb3.Connection(
                               window.solanaIntegration?.rpcUrl || 'https://api.mainnet-beta.solana.com'
                           ) : null);
        
        if (!connection) {
            throw new Error('Solana connection not available');
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
    
    // Fallback: try to get basic info from on-chain metadata
    try {
        const metadata = await fetchOnChainMetadata(mintAddress);
        console.log('✅ Retrieved metadata from blockchain');
        return { ...metadata, success: true };
    } catch (error) {
        console.warn('⚠️ On-chain metadata fetch failed:', error.message);
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
        if (!window.solanaIntegration?.connection && !window.solanaWeb3) {
            throw new Error('Solana connection not available');
        }
        
        const connection = window.solanaIntegration?.connection || 
                          (window.solanaWeb3?.Connection ? 
                           new window.solanaWeb3.Connection(
                               window.solanaIntegration?.rpcUrl || 'https://api.mainnet-beta.solana.com'
                           ) : null);
        
        if (!connection) {
            throw new Error('Solana connection not available');
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

