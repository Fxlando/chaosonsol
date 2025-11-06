# 🚀 Deployment Automation Guide

## Automatic Deployment System

This project now has **automatic deployment** to ensure all changes are always pushed to GitHub and deployed to Netlify.

## 📋 How It Works

### 1. **AI Instructions** (`.cursorrules` & `AI_INSTRUCTIONS.md`)
- Tells AI to **ALWAYS** commit and push after making changes
- Ensures no changes are left uncommitted
- Verifies on-chain operations

### 2. **Auto-Deploy Script** (`scripts/auto-deploy.js`)
Run this script to automatically:
- Stage all changes
- Commit with message
- Push to GitHub
- Netlify auto-deploys

**Usage:**
```bash
npm run deploy
# or
npm run deploy "Your commit message"
```

### 3. **On-Chain Validator** (`scripts/on-chain-validator.js`)
Validates that all operations use real on-chain data:
- Checks for mock/fake data patterns
- Verifies RPC connections
- Ensures wallet operations use real blockchain queries

**Usage:**
```bash
npm run validate
```

### 4. **Health Check** (`scripts/health-check.js`)
Checks that everything is working:
- Website is online
- Netlify functions are working
- RPC connection is active
- API endpoints respond

**Usage:**
```bash
npm run health
```

### 5. **GitHub Actions** (`.github/workflows/auto-deploy.yml`)
- Automatically runs validation on push
- Checks health status
- Verifies deployment

### 6. **Pre-Commit Hook** (`.git/hooks/pre-commit`)
- Runs validation before every commit
- Prevents commits with mock/fake data
- Ensures on-chain compliance

## 🎯 Quick Commands

```bash
# Deploy everything (commit + push)
npm run deploy

# Validate on-chain operations
npm run validate

# Check system health
npm run health

# Full check before commit
npm run precommit
```

## ✅ Deployment Checklist

Before considering any task complete:
- [ ] Run `npm run validate` - No mock/fake data
- [ ] Run `npm run deploy` - Push to GitHub
- [ ] Wait 2-3 minutes - Netlify auto-deploys
- [ ] Run `npm run health` - Verify everything works
- [ ] Check https://chaosbotonsol.xyz/ - Verify live site

## 🔗 Important Links

- **Live Site**: https://chaosbotonsol.xyz/
- **GitHub**: https://github.com/Fxlando/chaosonsol
- **Netlify Dashboard**: https://app.netlify.com/

## 🚨 Critical Rules

1. **ALWAYS** run `npm run deploy` after making changes
2. **NEVER** leave changes uncommitted
3. **ALWAYS** use real on-chain data (no mocks)
4. **ALWAYS** verify deployment after pushing

## 📝 For AI Assistants

**MANDATORY**: After making ANY changes:
1. Run `npm run validate` to check for mock data
2. Run `npm run deploy` to commit and push
3. Wait 2-3 minutes for Netlify deployment
4. Run `npm run health` to verify everything works

**NEVER** leave changes uncommitted. **ALWAYS** push immediately.

