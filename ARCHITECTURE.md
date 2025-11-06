# Production Architecture Plan

## Directory Structure

```
chaos-bot-website/
├── src/                          # Source code
│   ├── core/                     # Core Solana functionality
│   │   ├── SolanaCore.js        # Main Solana connection manager
│   │   ├── RPCManager.js        # RPC connection pooling & health checks
│   │   ├── TransactionBuilder.js # Transaction building utilities
│   │   └── AccountManager.js    # Account management
│   │
│   ├── integrations/             # DEX & Platform integrations
│   │   ├── pumpfun/             # PumpFun integration
│   │   │   ├── PumpFunClient.js # Main PumpFun client
│   │   │   ├── BondingCurve.js  # Bonding curve operations
│   │   │   ├── TokenLaunch.js   # Token creation
│   │   │   └── instructions.js  # Instruction builders
│   │   │
│   │   ├── jupiter/             # Jupiter aggregator
│   │   │   ├── JupiterClient.js # Main Jupiter client
│   │   │   ├── SwapEngine.js    # Swap execution
│   │   │   └── RouteOptimizer.js # Route optimization
│   │   │
│   │   └── raydium/             # Raydium direct integration (optional)
│   │       ├── RaydiumClient.js
│   │       └── AMMPool.js
│   │
│   ├── wallet/                   # Wallet management
│   │   ├── WalletManager.js      # Wallet operations
│   │   ├── WalletAdapter.js      # Browser wallet adapter
│   │   ├── KeyManager.js         # Private key management
│   │   └── Security.js           # Security utilities
│   │
│   ├── trading/                  # Trading functionality
│   │   ├── TradingEngine.js      # Main trading engine
│   │   ├── SmartSell.js          # Smart sell automation
│   │   ├── VolumeBot.js          # Volume trading bot
│   │   └── Blueprint.js          # Trading blueprints
│   │
│   ├── utils/                    # Utilities
│   │   ├── errors.js             # Error handling
│   │   ├── retry.js              # Retry logic
│   │   ├── cache.js              # Caching
│   │   ├── logger.js             # Logging
│   │   └── validation.js         # Input validation
│   │
│   └── config/                   # Configuration
│       ├── constants.js          # Solana constants
│       ├── rpcEndpoints.js        # RPC endpoint configs
│       └── settings.js           # App settings
│
├── lib/                          # Shared libraries (frontend & backend)
│   ├── solana-web3.js            # Solana Web3 utilities
│   └── common.js                 # Common utilities
│
├── webapp/                       # Frontend application
│   ├── assets/                   # Static assets
│   ├── components/               # UI components
│   │   ├── Wallet/               # Wallet components
│   │   ├── Trading/              # Trading components
│   │   ├── Portfolio/            # Portfolio components
│   │   └── Settings/             # Settings components
│   ├── services/                 # Frontend services
│   │   ├── api.js                # API client
│   │   ├── websocket.js          # WebSocket client
│   │   └── storage.js            # Local storage
│   ├── styles/                   # CSS files
│   └── index.html                # Main HTML
│
├── tests/                       # Tests
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── e2e/                      # End-to-end tests
│
├── config/                       # Configuration files
│   ├── devnet.json               # Devnet config
│   ├── mainnet.json              # Mainnet config
│   └── rpc-providers.json        # RPC provider configs
│
├── docs/                         # Documentation
│   ├── api/                      # API documentation
│   └── guides/                   # User guides
│
├── scripts/                      # Build & deployment scripts
│   ├── build.js                  # Build script
│   └── deploy.js                 # Deployment script
│
├── package.json
├── tsconfig.json                 # TypeScript config (optional)
├── webpack.config.js             # Webpack config (optional)
└── README.md
```

## Module Architecture

### 1. Core Layer
- **SolanaCore**: Main connection manager, transaction execution
- **RPCManager**: Connection pooling, health checks, failover
- **TransactionBuilder**: Transaction building utilities
- **AccountManager**: Account state management

### 2. Integration Layer
- **PumpFun**: Complete PumpFun integration
- **Jupiter**: Jupiter aggregator integration
- **Raydium**: Direct Raydium integration (optional)

### 3. Wallet Layer
- **WalletManager**: Wallet operations
- **WalletAdapter**: Browser wallet connections
- **KeyManager**: Secure key management
- **Security**: Encryption, validation

### 4. Trading Layer
- **TradingEngine**: Main trading orchestration
- **SmartSell**: Automated profit taking
- **VolumeBot**: Volume generation
- **Blueprint**: Trading strategies

### 5. Utils Layer
- **Errors**: Error handling & classification
- **Retry**: Retry strategies
- **Cache**: Caching layer
- **Logger**: Logging system

## Data Flow

```
User Action
    ↓
Frontend Component
    ↓
Service Layer (API/WebSocket)
    ↓
Trading Engine / Wallet Manager
    ↓
Integration (PumpFun/Jupiter)
    ↓
Solana Core
    ↓
RPC Manager
    ↓
Solana Blockchain
```

## Build Process

1. **Development**: Direct module loading
2. **Production**: Bundled with webpack/vite
3. **Testing**: Jest for unit, Playwright for E2E

## Extension Points

- New DEX integrations → Add to `src/integrations/`
- New trading strategies → Add to `src/trading/`
- New UI components → Add to `webapp/components/`
- New utilities → Add to `src/utils/`

