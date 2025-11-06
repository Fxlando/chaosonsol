/**
 * Basic Usage Example
 * Demonstrates how to use the Chaos Bot application
 */

import { App } from '../src/App.js';

async function main() {
  try {
    console.log('🚀 Starting Chaos Bot Example...\n');

    // Initialize application
    const app = new App({
      network: 'mainnet-beta', // or 'devnet' for testing
      trading: {
        defaultSlippage: 1.0 // 1% slippage
      },
      smartSell: {
        enabled: true,
        profitTarget: 30, // 30% profit target
        stopLoss: -15,    // -15% stop loss
        trailingStop: 10  // 10% trailing stop
      }
    });

    await app.initialize();
    console.log('✅ Application initialized\n');

    // Get status
    const status = app.getStatus();
    console.log('📊 Application Status:', JSON.stringify(status, null, 2), '\n');

    // Create a wallet
    console.log('💰 Creating wallet...');
    const wallet = app.createWallet('My Trading Wallet', ['trading']);
    console.log('✅ Wallet created:', wallet.wallet.publicKey, '\n');

    // Get wallet balance
    const wallets = await app.getAllWalletsWithBalances();
    console.log('💼 Wallets:', wallets.map(w => ({
      name: w.name,
      publicKey: w.publicKey,
      balance: w.balance.toFixed(4) + ' SOL'
    })), '\n');

    // Example: Buy token (replace with actual token mint)
    const tokenMint = 'YOUR_TOKEN_MINT_HERE';
    const solAmount = 0.1; // 0.1 SOL

    console.log(`📈 Buying ${solAmount} SOL worth of token: ${tokenMint}`);
    // const buyResult = await app.buyToken(
    //   wallet.wallet.id,
    //   tokenMint,
    //   solAmount
    // );
    // console.log('Buy result:', buyResult);

    // Example: Add position to Smart Sell monitoring
    // const entryPrice = 0.001; // Entry price in SOL
    // const amount = 1000000; // Token amount
    // 
    // console.log('🤖 Adding position to Smart Sell monitoring...');
    // await app.addSmartSellPosition(
    //   wallet.wallet.id,
    //   tokenMint,
    //   entryPrice,
    //   amount,
    //   {
    //     profitTarget: 30,
    //     stopLoss: -15,
    //     trailingStop: 10
    //   }
    // );

    // Example: Start volume trading
    // const walletIds = [wallet.wallet.id];
    // console.log('📊 Starting volume trading session...');
    // const volumeSession = await app.startVolumeSession(
    //   walletIds,
    //   tokenMint,
    //   {
    //     totalVolume: 0.5, // 0.5 SOL total
    //     cycles: 5,
    //     continuous: false
    //   }
    // );
    // console.log('Volume session:', volumeSession);

    // Get RPC stats
    const rpcStats = app.getRPCStats();
    console.log('🔌 RPC Stats:', rpcStats, '\n');

    console.log('✅ Example completed successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;

