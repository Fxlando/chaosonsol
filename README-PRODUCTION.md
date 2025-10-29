# Chaos Bot - Production Trading Platform

A comprehensive, production-ready Solana trading platform with full integration of PumpFun, Raydium DEX, and optimized RPC connections.

## 🚀 Features

### Core Trading Engines
- **Jupiter v6 Integration** - Advanced DEX aggregation with optimal routing
- **Raydium DEX Integration** - Direct AMM trading with liquidity pools
- **PumpFun Integration** - Bonding curve trading for new token launches
- **Smart Sell AI** - Automated profit-taking with bubble detection

### Wallet Management
- **Multi-Wallet Support** - Manage unlimited Solana wallets
- **Group Organization** - Organize wallets by trading strategy
- **Bulk Operations** - Fund, withdraw, tag, and warm wallets
- **Real-time Analytics** - P&L tracking and performance metrics

### Advanced Features
- **Connection Pool** - Optimized RPC connections with failover
- **Rate Limiting** - Intelligent request management
- **Smart Caching** - Reduced API calls and improved performance
- **Real-time Updates** - Live trading data and notifications

## 🛠️ Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Solana CLI (optional)
- Docker (for containerized deployment)

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/your-username/chaos-bot.git
cd chaos-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp env.production .env
# Edit .env with your configuration
```

4. **Start the application**
```bash
npm run start:production
```

5. **Access the platform**
Open http://localhost:3000 in your browser

### Docker Deployment

1. **Build and run with Docker Compose**
```bash
docker-compose up -d
```

2. **Access the platform**
- Web UI: http://localhost
- API: http://localhost/api
- Grafana: http://localhost:3001

## ⚙️ Configuration

### Environment Variables

```bash
# Solana RPC Configuration
RPC_URL=https://rpc.ankr.com/solana/your-api-key
NETWORK=mainnet-beta

# Trading Configuration
DEFAULT_SLIPPAGE=100
PRIORITY_FEE=1000
MAX_RETRIES=3

# Security
JWT_SECRET=your-super-secret-jwt-key
ENCRYPTION_KEY=your-32-character-encryption-key

# Rate Limiting
MAX_TRADES_PER_MINUTE=50
MAX_WALLETS_PER_OPERATION=100
MAX_SOL_PER_TRADE=10

# RPC Pool
RPC_POOL_SIZE=4
RPC_TIMEOUT=30000
RPC_RETRY_ATTEMPTS=3
```

### RPC Providers

The platform supports multiple RPC providers:

- **Ankr** (Recommended) - 1,500 RPS premium tier
- **QuickNode** - High-performance nodes
- **Alchemy** - Reliable infrastructure
- **Helius** - Advanced features

## 📊 Usage

### Wallet Management

1. **Create Wallet Groups**
   - Navigate to Wallet Commander
   - Click "Generate Wallets"
   - Select group type (Volume, Pump.fun, etc.)

2. **Fund Wallets**
   - Select wallets to fund
   - Click "Fund" button
   - Enter funder wallet private key
   - Set amount per wallet

3. **Bulk Operations**
   - Select multiple wallets
   - Choose operation (Tag, Warm, Export, etc.)
   - Configure parameters
   - Execute operation

### Trading Operations

1. **Volume Trading**
   - Select wallet group
   - Enter token address
   - Set buy amount and cycles
   - Start volume generation

2. **Smart Sell**
   - Enter token address
   - Set profit target and stop loss
   - Enable AI monitoring
   - Automatic profit-taking

3. **DEX Trading**
   - Choose Jupiter or Raydium
   - Enter token pair
   - Set amount and slippage
   - Execute swap

### Analytics & Monitoring

1. **P&L Dashboard**
   - View total profit/loss
   - Track win rate and performance
   - Analyze top performers

2. **Live Console**
   - Real-time transaction logs
   - System status updates
   - Error monitoring

## 🔧 API Reference

### Authentication
All API endpoints require proper authentication headers.

### Core Endpoints

#### System Status
```http
GET /api/status
```

#### Wallet Management
```http
GET /api/wallets
POST /api/groups
POST /api/groups/:id/wallets
```

#### Trading Operations
```http
POST /api/volume/start
POST /api/volume/stop
POST /api/smartsell/enable
POST /api/smartsell/disable
POST /api/trade/execute
```

#### Analytics
```http
GET /api/pnl
GET /api/history
GET /api/top-performers
```

## 🚨 Security

### Best Practices
- Use environment variables for sensitive data
- Enable HTTPS in production
- Implement proper rate limiting
- Regular security audits
- Keep dependencies updated

### Private Key Management
- Private keys are processed locally
- Never stored in database
- Encrypted in memory
- Secure key generation

## 📈 Performance

### Optimization Features
- Connection pooling for RPC calls
- Smart caching system
- Rate limiting and throttling
- Parallel processing
- Memory optimization

### Monitoring
- Real-time metrics
- Performance dashboards
- Error tracking
- Resource monitoring

## 🐛 Troubleshooting

### Common Issues

1. **RPC Connection Errors**
   - Check RPC URL validity
   - Verify API key
   - Check rate limits

2. **Transaction Failures**
   - Ensure sufficient SOL balance
   - Check slippage settings
   - Verify token address

3. **Performance Issues**
   - Monitor RPC usage
   - Check connection pool
   - Review rate limits

### Debug Mode
Enable debug logging:
```bash
ENABLE_DEBUG=true LOG_LEVEL=debug npm start
```

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📞 Support

- GitHub Issues: [Report bugs and feature requests](https://github.com/your-username/chaos-bot/issues)
- Documentation: [Full documentation](https://docs.chaos-bot.com)
- Community: [Discord Server](https://discord.gg/chaos-bot)

## ⚠️ Disclaimer

This software is for educational and research purposes only. Trading cryptocurrencies involves substantial risk of loss. Use at your own risk.

---

**Built with ❤️ for the Solana ecosystem**
