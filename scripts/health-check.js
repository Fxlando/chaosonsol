#!/usr/bin/env node
/**
 * Health Check Script
 * Verifies that the website and on-chain operations are working correctly
 * 
 * Note: This file uses CommonJS (require) for compatibility
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const https = require('https');
const http = require('http');

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

async function checkLocalAPI() {
  return new Promise((resolve) => {
    log('🔌 Checking local API server...', 'blue');
    http.get('http://localhost:3000/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            log(`   ✅ Local API server is working`, 'green');
            resolve(true);
          } catch (e) {
            log(`   ⚠️  API returned non-JSON`, 'yellow');
            resolve(false);
          }
        } else {
          log(`   ⚠️  API returned status ${res.statusCode}`, 'yellow');
          resolve(false);
        }
      });
    }).on('error', (error) => {
      log(`   ❌ API check failed: ${error.message}`, 'red');
      log(`   💡 Make sure API server is running: npm run web`, 'yellow');
      resolve(false);
    });
  });
}

async function checkRPC() {
  log('🔗 Checking Solana RPC...', 'blue');
  try {
    const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    const slot = await connection.getSlot();
    const blockHeight = await connection.getBlockHeight();
    
    log(`   ✅ RPC Connected (Slot: ${slot}, Height: ${blockHeight})`, 'green');
    return true;
  } catch (error) {
    log(`   ❌ RPC Check Failed: ${error.message}`, 'red');
    return false;
  }
}

async function runHealthCheck() {
  log('\n🏥 Running Health Check...\n', 'blue');

  const results = {
    localAPI: await checkLocalAPI(),
    rpc: await checkRPC()
  };

  log('\n📊 Health Check Summary:', 'blue');
  log(`   Local API: ${results.localAPI ? '✅' : '❌'}`, results.localAPI ? 'green' : 'red');
  log(`   RPC: ${results.rpc ? '✅' : '❌'}`, results.rpc ? 'green' : 'red');

  const allHealthy = Object.values(results).every(r => r === true);
  
  if (allHealthy) {
    log('\n✅ All systems operational!', 'green');
  } else {
    log('\n⚠️  Some systems need attention', 'yellow');
  }

  return allHealthy;
}

runHealthCheck()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    log(`❌ Health check error: ${error.message}`, 'red');
    process.exit(1);
  });

