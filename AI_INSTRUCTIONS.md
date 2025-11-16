# 🤖 AI Assistant Instructions - CRITICAL

## ⚠️ LOCAL DEVELOPMENT ONLY

**THIS PROJECT RUNS LOCALLY ONLY:**

### 1. Local Development Setup
- API server runs on `http://localhost:3000`
- Frontend served from `webapp/` directory
- Start API server: `npm run web`
- Open frontend in browser: `http://localhost:3000`

### 2. On-Chain Verification
- **NO MOCK DATA** - Everything must be real blockchain data
- **NO FAKE DATA** - All balances, prices, transactions must be on-chain
- Test with real Solana RPC calls
- Verify with `connection.getBalance()`, `getParsedTokenAccountsByOwner()`, etc.

## 📁 Project Structure

```
webapp/              → Frontend (served locally)
src/                 → Core application code
simple-bot.js        → Main bot entry point
webapp/api-server.js → Local API server
```

## ✅ Development Checklist

Before marking any task as complete:
- [ ] All code changes committed
- [ ] On-chain functionality tested (no mocks)
- [ ] API server runs on localhost:3000
- [ ] Frontend connects to local API

## 🚨 Critical Rules

1. **ALWAYS use real on-chain data** - No mocks, no fakes, no placeholders
2. **ALWAYS test locally** - Use localhost:3000 for API
3. **ALWAYS verify on-chain** - Use real Solana RPC endpoints
4. **ALWAYS commit changes** - Keep code in version control

