# Chaos Bot - Production-Ready Solana Trading Platform 🚀

A comprehensive Solana trading platform with full PumpFun, Jupiter DEX integration, optimized RPC connections, and automated trading features.

## ✨ Features

### Core Trading
- ✅ **Buy/Sell Tokens** - Auto-detects PumpFun vs DEX tokens
- ✅ **PumpFun Integration** - Complete bonding curve trading
- ✅ **Jupiter Integration** - DEX swaps with VersionedTransaction support
- ✅ **Cross-Token Swaps** - Seamless token-to-token trading

### Wallet Management
- ✅ **Create Wallets** - Generate new Solana wallets
- ✅ **Import Wallets** - Import existing wallets (multiple formats)
- ✅ **Secure Storage** - Encrypted wallet storage
- ✅ **Balance Management** - Real-time balance tracking

### Automation
- ✅ **Smart Sell** - Automated profit taking, stop loss, trailing stops
- ✅ **Volume Bot** - Multi-wallet volume generation
- ✅ **Position Monitoring** - Real-time price monitoring

### Infrastructure
- ✅ **RPC Connection Pooling** - Health checks, failover, load balancing
- ✅ **Error Handling** - Comprehensive error classification and retry logic
- ✅ **Logging System** - Centralized logging with levels
- ✅ **Security** - Encryption, input validation, secure storage

## 📦 Installation

```bash
npm install
```

## 🖥️ Local On-Chain Stack

Run the same build that ships to production without relying on demo shortcuts.

1. Copy the sample environment and update the values you care about:
   ```bash
   cp env.example .env
   ```
   - Set `NETWORK=devnet` for testing or `mainnet-beta` when you are ready for real funds.
   - Point `RPC_URL` (and optional `HELIUS_API_KEY`, `QUICKNODE_ENDPOINT`, etc.) at the providers you actually use.
2. Start the combined API + UI server:
   ```bash
   npm run web
   ```
   This serves the frontend and the API on `http://localhost:3000`, so every fetch stays on the same origin.
3. Open `http://localhost:3000` in your normal browser profile, authenticate with your access code, and connect your Solana wallet.
4. If you ever see a stale session, clear `localStorage` keys `chaos_auth` and `chaos_token` and refresh—no incognito window required.

## 🚀 Quick Start

### Basic Usage

```javascript
import { App } from './src/App.js';

// Initialize application
const app = new App({
  network: 'mainnet-beta', // or 'devnet' for testing
  trading: {
    defaultSlippage: 1.0 // 1% slippage
  }
});

await app.initialize();

// Create wallet
const wallet = app.createWallet('My Trading Wallet');

// Buy token (auto-detects PumpFun or DEX)
const result = await app.buyToken(
  wallet.wallet.id,
  tokenMint,
  0.1 // 0.1 SOL
);

// Sell token
const sellResult = await app.sellToken(
  wallet.wallet.id,
  tokenMint,
  tokenAmount
);
```

### Smart Sell Automation

```javascript
// Add position to Smart Sell monitoring
await app.addSmartSellPosition(
  walletId,
  tokenMint,
  entryPrice,
  amount,
  {
    profitTarget: 30,  // 30% profit target
    stopLoss: -15,     // -15% stop loss
    trailingStop: 10   // 10% trailing stop
  }
);

// Smart Sell will automatically monitor and sell
```

### Volume Bot

```javascript
// Start volume trading session
const session = await app.startVolumeSession(
  [walletId1, walletId2, walletId3],
  tokenMint,
  {
    totalVolume: 1.0,  // 1 SOL total
    cycles: 10,        // 10 buy/sell cycles
    continuous: false
  }
);
```

## 📁 Project Structure

```
src/
├── core/              # Core Solana functionality
│   ├── SolanaCore.js
│   ├── RPCManager.js
│   ├── TransactionBuilder.js
│   └── AccountManager.js
├── integrations/      # DEX & Platform integrations
│   ├── pumpfun/      # PumpFun integration
│   └── jupiter/      # Jupiter integration
├── wallet/            # Wallet management
│   ├── WalletManager.js
│   └── Security.js
├── trading/           # Trading features
│   ├── TradingEngine.js
│   ├── SmartSell.js
│   └── VolumeBot.js
├── utils/             # Utilities
│   ├── errors.js
│   ├── retry.js
│   └── logger.js
└── config/            # Configuration
    ├── constants.js
    └── rpcEndpoints.js
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

## 📚 Examples

See `examples/` directory for complete usage examples:
- `basic-usage.js` - Basic trading operations
- `trading-example.js` - Complete trading workflow
- `volume-bot-example.js` - Volume trading example

## 🔧 Configuration

### Environment Variables

```env
# RPC Providers (optional)
HELIUS_API_KEY=your_helius_key
QUICKNODE_ENDPOINT=your_quicknode_endpoint
TRITON_ENDPOINT=your_triton_endpoint

# Network
NETWORK=mainnet-beta
```

### App Configuration

```javascript
const app = new App({
  network: 'mainnet-beta',
  rpc: {
    maxConnections: 5,
    healthCheckInterval: 60000
  },
  trading: {
    defaultSlippage: 1.0,
    priorityFee: 1000
  },
  smartSell: {
    enabled: true,
    profitTarget: 30,
    stopLoss: -15
  },
  volumeBot: {
    minAmount: 0.001,
    maxAmount: 0.1
  }
});
```

## 📖 API Documentation

### App Class

Main application class that initializes all components.

```javascript
const app = new App(config);
await app.initialize();
```

#### Methods

- `buyToken(walletId, tokenMint, solAmount, options)` - Buy token
- `sellToken(walletId, tokenMint, tokenAmount, options)` - Sell token
- `createWallet(name, tags)` - Create new wallet
- `importWallet(privateKey, name, tags)` - Import wallet
- `getAllWalletsWithBalances()` - Get all wallets with balances
- `addSmartSellPosition(walletId, tokenMint, entryPrice, amount, options)` - Add to Smart Sell
- `startVolumeSession(walletIds, tokenMint, config)` - Start volume trading
- `getTokenPrice(tokenMint)` - Get token price
- `getQuote(inputMint, outputMint, amount, options)` - Get swap quote
- `getStatus()` - Get application status
- `getRPCStats()` - Get RPC statistics

## 🔐 Security

- Private keys are encrypted in storage
- Input validation and sanitization
- Secure key management
- No private keys exposed in logs

## 🚨 Important Notes

- **Test on devnet first** - Always test with small amounts
- **RPC Limits** - Free RPCs have rate limits (use paid RPCs for production)
- **Transaction Fees** - All transactions require SOL for fees
- **Slippage** - Higher slippage for volatile tokens (PumpFun tokens need 5-25%)

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📧 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ for the Solana ecosystem**
