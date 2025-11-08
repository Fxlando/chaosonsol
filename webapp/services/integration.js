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
    const solanaProto = window.SolanaIntegration.prototype;
    if (!solanaProto) {
      return;
    }

    const originalCreateWallet = solanaProto.createWallet;
    const originalImportWallet = solanaProto.importWallet;
    const originalGetWalletsWithBalances = solanaProto.getAllWalletsWithBalances;
    
    solanaProto.createWallet = async function(name = null, tags = []) {
      if (window.apiClient && window.apiClient.isConnected) {
        const response = await window.apiClient.createWallet(name, tags);
        return response.wallet;
      }

      if (typeof originalCreateWallet === 'function') {
        return originalCreateWallet.call(this, name, tags);
      }

      throw new Error('Wallet creation not available');
    };

    solanaProto.importWallet = async function(privateKey, name = null, tags = []) {
      if (window.apiClient && window.apiClient.isConnected) {
        const response = await window.apiClient.importWallet(privateKey, name, tags);
        return response.wallet;
      }

      if (typeof originalImportWallet === 'function') {
        return originalImportWallet.call(this, privateKey, name, tags);
      }

      throw new Error('Wallet import not available');
    };

    solanaProto.getAllWalletsWithBalances = async function() {
      if (window.apiClient && window.apiClient.isConnected) {
        const result = await window.apiClient.getAllWallets();
        return result.wallets || [];
      }

      if (typeof originalGetWalletsWithBalances === 'function') {
        return originalGetWalletsWithBalances.call(this);
      }

      return [];
    };
  }

  // Replace PumpFunTrading methods
  if (window.PumpFunTrading) {
    const pumpFunProto = window.PumpFunTrading.prototype;
    if (!pumpFunProto) {
      return;
    }

    const originalCreateToken = pumpFunProto.createToken;
    
    pumpFunProto.createToken = async function(config) {
      if (window.apiClient && window.apiClient.isConnected) {
        return window.apiClient.launchToken(
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
      }

      if (typeof originalCreateToken === 'function') {
        return originalCreateToken.call(this, config);
      }

      throw new Error('Token creation not available');
    };
  }
}

// Export for use
if (typeof window !== 'undefined') {
  window.integrateWithAPI = integrateWithAPI;
}

