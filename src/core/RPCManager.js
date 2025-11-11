/**
 * Enhanced RPC Connection Manager
 * Handles connection pooling, health checks, failover, and rate limiting
 */

import { Connection } from '@solana/web3.js';
import { ErrorClassifier } from '../utils/errors.js';
import { loggerManager } from '../utils/logger.js';
import { RPC_CONFIG } from '../config/constants.js';
import RPCEndpointConfig from '../config/rpcEndpoints.js';

const logger = loggerManager.getLogger('RPCManager');

/**
 * RPC Connection Manager
 */
export class RPCManager {
  constructor(network = 'mainnet-beta', config = {}) {
    this.network = network;
    this.config = {
      maxConnections: config.maxConnections || RPC_CONFIG.MAX_CONNECTIONS,
      minConnections: config.minConnections || RPC_CONFIG.MIN_CONNECTIONS,
      healthCheckInterval: config.healthCheckInterval || RPC_CONFIG.HEALTH_CHECK_INTERVAL,
      healthCheckTimeout: config.healthCheckTimeout || RPC_CONFIG.HEALTH_CHECK_TIMEOUT,
      connectionTimeout: config.connectionTimeout || RPC_CONFIG.CONNECTION_TIMEOUT,
      requestTimeout: config.requestTimeout || RPC_CONFIG.REQUEST_TIMEOUT,
      rateLimitWindow: config.rateLimitWindow || RPC_CONFIG.RATE_LIMIT_WINDOW,
      maxRequestsPerWindow: config.maxRequestsPerWindow || RPC_CONFIG.MAX_REQUESTS_PER_WINDOW,
      ...config
    };

    this.endpointConfig = new RPCEndpointConfig(network);
    this.connections = [];
    this.connectionStats = new Map();
    this.currentIndex = 0;
    this.healthCheckTimer = null;
    this.isInitialized = false;
  }

