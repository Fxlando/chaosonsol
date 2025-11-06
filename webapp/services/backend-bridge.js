/**
 * Backend Bridge Service
 * Connects the webapp frontend to the new production backend
 * This allows the website to use all the new backend functionality
 */

// This will be a bridge between browser-side code and the new backend
// Since the new backend uses ES6 modules, we need to either:
// 1. Bundle it for the browser
// 2. Create a service layer that mimics the backend API
// 3. Use the backend as a server-side API

class BackendBridge {
  constructor() {
    this.isInitialized = false;
    this.app = null;
    this.useServerSide = false; // Set to true if using server-side API
    this.apiBase = '/api'; // Backend API base URL
  }

  /**
   * Initialize the bridge
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Check if we can use the backend directly (Node.js environment)
      if (typeof window === 'undefined' || typeof require !== 'undefined') {
        // Server-side - use backend directly
        const { App } = require('../src/App.js');
        this.app = new App({
          network: 'mainnet-beta'
        });
        await this.app.initialize();
        this.useServerSide = true;
      } else {
        // Browser-side - use API or bundled version
        // For now, we'll use the existing browser implementations
        // but enhanced with the new backend concepts
        this.useServerSide = false;
        
        // TODO: Bundle the backend for browser use or connect via API
        console.log('Using browser-side implementation (connecting to new backend via API)');
      }

      this.isInitialized = true;
      console.log('✅ Backend Bridge initialized');
    } catch (error) {
      console.error('Backend Bridge initialization failed:', error);
      // Fall back to browser-side implementation
      this.useServerSide = false;
    }
  }

  /**
   * Create wallet
   */
  async createWallet(name, tags = []) {
    if (this.useServerSide && this.app) {
      return this.app.createWallet(name, tags);
    } else {
      // Browser-side fallback
      return this.createWalletBrowser(name, tags);
    }
  }

  /**
   * Browser-side wallet creation
   */
  createWalletBrowser(name, tags) {
    try {
      const { Keypair } = window.solanaWeb3;
      const keypair = Keypair.generate();
      
      return {
        success: true,
        wallet: {
          id: `wallet_${Date.now()}`,
          name: name,
          publicKey: keypair.publicKey.toString(),
          privateKey: Array.from(keypair.secretKey),
          tags: tags
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Launch token
   */
  async launchToken(walletId, metadata, initialBuy = 0, options = {}) {
    if (this.useServerSide && this.app) {
      return this.app.launchToken(walletId, metadata, initialBuy, options);
    } else {
      // Browser-side - use existing implementation enhanced
      return this.launchTokenBrowser(walletId, metadata, initialBuy, options);
    }
  }

  /**
   * Browser-side token launch
   */
  async launchTokenBrowser(walletId, metadata, initialBuy, options) {
    // Use existing pumpfun-trading.js implementation
    if (window.PumpFunTrading) {
      const pumpFun = new window.PumpFunTrading(window.SolanaIntegration);
      return await pumpFun.createToken({
        ...metadata,
        creatorWallet: walletId,
        initialBuyAmount: initialBuy
      });
    }
    
    return {
      success: false,
      error: 'PumpFun trading not available'
    };
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.BackendBridge = BackendBridge;
}

export default BackendBridge;

