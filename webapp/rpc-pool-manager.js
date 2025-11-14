// ============================================================================
// RPC POOL MANAGER - Intelligent RPC Rotation & Failover
// ============================================================================
// Features:
// - Collects ALL RPCs from settings (primary, backup, monitoring, price, etc.)
// - Prioritizes by cost: Free RPCs first → Paid RPCs last
// - Adaptive cooldown: Minimum time needed, increases if still rate limited
// - Smart rotation: Skips rate-limited RPCs, prefers healthy ones
// - WebSocket support: Rotates WebSocket connections too
// - Automatic failover: Cycles through all RPCs before giving up

(function() {
    'use strict';

    class RPCPoolManager {
        constructor() {
            this.rpcPool = [];
            this.wsPool = [];
            this.connections = new Map(); // Map of RPC URL -> Connection instance
            this.wsConnections = new Map(); // Map of RPC URL -> WebSocket instance
            this.rpcHealth = new Map(); // Map of RPC URL -> { rateLimited: boolean, cooldownUntil: timestamp, failures: number, successes: number }
            this.currentIndex = 0;
            this.currentWsIndex = 0;
            this.minCooldown = 5000; // Start with 5 seconds minimum
            this.maxCooldown = 300000; // Max 5 minutes
            this.init();
        }

        /**
         * Initialize RPC pool from settings
         */
        init() {
            this.refreshPool();
            
            // Listen for settings updates
            if (typeof window !== 'undefined') {
                window.addEventListener('chaosSettingsUpdated', () => {
                    this.refreshPool();
                });
            }
        }

        /**
         * Refresh RPC pool from current settings
         * Prioritizes: Free RPCs first → Paid RPCs last
         */
        refreshPool() {
            const httpPool = [];
            const wsPool = [];
            
            try {
                // Get settings
                let settings = null;
                if (window.settingsManager?.getSettings) {
                    settings = window.settingsManager.getSettings();
                } else {
                    const stored = localStorage.getItem('chaosbot_settings');
                    if (stored) {
                        settings = JSON.parse(stored);
                    }
                }

                if (!settings) return;

                const solana = settings.solana || {};

                // Helper to categorize RPC by cost (free = 0, paid = 1)
                const getRpcCost = (url) => {
                    if (!url) return 999; // Invalid
                    const lower = url.toLowerCase();
                    // Free/public RPCs
                    if (lower.includes('api.mainnet-beta.solana.com') || 
                        lower.includes('api.devnet.solana.com') ||
                        lower.includes('solana-api.projectserum.com')) {
                        return 0; // Free - highest priority
                    }
                    // Paid RPCs (Shyft, Helius, etc.)
                    if (lower.includes('shyft') || lower.includes('helius') || 
                        lower.includes('quicknode') || lower.includes('alchemy') ||
                        lower.includes('ankr')) {
                        return 1; // Paid - lower priority
                    }
                    return 0.5; // Unknown - assume free
                };

                // Helper to add RPC to pool if valid
                const addRpc = (url, isWebSocket = false) => {
                    if (!url || typeof url !== 'string') return;
                    
                    // Normalize WebSocket URLs
                    if (isWebSocket) {
                        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
                            url = url.replace('https://', 'wss://').replace('http://', 'ws://');
                        }
                        if (!wsPool.find(r => r.url === url)) {
                            wsPool.push({ url, cost: getRpcCost(url) });
                        }
                    } else {
                        // Normalize HTTP URLs
                        if (url.startsWith('ws://') || url.startsWith('wss://')) {
                            url = url.replace('wss://', 'https://').replace('ws://', 'http://');
                        }
                        if (!httpPool.find(r => r.url === url)) {
                            httpPool.push({ url, cost: getRpcCost(url) });
                        }
                    }
                };

                // Collect ALL RPCs (prioritize free ones)
                // 1. Free/public RPCs first
                addRpc('https://api.mainnet-beta.solana.com', false);
                addRpc('wss://api.mainnet-beta.solana.com', true);
                
                // 2. Backup RPCs (from .env or settings)
                if (solana.rpcHttp) addRpc(solana.rpcHttp, false);
                if (solana.rpcWebsocket) addRpc(solana.rpcWebsocket, true);
                
                // 3. Dedicated RPCs
                if (solana.monitoringRpc) {
                    addRpc(solana.monitoringRpc, true);
                    addRpc(solana.monitoringRpc, false); // Also add as HTTP
                }
                if (solana.priceRpc) {
                    addRpc(solana.priceRpc, false);
                    // Convert to WebSocket if possible
                    const wsUrl = solana.priceRpc.replace('https://', 'wss://').replace('http://', 'ws://');
                    addRpc(wsUrl, true);
                }

                // Sort by cost (free first, then paid)
                httpPool.sort((a, b) => a.cost - b.cost);
                wsPool.sort((a, b) => a.cost - b.cost);

                this.rpcPool = httpPool;
                this.wsPool = wsPool;

                console.log(`✅ RPC Pool initialized: ${this.rpcPool.length} HTTP RPCs, ${this.wsPool.length} WebSocket RPCs`);
                console.log(`   Priority: Free RPCs first → Paid RPCs last`);
            } catch (error) {
                console.error('Failed to refresh RPC pool:', error);
            }
        }

        /**
         * Get health status for an RPC
         */
        getRpcHealth(url) {
            if (!this.rpcHealth.has(url)) {
                this.rpcHealth.set(url, {
                    rateLimited: false,
                    cooldownUntil: 0,
                    failures: 0,
                    successes: 0,
                    lastError: null
                });
            }
            return this.rpcHealth.get(url);
        }

        /**
         * Mark RPC as rate limited with adaptive cooldown
         */
        markRateLimited(url, error = null) {
            const health = this.getRpcHealth(url);
            health.rateLimited = true;
            health.failures++;
            health.lastError = error;

            // Adaptive cooldown: increase if still rate limited
            const currentCooldown = health.cooldownUntil - Date.now();
            let newCooldown = this.minCooldown;
            
            if (currentCooldown > 0) {
                // Still in cooldown - increase it
                newCooldown = Math.min(currentCooldown * 1.5, this.maxCooldown);
            } else {
                // First time rate limited - start with minimum
                newCooldown = this.minCooldown;
            }

            health.cooldownUntil = Date.now() + newCooldown;
            
            console.debug(`⚠️ RPC rate limited: ${url.substring(0, 50)}... (cooldown: ${Math.round(newCooldown/1000)}s)`);
        }

        /**
         * Mark RPC as successful
         */
        markSuccess(url) {
            const health = this.getRpcHealth(url);
            health.successes++;
            
            // Reset rate limit if cooldown expired
            if (health.rateLimited && Date.now() >= health.cooldownUntil) {
                health.rateLimited = false;
                health.cooldownUntil = 0;
                console.debug(`✅ RPC recovered: ${url.substring(0, 50)}...`);
            }
        }

        /**
         * Check if RPC is available (not rate limited or cooldown expired)
         */
        isRpcAvailable(url) {
            const health = this.getRpcHealth(url);
            if (!health.rateLimited) return true;
            if (Date.now() >= health.cooldownUntil) {
                health.rateLimited = false;
                health.cooldownUntil = 0;
                return true;
            }
            return false;
        }

        /**
         * Get next available RPC from pool (smart rotation)
         * Skips rate-limited RPCs, prefers healthy ones
         */
        getNextRpc(pool, startIndex = null) {
            if (pool.length === 0) return null;

            const start = startIndex !== null ? startIndex : this.currentIndex;
            let attempts = 0;
            let index = start;

            // Try to find an available RPC
            while (attempts < pool.length) {
                const rpc = pool[index];
                
                if (this.isRpcAvailable(rpc.url)) {
                    this.currentIndex = (index + 1) % pool.length;
                    return rpc;
                }

                index = (index + 1) % pool.length;
                attempts++;
            }

            // All RPCs are rate limited - return the one with shortest cooldown
            let bestRpc = null;
            let shortestCooldown = Infinity;
            
            for (const rpc of pool) {
                const health = this.getRpcHealth(rpc.url);
                const remainingCooldown = health.cooldownUntil - Date.now();
                if (remainingCooldown < shortestCooldown) {
                    shortestCooldown = remainingCooldown;
                    bestRpc = rpc;
                }
            }

            return bestRpc || pool[0];
        }

        /**
         * Get HTTP Connection with automatic failover
         */
        getConnection(purpose = null) {
            // If purpose-specific RPC exists and is available, use it first
            if (purpose) {
                let dedicatedRpc = null;
                
                try {
                    if (window.settingsManager?.getSettings) {
                        const settings = window.settingsManager.getSettings();
                        if (purpose === 'price' && settings?.solana?.priceRpc) {
                            dedicatedRpc = settings.solana.priceRpc;
                        } else if (purpose === 'monitoring' && settings?.solana?.monitoringRpc) {
                            dedicatedRpc = settings.solana.monitoringRpc.replace('wss://', 'https://').replace('ws://', 'http://');
                        }
                    }
                } catch (error) {
                    console.debug('Failed to get dedicated RPC:', error);
                }

                if (dedicatedRpc && this.isRpcAvailable(dedicatedRpc)) {
                    const connection = this.getOrCreateConnection(dedicatedRpc);
                    if (connection) return connection;
                }
            }

            // Use pool rotation
            const rpc = this.getNextRpc(this.rpcPool);
            if (!rpc) return null;

            return this.getOrCreateConnection(rpc.url);
        }

        /**
         * Get or create Connection instance for RPC URL
         */
        getOrCreateConnection(rpcUrl) {
            if (!rpcUrl || !window.solanaWeb3?.Connection) return null;

            // Normalize URL
            if (rpcUrl.startsWith('ws://') || rpcUrl.startsWith('wss://')) {
                rpcUrl = rpcUrl.replace('wss://', 'https://').replace('ws://', 'http://');
            }

            if (this.connections.has(rpcUrl)) {
                return this.connections.get(rpcUrl);
            }

            try {
                const connection = new window.solanaWeb3.Connection(rpcUrl, 'confirmed');
                this.connections.set(rpcUrl, connection);
                return connection;
            } catch (error) {
                console.debug('Failed to create connection:', error);
                return null;
            }
        }

        /**
         * Get WebSocket URL with automatic failover
         */
        getWebSocketUrl() {
            const rpc = this.getNextRpc(this.wsPool, this.currentWsIndex);
            if (!rpc) return null;

            this.currentWsIndex = (this.currentWsIndex + 1) % this.wsPool.length;
            return rpc.url;
        }

        /**
         * Execute RPC call with automatic failover
         */
        async executeWithFailover(operation, maxRetries = null) {
            if (maxRetries === null) {
                maxRetries = this.rpcPool.length; // Try all RPCs
            }

            const errors = [];
            let lastIndex = this.currentIndex;

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                const rpc = this.getNextRpc(this.rpcPool, lastIndex);
                if (!rpc) break;

                const connection = this.getOrCreateConnection(rpc.url);
                if (!connection) {
                    lastIndex = (lastIndex + 1) % this.rpcPool.length;
                    continue;
                }

                try {
                    const result = await operation(connection, rpc.url);
                    this.markSuccess(rpc.url);
                    return result;
                } catch (error) {
                    errors.push({ rpc: rpc.url, error });
                    
                    // Check if it's a rate limit error
                    const errorMsg = error?.message || '';
                    const errorCode = error?.code || '';
                    
                    if (errorCode === 429 || 
                        errorMsg.includes('429') ||
                        errorMsg.includes('rate limit') ||
                        errorMsg.includes('too many requests') ||
                        errorCode === 403 ||
                        (errorMsg.includes('403') && errorMsg.includes('forbidden'))) {
                        this.markRateLimited(rpc.url, error);
                    }

                    lastIndex = (lastIndex + 1) % this.rpcPool.length;
                }
            }

            // All RPCs failed
            throw new Error(`All RPCs failed. Last errors: ${errors.map(e => e.error.message).join('; ')}`);
        }

        /**
         * Get pool statistics
         */
        getStats() {
            const stats = {
                totalRpc: this.rpcPool.length,
                totalWs: this.wsPool.length,
                rateLimited: 0,
                healthy: 0,
                rpcDetails: []
            };

            for (const rpc of this.rpcPool) {
                const health = this.getRpcHealth(rpc.url);
                if (health.rateLimited) {
                    stats.rateLimited++;
                } else {
                    stats.healthy++;
                }
                stats.rpcDetails.push({
                    url: rpc.url.substring(0, 50) + '...',
                    cost: rpc.cost === 0 ? 'Free' : 'Paid',
                    rateLimited: health.rateLimited,
                    cooldownUntil: health.cooldownUntil,
                    failures: health.failures,
                    successes: health.successes
                });
            }

            return stats;
        }
    }

    // Create global instance
    if (typeof window !== 'undefined') {
        window.rpcPoolManager = new RPCPoolManager();
        console.log('✅ RPC Pool Manager initialized');
    }

})();

