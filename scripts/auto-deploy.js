#!/usr/bin/env node
/**
 * Auto-Deploy Script
 * Automatically commits and pushes changes to GitHub
 * This ensures Netlify auto-deploys the latest changes
 * 
 * Note: This file uses CommonJS (require) even though package.json is ES module
 * This is because child_process.execSync works better with CommonJS
 */

// Use CommonJS for this script
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Auto-Deploy Script Starting...\n');

// Check if we're in a git repository
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ Not a git repository. Please initialize git first.');
  process.exit(1);
}

// Check for changes
try {
  const status = execSync('git status --porcelain', { encoding: 'utf-8' });
  
  if (!status.trim()) {
    console.log('✅ No changes to commit. Everything is up to date!');
    process.exit(0);
  }

  console.log('📝 Changes detected:');
  console.log(status);
  console.log('');

  // Stage all changes
  console.log('📦 Staging changes...');
  execSync('git add .', { stdio: 'inherit' });

  // Create commit message
  const timestamp = new Date().toISOString();
  const commitMessage = process.argv[2] || `Auto-deploy: ${timestamp}`;

  // Commit changes
  console.log(`💾 Committing changes: "${commitMessage}"`);
  execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });

  // Push to GitHub
  console.log('🚀 Pushing to GitHub...');
  execSync('git push origin main', { stdio: 'inherit' });

  console.log('\n✅ Successfully deployed!');
  console.log('⏳ Netlify will auto-deploy in 2-3 minutes...');
  console.log('🌐 Check: https://chaosbotonsol.xyz/');
  console.log('📊 Netlify Dashboard: https://app.netlify.com/');

} catch (error) {
  console.error('❌ Deployment failed:', error.message);
  process.exit(1);
}

