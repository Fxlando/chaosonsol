/**
 * Solana Constants and Configuration
 * Centralized constants for the entire application
 */

// Solana Network Constants
export const NETWORKS = {
  MAINNET: 'mainnet-beta',
  DEVNET: 'devnet',
  TESTNET: 'testnet'
};

// Solana Program IDs
export const PROGRAM_IDS = {
  SYSTEM_PROGRAM: '11111111111111111111111111111111',
  TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  ASSOCIATED_TOKEN_PROGRAM: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  
  // PumpFun
  PUMPFUN_PROGRAM: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  PUMPFUN_BONDING_CURVE: 'So11111111111111111111111111111111111111112',
  
  // Jupiter
  JUPITER_V6_PROGRAM: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  
  // Raydium
  RAYDIUM_AMM_PROGRAM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM_PROGRAM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'
};

// RPC Endpoints
export const RPC_ENDPOINTS = {
  MAINNET: {
    HELIUS: 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY',
    QUICKNODE: 'https://YOUR_ENDPOINT.solana-mainnet.quiknode.pro/YOUR_KEY/',
    TRITON: 'https://YOUR_ENDPOINT.rpcpool.com/YOUR_KEY',
    ANKR: 'https://rpc.ankr.com/solana',
    PUBLIC: [
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com'
    ]
  },
  DEVNET: {
    PUBLIC: [
      'https://api.devnet.solana.com',
      'https://rpc.ankr.com/solana_devnet'
    ]
  }
};

// API Endpoints
export const API_ENDPOINTS = {
  PUMPFUN: 'https://frontend-api.pump.fun',
  JUPITER_V6: 'https://quote-api.jup.ag/v6',
  SOLSCAN: 'https://api.solscan.io',
  COINBASE: 'https://api.coinbase.com/v2/exchange-rates'
};

// Transaction Constants
export const TRANSACTION_CONFIG = {
  DEFAULT_SLIPPAGE: 1.0, // 1%
  MAX_SLIPPAGE: 50.0, // 50%
  MIN_SLIPPAGE: 0.1, // 0.1%
  
  DEFAULT_PRIORITY_FEE: 1000, // lamports
  MAX_PRIORITY_FEE: 100000, // lamports
  
  DEFAULT_TIMEOUT: 30000, // 30 seconds
  MAX_TIMEOUT: 60000, // 60 seconds
  
  DEFAULT_RETRIES: 3,
  MAX_RETRIES: 5,
  
  CONFIRMATION_TIMEOUT: 60000, // 60 seconds
  BLOCK_HEIGHT_TIMEOUT: 150, // 150 slots (~60 seconds)
  
  MAX_TRANSACTION_SIZE: 1232, // bytes
  COMPUTE_UNIT_LIMIT: 200000, // default compute units
  COMPUTE_UNIT_PRICE: 1000 // default compute unit price (micro lamports)
};

// Token Constants
export const TOKEN_CONFIG = {
  DEFAULT_DECIMALS: 9,
  MIN_DECIMALS: 0,
  MAX_DECIMALS: 9,
  
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 32,
  
  MIN_SYMBOL_LENGTH: 1,
  MAX_SYMBOL_LENGTH: 10,
  
  MIN_DESCRIPTION_LENGTH: 0,
  MAX_DESCRIPTION_LENGTH: 1000,
  
  MIN_INITIAL_BUY: 0.001, // SOL
  MAX_INITIAL_BUY: 1000, // SOL
};

// RPC Connection Constants
export const RPC_CONFIG = {
  MAX_CONNECTIONS: 5,
  MIN_CONNECTIONS: 2,
  
  HEALTH_CHECK_INTERVAL: 60000, // 1 minute
  HEALTH_CHECK_TIMEOUT: 5000, // 5 seconds
  
  CONNECTION_TIMEOUT: 10000, // 10 seconds
  REQUEST_TIMEOUT: 30000, // 30 seconds
  
  RATE_LIMIT_WINDOW: 60000, // 1 minute
  MAX_REQUESTS_PER_WINDOW: 100,
  
  FAILOVER_DELAY: 1000, // 1 second
  RETRY_DELAY: 2000, // 2 seconds
  MAX_RETRY_DELAY: 10000, // 10 seconds
};

// Cache Constants
export const CACHE_CONFIG = {
  TOKEN_INFO_TTL: 30000, // 30 seconds
  PRICE_TTL: 10000, // 10 seconds
  QUOTE_TTL: 5000, // 5 seconds
  BALANCE_TTL: 5000, // 5 seconds
  TRANSACTION_TTL: 60000, // 1 minute
  
  MAX_CACHE_SIZE: 1000, // entries
};

// Error Codes
export const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  RPC_ERROR: 'RPC_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  TRANSACTION_ERROR: 'TRANSACTION_ERROR',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  SLIPPAGE_EXCEEDED: 'SLIPPAGE_EXCEEDED',
  INVALID_ACCOUNT: 'INVALID_ACCOUNT',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  TRANSACTION_EXPIRED: 'TRANSACTION_EXPIRED',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  PROGRAM_ERROR: 'PROGRAM_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
};

// Wallet Constants
export const WALLET_CONFIG = {
  SUPPORTED_WALLETS: ['Phantom', 'Solflare', 'Backpack', 'Coinbase'],
  MIN_BALANCE: 0.001, // SOL (rent exempt minimum)
  GAS_BUFFER: 0.002, // SOL (gas buffer for transactions)
};

// Trading Constants
export const TRADING_CONFIG = {
  MIN_TRADE_AMOUNT: 0.001, // SOL
  MAX_TRADE_AMOUNT: 1000, // SOL
  
  SMART_SELL_PROFIT_TARGET: 30, // 30%
  SMART_SELL_STOP_LOSS: 15, // 15%
  SMART_SELL_TRAILING_STOP: 10, // 10%
  SMART_SELL_EMERGENCY_LOSS: 25, // 25%
  
  VOLUME_BOT_MIN_DELAY: 1000, // 1 second
  VOLUME_BOT_MAX_DELAY: 60000, // 60 seconds
  VOLUME_BOT_DEFAULT_DELAY: 3000, // 3 seconds
  VOLUME_BOT_MIN_SELL_PERCENT: 45, // 45%
  VOLUME_BOT_MAX_SELL_PERCENT: 95, // 95%
  VOLUME_BOT_DEFAULT_BUY_INTERVAL: 3000, // 3 seconds between buys
  VOLUME_BOT_DEFAULT_SELL_INTERVAL: 5000, // 5 seconds between sells
  VOLUME_BOT_GUARDRAILS: {
    ENABLED: true,
    MIN_NET_POSITION: 0, // tokens (ui amount)
    MAX_NET_POSITION: null,
    TARGET_NET_POSITION: null,
    REALIZED_PROFIT_TARGET: null, // SOL
    REALIZED_LOSS_LIMIT: null // SOL
  }
};

// Logging Constants
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

export const DEFAULT_LOG_LEVEL = LOG_LEVELS.INFO;

// Export everything
export default {
  NETWORKS,
  PROGRAM_IDS,
  RPC_ENDPOINTS,
  API_ENDPOINTS,
  TRANSACTION_CONFIG,
  TOKEN_CONFIG,
  RPC_CONFIG,
  CACHE_CONFIG,
  ERROR_CODES,
  WALLET_CONFIG,
  TRADING_CONFIG,
  LOG_LEVELS,
  DEFAULT_LOG_LEVEL
};

