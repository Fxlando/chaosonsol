# Chaos Bot - Web Control Panel

A **fully functional** web control panel to operate your Solana trading bot through a browser interface.

## 🚀 Quick Start

```bash
npm run web
```

Then open: `http://localhost:3000`

## ⚡ Features

### Dashboard
- Real-time statistics (wallets, balances, groups)
- Live SOL price updates
- System status monitoring
- Quick action buttons

### Wallet Management
- View all wallets across all groups
- Real-time balance updates
- Group assignments
- Wallet health status

### Volume Trading Control
- Select wallet groups
- Configure token and cycles
- Start/stop volume sessions
- Real-time session monitoring

### Smart Sell Engine
- Configure profit targets and stop losses
- Enable/disable monitoring
- Set trailing stops
- Emergency stop configuration

### Manual Trading
- Execute immediate buy/sell trades
- Select specific wallets
- Custom trade amounts
- Direct Jupiter integration

### Trade History
- View all past trades
- Transaction signatures
- Success/failure status
- Timestamp tracking

## 🔧 How It Works

### Backend API Server (`api-server.js`)
- Connects to your existing bot modules
- Exposes REST API endpoints
- Handles all trading logic
- Real-time data fetching

### Frontend App (`index.html`, `app.js`, `app.css`)
- Single-page application
- Real-time updates every 5-10 seconds
- Toast notifications
- Responsive design

## 📡 API Endpoints

### GET Endpoints
- `/api/stats` - Dashboard statistics
- `/api/wallets` - All wallets with balances
- `/api/groups` - Wallet groups
- `/api/volume/status` - Volume trading status
- `/api/smartsell/status` - Smart sell status
- `/api/history` - Trade history

### POST Endpoints
- `/api/volume/start` - Start volume trading
- `/api/volume/stop` - Stop volume trading
- `/api/smartsell/enable` - Enable smart sell
- `/api/smartsell/disable` - Disable smart sell
- `/api/trade/execute` - Execute manual trade

## 🛠️ Architecture

```
webapp/
├── api-server.js       # Backend API + static file server
├── index.html          # Main control panel UI
├── app.css             # Styling
├── app.js              # Frontend logic
└── server.js           # Old simple server (not used)
```

The control panel connects directly to your bot's trading engines:
- JupiterV6Integration
- SmartSellEngine
- WalletGroupManager
- GroupTradingEngine
- WalletAnalytics

## ⚙️ Configuration

Edit `webapp/api-server.js` to change:
- Port (default: 3000)
- RPC URL
- Trading settings

Or use environment variables:
```bash
WEB_PORT=3000 npm run web
```

## 🔒 Security Notes

**IMPORTANT:** This control panel has full access to your wallets and trading functions.

- **Never expose this to the public internet**
- Only run on localhost or secure private networks
- Add authentication if deploying remotely
- All trades execute on mainnet immediately
- Double-check all parameters before executing

## 🚦 Usage Tips

1. **Dashboard** - Start here to check system status
2. **Wallets** - Verify balances before trading
3. **Volume** - Configure and start coordinated trading
4. **Smart Sell** - Set up automated profit-taking
5. **Manual Trade** - Execute quick trades manually
6. **History** - Review past transactions

## 🔄 Real-Time Updates

- SOL price: Updates every 5 seconds
- Dashboard stats: Updates every 10 seconds
- Volume status: Real-time
- Smart sell status: Real-time

## 💡 Pro Tips

- Keep the dashboard open to monitor bot activity
- Use multiple browser tabs for different views
- Refresh wallet balances before large operations
- Check history after trades to verify execution
- Monitor smart sell status during active trading

## 🐛 Troubleshooting

**Can't connect to server:**
- Ensure `npm run web` is running
- Check port 3000 is not in use
- Verify .env file is configured

**Wallets not loading:**
- Check wallet group files exist
- Verify RPC connection
- Check console for errors

**Trades failing:**
- Verify wallet has sufficient balance
- Check token address is correct
- Ensure RPC is responsive

## 📝 Development

To modify the UI:
1. Edit `index.html` for structure
2. Edit `app.css` for styling
3. Edit `app.js` for functionality
4. Refresh browser (no rebuild needed)

To add API endpoints:
1. Add route to `apiRoutes` or `apiPostRoutes` in `api-server.js`
2. Implement handler function
3. Call from frontend in `app.js`

---

**This is a working control panel, not a demo. All actions execute real trades on Solana mainnet.**
