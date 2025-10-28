/**
 * Connection Pool Manager
 * Manages multiple Solana RPC connections for better performance
 * and load balancing to avoid rate limits
 */

const { Connection } = require('@solana/web3.js');

class ConnectionPoolManager {
  constructor(rpcUrls = [], config = {}) {
    this.rpcUrls = rpcUrls.length > 0 ? rpcUrls : [
      'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27',
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com',
      'https://solana-mainnet.g.alchemy.com/v2/demo'
    ];
    
    this.config = {
      maxConnections: config.maxConnections || 4,
      connectionTimeout: config.connectionTimeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      healthCheckInterval: config.healthCheckInterval || 60000, // 1 minute
      ...config
    };
    
    this.connections = [];
    this.connectionStats = new Map();
    this.currentIndex = 0;
    this.isInitialized = false;
    
    // Health check interval
    this.healthCheckTimer = null;
  }

  /**
   * Initialize connection pool
   */
  async initialize() {
    if (this.isInitialized) return;
    
    console.log(`🔗 Initializing connection pool with ${this.rpcUrls.length} RPC endpoints...`);
    
    // Create connections
    for (let i = 0; i < Math.min(this.rpcUrls.length, this.config.maxConnections); i++) {
      try {
        const connection = new Connection(this.rpcUrls[i], 'confirmed');
        
        // Test connection
        await connection.getVersion();
        
        this.connections.push(connection);
        this.connectionStats.set(connection, {
          url: this.rpcUrls[i],
          requests: 0,
          errors: 0,
          lastError: null,
          isHealthy: true,
          responseTime: 0,
          lastUsed: Date.now()
        });
        
        console.log(`✅ Connection ${i + 1}: ${this.rpcUrls[i]}`);
      } catch (error) {
        console.log(`❌ Failed to connect to ${this.rpcUrls[i]}: ${error.message}`);
      }
    }
    
    if (this.connections.length === 0) {
      throw new Error('No healthy connections available');
    }
    
    this.isInitialized = true;
    this.startHealthCheck();
    
    console.log(`✅ Connection pool initialized with ${this.connections.length} healthy connections`);
  }

  /**
   * Get the best available connection using round-robin with health checks
   */
  getConnection() {
    if (!this.isInitialized || this.connections.length === 0) {
      throw new Error('Connection pool not initialized');
    }
    
    // Find healthy connections
    const healthyConnections = this.connections.filter(conn => {
      const stats = this.connectionStats.get(conn);
      return stats && stats.isHealthy;
    });
    
    if (healthyConnections.length === 0) {
      // Fallback to any connection if none are healthy
      console.log('⚠️ No healthy connections, using fallback');
      return this.connections[this.currentIndex % this.connections.length];
    }
    
    // Use round-robin for healthy connections
    const connection = healthyConnections[this.currentIndex % healthyConnections.length];
    this.currentIndex = (this.currentIndex + 1) % healthyConnections.length;
    
    return connection;
  }

  /**
   * Execute a request with automatic failover
   */
  async executeRequest(requestFn, maxRetries = null) {
    const retries = maxRetries || this.config.retryAttempts;
    let lastError = null;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      const connection = this.getConnection();
      const stats = this.connectionStats.get(connection);
      
      try {
        const startTime = Date.now();
        const result = await requestFn(connection);
        const responseTime = Date.now() - startTime;
        
        // Update stats on success
        stats.requests++;
        stats.responseTime = responseTime;
        stats.lastUsed = Date.now();
        stats.isHealthy = true;
        
        return result;
      } catch (error) {
        lastError = error;
        stats.errors++;
        stats.lastError = error.message;
        
        // Mark connection as unhealthy if it fails multiple times
        if (stats.errors > 3) {
          stats.isHealthy = false;
          console.log(`⚠️ Marking connection as unhealthy: ${stats.url}`);
        }
        
        console.log(`❌ Request failed on ${stats.url} (attempt ${attempt + 1}/${retries}): ${error.message}`);
        
        // Wait before retry
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    throw new Error(`Request failed after ${retries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const stats = [];
    for (const [connection, stat] of this.connectionStats) {
      stats.push({
        url: stat.url,
        requests: stat.requests,
        errors: stat.errors,
        errorRate: stat.requests > 0 ? (stat.errors / stat.requests) * 100 : 0,
        isHealthy: stat.isHealthy,
        responseTime: stat.responseTime,
        lastUsed: stat.lastUsed
      });
    }
    
    return {
      totalConnections: this.connections.length,
      healthyConnections: stats.filter(s => s.isHealthy).length,
      totalRequests: stats.reduce((sum, s) => sum + s.requests, 0),
      totalErrors: stats.reduce((sum, s) => sum + s.errors, 0),
      connections: stats
    };
  }

  /**
   * Start health check timer
   */
  startHealthCheck() {
    if (this.healthCheckTimer) return;
    
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health check on all connections
   */
  async performHealthCheck() {
    console.log('🔍 Performing connection health check...');
    
    for (const connection of this.connections) {
      const stats = this.connectionStats.get(connection);
      if (!stats) continue;
      
      try {
        const startTime = Date.now();
        await connection.getVersion();
        const responseTime = Date.now() - startTime;
        
        // Update health status
        stats.isHealthy = true;
        stats.responseTime = responseTime;
        stats.lastUsed = Date.now();
        
        console.log(`✅ Health check passed: ${stats.url} (${responseTime}ms)`);
      } catch (error) {
        stats.isHealthy = false;
        stats.lastError = error.message;
        console.log(`❌ Health check failed: ${stats.url} - ${error.message}`);
      }
    }
  }

  /**
   * Stop health check timer
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Add new RPC endpoint
   */
  async addConnection(rpcUrl) {
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      await connection.getVersion();
      
      this.connections.push(connection);
      this.connectionStats.set(connection, {
        url: rpcUrl,
        requests: 0,
        errors: 0,
        lastError: null,
        isHealthy: true,
        responseTime: 0,
        lastUsed: Date.now()
      });
      
      console.log(`✅ Added new connection: ${rpcUrl}`);
      return true;
    } catch (error) {
      console.log(`❌ Failed to add connection ${rpcUrl}: ${error.message}`);
      return false;
    }
  }

  /**
   * Remove connection from pool
   */
  removeConnection(rpcUrl) {
    const connectionIndex = this.connections.findIndex(conn => {
      const stats = this.connectionStats.get(conn);
      return stats && stats.url === rpcUrl;
    });
    
    if (connectionIndex !== -1) {
      const connection = this.connections[connectionIndex];
      this.connections.splice(connectionIndex, 1);
      this.connectionStats.delete(connection);
      console.log(`🗑️ Removed connection: ${rpcUrl}`);
      return true;
    }
    
    return false;
  }

  /**
   * Shutdown connection pool
   */
  shutdown() {
    this.stopHealthCheck();
    this.connections = [];
    this.connectionStats.clear();
    this.isInitialized = false;
    console.log('🛑 Connection pool shutdown');
  }
}

// Create singleton instance
const connectionPoolManager = new ConnectionPoolManager();

module.exports = connectionPoolManager;
