/**
 * Volume Bot Example
 * Demonstrates volume trading across multiple wallets
 */

import { App } from '../src/App.js';

async function volumeBotExample() {
  try {
    console.log('📊 Volume Bot Example\n');

    // Initialize app
    const app = new App({
      network: 'mainnet-beta',
      volumeBot: {
        minAmount: 0.001, // 0.001 SOL
        maxAmount: 0.05,  // 0.05 SOL
        minDelay: 2000,  // 2 seconds
        maxDelay: 10000, // 10 seconds
        randomizeAmounts: true,
        randomizeDelay: true
      }
    });

    await app.initialize();

    // Create multiple wallets
    console.log('💰 Creating wallets...');
    const wallets = [];
    for (let i = 0; i < 3; i++) {
      const wallet = app.createWallet(`Volume Bot Wallet ${i + 1}`, ['volume']);
      wallets.push(wallet.wallet);
    }
    console.log(`✅ Created ${wallets.length} wallets\n`);

    // Example token mint (replace with actual)
    const tokenMint = 'YOUR_TOKEN_MINT_HERE';
    const walletIds = wallets.map(w => w.id);

    // Start volume trading session
    console.log('🚀 Starting volume trading session...');
    console.log(`Token: ${tokenMint}`);
    console.log(`Wallets: ${walletIds.length}`);
    console.log(`Total volume: 0.5 SOL`);
    console.log(`Cycles: 5\n`);

    // const session = await app.startVolumeSession(
    //   walletIds,
    //   tokenMint,
    //   {
    //     totalVolume: 0.5, // 0.5 SOL total
    //     cycles: 5,        // 5 buy/sell cycles
    //     continuous: false,
    //     randomizeAmounts: true,
    //     randomizeDelay: true
    //   }
    // );

    // if (session.success) {
    //   console.log(`✅ Volume session started: ${session.sessionId}\n`);
    //   
    //   // Monitor session
    //   const checkInterval = setInterval(() => {
    //     const activeSession = app.volumeBot.getSession(session.sessionId);
    //     if (activeSession) {
    //       console.log(`Session stats:`, {
    //         cycles: activeSession.stats.cyclesCompleted,
    //         trades: activeSession.stats.totalTrades,
    //         successful: activeSession.stats.successfulTrades,
    //         failed: activeSession.stats.failedTrades,
    //         volume: activeSession.stats.totalVolume.toFixed(4) + ' SOL',
    //         active: activeSession.isActive
    //       });
    //     }
    //     
    //     if (!activeSession || !activeSession.isActive) {
    //       clearInterval(checkInterval);
    //       console.log('\n✅ Volume session completed');
    //     }
    //   }, 5000); // Check every 5 seconds
    // }

    // Example: Stop all sessions
    // setTimeout(() => {
    //   console.log('\n🛑 Stopping all volume sessions...');
    //   app.volumeBot.stopAllSessions();
    // }, 30000); // Stop after 30 seconds

    // Get all active sessions
    const activeSessions = app.volumeBot.getActiveSessions();
    console.log(`📊 Active sessions: ${activeSessions.length}\n`);

    // Cleanup
    app.destroy();
    console.log('✅ Volume bot example completed');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

export default volumeBotExample;

