// ============================================================================
// API POOL MANAGER - Intelligent API Rotation & Failover for Monitoring
// ============================================================================
// Features:
// - Tracks response times per API (prioritizes fastest)
// - Prioritizes by cost: Free APIs first → Paid APIs last
// - Adaptive cooldown: Minimum time needed, increases if still rate limited
// - Smart rotation: Skips rate-limited APIs, prefers healthy/fast ones
// - Parallel requests: Tries multiple APIs simultaneously, uses first response
// - Automatic failover: Cycles through all APIs before giving up
// - Purpose-specific pools: Price, Metadata, Trades

(function() {
    'use strict';

    class APIPoolManager {
        constructor() {
            // Purpose-specific API pools
            this.pricePool = [];
            this.metadataPool = [];
            this.tradePool = [];
            
            // Performance tracking: API URL -> { avgResponseTime, successRate, rateLimited, cooldownUntil, failures, successes }
            this.apiPerformance = new Map();
            
            // Current indices for round-robin
            this.priceIndex = 0;
            this.metadataIndex = 0;
            this.tradeIndex = 0;
            
            // Cooldown settings
            this.minCooldown = 5000; // 5 seconds minimum
            this.maxCooldown = 300000; // 5 minutes max
            
            this.init();
        }

        /**
         * Initialize API pools
         */
        init() {
            this.refreshPools();
            
            // Listen for settings updates
            if (typeof window !== 'undefined') {
                window.addEventListener('chaosSettingsUpdated', () => {
                    this.refreshPools();
                });
            }
        }

        /**
         * Refresh API pools from current settings
         */
        refreshPools() {
            // Price APIs Pool (sorted by speed: fastest first)
            this.pricePool = [
                { url: 'jupiter', name: 'Jupiter', cost: 0, type: 'price' }, // Free, fast
                { url: 'dexscreener', name: 'DexScreener', cost: 0, type: 'price' }, // Free
                { url: 'coingecko', name: 'CoinGecko', cost: 0, type: 'price' }, // Free, reliable
                { url: 'moralis', name: 'Moralis', cost: 1, type: 'price' }, // Paid (free tier), Pump.fun specific
                { url: 'onchain', name: 'On-Chain', cost: 0, type: 'price' } // Free, uses RPC
            ];

            // Metadata APIs Pool (sorted by speed: fastest first)
            this.metadataPool = [
                { url: 'dexscreener', name: 'DexScreener', cost: 0, type: 'metadata' }, // Free, fast
                { url: 'moralis', name: 'Moralis', cost: 1, type: 'metadata' }, // Paid (free tier), Pump.fun specific
                { url: 'pumpfun', name: 'Pump.fun', cost: 0, type: 'metadata' }, // Free but unreliable
                { url: 'birdeye', name: 'Birdeye', cost: 1, type: 'metadata' }, // Paid, reliable
                { url: 'onchain', name: 'On-Chain Metaplex', cost: 0, type: 'metadata' } // Free, slow
            ];

            // Trade APIs Pool (sorted by speed: fastest first)
            this.tradePool = [
                { url: 'helius', name: 'Helius Enhanced', cost: 1, type: 'trade' }, // Paid, fastest
                { url: 'moralis', name: 'Moralis', cost: 1, type: 'trade' }, // Paid (free tier), Pump.fun specific
                { url: 'pumpportal', name: 'PumpPortal', cost: 1, type: 'trade' }, // Paid, WebSocket
                { url: 'onchain', name: 'On-Chain', cost: 0, type: 'trade' } // Free, slow
            ];

            console.log(`✅ API Pool Manager initialized:`);
            console.log(`   Price APIs: ${this.pricePool.length}`);
            console.log(`   Metadata APIs: ${this.metadataPool.length}`);
            console.log(`   Trade APIs: ${this.tradePool.length}`);
        }

        /**
         * Get performance metrics for an API
         */
        getApiPerformance(apiUrl) {
            if (!this.apiPerformance.has(apiUrl)) {
                this.apiPerformance.set(apiUrl, {
                    avgResponseTime: 1000, // Default 1 second
                    successRate: 1.0,
                    rateLimited: false,
                    cooldownUntil: 0,
                    failures: 0,
                    successes: 0,
                    responseTimes: [] // Last 10 response times for averaging
                });
            }
            return this.apiPerformance.get(apiUrl);
        }

        /**
         * Record API response time
         */
        recordResponseTime(apiUrl, responseTime, success = true) {
            const perf = this.getApiPerformance(apiUrl);
            
            if (success) {
                perf.successes++;
                perf.responseTimes.push(responseTime);
                // Keep only last 10 response times
                if (perf.responseTimes.length > 10) {
                    perf.responseTimes.shift();
                }
                // Calculate average
                perf.avgResponseTime = perf.responseTimes.reduce((a, b) => a + b, 0) / perf.responseTimes.length;
                perf.successRate = perf.successes / (perf.successes + perf.failures);
            } else {
                perf.failures++;
                perf.successRate = perf.successes / (perf.successes + perf.failures);
            }
        }

        /**
         * Mark API as rate limited with adaptive cooldown
         */
        markRateLimited(apiUrl, error = null) {
            const perf = this.getApiPerformance(apiUrl);
            perf.rateLimited = true;
            perf.failures++;
            
            // Adaptive cooldown: increase if still rate limited
            const currentCooldown = perf.cooldownUntil - Date.now();
            let newCooldown = this.minCooldown;
            
            if (currentCooldown > 0) {
                // Still in cooldown - increase it
                newCooldown = Math.min(currentCooldown * 1.5, this.maxCooldown);
            } else {
                // First time rate limited - start with minimum
                newCooldown = this.minCooldown;
            }

            perf.cooldownUntil = Date.now() + newCooldown;
            console.debug(`⚠️ API rate limited: ${apiUrl} (cooldown: ${Math.round(newCooldown/1000)}s)`);
        }

        /**
         * Mark API as successful
         */
        markSuccess(apiUrl) {
            const perf = this.getApiPerformance(apiUrl);
            perf.successes++;
            
            // Reset rate limit if cooldown expired
            if (perf.rateLimited && Date.now() >= perf.cooldownUntil) {
                perf.rateLimited = false;
                perf.cooldownUntil = 0;
            }
        }

        /**
         * Check if API is available (not rate limited or cooldown expired)
         */
        isApiAvailable(apiUrl) {
            const perf = this.getApiPerformance(apiUrl);
            if (!perf.rateLimited) return true;
            if (Date.now() >= perf.cooldownUntil) {
                perf.rateLimited = false;
                perf.cooldownUntil = 0;
                return true;
            }
            return false;
        }

        /**
         * Get next available API from pool (smart selection: fastest + available)
         */
        getNextApi(pool, startIndex = null) {
            if (pool.length === 0) return null;

            // Sort by: available first, then by speed (avgResponseTime), then by cost
            const sorted = [...pool].sort((a, b) => {
                const aPerf = this.getApiPerformance(a.url);
                const bPerf = this.getApiPerformance(b.url);
                
                const aAvailable = this.isApiAvailable(a.url);
                const bAvailable = this.isApiAvailable(b.url);
                
                // Available APIs first
                if (aAvailable && !bAvailable) return -1;
                if (!aAvailable && bAvailable) return 1;
                
                // If both available or both unavailable, sort by speed
                if (aAvailable && bAvailable) {
                    const speedDiff = aPerf.avgResponseTime - bPerf.avgResponseTime;
                    if (Math.abs(speedDiff) > 100) { // If >100ms difference, prioritize speed
                        return speedDiff;
                    }
                    // If similar speed, prioritize free (cost 0)
                    return a.cost - b.cost;
                }
                
                // Both unavailable - return shortest cooldown
                const aCooldown = aPerf.cooldownUntil - Date.now();
                const bCooldown = bPerf.cooldownUntil - Date.now();
                return aCooldown - bCooldown;
            });

            // Return fastest available API
            for (const api of sorted) {
                if (this.isApiAvailable(api.url)) {
                    return api;
                }
            }

            // All rate limited - return one with shortest cooldown
            return sorted[0] || pool[0];
        }

        /**
         * Execute API call with automatic failover and parallel requests
         * @param {string} purpose - 'price', 'metadata', or 'trade'
         * @param {Function} apiCaller - Function that takes API object and returns Promise
         * @param {Object} options - { parallel: boolean, maxRetries: number }
         */
        async executeWithFailover(purpose, apiCaller, options = {}) {
            const { parallel = false, maxRetries = null } = options;
            const pool = this.getPool(purpose);
            
            if (!pool || pool.length === 0) {
                throw new Error(`No APIs available for purpose: ${purpose}`);
            }

            if (maxRetries === null) {
                maxRetries = pool.length; // Try all APIs
            }

            // If parallel mode, try ALL available APIs simultaneously for fastest response
            if (parallel) {
                const availableApis = pool
                    .filter(api => this.isApiAvailable(api.url))
                    .sort((a, b) => {
                        // Sort by speed first, then by cost (free first)
                        const aPerf = this.getApiPerformance(a.url);
                        const bPerf = this.getApiPerformance(b.url);
                        const speedDiff = aPerf.avgResponseTime - bPerf.avgResponseTime;
                        if (Math.abs(speedDiff) > 100) {
                            return speedDiff; // Prioritize speed if >100ms difference
                        }
                        return a.cost - b.cost; // Otherwise prioritize free APIs
                    });
                
                // Try ALL available APIs in parallel (not just top 3) for fastest response
                const topApis = availableApis;

                if (topApis.length > 0) {
                    const startTime = Date.now();
                    const promises = topApis.map(async (api) => {
                        try {
                            const result = await apiCaller(api);
                            const responseTime = Date.now() - startTime;
                            this.recordResponseTime(api.url, responseTime, true);
                            this.markSuccess(api.url);
                            return { api, result, responseTime };
                        } catch (error) {
                            const responseTime = Date.now() - startTime;
                            this.recordResponseTime(api.url, responseTime, false);
                            
                            // Silently handle network errors - don't throw, allow fallback
                            if (this.isNetworkError(error)) {
                                // Network errors are expected, silently skip
                                return null;
                            }
                            
                            // Check if rate limited
                            if (this.isRateLimitError(error)) {
                                this.markRateLimited(api.url, error);
                            }
                            throw error;
                        }
                    });

                    // Race: use first successful response
                    try {
                        const results = await Promise.allSettled(promises);
                        for (const result of results) {
                            if (result.status === 'fulfilled' && result.value !== null) {
                                return result.value.result;
                            }
                        }
                    } catch (error) {
                        // All parallel requests failed, continue to sequential
                    }
                }
            }

            // Sequential fallback: try APIs one by one
            const errors = [];
            let attempts = 0;

            while (attempts < maxRetries) {
                const api = this.getNextApi(pool);
                if (!api) break;

                const startTime = Date.now();
                try {
                    const result = await apiCaller(api);
                    const responseTime = Date.now() - startTime;
                    this.recordResponseTime(api.url, responseTime, true);
                    this.markSuccess(api.url);
                    return result;
                } catch (error) {
                    const responseTime = Date.now() - startTime;
                    this.recordResponseTime(api.url, responseTime, false);
                    
                    // Silently handle network errors - don't log as error, just skip
                    if (this.isNetworkError(error)) {
                        // Network errors are expected, silently skip to next API
                        attempts++;
                        continue;
                    }
                    
                    errors.push({ api: api.url, error });

                    // Check if rate limited
                    if (this.isRateLimitError(error)) {
                        this.markRateLimited(api.url, error);
                    }

                    attempts++;
                }
            }

            // All APIs failed
            throw new Error(`All ${purpose} APIs failed. Last errors: ${errors.map(e => e.error.message).join('; ')}`);
        }

        /**
         * Check if error is a rate limit error
         */
        isRateLimitError(error) {
            const errorMsg = error?.message || '';
            const errorCode = error?.code || '';
            const status = error?.status || error?.response?.status;

            return status === 429 ||
                   status === 403 ||
                   errorCode === 429 ||
                   errorMsg.includes('429') ||
                   errorMsg.includes('rate limit') ||
                   errorMsg.includes('too many requests') ||
                   (errorMsg.includes('403') && errorMsg.includes('forbidden'));
        }

        /**
         * Check if error is a network/DNS error (should be silently handled)
         */
        isNetworkError(error) {
            const errorMsg = error?.message || '';
            const errorName = error?.name || '';
            
            return errorName === 'AbortError' ||
                   errorMsg.includes('ERR_NAME_NOT_RESOLVED') ||
                   errorMsg.includes('ERR_INTERNET_DISCONNECTED') ||
                   errorMsg.includes('Failed to fetch') ||
                   errorMsg.includes('NetworkError') ||
                   errorMsg.includes('Network request failed') ||
                   errorMsg.includes('net::ERR_NAME_NOT_RESOLVED') ||
                   errorMsg.includes('net::ERR_INTERNET_DISCONNECTED');
        }

        /**
         * Get pool for purpose
         */
        getPool(purpose) {
            switch (purpose) {
                case 'price': return this.pricePool;
                case 'metadata': return this.metadataPool;
                case 'trade': return this.tradePool;
                default: return [];
            }
        }

        /**
         * Get API statistics
         */
        getStats() {
            const stats = {
                price: {
                    total: this.pricePool.length,
                    available: this.pricePool.filter(api => this.isApiAvailable(api.url)).length,
                    rateLimited: this.pricePool.filter(api => !this.isApiAvailable(api.url)).length
                },
                metadata: {
                    total: this.metadataPool.length,
                    available: this.metadataPool.filter(api => this.isApiAvailable(api.url)).length,
                    rateLimited: this.metadataPool.filter(api => !this.isApiAvailable(api.url)).length
                },
                trade: {
                    total: this.tradePool.length,
                    available: this.tradePool.filter(api => this.isApiAvailable(api.url)).length,
                    rateLimited: this.tradePool.filter(api => !this.isApiAvailable(api.url)).length
                },
                apiDetails: []
            };

            // Collect all unique APIs
            const allApis = new Set();
            [...this.pricePool, ...this.metadataPool, ...this.tradePool].forEach(api => {
                allApis.add(api.url);
            });

            for (const apiUrl of allApis) {
                const perf = this.getApiPerformance(apiUrl);
                stats.apiDetails.push({
                    url: apiUrl,
                    avgResponseTime: Math.round(perf.avgResponseTime),
                    successRate: (perf.successRate * 100).toFixed(1) + '%',
                    rateLimited: perf.rateLimited,
                    cooldownUntil: perf.cooldownUntil,
                    failures: perf.failures,
                    successes: perf.successes
                });
            }

            return stats;
        }
    }

    // Create global instance
    if (typeof window !== 'undefined') {
        window.apiPoolManager = new APIPoolManager();
        console.log('✅ API Pool Manager initialized');
    }

})();

