/**
 * Production API Server Entry Point
 * Starts the API server using the new backend
 */

import 'dotenv/config';
import APIServer from './src/server/APIServer.js';
import { loggerManager } from './src/utils/logger.js';

const logger = loggerManager.getLogger('Server');

// Get configuration from environment
const config = {
  port: process.env.PORT || 3000,
  network: process.env.NETWORK || 'mainnet-beta',
  rpc: {
    heliusApiKey: process.env.HELIUS_API_KEY,
    quicknodeEndpoint: process.env.QUICKNODE_ENDPOINT,
    tritonEndpoint: process.env.TRITON_ENDPOINT
  }
};

// Create and start server
const server = new APIServer(config);

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await server.stop();
  process.exit(0);
});

// Start server
server.start().catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

