/**
 * Token Launch Example
 * Demonstrates how to create and launch tokens on PumpFun
 */

import { App } from '../src/App.js';

async function tokenLaunchExample() {
  try {
    console.log('🚀 Token Launch Example\n');

    // Initialize app
    const app = new App({
      network: 'mainnet-beta' // Use 'devnet' for testing
    });

    await app.initialize();

    // Create or get wallet
    let wallet = app.walletManager.getAllWallets()[0];
    if (!wallet) {
      wallet = app.createWallet('Token Creator Wallet');
      wallet = wallet.wallet;
      console.log(`Created wallet: ${wallet.publicKey}\n`);
    }

    console.log(`Using wallet: ${wallet.publicKey}\n`);

    // Token metadata
    const metadata = {
      name: 'My Awesome Token',
      symbol: 'AWESOME',
      description: 'This is an awesome token created with Chaos Bot!',
      image: 'https://example.com/token-image.png', // Image URL or base64
      twitter: 'https://twitter.com/mytoken', // Optional
      telegram: 'https://t.me/mytoken', // Optional
      website: 'https://mytoken.com' // Optional
    };

    // Validate metadata
    const { TokenLaunch } = await import('../src/integrations/pumpfun/TokenLaunch.js');
    const tokenLaunch = new TokenLaunch(app.solanaCore);
    await tokenLaunch.initialize();
    
    const validation = tokenLaunch.validateMetadata(metadata);
    if (!validation.valid) {
      console.error('❌ Metadata validation failed:', validation.errors);
      return;
    }

    console.log('✅ Metadata validated\n');

    // Launch token with initial buy
    console.log('🚀 Launching token...');
    console.log(`Name: ${metadata.name}`);
    console.log(`Symbol: ${metadata.symbol}`);
    console.log(`Initial Buy: 0.1 SOL\n`);

    // const result = await app.launchToken(
    //   wallet.id,
    //   metadata,
    //   0.1, // Initial buy amount in SOL
    //   {
    //     maxRetries: 3
    //   }
    // );

    // if (result.success) {
    //   console.log('✅ Token launched successfully!');
    //   console.log(`Token Mint: ${result.tokenMint}`);
    //   console.log(`Transaction: https://solscan.io/tx/${result.signature}`);
    //   console.log(`Metadata URI: ${result.metadataUri}\n`);
    //   
    //   if (result.initialBuy && result.initialBuy.success) {
    //     console.log('✅ Initial buy successful!');
    //     console.log(`Buy Transaction: https://solscan.io/tx/${result.initialBuy.signature}\n`);
    //   }
    // } else {
    //   console.error('❌ Token launch failed:', result.error);
    // }

    // Example: Create token without initial buy
    console.log('📝 Example: Create token without initial buy...');
    // const createResult = await app.createToken(
    //   wallet.id,
    //   metadata,
    //   {
    //     maxRetries: 3
    //   }
    // );

    // if (createResult.success) {
    //   console.log('✅ Token created successfully!');
    //   console.log(`Token Mint: ${createResult.tokenMint}`);
    //   console.log(`Transaction: https://solscan.io/tx/${createResult.signature}\n`);
    // }

    // Cleanup
    app.destroy();
    console.log('✅ Token launch example completed');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

export default tokenLaunchExample;

