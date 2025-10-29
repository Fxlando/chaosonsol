# 🚀 Chaos Bot - Production Trading System

A complete, production-ready Solana trading platform with full integration of PumpFun, Raydium DEX, and optimized RPC connections. This system provides 100% functional trading capabilities with no placeholders or mock data.

## ✨ Features

### 🔧 Core Infrastructure
- **Production Solana Core** - Optimized RPC connection management with load balancing
- **PumpFun Integration** - Complete bonding curve trading with real-time data
- **Raydium DEX Integration** - Full DEX trading via Jupiter Aggregator v6
- **Wallet Management** - Comprehensive wallet operations and group management
- **Trading Engine** - Unified trading system with smart routing

### 🎯 Trading Capabilities
- **Token Trading** - Buy/sell tokens on both PumpFun and Raydium DEX
- **Smart Routing** - Automatically chooses optimal trading platform
- **Group Trading** - Execute trades across multiple wallets simultaneously
- **Real-time Pricing** - Live token prices from multiple sources
- **Advanced Analytics** - Comprehensive P&L tracking and statistics

### 🌐 Web Interface
- **Professional UI** - Modern, responsive trading platform
- **Real-time Updates** - Live data refresh and notifications
- **Multi-section Dashboard** - Tokens, Wallets, Automations, Console, P&L, Settings
- **Advanced Search** - Token and wallet search with filtering
- **Bulk Operations** - Mass wallet management and trading

### 🔒 Security & Reliability
- **Input Validation** - Comprehensive data validation and sanitization
- **Error Handling** - Robust error handling with detailed logging
- **Rate Limiting** - Intelligent API rate limiting and retry logic
- **Connection Pooling** - Optimized RPC connections with failover
- **Caching** - Smart caching for improved performance

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Solana RPC access

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Fxlando/chaosonsol.git
cd chaosonsol
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp env.example .env
# Edit .env with your configuration
```

4. **Start the production system**
```bash
npm run start:production
```

### Environment Configuration

Create a `.env` file with the following variables:

```env
# Solana Configuration
RPC_URL=https://api.mainnet-beta.solana.com
NETWORK=mainnet-beta
DEFAULT_SLIPPAGE=1.0
PRIORITY_FEE=1000
MAX_RETRIES=3

# Trading Configuration
AUTO_TRADE=false
MAX_CONCURRENT_TRADES=5

# API Configuration
PORT=3000
HOST=0.0.0.0

# Logging
LOG_LEVEL=info
ENABLE_DEBUG=false
```

## 📁 Project Structure

```
├── production-solana-core.js          # Core Solana infrastructure
├── production-pumpfun-integration.js  # PumpFun trading integration
├── production-raydium-integration.js  # Raydium DEX integration
├── production-wallet-manager.js       # Wallet management system
├── production-trading-engine.js       # Unified trading engine
├── webapp/
│   ├── production-api-server.js       # Production API server
│   ├── production-frontend.js         # Frontend JavaScript
│   └── production-trading-platform.html # Main trading UI
├── test-production-system.js          # Comprehensive test suite
├── start-production-system.js         # Production startup script
└── README-PRODUCTION-SYSTEM.md        # This file
```

## 🎯 Usage

### Starting the System

```bash
# Start with full testing
npm run start:production

# Start API server only
npm run web:production

