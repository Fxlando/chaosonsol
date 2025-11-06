/**
 * Integration Layer
 * Connects existing webapp code to new API server
 */

// Initialize API client when page loads
document.addEventListener('DOMContentLoaded', async () => {
  if (window.APIClient) {
    try {
      await window.apiClient.initialize();
      console.log('✅ Connected to production API server');
      
      // Replace existing implementations with API calls
      integrateWithAPI();
    } catch (error) {
      console.warn('⚠️ API server not available, using local mode:', error);
      // Continue with existing browser-side code
    }
  }
});

/**
 * Integrate existing code with new API
 */
function integrateWithAPI() {
  // Replace SolanaIntegration methods with API calls
  if (window.SolanaIntegration) {
    const originalSolana = window.SolanaIntegration;
    
    // Override wallet creation
    originalSolana.createWallet = async function() {
      if (window.apiClient && window.apiClient.isConnected) {
        const result = await window.apiClient.createWallet('New Wallet');
        return result.wallet;
      }
      // Fallback to original
      return this.createWallet();
    };

    // Override wallet import
    originalSolana.importWallet = async function(privateKey, name) {
      if (window.apiClient && window.apiClient.isConnected) {
        const result = await window.apiClient.importWallet(privateKey, name);
        return result.wallet;
      }
      // Fallback to original
      return this.importWallet(privateKey);
    };

    // Override balance fetching
    originalSolana.getAllWalletsWithBalances = async function() {
      if (window.apiClient && window.apiClient.isConnected) {
        const result = await window.apiClient.getAllWallets();
        return result.wallets || [];
      }
      // Fallback to original
      return this.getAllWalletsWithBalances();
    };
  }

  // Replace PumpFunTrading methods
  if (window.PumpFunTrading) {
    const originalPumpFun = window.PumpFunTrading;
    
    // Override token creation
    originalPumpFun.prototype.createToken = async function(config) {
      if (window.apiClient && window.apiClient.isConnected) {
        const result = await window.apiClient.launchToken(
          config.creatorWallet,
          {
            name: config.name,
            symbol: config.symbol,
            description: config.description,
            image: config.image,
            twitter: config.twitter,
            telegram: config.telegram,
            website: config.website
          },
          config.initialBuyAmount || 0
        );
        return result;
      }
      // Fallback to original
      return this.createToken(config);
    };
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.integrateWithAPI = integrateWithAPI;
}

