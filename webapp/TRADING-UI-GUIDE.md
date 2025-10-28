# 🚀 Chaos Bot - Professional Trading Platform

## Welcome to Your Professional-Grade Solana Trading UI

This is a **production-level trading platform** inspired by [FrogWifTools](https://frogwiftools.gitbook.io/frogwiftools) - built specifically for serious Solana traders and market makers.

---

## 🌐 **Quick Start**

### **Start the Web Server:**
```bash
npm run web
```

### **Access the Platform:**
Open your browser to: **http://localhost:3000/trading-ui.html**

---

## 📊 **Core Features**

### **1. Dashboard**
- Real-time portfolio overview
- System status monitoring  
- Live SOL price tracking
- Wallet group statistics
- Active trading engine status

### **2. Wallet Commander** 👛
The most powerful feature - complete wallet management:

#### **Search & Filter**
- Search by wallet name or address
- Filter by Active/Inactive status
- Sort by name, tokens, rent, or balance

#### **Bulk Operations** (Select Multiple Wallets)
- **💰 Fund Wallets**
  - Standard Mode: Direct transfers
  - Mixer Mode: Hopped transfers (bubble map safe)
  - Uniform or Specific amounts per wallet
  
- **💸 Withdraw Funds**
  - Uniform Percentage: Extract % from each wallet
  - Uniform Amount: Fixed SOL amount from each
  - Specific Amounts: Custom per wallet
  
- **🏷️ Tag Wallets**
  - Brand wallets with platform identities
  - Supported: Photon, BullX, Trojan, Axiom, GMGN, PepeBoost
  - Executor options: Jito (recommended) or RPC
  - Random buy amount ranges
  - Verify tags on gmgn.ai
  
- **🔥 Warm Wallets**
  - Generate realistic trading activity
  - Configurable swap counts (min-max)
  - Buy amount randomization
  - Custom delay ranges between swaps
  - Auto or custom token selection
  
- **➕ Generate Wallets**
  - Create 1-100 wallets instantly
  - Assign to existing or new groups
  - Secure storage with export option
  
- **📤 Export Wallets**
  - CSV export of selected or all wallets
  - Includes: name, address, group, balance, tokens, rent, status

#### **Table Features**
- Real-time balance updates
- Token holdings per wallet
- Reclaimable rent display
- Wallet tags visible
- Group assignments
- Quick actions (View on Solscan, Copy Address)
- Footer stats: Total balance, wallet count, total rent

### **3. Live Console** 🖥️
- Real-time transaction logging
- Color-coded messages (INFO, SUCCESS, ERROR, WARNING)
- Auto-scroll toggle
- Clear console button
- Timestamps on all entries

### **4. Token Manager** 🪙 (Coming Soon)
- Launch new tokens
- Copy existing tokens
- Import tokens
- Manage token metadata

### **5. Trading Tasks** ⚡ (Coming Soon)
- Volume generation
- Bulk sell operations
- Bump functionality
- Sell/Buyback automation

### **6. P&L Dashboard** 💰 (Coming Soon)
- Real-time profit/loss tracking
- Performance analytics
- Win rate calculations
- ROI tracking

---

## 🎯 **Professional Features**

### **Security & Privacy**
- **Mixer Mode**: Hopped transfers avoid bubble map detection
- **Private Key Security**: Keys hidden by default, copyable when needed
- **Export Backups**: Regular CSV exports recommended

### **Performance**
- Virtual scrolling for 40+ wallets
- Real-time balance updates every 30 seconds
- Dashboard refresh every 10 seconds
- Optimized for speed with TanStack Virtual principles

### **User Experience**
- Toast notifications for all actions
- Confirmation dialogs for critical operations
- Inline wallet renaming
- Address truncation for readability
- Modal-based operations for focus
- Responsive design for all screens

---

## 🔧 **Configuration**

### **RPC Settings**
- Current: Ankr Premium (1,500 RPS)
- Network: Solana Mainnet-β
- Configured in `webapp/api-server.js`

### **Wallet Groups**
- **Volume Trading**: 20 wallets for coordinated volume
- **Pump.fun Launch**: 20 wallets for post-sniper coordination
- Create custom groups as needed

---

## 📖 **How to Use**

### **Basic Workflow**

1. **View Wallets**
   - Click "Wallet Commander" in sidebar
   - See all 40 wallets with real-time balances

2. **Fund Wallets**
   - Select wallets using checkboxes
   - Click "💰 Fund" in bulk actions bar
   - Choose Standard or Mixer mode
   - Enter amount and funder private key
   - Execute

3. **Tag Wallets**
   - Select wallets to tag
   - Click "🏷️ Tag"
   - Choose platforms (Photon, BullX, etc.)
   - Set buy amount range
   - Execute and verify on gmgn.ai

4. **Warm Wallets**
   - Select wallets
   - Click "🔥 Warm"
   - Configure swap counts and amounts
   - Set delay ranges
   - Execute

5. **Withdraw Profits**
   - Select wallets with profits
   - Click "💸 Withdraw"
   - Enter destination address
   - Choose percentage or fixed amount
   - Execute

6. **Export for Backup**
   - Select wallets (or leave unselected for all)
   - Click "📤 Export"
   - Save CSV file securely

---

## 🚨 **Important Notes**

### **Security Warnings**
⚠️ **This platform executes REAL transactions on Solana Mainnet**
- All operations are final and irreversible
- Double-check addresses before withdrawing
- Keep CSV exports in secure locations
- Never share private keys
- Use Mixer mode for sensitive operations

### **Network Fees**
- All Solana transactions require network fees
- Ensure wallets have sufficient balance
- Rent: 0.002 SOL per token account (reclaimable)

### **Platform Tags**
- Tags require small buy/sell transactions
- Fees apply per tag per wallet
- Verify tags on gmgn.ai (may take a few minutes)

### **Warming**
- Simulates natural trading activity
- Uses random amounts and delays
- Check results on gmgn.ai
- Requires SOL balance in each wallet

---

## 🔗 **API Endpoints**

The platform connects to your backend at `http://localhost:3000/api`:

- `GET /stats` - Dashboard statistics
- `GET /wallets` - All wallets with balances
- `GET /groups` - Wallet groups
- `GET /volume/status` - Volume engine status
- `GET /smartsell/status` - Smart sell status

---

## 🎨 **UI Customization**

### **Color Scheme**
- Primary: Purple (#8b5cf6)
- Success: Green (#10b981)
- Danger: Red (#ef4444)
- Warning: Orange (#f59e0b)
- Info: Cyan (#06b6d4)

### **Files**
- HTML: `webapp/trading-ui.html`
- CSS: `webapp/trading-ui.css`
- JavaScript: `webapp/trading-ui.js`

---

## 📱 **Responsive Design**

The platform is fully responsive:
- Desktop: Full sidebar + multi-column layout
- Tablet: Compact sidebar + adjusted columns
- Mobile: Hidden sidebar (hamburger menu coming soon)

---

## 🐛 **Troubleshooting**

### **"No wallets found"**
- Ensure backend is running (`npm run web`)
- Check wallet-keys.json files exist
- Verify RPC connection

### **"Backend API not connected"**
- Restart the web server
- Check port 3000 is not in use
- Verify `.env` configuration

### **Balances showing 0.00**
- Click "🔄 Re-sync" button
- Wait 30 seconds for auto-refresh
- Check RPC rate limits

### **Tags not appearing**
- Wait 2-3 minutes after tagging
- Check wallet on gmgn.ai directly
- Verify transaction on Solscan

---

## 🚀 **Next Steps**

Explore the remaining features as they're completed:
- [ ] Redistribute with Mixer Mode
- [ ] Reclaim Rent Automation
- [ ] Trading Task Center (Volume, Bulk Sell, Bump)
- [ ] P&L Dashboard
- [ ] Token Manager

---

## 💡 **Pro Tips**

1. **Regular Exports**: Export wallets daily for backup
2. **Use Mixer Mode**: Always use mixer for large operations
3. **Test First**: Test with small amounts on new features
4. **Monitor Console**: Keep console view open during operations
5. **Tag Strategically**: Tag wallets before major operations
6. **Warm Regularly**: Keep wallets "warm" with periodic activity
7. **Group Organization**: Use groups to organize different strategies

---

## 📞 **Support**

- Check `webapp/README.md` for API documentation
- Review `simple-bot.js` for backend logic
- Telegram bot available for quick commands

---

**Built with 💜 for professional Solana traders**

*This is a production-grade trading platform. Use responsibly.*

