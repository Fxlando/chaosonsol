# Chaos Bot - Web Interface

A sleek, professional web interface for the Chaos Bot Solana trading system.

## 🚀 Quick Start

Start the web server:
```bash
npm run web
```

Then open your browser to: `http://localhost:3000`

## 📁 Structure

```
webapp/
├── index.html          # Landing page
├── dashboard.html      # Command center dashboard
├── styles.css          # Main stylesheet
├── dashboard.css       # Dashboard-specific styles
├── script.js           # Landing page interactivity
├── dashboard.js        # Dashboard functionality
├── server.js           # Simple Node.js web server
└── README.md          # This file
```

## ✨ Features

### Landing Page (`index.html`)
- Modern hero section with animated floating cards
- Feature showcase grid
- Real-time statistics display
- Smooth scrolling navigation
- Responsive design

### Dashboard (`dashboard.html`)
- Command Center controls
- Volume Trading interface
- Smart Sell Engine monitoring
- Wallet Manager
- Real-time activity log
- Live SOL price updates
- System status indicators

## 🎨 Design Features

- **Dark Theme**: Sleek dark background with purple/blue Solana-inspired colors
- **Animations**: Smooth hover effects, floating elements, and fade-in transitions
- **Responsive**: Mobile-friendly design that adapts to all screen sizes
- **Modern UI**: Clean cards, gradients, and professional typography
- **Interactive**: Real-time updates and dynamic content

## 🛠️ Customization

### Colors
Edit the CSS variables in `styles.css`:
```css
:root {
    --primary: #8b5cf6;
    --secondary: #06b6d4;
    --background: #0f0f1e;
    /* ... more colors */
}
```

### Content
- Modify `index.html` for landing page content
- Edit `dashboard.html` for dashboard layout
- Update `dashboard.js` for functionality

## 🔗 Integration

To connect the web interface to your actual bot:

1. Create API endpoints in your bot for:
   - Wallet data
   - Trading statistics
   - System status
   - Control actions

2. Update `dashboard.js` to fetch real data:
   ```javascript
   async function fetchWalletData() {
       const response = await fetch('/api/wallets');
       const data = await response.json();
       // Update UI with real data
   }
   ```

3. Add authentication if needed for security

## 📝 Notes

- Current version shows simulated data for demonstration
- Real integration requires bot API endpoints
- Server runs on port 3000 by default
- All files use vanilla JavaScript (no frameworks required)

## 🎯 Next Steps

1. Add authentication system
2. Connect to real bot API
3. Add real-time WebSocket updates
4. Implement transaction history
5. Add wallet connection (Phantom, Solflare)

---

Built with ❤️ for Chaos Bot

