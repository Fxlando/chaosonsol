// Settings Manager - RPC, Jito, Network Configuration
// Manage all platform settings

class SettingsManager {
    constructor(solanaIntegration) {
        this.solana = solanaIntegration;
        this.settings = this.loadSettings();
    }

    // Get default settings
    getDefaultSettings() {
        return {
            // RPC Settings
            rpc: {
                mainnet: 'https://api.mainnet-beta.solana.com',
                devnet: 'https://api.devnet.solana.com',
                custom: '',
                current: 'mainnet',
                timeout: 30000,
                commitment: 'confirmed'
            },
            
            // Jito Settings
            jito: {
                enabled: false,
                blockEngineUrl: 'https://mainnet.block-engine.jito.wtf',
                tipAmount: 0.001, // SOL
                bundleSize: 5
            },
            
            // Trading Settings
            trading: {
                defaultSlippage: 1, // %
                priorityFee: 0.0001, // SOL
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
                logoutTimeout: 3600000 // 1 hour
            }
        };
    }

    // Load settings from localStorage
    loadSettings() {
        try {
            const saved = localStorage.getItem('chaosbot_settings');
            if (saved) {
                const loaded = JSON.parse(saved);
                // Merge with defaults to ensure all keys exist
                return { ...this.getDefaultSettings(), ...loaded };
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
        return this.getDefaultSettings();
    }

    // Save settings to localStorage
    saveSettings() {
        try {
            localStorage.setItem('chaosbot_settings', JSON.stringify(this.settings));
            console.log('✅ Settings saved');
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    }

    // Update RPC endpoint
    async updateRPC(network, customUrl = null) {
        try {
            let rpcUrl;

            if (network === 'custom' && customUrl) {
                rpcUrl = customUrl;
                this.settings.rpc.custom = customUrl;
            } else if (network === 'mainnet') {
                rpcUrl = this.settings.rpc.mainnet;
            } else if (network === 'devnet') {
                rpcUrl = this.settings.rpc.devnet;
            } else {
                throw new Error('Invalid network');
            }

            // Update Solana connection
            this.solana.setRPCEndpoint(rpcUrl);
            this.settings.rpc.current = network;

            // Test connection
            const health = await this.solana.checkRPCHealth();
            
            if (health.healthy) {
                this.saveSettings();
                console.log(`✅ RPC updated to ${network}: ${rpcUrl}`);
                return {
                    success: true,
                    network: network,
                    url: rpcUrl,
                    health: health
                };
            } else {
                throw new Error('RPC connection failed');
            }

        } catch (error) {
            console.error('RPC update error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update Jito settings
    updateJito(config) {
        this.settings.jito = { ...this.settings.jito, ...config };
        this.saveSettings();
        console.log('✅ Jito settings updated');
        return true;
    }

    // Update trading settings
    updateTrading(config) {
        this.settings.trading = { ...this.settings.trading, ...config };
        this.saveSettings();
        console.log('✅ Trading settings updated');
        return true;
    }

    // Update automation settings
    updateAutomation(type, config) {
        if (this.settings.automation[type]) {
            this.settings.automation[type] = { ...this.settings.automation[type], ...config };
            this.saveSettings();
            console.log(`✅ ${type} settings updated`);
            return true;
        }
        return false;
    }

    // Update UI settings
    updateUI(config) {
        this.settings.ui = { ...this.settings.ui, ...config };
        this.saveSettings();
        console.log('✅ UI settings updated');
        return true;
    }

    // Update security settings
    updateSecurity(config) {
        this.settings.security = { ...this.settings.security, ...config };
        this.saveSettings();
        console.log('✅ Security settings updated');
        return true;
    }

    // Get current settings
    getSettings() {
        return this.settings;
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
            
            // Validate structure
            if (imported.rpc && imported.trading && imported.ui) {
                this.settings = { ...this.getDefaultSettings(), ...imported };
                this.saveSettings();
                console.log('✅ Settings imported');
                return {
                    success: true,
                    message: 'Settings imported successfully'
                };
            } else {
                throw new Error('Invalid settings file');
            }
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
            
            const blockHeight = await testConnection.getBlockHeight();
            const slot = await testConnection.getSlot();
            
            return {
                success: true,
                blockHeight,
                slot,
                latency: 'Good' // TODO: Measure actual latency
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
        return await this.solana.checkRPCHealth();
    }

    // Apply settings to application
    applySettings() {
        // Apply RPC settings
        if (this.settings.rpc.current) {
            this.updateRPC(this.settings.rpc.current, this.settings.rpc.custom);
        }

        // Apply UI settings
        if (this.settings.ui.theme) {
            document.body.classList.toggle('light-theme', this.settings.ui.theme === 'light');
        }

        console.log('✅ Settings applied');
    }
}

// Export
window.SettingsManager = SettingsManager;

console.log('✅ Settings Manager loaded');

