# 🚀 Local Development Guide

## Local Development System

This project runs **locally only**. All changes should be committed to GitHub for version control.

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
- Local API server is running
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

## ✅ Development Checklist

Before considering any task complete:
- [ ] Run `npm run validate` - No mock/fake data
- [ ] Run `npm run deploy` - Push to GitHub (optional, for version control)
- [ ] Run `npm run health` - Verify local API server works
- [ ] Test locally on `http://localhost:3000`

## 🔗 Important Links

- **GitHub**: https://github.com/Fxlando/chaosonsol
- **Local API**: http://localhost:3000

## 🚨 Critical Rules

1. **ALWAYS** use real on-chain data (no mocks)
2. **ALWAYS** test locally before committing
3. **ALWAYS** commit changes to version control
4. **ALWAYS** verify API server runs on localhost:3000

## 📝 For AI Assistants

**MANDATORY**: After making ANY changes:
1. Run `npm run validate` to check for mock data
2. Test locally - Start API server with `npm run web`
3. Run `npm run health` to verify everything works
4. Commit changes to version control

**NEVER** leave changes uncommitted. **ALWAYS** test locally first.

