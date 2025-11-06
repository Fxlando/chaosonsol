/**
 * Trading Example
 * Demonstrates complete trading workflow
 */

import { App } from '../src/App.js';

async function tradingExample() {
  try {
    console.log('📈 Trading Example\n');

    // Initialize app
    const app = new App({
      network: 'mainnet-beta',
      smartSell: {
        enabled: true,
        profitTarget: 30,
        stopLoss: -15
      }
    });

    await app.initialize();

    // Create or get wallet
    let wallet = app.walletManager.getAllWallets()[0];
    if (!wallet) {
      wallet = app.createWallet('Trading Wallet');
      wallet = wallet.wallet;
    }

    console.log(`Using wallet: ${wallet.publicKey}\n`);

    // Example token mint (replace with actual)
    const tokenMint = 'YOUR_TOKEN_MINT_HERE';

    // Get token price
    console.log('📊 Getting token price...');
    const priceInfo = await app.getTokenPrice(tokenMint);
    if (priceInfo.success) {
      console.log(`Token price: ${priceInfo.price}\n`);
    }

    // Get quote before buying
    console.log('💱 Getting quote...');
    const solMint = 'So11111111111111111111111111111111111111112';
    const solAmount = 0.1; // 0.1 SOL
    const quote = await app.getQuote(solMint, tokenMint, solAmount * 1e9);
    
    if (quote.success) {
      console.log(`Quote: ${quote.inputAmount / 1e9} SOL → ${quote.outputAmount} tokens`);
      console.log(`Price impact: ${quote.priceImpact}%\n`);
    }

    // Buy token
    console.log('💰 Buying token...');
    // const buyResult = await app.buyToken(
    //   wallet.id,
    //   tokenMint,
    //   solAmount
    // );
    // 
    // if (buyResult.success) {
    //   console.log(`✅ Buy successful: ${buyResult.signature}\n`);
    //   
    //   // Add to Smart Sell monitoring
    //   console.log('🤖 Adding to Smart Sell monitoring...');
    //   await app.addSmartSellPosition(
    //     wallet.id,
    //     tokenMint,
    //     priceInfo.price, // Entry price
    //     buyResult.tokenAmount, // Amount bought
    //     {
    //       profitTarget: 30,
    //       stopLoss: -15,
    //       trailingStop: 10
    //     }
    //   );
    //   console.log('✅ Position added to Smart Sell\n');
    // }

    // Monitor positions
    const positions = app.smartSell.getPositions();
    console.log(`📊 Monitoring ${positions.length} positions\n`);

    // Cleanup
    app.destroy();
    console.log('✅ Trading example completed');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

export default tradingExample;

