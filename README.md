# Solana Command Center & Wallet Manager

🚀 **FULLY FUNCTIONAL ON-CHAIN TRADING BOT** - A comprehensive Telegram bot with real Jupiter v6 integration, automated smart selling, and coordinated volume trading on Solana mainnet.

## Features

### 🎛️ Command Center
- System status and overview
- Master control panel
- Real-time SOL price monitoring
- Advanced wallet operations

### 👑 Wallet Commander
- Advanced wallet operations center
- Multi-wallet management
- Detailed wallet analytics
- Bulk operations and monitoring
- Performance statistics

### 📊 Volume Trading (LIVE ON MAINNET)
- **Real Jupiter v6 swaps** across multiple wallets
- Coordinated buy/sell cycles with randomization
- Configurable volume patterns and timing
- Built-in slippage protection (5% for volume trading)
- Real transaction execution on mainnet/devnet
- Performance tracking and success rates

### 🧠 Smart Sell (LIVE ON MAINNET) 
- **Real-time price monitoring** with automated execution
- **Bubble detection algorithm** analyzing growth patterns
- Profit targets (30%), stop losses (-15%), trailing stops (10%)
- Multi-wallet coordination with cooldown protection
- **Emergency sell** triggers at -25% loss
- Risk management with volatility analysis

### 💰 Wallet Manager
- View all wallets and balances
- Generate new Solana wallets
- Fund wallets with SOL
- Check wallet health and connectivity
- Support for both devnet and mainnet

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy `env.example` to `.env` (already configured for mainnet)
   - Add your Telegram bot token
   - **MAINNET READY**: RPC URL defaults to `https://api.mainnet-beta.solana.com`
   - **REAL TRADING**: All features work with actual on-chain transactions

3. **Fund Your Wallets**
   - Generate wallets using the bot
   - Fund them with SOL for real trading
   - Minimum 0.05 SOL per wallet for volume trading

4. **Start the Bot**
   ```bash
   npm start
   ```

⚠️ **IMPORTANT**: This bot executes REAL transactions on Solana. Always test with small amounts first.

## Environment Variables

```env
# Telegram Bot Token (required)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Solana RPC URL (optional - defaults to devnet)
RPC_URL=https://api.devnet.solana.com

# Network (devnet or mainnet-beta)
NETWORK=devnet
```

## Usage

1. Start a chat with your bot
2. Send `/start` to begin
3. Choose between:
   - **Command Center** - Advanced operations and control
   - **Wallet Manager** - Basic wallet management

### Command Center Operations

**👑 Wallet Commander**
- **View All Wallets** - Comprehensive wallet analysis
- **Multi-Wallet Fund** - Bulk funding operations
- **Performance Stats** - Advanced analytics

**📊 Volume Trading**
- **Volume Settings** - Configure coordination patterns
- **Start Volume Session** - Initiate multi-wallet operations
- **Volume Stats** - Monitor performance

**🧠 Smart Sell**
- **Smart Sell Settings** - Configure AI parameters
- **Enable/Disable** - Control automated features
- **Anti-Bubble Detection** - AI-powered protection

### Basic Wallet Management
- **View Wallets** - See all your wallets and current SOL balances
- **Generate Wallet** - Create new Solana wallets
- **Fund Wallets** - Get wallet addresses for funding
- **Check Health** - Test wallet connectivity

## Security

- All wallets are generated locally
- Private keys are stored securely in `wallets.json`
- No private keys are transmitted or logged
- Always backup your `wallets.json` file

## Files

- `simple-bot.js` - Main bot application
- `wallets.json` - Your wallet storage (keep this safe!)
- `.env` - Environment configuration
- `package.json` - Project dependencies

## Support

This is a simple, lightweight wallet manager focused on:
- ✅ Command Center functionality
- ✅ Basic wallet management
- ✅ Balance checking
- ✅ Wallet generation
- ✅ Health monitoring

## License

MIT