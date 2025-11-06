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
export { default as TokenLaunch } from './integrations/pumpfun/TokenLaunch.js';
export { default as JupiterClient } from './integrations/jupiter/JupiterClient.js';

// Wallet
export { default as WalletManager } from './wallet/WalletManager.js';

// Trading
export { default as TradingEngine } from './trading/TradingEngine.js';
export { default as SmartSell } from './trading/SmartSell.js';
export { default as VolumeBot } from './trading/VolumeBot.js';

// Wallet
export { default as Security } from './wallet/Security.js';

// App
export { default as App } from './App.js';

// Re-export for convenience
export default {
  SolanaCore: () => import('./core/SolanaCore.js'),
  RPCManager: () => import('./core/RPCManager.js'),
  TransactionBuilder: () => import('./core/TransactionBuilder.js'),
  AccountManager: () => import('./core/AccountManager.js'),
  PumpFunClient: () => import('./integrations/pumpfun/PumpFunClient.js'),
  JupiterClient: () => import('./integrations/jupiter/JupiterClient.js'),
  WalletManager: () => import('./wallet/WalletManager.js'),
  Security: () => import('./wallet/Security.js'),
  TradingEngine: () => import('./trading/TradingEngine.js'),
  SmartSell: () => import('./trading/SmartSell.js'),
  VolumeBot: () => import('./trading/VolumeBot.js'),
  App: () => import('./App.js'),
  // More exports will be added as modules are built
};