# Run tests only
node test-production-system.js
```

### Accessing the Platform

- **Main Platform**: http://localhost:3000/production-trading-platform.html
- **API Endpoints**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/api/health

### Trading Operations

#### Buy Tokens
```javascript
// Via API
POST /api/buy
{
  "walletAddress": "wallet_address",
  "tokenMint": "token_mint_address",
  "amount": 0.1,
  "options": { "slippage": 1.0 }
}
```

#### Sell Tokens
```javascript
// Via API
POST /api/sell
{
  "walletAddress": "wallet_address",
  "tokenMint": "token_mint_address",
  "tokenAmount": 1000000,
  "options": { "slippage": 1.0 }
}
```

#### Group Trading
```javascript
// Via API
POST /api/group-trade
{
  "groupId": "group_id",
  "tokenMint": "token_mint_address",
  "amount": 0.1,
  "tradeType": "buy",
  "options": { "slippage": 1.0 }
}
```

## 🔧 API Endpoints

### Core Endpoints
- `GET /api/health` - System health check
- `GET /api/stats` - Trading statistics
- `GET /api/rpc-health` - RPC connection status

### Wallet Management
- `GET /api/wallets` - List all wallets
- `POST /api/wallets` - Create new wallet
- `GET /api/wallet?address=...` - Get wallet details
- `PUT /api/wallet?address=...` - Update wallet
- `DELETE /api/wallet?address=...` - Delete wallet

### Group Management
- `GET /api/groups` - List all groups
- `POST /api/groups` - Create new group
- `GET /api/group?id=...` - Get group details
- `PUT /api/group?id=...` - Update group
- `DELETE /api/group?id=...` - Delete group

### Token Operations
- `GET /api/tokens` - List tokens (trending/popular)
- `GET /api/token?mint=...` - Get token details
- `GET /api/search?q=...` - Search tokens
- `GET /api/trending` - Get trending tokens
- `GET /api/price?mint=...` - Get token price

### Trading Operations
- `POST /api/buy` - Buy tokens
- `POST /api/sell` - Sell tokens
- `POST /api/swap` - Swap tokens
- `POST /api/group-trade` - Execute group trade

## 🧪 Testing

The system includes comprehensive testing:

```bash
# Run all tests
node test-production-system.js

# Test specific components
node -e "require('./production-solana-core')"
node -e "require('./production-pumpfun-integration')"
node -e "require('./production-raydium-integration')"
```

### Test Coverage
- ✅ Solana Core functionality
- ✅ PumpFun integration
- ✅ Raydium DEX integration
- ✅ Wallet management
- ✅ Trading engine
- ✅ API endpoints
- ✅ Error handling
- ✅ Data validation

## 📊 Monitoring

### Health Checks
- RPC connection status
- API endpoint availability
- Trading engine status
- Wallet balance updates

### Logging
- Comprehensive logging system
- Error tracking and reporting
- Performance metrics
- Trade history

### Statistics
- Total trades executed
- Success/failure rates
- Volume traded
- Profit/loss tracking
- Wallet performance

## 🔒 Security Features

- **Input Validation** - All inputs are validated and sanitized
- **Rate Limiting** - API rate limiting to prevent abuse
- **Error Handling** - Secure error handling without data leakage
- **Connection Security** - Secure RPC connections
- **Data Protection** - Sensitive data is properly handled

## 🚀 Deployment

### Local Development
```bash
npm run start:production
```

### Production Deployment
```bash
# Build for production
npm run build

# Start production server
npm run start:production
```

### Docker Deployment
```bash
# Build Docker image
docker build -t chaos-bot-production .

# Run container
docker run -p 3000:3000 --env-file .env chaos-bot-production
```

## 📈 Performance

- **Connection Pooling** - Multiple RPC connections for load balancing
- **Smart Caching** - Intelligent caching for improved performance
- **Rate Limiting** - Prevents API rate limit issues
- **Async Operations** - Non-blocking operations for better performance
- **Memory Management** - Efficient memory usage

## 🛠️ Troubleshooting

### Common Issues

1. **RPC Connection Issues**
   - Check RPC URL in .env file
   - Verify network connectivity
   - Check RPC health endpoint

2. **Trading Failures**
   - Verify wallet has sufficient balance
   - Check slippage settings
   - Review error logs

3. **API Errors**
   - Check API endpoint URLs
   - Verify request format
   - Review server logs

### Debug Mode

Enable debug mode in .env:
```env
ENABLE_DEBUG=true
LOG_LEVEL=debug
```

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation

---

**⚠️ Disclaimer**: This software is for educational and research purposes. Use at your own risk. Always test thoroughly before using with real funds.
