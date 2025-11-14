// Settings Manager - RPC, Jito, Network Configuration
// Manage all platform settings

class SettingsManager {
    constructor(solanaIntegration) {
        this.solana = solanaIntegration;
        this.storageKey = 'chaosbot_settings';
        this.settings = this.loadSettings();
        this.applySettings();
    }

    // Deep merge helper
    deepMerge(target = {}, source = {}) {
        const output = Array.isArray(target) ? [...target] : { ...target };
        if (!source || typeof source !== 'object') {
            return output;
        }

        Object.keys(source).forEach((key) => {
            const srcValue = source[key];
            const tgtValue = output[key];

            if (Array.isArray(srcValue)) {
                output[key] = [...srcValue];
            } else if (srcValue && typeof srcValue === 'object') {
                output[key] = this.deepMerge(
                    tgtValue && typeof tgtValue === 'object' ? tgtValue : {},
                    srcValue
                );
            } else if (srcValue !== undefined) {
                output[key] = srcValue;
            }
        });

        return output;
    }

    // Get default settings
    getDefaultSettings() {
        return {
            // Legacy RPC Block (kept for backward compatibility)
            rpc: {
                mainnet: 'https://api.mainnet-beta.solana.com',
                devnet: 'https://api.devnet.solana.com',
                custom: 'https://rpc.shyft.to?api_key=6AC3vTBB5lObDYTm',
                current: 'custom',
                timeout: 30000,
                commitment: 'confirmed'
            },

            // Solana Connectivity
            solana: {
                rpcHttp: 'https://rpc.shyft.to?api_key=6AC3vTBB5lObDYTm',
                rpcWebsocket: 'wss://rpc.shyft.to?api_key=6AC3vTBB5lObDYTm',
                network: 'mainnet',
                skipPreflight: false,
                priorityFee: 0.0005,
                commitment: 'confirmed',
                // Dedicated RPCs for specific purposes (optional - falls back to main RPC if not set)
                monitoringRpc: '', // For live trade transaction monitoring (WebSocket)
                priceRpc: '' // For market cap/price updates (HTTP)
            },

            // Jito Settings
            jito: {
                location: 'New York',
                bundleMaxTip: 0.001,
                transactionMaxTip: 0.001,
                forwarder: 'Astralane'
            },

            // Astralane Settings
            astralane: {
                location: 'New York',
                apiKey: '',
                minPriorityFee: 0.0001,
                maxPriorityFee: 0.0005
            },

            // Proxy Settings
            proxies: {
                endpoints: ''
            },

            // Launchpad Trading
            launchpad: {
                buySlippage: 20,
                sellSlippage: 20
            },

            // DEX Trading
            dex: {
                buySlippage: 5,
                sellSlippage: 50
            },

            // Customization
            customization: {
                quickBuyOptions: [0.1, 0.5, 1],
                quickSellOptions: [25, 50, 100],
                autoOpenLinks: {
                    solscan: true,
                    axiom: false,
                    gmgn: false,
                    pumpfun: false,
                    raydium: false,
                    bonk: false
                },
                hideAddresses: false
            },

            // PumpPortal Settings
            pumpportal: {
                apiKey: '',
                priorityFee: 0.000001,
                pool: 'pump' // 'pump' or 'meteora-dbc'
            },

            // Shyft RPC Settings
            shyft: {
                apiKey: '6AC3vTBB5lObDYTm', // Default API key - can be overridden in Settings
                enabled: false // Enable Shyft RPC for blockchain queries and WebSocket subscriptions
            },

            // Trading Settings (legacy compatibility)
            trading: {
                defaultSlippage: 1,
                priorityFee: 0.0001,
                maxRetries: 3,
                confirmTimeout: 30000
            },

            // Automation Settings
            automation: {
                smartSell: {
                    enabled: true,
                    defaultProfitTarget: 30,
                    defaultStopLoss: -15,
                    defaultTrailingStop: 10
                },
                volumeBot: {
                    enabled: true,
                    defaultCycles: 10,
                    defaultBuyAmount: 0.01,
                    defaultSellDelay: 30
                }
            },

            // UI Settings
            ui: {
                theme: 'dark',
                autoRefresh: true,
                refreshInterval: 30000,
                showNotifications: true,
                soundEnabled: false
            },

            // Security Settings
            security: {
                requireConfirmation: true,
                showPrivateKeys: false,
                autoLogout: false,
                logoutTimeout: 3600000
            }
        };
    }

    // Load settings from localStorage
    loadSettings() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            const defaults = this.getDefaultSettings();

            if (saved) {
                const loaded = JSON.parse(saved);
                return this.deepMerge(defaults, loaded);
            }

