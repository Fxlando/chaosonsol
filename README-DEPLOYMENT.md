# 🚀 AUTO-DEPLOYMENT SYSTEM

## ⚡ Quick Start

**After making ANY changes, run:**
```bash
npm run deploy
```

This will:
1. ✅ Validate on-chain operations
2. ✅ Commit all changes
3. ✅ Push to GitHub
4. ✅ Netlify auto-deploys (2-3 minutes)

## 📋 Available Commands

```bash
# Deploy everything (commit + push)
npm run deploy

# Validate on-chain operations (no mocks/fakes)
npm run validate

# Check system health
npm run health

# Full check before commit
npm run precommit
```

## 🤖 For AI Assistants

**CRITICAL RULES:**
1. **ALWAYS** run `npm run deploy` after making changes
2. **NEVER** leave changes uncommitted
3. **ALWAYS** use real on-chain data (no mocks)
4. **ALWAYS** verify deployment

## 🌍 GitHub Pages Backup Deployment

When Netlify is unavailable, the repository can deploy the static `webapp/` directory to GitHub Pages:

1. Enable **Settings → Pages → Source → GitHub Actions** in the repository.
2. Push to `main` to trigger `.github/workflows/deploy-pages.yml`, which uploads `webapp/` to Pages.
3. (Optional) Add a `webapp/CNAME` file before deployment if you plan to point a custom domain at GitHub Pages.
4. Update DNS records to target GitHub Pages when you are ready to cut over from Netlify.

## 📁 Files Created

- `.cursorrules` - AI instructions for deployment
- `AI_INSTRUCTIONS.md` - Detailed AI deployment guide
- `scripts/auto-deploy.js` - Auto-deployment script
- `scripts/on-chain-validator.js` - Validates no mock data
- `scripts/health-check.js` - Checks system health
- `.github/workflows/auto-deploy.yml` - GitHub Actions workflow
- `.git/hooks/pre-commit` - Pre-commit validation hook

## 🔗 Links

- **Live Site**: https://chaosbotonsol.xyz/
- **GitHub**: https://github.com/Fxlando/chaosonsol
- **Netlify**: https://app.netlify.com/

## ✅ Deployment Checklist

- [ ] Run `npm run validate`
- [ ] Run `npm run deploy`
- [ ] Wait 2-3 minutes
- [ ] Run `npm run health`
- [ ] Check https://chaosbotonsol.xyz/

