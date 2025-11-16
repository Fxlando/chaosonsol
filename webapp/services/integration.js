/**
 * Integration Layer
 * Connects existing webapp code to new API server
 */

// Listen for SettingsManager initialization
let configLoaded = false;
let pendingConfig = null;

// Check periodically for settingsManager to be initialized
if (typeof window !== 'undefined') {
  const checkInterval = setInterval(() => {
    if (window.settingsManager && !configLoaded && pendingConfig) {
      console.log('🔄 Settings Manager detected, applying pending config...');
      applyConfigToSettingsManager(pendingConfig);
      configLoaded = true;
      clearInterval(checkInterval);
    }
  }, 500);
  
  // Stop checking after 10 seconds
  setTimeout(() => clearInterval(checkInterval), 10000);
}

/**
 * Apply config to settings manager
 */
function applyConfigToSettingsManager(envConfig) {
  if (!window.settingsManager) return;
  
  try {
    const currentSettings = window.settingsManager.getSettings();
    
    // Helper to use existing value if it exists, otherwise use backend config
    const useIfEmpty = (existing, backend, defaultValue = '') => {
      return (existing && existing.trim && existing.trim() !== '') || (existing && !existing.trim) ? existing : (backend || defaultValue);
    };
    
    const mergedSettings = {
      solana: {
        ...currentSettings.solana,
        rpcHttp: useIfEmpty(currentSettings.solana?.rpcHttp, envConfig.solana?.rpcHttp),
        rpcWebsocket: useIfEmpty(currentSettings.solana?.rpcWebsocket, envConfig.solana?.rpcWebsocket),
        monitoringRpc: useIfEmpty(currentSettings.solana?.monitoringRpc, envConfig.solana?.monitoringRpc),
        priceRpc: useIfEmpty(currentSettings.solana?.priceRpc, envConfig.solana?.priceRpc),
        rpcHttp2: useIfEmpty(currentSettings.solana?.rpcHttp2, envConfig.solana?.rpcHttp2),
        rpcHttp3: useIfEmpty(currentSettings.solana?.rpcHttp3, envConfig.solana?.rpcHttp3),
        priorityFee: currentSettings.solana?.priorityFee || envConfig.solana?.priorityFee || 0.0005
      },
      pumpportal: {
        ...currentSettings.pumpportal,
        apiKey: useIfEmpty(currentSettings.pumpportal?.apiKey, envConfig.pumpportal?.apiKey),
        priorityFee: currentSettings.pumpportal?.priorityFee || envConfig.pumpportal?.priorityFee || 0.000001,
        pool: currentSettings.pumpportal?.pool || envConfig.pumpportal?.pool || 'pump'
      },
      shyft: {
        ...currentSettings.shyft,
        apiKey: useIfEmpty(currentSettings.shyft?.apiKey, envConfig.shyft?.apiKey),
        enabled: currentSettings.shyft?.enabled !== undefined ? currentSettings.shyft.enabled : (envConfig.shyft?.enabled || false)
      },
      helius: {
        ...currentSettings.helius,
        apiKey: useIfEmpty(currentSettings.helius?.apiKey, envConfig.helius?.apiKey)
      },
      birdeye: {
        ...currentSettings.birdeye,
        apiKey: useIfEmpty(currentSettings.birdeye?.apiKey, envConfig.birdeye?.apiKey)
      },
      moralis: {
        ...currentSettings.moralis,
        apiKey: useIfEmpty(currentSettings.moralis?.apiKey, envConfig.moralis?.apiKey)
      }
    };
    
    // Update settings
    window.settingsManager.settings = {
      ...currentSettings,
      ...mergedSettings
    };
    window.settingsManager.saveSettings();
    window.settingsManager.applySettings();
    
    console.log('✅ Config applied to Settings Manager');
    
    // Refresh RPC pool manager if available
    setTimeout(() => {
      if (window.rpcPoolManager) {
        window.rpcPoolManager.refreshPool();
        console.log('✅ RPC pool refreshed with new settings');
      }
    }, 100);
  } catch (error) {
    console.error('Failed to apply config to Settings Manager:', error);
  }
}

// Initialize API client when page loads
document.addEventListener('DOMContentLoaded', async () => {
  if (window.APIClient) {
    try {
      await window.apiClient.initialize();
      console.log('✅ Connected to production API server');
      
      // Load config from backend and update settings
      await loadConfigFromBackend();
      
      // Replace existing implementations with API calls
      integrateWithAPI();
    } catch (error) {
      console.warn('⚠️ API server not available, using local mode:', error);
      // Try to load config anyway (backend might be slow to start)
      setTimeout(async () => {
        try {
          await loadConfigFromBackend();
        } catch (retryError) {
          console.debug('Config load retry failed:', retryError.message);
        }
      }, 2000);
      // Continue with existing browser-side code
    }
  } else {
    // Even if API client isn't available, try to load config
    setTimeout(async () => {
      try {
        await loadConfigFromBackend();
      } catch (retryError) {
        console.debug('Config load failed:', retryError.message);
      }
    }, 1000);
  }
});

/**
 * Wait for settings manager to be initialized
 */