            return defaults;
        } catch (error) {
            console.error('Error loading settings:', error);
            return this.getDefaultSettings();
        }
    }

    // Persist settings
    saveSettings() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
            console.log('✅ Settings saved');
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    publish() {
        const snapshot = this.getSettings();
        window.__CHAOS_SETTINGS__ = JSON.parse(JSON.stringify(snapshot));
        document.dispatchEvent(new CustomEvent('chaosSettingsUpdated', { detail: snapshot }));
    }

    // Apply settings to the application
    applySettings() {
        if (this.solana) {
            const solanaSettings = this.settings.solana || {};
            if (solanaSettings.rpcHttp) {
                this.solana.setRPCEndpoint(solanaSettings.rpcHttp);
            }
            if (solanaSettings.rpcWebsocket && this.solana.setWebsocketEndpoint) {
                this.solana.setWebsocketEndpoint(solanaSettings.rpcWebsocket);
            }
            if (typeof solanaSettings.skipPreflight === 'boolean' && this.solana.setSkipPreflight) {
                this.solana.setSkipPreflight(solanaSettings.skipPreflight);
            }
            if (typeof solanaSettings.priorityFee === 'number' && this.solana.setPriorityFee) {
                this.solana.setPriorityFee(solanaSettings.priorityFee);
            }
        }

        // Apply UI theme
        if (this.settings.ui?.theme) {
            document.body.classList.toggle('light-theme', this.settings.ui.theme === 'light');
        }

        // Hide addresses when necessary
        const shouldHideAddresses = !!this.settings.customization?.hideAddresses;
        document.body.classList.toggle('hide-addresses', shouldHideAddresses);

        this.publish();

        console.log('✅ Settings applied');
    }

    async updateSolana(config = {}) {
        const parsedConfig = { ...config };

        if (parsedConfig.priorityFee !== undefined) {
            parsedConfig.priorityFee = Number(parsedConfig.priorityFee) || 0;
        }

        if (parsedConfig.skipPreflight !== undefined) {
            parsedConfig.skipPreflight = !!parsedConfig.skipPreflight;
        }

        const previousSolana = this.deepMerge({}, this.settings.solana);
        const previousRpc = this.deepMerge({}, this.settings.rpc);

        try {
            const nextSolanaSettings = this.deepMerge(previousSolana, parsedConfig);

            if (this.solana && parsedConfig.rpcHttp) {
                this.solana.setRPCEndpoint(parsedConfig.rpcHttp);
            }
            if (this.solana && parsedConfig.rpcWebsocket && this.solana.setWebsocketEndpoint) {
                this.solana.setWebsocketEndpoint(parsedConfig.rpcWebsocket);
            }
            if (this.solana && parsedConfig.skipPreflight !== undefined && this.solana.setSkipPreflight) {
                this.solana.setSkipPreflight(parsedConfig.skipPreflight);
            }
            if (this.solana && parsedConfig.priorityFee !== undefined && this.solana.setPriorityFee) {
                this.solana.setPriorityFee(parsedConfig.priorityFee);
            }

            const health = this.solana ? await this.solana.checkRPCHealth() : { healthy: true };
            if (!health.healthy) {
                throw new Error(health.error || 'RPC connection failed');
            }

            this.settings.solana = nextSolanaSettings;

            if (parsedConfig.rpcHttp) {
                this.settings.rpc.custom = parsedConfig.rpcHttp;
                this.settings.rpc.current = parsedConfig.network || 'custom';
            }

            this.saveSettings();
            this.applySettings();
            return { success: true, health };
        } catch (error) {
            console.error('RPC update error:', error);

            if (this.solana && previousSolana.rpcHttp) {
                this.solana.setRPCEndpoint(previousSolana.rpcHttp);
            }
            if (this.solana && this.solana.setWebsocketEndpoint && previousSolana.rpcWebsocket) {
                this.solana.setWebsocketEndpoint(previousSolana.rpcWebsocket);
            }
            if (this.solana && this.solana.setSkipPreflight) {
                this.solana.setSkipPreflight(previousSolana.skipPreflight ?? false);
            }
            if (this.solana && this.solana.setPriorityFee) {
                this.solana.setPriorityFee(previousSolana.priorityFee ?? 0);
            }

            this.settings.solana = previousSolana;
            this.settings.rpc = previousRpc;
            this.applySettings();

            return {
                success: false,
                error: error.message
            };
        }
    }

    // Legacy RPC update helper
    async updateRPC(network, customUrl = null) {
        const nextUrl =
            network === 'custom'
                ? customUrl || this.settings.rpc.custom
                : this.settings.rpc[network];

        if (!nextUrl) {
            return { success: false, error: 'RPC URL not provided' };
        }

        const result = await this.updateSolana({
            rpcHttp: nextUrl,
            network,
            ...(network === 'custom' && customUrl ? { customEndpoint: customUrl } : {})
        });

        if (result.success) {
            this.settings.rpc.current = network;
            if (network === 'custom' && customUrl) {
                this.settings.rpc.custom = customUrl;
            }
            this.saveSettings();
            this.applySettings();
        }

        return result;
    }

    updateJito(config = {}) {
        this.settings.jito = this.deepMerge(this.settings.jito, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ Jito settings updated');
        return true;
    }

    updateAstralane(config = {}) {
        this.settings.astralane = this.deepMerge(this.settings.astralane, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ Astralane settings updated');
        return true;
    }

    updateProxies(config = {}) {
        this.settings.proxies = this.deepMerge(this.settings.proxies, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ Proxy settings updated');
        return true;
    }

    updateLaunchpad(config = {}) {
        this.settings.launchpad = this.deepMerge(this.settings.launchpad, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ Launchpad settings updated');
        return true;
    }

    updateDex(config = {}) {
        this.settings.dex = this.deepMerge(this.settings.dex, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ DEX settings updated');
        return true;
    }

    updateCustomization(config = {}) {
        this.settings.customization = this.deepMerge(this.settings.customization, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ Customization settings updated');
        return true;
    }

    updateShyft(config = {}) {
        // Ensure shyft object exists
        if (!this.settings.shyft) {
            this.settings.shyft = {};
        }
        
        // Deep merge the config
        this.settings.shyft = this.deepMerge(this.settings.shyft, config);
        
        // Force save to localStorage
        const saved = this.saveSettings();
        if (!saved) {
            console.error('❌ Failed to save Shyft settings to localStorage');
            return false;
        }
        
        // Verify it was saved
        try {
            const verify = localStorage.getItem(this.storageKey);
            if (verify) {
                const parsed = JSON.parse(verify);
                console.log('✅ Shyft settings verified in localStorage:', parsed?.shyft);
            }
        } catch (error) {
            console.error('Failed to verify Shyft settings:', error);
        }
        
        this.applySettings();
        this.publish(); // Notify other components
        console.log('✅ Shyft RPC settings updated and saved');
        return true;
    }

    // Update trading settings
    updateTrading(config) {
        this.settings.trading = this.deepMerge(this.settings.trading, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ Trading settings updated');
        return true;
    }

    // Update automation settings
    updateAutomation(type, config) {
        if (this.settings.automation[type]) {
            this.settings.automation[type] = this.deepMerge(this.settings.automation[type], config);
            this.saveSettings();
            this.applySettings();
            console.log(`✅ ${type} settings updated`);
            return true;
        }
        return false;
    }

    // Update UI settings
    updateUI(config) {
        this.settings.ui = this.deepMerge(this.settings.ui, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ UI settings updated');
        return true;
    }

    // Update security settings
    updateSecurity(config) {
        this.settings.security = this.deepMerge(this.settings.security, config);
        this.saveSettings();
        this.applySettings();
        console.log('✅ Security settings updated');
        return true;
    }

    // Get current settings
    getSettings() {
        return this.deepMerge({}, this.settings);
    }

    // Get specific setting
    getSetting(category, key) {
        if (this.settings[category] && this.settings[category][key] !== undefined) {
            return this.settings[category][key];
        }
        return null;
    }

    // Reset to defaults
    resetToDefaults() {
        this.settings = this.getDefaultSettings();
        this.saveSettings();
        this.applySettings();
        console.log('✅ Settings reset to defaults');
        return true;
    }

    // Export settings
    exportSettings() {
        try {
            const settingsJson = JSON.stringify(this.settings, null, 2);
            const blob = new Blob([settingsJson], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chaosbot-settings-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log('✅ Settings exported');
            return true;
        } catch (error) {
            console.error('Export error:', error);
            return false;
        }
    }

    // Import settings
    async importSettings(file) {
        try {
            const text = await file.text();
            const imported = JSON.parse(text);

            if (!imported || typeof imported !== 'object') {
                throw new Error('Invalid settings file');
            }

            this.settings = this.deepMerge(this.getDefaultSettings(), imported);
            this.saveSettings();
            this.applySettings();

            console.log('✅ Settings imported');
            return {
                success: true,
                message: 'Settings imported successfully'
            };
        } catch (error) {
            console.error('Import error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Test RPC connection
    async testRPC(url) {
        try {
            const { Connection } = window.solanaWeb3;
            const testConnection = new Connection(url, 'confirmed');

            const [blockHeight, slot] = await Promise.all([
                testConnection.getBlockHeight(),
                testConnection.getSlot()
            ]);

            return {
                success: true,
                blockHeight,
                slot,
                latency: 'Good'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get RPC health status
    async getRPCHealth() {
        return this.solana ? this.solana.checkRPCHealth() : { healthy: false };
    }
}

// Export
window.SettingsManager = SettingsManager;

console.log('✅ Settings Manager loaded');

