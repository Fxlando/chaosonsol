# 🚀 Production Deployment Guide

## Current Issue

Your website (chaosbotonsol.xyz) is deployed on Netlify but:
- ❌ Using old static files
- ❌ Not connected to new production backend
- ❌ API endpoints not working

## Solution

I've created a Netlify serverless function that wraps your new production backend.

## What I Fixed

### 1. Created Netlify Function
- ✅ `netlify/functions/api.js` - Wraps your production backend
- ✅ Handles all API routes
- ✅ Connects to your new backend modules

### 2. Updated API Client
- ✅ Updated `webapp/services/api-client.js` to use Netlify functions
- ✅ Routes to `/.netlify/functions/api` in production

### 3. Updated Netlify Config
- ✅ Updated `netlify.toml` to route `/api/*` to Netlify functions

## Next Steps

### Option 1: Deploy to Netlify (Recommended)

1. **Push changes to GitHub** (already done ✅)
2. **Netlify will auto-deploy** from GitHub
3. **Wait for build** (usually 2-3 minutes)
4. **Check deployment** - Your site should now use production backend

### Option 2: Manual Netlify Deploy

If auto-deploy doesn't work:

1. Go to Netlify dashboard
2. Click "Trigger deploy" → "Deploy site"
3. Wait for build to complete

### Option 3: Separate API Server (Alternative)

If Netlify functions don't work well, you can:

1. Deploy API server separately (Railway, Render, Fly.io)
2. Update `webapp/services/api-client.js` to point to your API server URL
3. Update CORS settings

## Verification

After deployment, check:

1. Open browser console on your website
2. Look for: `✅ Connected to API server`
3. Test API: `https://chaosbotonsol.xyz/api/health`
4. Should return: `{"status":"ok","timestamp":"...","network":"mainnet-beta"}`

## Troubleshooting

### If API still doesn't work:

1. **Check Netlify Functions Logs**
   - Go to Netlify dashboard → Functions → api
   - Check for errors

2. **Check Build Logs**
   - Netlify dashboard → Deploys → Latest deploy
   - Look for build errors

3. **Test Function Locally**
   ```bash
   netlify dev
   ```

4. **Check Environment Variables**
   - Netlify dashboard → Site settings → Environment variables
   - Add: `NETWORK=mainnet-beta`

## Files Changed

- ✅ `netlify/functions/api.js` - New Netlify function
- ✅ `netlify.toml` - Updated redirects
- ✅ `webapp/services/api-client.js` - Updated API base URL

## Status

✅ **Ready to deploy!** Push to GitHub and Netlify will auto-deploy.

