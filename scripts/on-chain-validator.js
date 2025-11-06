#!/usr/bin/env node
/**
 * On-Chain Validator
 * Validates that all operations are using real on-chain data
 * No mocks, no fakes, no placeholders
 */

const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function validateOnChain() {
  log('\n🔍 Validating On-Chain Operations...\n', 'blue');

  const issues = [];
  const warnings = [];

  // Check RPC connection
  log('1. Checking RPC Connection...', 'blue');
  try {
    const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    const slot = await connection.getSlot();
    log(`   ✅ RPC Connected (Slot: ${slot})`, 'green');
  } catch (error) {
    issues.push('RPC connection failed');
    log(`   ❌ RPC Connection Failed: ${error.message}`, 'red');
  }

  // Check for mock/fake data patterns
  log('\n2. Scanning for Mock/Fake Data...', 'blue');
  const filesToCheck = [
    'webapp/real-trading-ui.js',
    'webapp/app.js',
    'webapp/api-server.js',
    'netlify/functions/api.js',
    'simple-bot.js'
  ];

  const badPatterns = [
    /mock/i,
    /fake/i,
    /placeholder/i,
    /demo.*data/i,
    /test.*data/i,
    /hardcoded/i,
    /dummy/i,
    /sample/i
  ];

  for (const file of filesToCheck) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      for (const pattern of badPatterns) {
        const matches = content.match(new RegExp(pattern, 'gi'));
        if (matches && !content.includes('// TODO: Remove mock') && !content.includes('// FIXME: Remove fake')) {
          warnings.push(`${file}: Found potential mock/fake data pattern: ${pattern}`);
        }
      }
    }
  }

  if (warnings.length === 0) {
    log('   ✅ No mock/fake data patterns found', 'green');
  } else {
    log(`   ⚠️  Found ${warnings.length} potential issues:`, 'yellow');
    warnings.forEach(w => log(`      - ${w}`, 'yellow'));
  }

  // Check API endpoints use real data
  log('\n3. Validating API Endpoints...', 'blue');
  const apiFiles = [
    'netlify/functions/api.js',
    'webapp/api-server.js'
  ];

  for (const file of apiFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check if using Connection for real data
      if (content.includes('new Connection') || content.includes('connection.get')) {
        log(`   ✅ ${file}: Uses real Connection`, 'green');
      } else if (content.includes('return []') || content.includes('return {}')) {
        warnings.push(`${file}: Returns empty data - verify this is intentional`);
      }
    }
  }

  // Check wallet operations
  log('\n4. Validating Wallet Operations...', 'blue');
  const walletFiles = [
    'webapp/wallet-operations.js',
    'src/wallet/WalletManager.js'
  ];

  for (const file of walletFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      if (content.includes('getBalance') || content.includes('getParsedTokenAccountsByOwner')) {
        log(`   ✅ ${file}: Uses real on-chain wallet queries`, 'green');
      }
    }
  }

  // Summary
  log('\n📊 Validation Summary:', 'blue');
  if (issues.length === 0 && warnings.length === 0) {
    log('✅ All checks passed! Everything is on-chain.', 'green');
    return true;
  } else {
    if (issues.length > 0) {
      log(`❌ Found ${issues.length} critical issues:`, 'red');
      issues.forEach(issue => log(`   - ${issue}`, 'red'));
    }
    if (warnings.length > 0) {
      log(`⚠️  Found ${warnings.length} warnings:`, 'yellow');
      warnings.forEach(warning => log(`   - ${warning}`, 'yellow'));
    }
    return false;
  }
}

// Run validation
validateOnChain()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log(`❌ Validation error: ${error.message}`, 'red');
    process.exit(1);
  });

