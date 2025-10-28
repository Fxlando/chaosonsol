require('dotenv').config();
const { Connection, PublicKey } = require('@solana/web3.js');
const { SmartSellEngine } = require('./smart-sell-engine');

// Initialize connection (using environment variable)
const connection = new Connection(process.env.RPC_URL || 'https://rpc.ankr.com/solana/0420a9599f84c238839150272c7dc114e8d6fa8722dfd48b5c92e0a81be23d27');

// Test Smart Sell functionality
async function testSmartSell() {
  console.log('🧪 Testing Smart Sell Engine...');
  
  // Use minimal config for testing
  const smartSell = new SmartSellEngine(connection, { 
    slippage: 0.5, 
    priorityFee: 10000 
  });
  
  // Check active monitors
  const activeMonitors = smartSell.getAllActiveMonitors();
  console.log('📊 Active monitors:', activeMonitors.length);
  
  if (activeMonitors.length > 0) {
    console.log('🔍 Active monitors details:');
    activeMonitors.forEach((monitor, index) => {
      console.log(`  ${index + 1}. Token: ${monitor.tokenMint}`);
      console.log(`     Wallets monitored: ${monitor.walletsMonitored}`);
      console.log(`     Runtime: ${Math.floor(monitor.runtime / 1000 / 60)} minutes`);
    });
  } else {
    console.log('❌ No active Smart Sell monitors found');
  }
  
  // Check if we can find a target token to test with
  console.log('\n🎯 Checking for target token...');
  
  // Common test tokens (adjust as needed)
  const testTokens = [
    'So11111111111111111111111111111111111111112', // Wrapped SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  ];
  
  for (const tokenMint of testTokens) {
    try {
      console.log(`\n🧪 Testing token: ${tokenMint}`);
      
      // Test whitelist functionality
      const testAddresses = [
        '8RanPrdniTNCDN6nbgHBqC7zeT48AcVQwVzzfPGxu8ho', // First wallet from wallets.json
      ];
      
      // Test if the engine can validate addresses
      console.log('📋 Testing whitelist validation...');
      testAddresses.forEach(addr => {
        try {
          new PublicKey(addr);
          console.log(`  ✅ Valid address: ${addr.substring(0, 8)}...`);
        } catch (error) {
          console.log(`  ❌ Invalid address: ${addr}`);
        }
      });
      
      break; // Just test the first one
    } catch (error) {
      console.error(`❌ Error testing token ${tokenMint}:`, error.message);
    }
  }
}

testSmartSell().catch(console.error);