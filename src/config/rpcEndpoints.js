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
    
    // Primary: RPC_URL (Shyft or configured RPC)
    if (process.env?.RPC_URL) {
      const isShyft = process.env.RPC_URL.includes('shyft.to');
      endpoints.push({
        url: process.env.RPC_URL,
        provider: isShyft ? 'Shyft' : 'Custom',
        priority: 1,
        rateLimit: isShyft ? 1000 : 500,
        supportsWebSocket: isShyft
      });
    }
    
    // Backup RPCs: RPC_URL_2, RPC_URL_3
    if (process.env?.RPC_URL_2) {
      endpoints.push({
        url: process.env.RPC_URL_2,
        provider: 'Backup',
        priority: 2,
        rateLimit: 500,
        supportsWebSocket: false
      });
    }
    if (process.env?.RPC_URL_3) {
      endpoints.push({
        url: process.env.RPC_URL_3,
        provider: 'Backup',
        priority: 3,
        rateLimit: 500,
        supportsWebSocket: false
      });
    }
    
    // Helius (if configured) - for dedicated tasks
    if (process.env?.HELIUS_API_KEY) {
      endpoints.push({
        url: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        provider: 'Helius',
        priority: 4,
        rateLimit: 1000, // requests per minute
        supportsWebSocket: true
      });
    }

    // QuickNode (if configured)
    if (process.env?.QUICKNODE_ENDPOINT) {
      endpoints.push({
        url: process.env.QUICKNODE_ENDPOINT,
        provider: 'QuickNode',
        priority: 5,
        rateLimit: 1000,
        supportsWebSocket: true
      });
    }

    // Triton (if configured)
    if (process.env?.TRITON_ENDPOINT) {
      endpoints.push({
        url: process.env.TRITON_ENDPOINT,
        provider: 'Triton',
        priority: 6,
        rateLimit: 500,
        supportsWebSocket: true
      });
    }

    return endpoints;
  }

  getSecondaryEndpoints() {
    // Ankr as final fallback only (lowest priority)
    return [
      {
        url: 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27',
        provider: 'Ankr',
        priority: 99, // Lowest priority - only used if all others fail
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

