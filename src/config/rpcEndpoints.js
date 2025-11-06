/**
 * RPC Endpoint Configuration
 * Manages RPC endpoint configurations and provider settings
 */

import { RPC_ENDPOINTS, RPC_CONFIG } from './constants.js';

/**
 * RPC Provider Configuration
 */
export class RPCEndpointConfig {
  constructor(network = 'mainnet-beta') {
    this.network = network;
    this.endpoints = this.loadEndpoints(network);
    this.config = RPC_CONFIG;
  }

  loadEndpoints(network) {
    if (network === 'mainnet-beta') {
      return {
        primary: this.getPrimaryEndpoints(),
        secondary: this.getSecondaryEndpoints(),
        fallback: RPC_ENDPOINTS.MAINNET.PUBLIC
      };
    } else {
      return {
        primary: RPC_ENDPOINTS.DEVNET.PUBLIC,
        secondary: [],
        fallback: RPC_ENDPOINTS.DEVNET.PUBLIC
      };
    }
  }

  getPrimaryEndpoints() {
    // Load from environment variables or config
    const endpoints = [];
    
    // Helius (if configured)
    if (process.env?.HELIUS_API_KEY) {
      endpoints.push({
        url: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        provider: 'Helius',
        priority: 1,
        rateLimit: 1000, // requests per minute
        supportsWebSocket: true
      });
    }

    // QuickNode (if configured)
    if (process.env?.QUICKNODE_ENDPOINT) {
      endpoints.push({
        url: process.env.QUICKNODE_ENDPOINT,
        provider: 'QuickNode',
        priority: 2,
        rateLimit: 1000,
        supportsWebSocket: true
      });
    }

    // Triton (if configured)
    if (process.env?.TRITON_ENDPOINT) {
      endpoints.push({
        url: process.env.TRITON_ENDPOINT,
        provider: 'Triton',
        priority: 3,
        rateLimit: 500,
        supportsWebSocket: true
      });
    }

    return endpoints;
  }

  getSecondaryEndpoints() {
    // Ankr (free tier available)
    return [
      {
        url: 'https://rpc.ankr.com/solana',
        provider: 'Ankr',
        priority: 4,
        rateLimit: 100,
        supportsWebSocket: false
      }
    ];
  }

  /**
   * Get all available endpoints sorted by priority
   */
  getAllEndpoints() {
    const all = [
      ...this.endpoints.primary,
      ...this.endpoints.secondary,
      ...this.endpoints.fallback.map(url => ({
        url,
        provider: 'Public',
        priority: 99,
        rateLimit: 10,
        supportsWebSocket: false
      }))
    ];

    return all.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get endpoint configuration
   */
  getConfig() {
    return {
      maxConnections: this.config.MAX_CONNECTIONS,
      minConnections: this.config.MIN_CONNECTIONS,
      healthCheckInterval: this.config.HEALTH_CHECK_INTERVAL,
      connectionTimeout: this.config.CONNECTION_TIMEOUT,
      requestTimeout: this.config.REQUEST_TIMEOUT,
      rateLimitWindow: this.config.RATE_LIMIT_WINDOW,
      maxRequestsPerWindow: this.config.MAX_REQUESTS_PER_WINDOW
    };
  }

  /**
   * Validate endpoint
   */
  async validateEndpoint(endpoint) {
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getHealth'
        })
      });

      const data = await response.json();
      return data.result === 'ok';
    } catch (error) {
      return false;
    }
  }
}

export default RPCEndpointConfig;

