/**
 * Smart Rate Limit Manager
 * Handles all API rate limiting intelligently to prevent 429 errors
 * while maximizing trading speed and efficiency
 */

class RateLimitManager {
  constructor() {
    this.requestQueues = new Map(); // Track requests per endpoint
    this.requestTimes = new Map(); // Track request timestamps
        this.rateLimits = {
            'jupiter-quote': { maxRequests: 30, windowMs: 60000 }, // 30 requests per minute (increased)
            'jupiter-swap': { maxRequests: 20, windowMs: 60000 }, // 20 requests per minute (increased)
            'jupiter-price': { maxRequests: 30, windowMs: 60000 }, // 30 requests per minute (increased)
            'solana-rpc': { maxRequests: 40, windowMs: 60000 }, // 40 requests per minute (increased)
            'telegram-api': { maxRequests: 20, windowMs: 60000 }, // 20 requests per minute for Telegram
        };
        this.defaultDelay = 1000; // 1 second between requests (reduced)
        this.adaptiveDelays = new Map(); // Track adaptive delays per endpoint
  }

  /**
   * Get the current request count for an endpoint
   */
  getRequestCount(endpoint) {
    const now = Date.now();
    const windowMs = this.rateLimits[endpoint]?.windowMs || 60000;
    const requestTimes = this.requestTimes.get(endpoint) || [];
    
    // Remove old requests outside the window
    const validRequests = requestTimes.filter(time => now - time < windowMs);
    this.requestTimes.set(endpoint, validRequests);
    
    return validRequests.length;
  }

  /**
   * Check if we can make a request to an endpoint
   */
  canMakeRequest(endpoint) {
    const limit = this.rateLimits[endpoint];
    if (!limit) return true;
    
    const currentCount = this.getRequestCount(endpoint);
    return currentCount < limit.maxRequests;
  }

  /**
   * Calculate delay needed before next request
   */
  calculateDelay(endpoint) {
    const limit = this.rateLimits[endpoint];
    if (!limit) return 0;
    
    const requestTimes = this.requestTimes.get(endpoint) || [];
    if (requestTimes.length === 0) return 0;
    
    const oldestRequest = Math.min(...requestTimes);
    const timeSinceOldest = Date.now() - oldestRequest;
    
    if (timeSinceOldest >= limit.windowMs) return 0;
    
    // Calculate when we can make the next request
    const nextAvailableTime = oldestRequest + limit.windowMs;
    const delay = Math.max(0, nextAvailableTime - Date.now());
    
    return delay;
  }

  /**
   * Wait for the appropriate delay before making a request
   */
  async waitForRateLimit(endpoint) {
    const delay = this.calculateDelay(endpoint);
    
    if (delay > 0) {
      console.log(`⏳ Rate limiting ${endpoint}: waiting ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Record a request for rate limiting
   */
  recordRequest(endpoint) {
    const now = Date.now();
    const requestTimes = this.requestTimes.get(endpoint) || [];
    requestTimes.push(now);
    this.requestTimes.set(endpoint, requestTimes);
  }

  /**
   * Make a rate-limited request with adaptive delays
   */
  async makeRequest(endpoint, requestFn, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      // Wait for rate limit
      await this.waitForRateLimit(endpoint);
      
      // Record the request start time
      const startTime = Date.now();
      this.recordRequest(endpoint);
      
      // Execute the request
      const result = await requestFn();
      
      // Calculate response time and update adaptive delay
      const responseTime = Date.now() - startTime;
      this.updateAdaptiveDelay(endpoint, responseTime, false);
      
      return result;
      
    } catch (error) {
      // Handle 429 errors specifically
      if (error.response && error.response.status === 429) {
        console.log(`⚠️ Rate limited on ${endpoint}. Retrying after adaptive delay...`);
        
        if (retryCount < maxRetries) {
          // Increase delay exponentially on rate limit
          const retryDelay = Math.min(5000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
          this.updateAdaptiveDelay(endpoint, retryDelay, true);
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return this.makeRequest(endpoint, requestFn, retryCount + 1);
        } else {
          throw new Error(`Rate limit exceeded for ${endpoint} after ${maxRetries} retries`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Batch multiple requests intelligently
   */
  async batchRequests(endpoint, requests, maxConcurrent = 3) {
    const results = [];
    const executing = [];
    
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      
      // Wait if we're at max concurrent
      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
      }
      
      // Execute request with rate limiting
      const promise = this.makeRequest(endpoint, request).then(result => {
        results[i] = result;
        return result;
      });
      
      executing.push(promise);
    }
    
    // Wait for all to complete
    await Promise.all(executing);
    return results;
  }

  /**
   * Get rate limit status for monitoring
   */
  getStatus() {
    const status = {};
    
    for (const [endpoint, limit] of Object.entries(this.rateLimits)) {
      const currentCount = this.getRequestCount(endpoint);
      const utilization = (currentCount / limit.maxRequests) * 100;
      
      status[endpoint] = {
        current: currentCount,
        limit: limit.maxRequests,
        utilization: Math.round(utilization),
        canMakeRequest: this.canMakeRequest(endpoint),
        nextAvailableIn: this.calculateDelay(endpoint)
      };
    }
    
    return status;
  }

  /**
   * Update adaptive delay based on response time and rate limiting
   */
  updateAdaptiveDelay(endpoint, responseTime, wasRateLimited) {
    if (!this.adaptiveDelays.has(endpoint)) {
      this.adaptiveDelays.set(endpoint, {
        baseDelay: this.defaultDelay,
        currentDelay: this.defaultDelay,
        lastUpdate: Date.now(),
        rateLimitCount: 0
      });
    }
    
    const delayData = this.adaptiveDelays.get(endpoint);
    
    if (wasRateLimited) {
      // Increase delay significantly on rate limit
      delayData.rateLimitCount++;
      delayData.currentDelay = Math.min(delayData.currentDelay * 2, 10000); // Max 10 seconds
      console.log(`📈 Increased delay for ${endpoint} to ${delayData.currentDelay}ms (rate limit #${delayData.rateLimitCount})`);
    } else if (responseTime < 500) {
      // Decrease delay if response is fast
      delayData.currentDelay = Math.max(delayData.currentDelay * 0.9, 500); // Min 500ms
    } else if (responseTime > 2000) {
      // Increase delay if response is slow
      delayData.currentDelay = Math.min(delayData.currentDelay * 1.1, 5000); // Max 5 seconds
    }
    
    delayData.lastUpdate = Date.now();
  }

  /**
   * Get current adaptive delay for an endpoint
   */
  getAdaptiveDelay(endpoint) {
    const delayData = this.adaptiveDelays.get(endpoint);
    return delayData ? delayData.currentDelay : this.defaultDelay;
  }

  /**
   * Reset rate limits (for testing or manual override)
   */
  reset() {
    this.requestTimes.clear();
    this.adaptiveDelays.clear();
    console.log('🔄 Rate limits and adaptive delays reset');
  }
}

module.exports = RateLimitManager;
