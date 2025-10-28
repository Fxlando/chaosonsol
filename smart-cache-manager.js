/**
 * Smart Cache Manager
 * Implements intelligent caching to reduce redundant API calls
 * and improve bot performance while maintaining data freshness
 */

class SmartCacheManager {
  constructor() {
    this.caches = new Map(); // endpoint -> cache data
    this.defaultTTL = {
      'jupiter-quote': 10000, // 10 seconds for quotes
      'jupiter-price': 30000, // 30 seconds for prices
      'solana-rpc': 5000, // 5 seconds for RPC calls
      'wallet-balance': 15000, // 15 seconds for wallet balances
      'token-balance': 10000, // 10 seconds for token balances
      'transaction-data': 30000, // 30 seconds for transaction data
    };
    
    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0
    };
  }

  /**
   * Get cached data if available and not expired
   */
  get(endpoint, key) {
    this.stats.totalRequests++;
    
    if (!this.caches.has(endpoint)) {
      this.stats.misses++;
      return null;
    }
    
    const cache = this.caches.get(endpoint);
    const cacheKey = this.generateCacheKey(key);
    
    if (!cache.has(cacheKey)) {
      this.stats.misses++;
      return null;
    }
    
    const cachedItem = cache.get(cacheKey);
    const now = Date.now();
    
    // Check if expired
    if (now > cachedItem.expiresAt) {
      cache.delete(cacheKey);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }
    
    this.stats.hits++;
    return cachedItem.data;
  }

  /**
   * Set cached data with TTL
   */
  set(endpoint, key, data, customTTL = null) {
    if (!this.caches.has(endpoint)) {
      this.caches.set(endpoint, new Map());
    }
    
    const cache = this.caches.get(endpoint);
    const cacheKey = this.generateCacheKey(key);
    const ttl = customTTL || this.defaultTTL[endpoint] || 10000;
    
    cache.set(cacheKey, {
      data: data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    });
    
    // Clean up expired entries periodically
    this.cleanupExpired(endpoint);
  }

  /**
   * Generate cache key from input
   */
  generateCacheKey(key) {
    if (typeof key === 'string') {
      return key;
    } else if (typeof key === 'object') {
      return JSON.stringify(key);
    } else {
      return String(key);
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanupExpired(endpoint) {
    if (!this.caches.has(endpoint)) return;
    
    const cache = this.caches.get(endpoint);
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of cache) {
      if (now > item.expiresAt) {
        cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.stats.evictions += cleaned;
    }
  }

  /**
   * Clear cache for specific endpoint
   */
  clear(endpoint) {
    if (this.caches.has(endpoint)) {
      this.caches.get(endpoint).clear();
    }
  }

  /**
   * Clear all caches
   */
  clearAll() {
    this.caches.clear();
    this.stats = { hits: 0, misses: 0, evictions: 0, totalRequests: 0 };
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.totalRequests > 0 ? 
      (this.stats.hits / this.stats.totalRequests) * 100 : 0;
    
    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      cacheSizes: Object.fromEntries(
        Array.from(this.caches.entries()).map(([endpoint, cache]) => [endpoint, cache.size])
      )
    };
  }

  /**
   * Preload cache with common data
   */
  async preloadCache(rateLimitManager, connection, tokenMint) {
    try {
      console.log('🔄 Preloading cache with common data...');
      
      // Preload token price
      const priceKey = `price_${tokenMint}`;
      if (!this.get('jupiter-price', priceKey)) {
        try {
          const price = await rateLimitManager.makeRequest('jupiter-price', async () => {
            // This would be your actual price fetching logic
            return 0.001; // Placeholder
          });
          this.set('jupiter-price', priceKey, price);
        } catch (error) {
          console.log('⚠️ Failed to preload price data:', error.message);
        }
      }
      
      console.log('✅ Cache preloading completed');
    } catch (error) {
      console.error('❌ Error preloading cache:', error.message);
    }
  }

  /**
   * Smart cache with automatic refresh
   */
  async getOrFetch(endpoint, key, fetchFn, customTTL = null) {
    // Try to get from cache first
    const cached = this.get(endpoint, key);
    if (cached !== null) {
      return cached;
    }
    
    // Fetch fresh data
    try {
      const data = await fetchFn();
      this.set(endpoint, key, data, customTTL);
      return data;
    } catch (error) {
      console.error(`❌ Failed to fetch data for ${endpoint}:`, error.message);
      throw error;
    }
  }

  /**
   * Batch cache operations
   */
  async batchGetOrFetch(endpoint, keys, fetchFn, customTTL = null) {
    const results = new Map();
    const keysToFetch = [];
    
    // Check cache for all keys
    for (const key of keys) {
      const cached = this.get(endpoint, key);
      if (cached !== null) {
        results.set(key, cached);
      } else {
        keysToFetch.push(key);
      }
    }
    
    // Fetch missing keys
    if (keysToFetch.length > 0) {
      try {
        const fetchedData = await fetchFn(keysToFetch);
        for (const [key, data] of fetchedData) {
          this.set(endpoint, key, data, customTTL);
          results.set(key, data);
        }
      } catch (error) {
        console.error(`❌ Failed to batch fetch data for ${endpoint}:`, error.message);
      }
    }
    
    return results;
  }
}

// Create singleton instance
const smartCacheManager = new SmartCacheManager();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  for (const endpoint of smartCacheManager.caches.keys()) {
    smartCacheManager.cleanupExpired(endpoint);
  }
}, 5 * 60 * 1000);

module.exports = smartCacheManager;
