# 🤖 AI Assistant Instructions - CRITICAL

## ⚠️ MANDATORY DEPLOYMENT RULES

**YOU MUST ALWAYS DO THIS AFTER MAKING ANY CHANGES:**

### 1. Commit and Push to GitHub
```bash
git add .
git commit -m "Your change description"
git push origin main
```

**NEVER** leave changes uncommitted. **ALWAYS** push immediately.

### 2. Verify Netlify Deployment
- Netlify auto-deploys from GitHub
- Site: https://chaosbotonsol.xyz/
- Wait 2-3 minutes after push
- Check deployment status

### 3. On-Chain Verification
- **NO MOCK DATA** - Everything must be real blockchain data
- **NO FAKE DATA** - All balances, prices, transactions must be on-chain
- Test with real Solana RPC calls
- Verify with `connection.getBalance()`, `getParsedTokenAccountsByOwner()`, etc.

## 📁 Project Structure

```
webapp/              → Frontend (deployed to Netlify)
netlify/functions/   → Serverless functions (deployed to Netlify)
src/                 → Core application code
simple-bot.js        → Main bot entry point
```

## ✅ Deployment Checklist

Before marking any task as complete:
- [ ] All code changes committed
- [ ] Changes pushed to GitHub (`git push origin main`)
- [ ] Netlify deployment verified
- [ ] On-chain functionality tested (no mocks)
- [ ] Website tested at https://chaosbotonsol.xyz/

## 🚨 Critical Rules

1. **ALWAYS commit and push** - Never leave changes uncommitted
2. **ALWAYS use real on-chain data** - No mocks, no fakes, no placeholders
3. **ALWAYS verify deployment** - Check Netlify after pushing
4. **ALWAYS test on-chain** - Use real Solana RPC endpoints

## 🔗 Important Links

- **Live Site**: https://chaosbotonsol.xyz/
- **GitHub**: Check repository for latest commits
- **Netlify**: Check dashboard for deployment status