async function waitForSettingsManager(maxWait = 5000) {
  const startTime = Date.now();
  while (!window.settingsManager && (Date.now() - startTime) < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return window.settingsManager;
}

/**
 * Initialize settings manager if it doesn't exist
 */
function ensureSettingsManager() {
  if (!window.settingsManager && window.SettingsManager && window.SolanaIntegration) {
    // Create SolanaIntegration if it doesn't exist
    if (!window.solanaIntegration) {
      window.solanaIntegration = new window.SolanaIntegration();
    }
    // Create SettingsManager
    window.settingsManager = new window.SettingsManager(window.solanaIntegration);
    console.log('✅ Settings Manager initialized');
    return true;
  }
  return false;
}

/**
 * Load configuration from backend API and update settings
 */
async function loadConfigFromBackend() {
  try {
    const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000' 
      : (window.__CHAOSBOT_API_BASE__ || '/api');
    const configEndpoint = apiBase.startsWith('http') ? `${apiBase}/api/config` : `${apiBase}/config`;
    
    console.log('🔄 Loading config from backend:', configEndpoint);
    const response = await fetch(configEndpoint);
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.config) {
        const envConfig = data.config;
        
        // Try to ensure settings manager exists
        ensureSettingsManager();
        
        // Wait for settings manager if it's not ready yet
        const settingsManager = await waitForSettingsManager(3000);
        
        // Update settings manager if available
        if (settingsManager) {
          const currentSettings = settingsManager.getSettings();
          
          // Merge config from backend (only fill empty fields)
          // Helper to use existing value if it exists, otherwise use backend config
          const useIfEmpty = (existing, backend, defaultValue = '') => {
            return (existing && existing.trim && existing.trim() !== '') || (existing && !existing.trim) ? existing : (backend || defaultValue);
          };
          
          const mergedSettings = {
            solana: {
              ...currentSettings.solana,
              rpcHttp: useIfEmpty(currentSettings.solana?.rpcHttp, envConfig.solana?.rpcHttp),
              rpcWebsocket: useIfEmpty(currentSettings.solana?.rpcWebsocket, envConfig.solana?.rpcWebsocket),
              monitoringRpc: useIfEmpty(currentSettings.solana?.monitoringRpc, envConfig.solana?.monitoringRpc),
              priceRpc: useIfEmpty(currentSettings.solana?.priceRpc, envConfig.solana?.priceRpc),
              rpcHttp2: useIfEmpty(currentSettings.solana?.rpcHttp2, envConfig.solana?.rpcHttp2),
              rpcHttp3: useIfEmpty(currentSettings.solana?.rpcHttp3, envConfig.solana?.rpcHttp3),
              priorityFee: currentSettings.solana?.priorityFee || envConfig.solana?.priorityFee || 0.0005
            },
            pumpportal: {
              ...currentSettings.pumpportal,
              apiKey: useIfEmpty(currentSettings.pumpportal?.apiKey, envConfig.pumpportal?.apiKey),
              priorityFee: currentSettings.pumpportal?.priorityFee || envConfig.pumpportal?.priorityFee || 0.000001,
              pool: currentSettings.pumpportal?.pool || envConfig.pumpportal?.pool || 'pump'
            },
            shyft: {
              ...currentSettings.shyft,
              apiKey: useIfEmpty(currentSettings.shyft?.apiKey, envConfig.shyft?.apiKey),
              enabled: currentSettings.shyft?.enabled !== undefined ? currentSettings.shyft.enabled : (envConfig.shyft?.enabled || false)
            },
            helius: {
              ...currentSettings.helius,
              apiKey: useIfEmpty(currentSettings.helius?.apiKey, envConfig.helius?.apiKey)
            },
            birdeye: {
              ...currentSettings.birdeye,
              apiKey: useIfEmpty(currentSettings.birdeye?.apiKey, envConfig.birdeye?.apiKey)
            },
            moralis: {
              ...currentSettings.moralis,
              apiKey: useIfEmpty(currentSettings.moralis?.apiKey, envConfig.moralis?.apiKey)
            }
          };
          
          // Update settings
          settingsManager.settings = {
            ...currentSettings,
            ...mergedSettings
          };
          settingsManager.saveSettings();
          settingsManager.applySettings();
          
          console.log('✅ Config loaded from backend and settings updated');
          
          // Refresh RPC pool manager if available
          // Use setTimeout to ensure settings are fully applied first
          setTimeout(() => {
            if (window.rpcPoolManager) {
              window.rpcPoolManager.refreshPool();
              console.log('✅ RPC pool refreshed with new settings');
              console.log(`📊 RPC Pool Stats: ${window.rpcPoolManager.getStats().totalRpc} HTTP RPCs, ${window.rpcPoolManager.getStats().totalWs} WebSocket RPCs`);
            }
          }, 100);
        } else {
          // Settings manager not available - save config for later application
          console.warn('⚠️ Settings manager not available, will apply config when it initializes');
          pendingConfig = envConfig;
          
          // Also save to localStorage as fallback
          try {
            const stored = localStorage.getItem('chaosbot_settings');
            const currentSettings = stored ? JSON.parse(stored) : {};
            const mergedSettings = {
              ...currentSettings,
              solana: {
                ...currentSettings.solana,
                ...envConfig.solana
              },
              pumpportal: {
                ...currentSettings.pumpportal,
                ...envConfig.pumpportal
              },
              shyft: {
                ...currentSettings.shyft,
                ...envConfig.shyft
              },
              helius: {
                ...currentSettings.helius,
                ...envConfig.helius
              },
              birdeye: {
                ...currentSettings.birdeye,
                ...envConfig.birdeye
              },
              moralis: {
                ...currentSettings.moralis,
                ...envConfig.moralis
              }
            };
            localStorage.setItem('chaosbot_settings', JSON.stringify(mergedSettings));
            console.log('✅ Config saved to localStorage (will be loaded when settings manager initializes)');
          } catch (error) {
            console.error('Failed to save config to localStorage:', error);
          }
        }
      }
    } else {
      console.warn('⚠️ Failed to load config from backend:', response.status);
    }
  } catch (error) {
    // Silently fail - config loading is optional
    console.debug('Could not load config from backend (backend may not be running):', error.message);
  }
}

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