  /**
   * Initialize connections
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('RPCManager already initialized');
      return;
    }

    logger.info('Initializing RPC connections...');

    const endpoints = this.endpointConfig.getAllEndpoints();
    
    // Initialize connections
    for (const endpoint of endpoints.slice(0, this.config.maxConnections)) {
      try {
        const connection = await this.createConnection(endpoint);
        if (connection) {
          this.connections.push(connection);
        }
      } catch (error) {
        logger.warn(`Failed to create connection to ${endpoint.url}:`, error.message);
      }
    }

    if (this.connections.length === 0) {
      throw new Error('No healthy RPC connections available');
    }

    // Start health checks
    this.startHealthChecks();

    this.isInitialized = true;
    logger.info(`RPCManager initialized with ${this.connections.length} connections`);
  }

  /**
   * Create connection
   */
  async createConnection(endpoint) {
    try {
      const connection = new Connection(endpoint.url, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: this.config.connectionTimeout,
        disableRetryOnRateLimit: false
      });

      // Test connection
      const version = await Promise.race([
        connection.getVersion(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), this.config.healthCheckTimeout)
        )
      ]);

      const connectionData = {
        connection,
        endpoint,
        url: endpoint.url,
        provider: endpoint.provider,
        healthy: true,
        lastUsed: Date.now(),
        lastHealthCheck: Date.now(),
        requestCount: 0,
        successCount: 0,
        failureCount: 0,
        averageLatency: 0,
        latencyHistory: [],
        rateLimitCount: 0,
        lastRateLimitReset: Date.now()
      };

      this.connectionStats.set(endpoint.url, connectionData);
      
      logger.info(`✅ Connected to ${endpoint.provider} (${endpoint.url})`);
      return connectionData;
    } catch (error) {
      logger.warn(`Failed to connect to ${endpoint.url}:`, error.message);
      return null;
    }
  }

  /**
   * Get best connection
   */
  getConnection() {
    if (!this.isInitialized || this.connections.length === 0) {
      throw new Error('RPCManager not initialized or no connections available');
    }

    // Filter healthy connections
    const healthyConnections = this.connections.filter(c => c.healthy);
    
    if (healthyConnections.length === 0) {
      // All connections unhealthy, try to use any available
      logger.warn('All connections unhealthy, using any available connection');
      const connection = this.connections[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.connections.length;
      return connection.connection;
    }

    // Sort by quality (success rate, latency, request count)
    healthyConnections.sort((a, b) => {
      const aScore = this.calculateConnectionScore(a);
      const bScore = this.calculateConnectionScore(b);
      return bScore - aScore; // Higher score is better
    });

    const bestConnection = healthyConnections[0];
    bestConnection.lastUsed = Date.now();
    bestConnection.requestCount++;

    return bestConnection.connection;
  }

  /**
   * Calculate connection quality score
   */
  calculateConnectionScore(connectionData) {
    const stats = this.connectionStats.get(connectionData.url);
    if (!stats) return 0;

    const totalRequests = stats.successCount + stats.failureCount;
    if (totalRequests === 0) return 100; // New connection, give it a chance

    const successRate = stats.successCount / totalRequests;
    const latencyScore = Math.max(0, 1000 - stats.averageLatency) / 10; // Lower latency = higher score
    const requestPenalty = Math.min(stats.requestCount / 100, 10); // Penalize overused connections

    return (successRate * 100) + latencyScore - requestPenalty;
  }

  /**
   * Execute request with connection management
   */
  async executeRequest(requestFn, options = {}) {
    const maxRetries = options.maxRetries || 3;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let connection;
      try {
        connection = this.getConnection();
        const startTime = Date.now();
        
        const result = await Promise.race([
          requestFn(connection),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout)
          )
        ]);

        // Update stats on success
        const latency = Date.now() - startTime;
        this.updateConnectionStats(connection, true, latency);

        return result;
      } catch (error) {
        lastError = error;
        
        // Classify error
        const classifiedError = ErrorClassifier.classifyRPCError(error);
        
        // Update stats on failure
        if (connection) {
          this.updateConnectionStats(connection, false, 0);
        }

        // Check if retryable
        if (!ErrorClassifier.isRetryable(classifiedError) || attempt >= maxRetries - 1) {
          throw classifiedError;
        }

        // Wait before retry
        await this.sleep(Math.min(1000 * Math.pow(2, attempt), 5000));
      }
    }

    throw lastError;
  }

  /**
   * Update connection statistics
   */
  updateConnectionStats(connection, success, latency) {
    // Find connection data
    let connectionData = null;
    for (const data of this.connections) {
      if (data.connection === connection) {
        connectionData = data;
        break;
      }
    }

    if (!connectionData) return;

    const stats = this.connectionStats.get(connectionData.url);
    if (!stats) return;

    if (success) {
      stats.successCount++;
      stats.latencyHistory.push(latency);
      if (stats.latencyHistory.length > 100) {
        stats.latencyHistory.shift();
      }
      stats.averageLatency = stats.latencyHistory.reduce((a, b) => a + b, 0) / stats.latencyHistory.length;
    } else {
      stats.failureCount++;
      
      // Mark unhealthy after too many failures
      if (stats.failureCount > 10 && stats.failureCount / (stats.successCount + stats.failureCount) > 0.5) {
        connectionData.healthy = false;
        logger.warn(`Connection ${connectionData.url} marked as unhealthy`);
      }
    }
  }

  /**
   * Start health checks
   */
  startHealthChecks() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);

    // Perform initial health check
    this.performHealthChecks();
  }

  /**
   * Perform health checks on all connections
   */
  async performHealthChecks() {
    logger.debug('Performing health checks...');

    for (const connectionData of this.connections) {
      try {
        const startTime = Date.now();
        const slot = await Promise.race([
          connectionData.connection.getSlot(),
          new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error('Health check timeout')),
              this.config.healthCheckTimeout
            );
          })
        ]);
        const latency = Date.now() - startTime;

        connectionData.healthy = true;
        connectionData.lastHealthCheck = Date.now();
        
        const stats = this.connectionStats.get(connectionData.url);
        if (stats) {
          stats.latencyHistory.push(latency);
          if (stats.latencyHistory.length > 100) {
            stats.latencyHistory.shift();
          }
          stats.averageLatency = stats.latencyHistory.reduce((a, b) => a + b, 0) / stats.latencyHistory.length;
        }

        logger.debug(`✅ ${connectionData.provider} healthy (latency: ${latency}ms)`);
      } catch (error) {
        connectionData.healthy = false;
        logger.warn(`❌ ${connectionData.provider} unhealthy:`, error.message);
      }
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const stats = [];
    for (const connectionData of this.connections) {
      const connectionStats = this.connectionStats.get(connectionData.url);
      stats.push({
        provider: connectionData.provider,
        url: connectionData.url,
        healthy: connectionData.healthy,
        lastUsed: connectionData.lastUsed,
        lastHealthCheck: connectionData.lastHealthCheck,
        requestCount: connectionData.requestCount,
        successCount: connectionStats?.successCount || 0,
        failureCount: connectionStats?.failureCount || 0,
        averageLatency: connectionStats?.averageLatency || 0,
        successRate: connectionStats ? 
          connectionStats.successCount / (connectionStats.successCount + connectionStats.failureCount) : 0
      });
    }
    return stats;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.connections = [];
    this.connectionStats.clear();
    this.isInitialized = false;
    logger.info('RPCManager destroyed');
  }
}

export default RPCManager;

