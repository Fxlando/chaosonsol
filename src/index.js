/**
 * Main Entry Point
 * Exports all core modules
 */

// Core
export { default as SolanaCore } from './core/SolanaCore.js';
export { default as RPCManager } from './core/RPCManager.js';
export { default as TransactionBuilder } from './core/TransactionBuilder.js';
export { default as AccountManager } from './core/AccountManager.js';

// Config
export { default as RPCEndpointConfig } from './config/rpcEndpoints.js';
export * from './config/constants.js';

// Utils
export * from './utils/errors.js';
export { default as RetryHandler } from './utils/retry.js';
export { default as Logger, loggerManager, logger } from './utils/logger.js';

// Integrations
export { default as PumpFunClient } from './integrations/pumpfun/PumpFunClient.js';

// Re-export for convenience
export default {
  SolanaCore: () => import('./core/SolanaCore.js'),
  RPCManager: () => import('./core/RPCManager.js'),
  TransactionBuilder: () => import('./core/TransactionBuilder.js'),
  AccountManager: () => import('./core/AccountManager.js'),
  PumpFunClient: () => import('./integrations/pumpfun/PumpFunClient.js'),
  // More exports will be added as modules are built
};

