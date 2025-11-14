// Settings UI Controller
// Bridges DOM form inputs with SettingsManager

(function () {
    const SOLANA_FIELDS = {
        rpcHttp: 'solana-rpc-http',
        rpcWebsocket: 'solana-rpc-ws',
        monitoringRpc: 'solana-monitoring-rpc',
        priceRpc: 'solana-price-rpc',
        skipPreflight: 'skipPreflight',
        priorityFee: 'solana-priority-fee'
    };

    const QUICK_BUY_IDS = ['quick-buy-option-1', 'quick-buy-option-2', 'quick-buy-option-3'];
    const QUICK_SELL_IDS = ['quick-sell-option-1', 'quick-sell-option-2', 'quick-sell-option-3'];

    const AUTO_OPEN_FIELDS = {
        solscan: 'auto-open-solscan',
        axiom: 'auto-open-axiom',
        gmgn: 'auto-open-gmgn',
        pumpfun: 'auto-open-pumpfun',
        raydium: 'auto-open-raydium',
        bonk: 'auto-open-bonk'
    };

    const PUMPPORTAL_FIELDS = {
        apiKey: 'pumpportal-api-key',
        priorityFee: 'pumpportal-priority-fee',
        pool: 'pumpportal-pool'
    };

    const SHYFT_FIELDS = {
        enabled: 'shyft-enabled',
        apiKey: 'shyft-api-key'
    };
    
    const HELIUS_FIELDS = {
        apiKey: 'helius-api-key'
    };

    const BIRDEYE_FIELDS = {
        apiKey: 'birdeye-api-key'
    };

    const MORALIS_FIELDS = {
        apiKey: 'moralis-api-key'
    };

    function parseNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function setInputValue(id, value) {
        const el = document.getElementById(id);
        if (!el) return;

        if (el.type === 'checkbox') {
            el.checked = !!value;
        } else if (el.tagName === 'SELECT') {
            el.value = value ?? el.value;
        } else {
            el.value = value ?? '';
        }
    }

    function updateShyftEndpoints(apiKey) {
        const endpointEl = document.getElementById('shyft-ws-endpoint');
        if (endpointEl) {
            endpointEl.textContent = apiKey || 'YOUR_KEY';
        }
    }

    function populateSettingsForm(settings) {
        if (!settings) return;

        const { solana = {}, customization = {}, pumpportal = {}, shyft = {}, helius = {}, birdeye = {}, moralis = {} } = settings;

        Object.entries(SOLANA_FIELDS).forEach(([key, id]) => {
            setInputValue(id, solana[key]);
        });

        // Populate PumpPortal settings
        Object.entries(PUMPPORTAL_FIELDS).forEach(([key, id]) => {
            setInputValue(id, pumpportal[key]);
        });

        // Populate Shyft RPC settings
        Object.entries(SHYFT_FIELDS).forEach(([key, id]) => {
            setInputValue(id, shyft[key]);
        });
        
        // Populate Helius Enhanced API settings
        Object.entries(HELIUS_FIELDS).forEach(([key, id]) => {
            setInputValue(id, helius[key]);
        });

        // Populate Birdeye API settings
        Object.entries(BIRDEYE_FIELDS).forEach(([key, id]) => {
            setInputValue(id, birdeye[key]);
        });

        // Populate Moralis API settings
        Object.entries(MORALIS_FIELDS).forEach(([key, id]) => {
            setInputValue(id, moralis[key]);
        });

        // Update endpoint display
        updateShyftEndpoints(shyft.apiKey || '');

        // Add event listener for API key changes
        const shyftApiKeyInput = document.getElementById(SHYFT_FIELDS.apiKey);
        if (shyftApiKeyInput) {
            shyftApiKeyInput.addEventListener('input', (e) => {
                updateShyftEndpoints(e.target.value.trim());
            });
        }

        const quickBuy = Array.isArray(customization.quickBuyOptions) ? customization.quickBuyOptions : [];
        QUICK_BUY_IDS.forEach((id, index) => setInputValue(id, quickBuy[index] ?? ''));

        const quickSell = Array.isArray(customization.quickSellOptions) ? customization.quickSellOptions : [];
        QUICK_SELL_IDS.forEach((id, index) => setInputValue(id, quickSell[index] ?? ''));

        const autoOpen = customization.autoOpenLinks || {};
        Object.entries(AUTO_OPEN_FIELDS).forEach(([key, id]) => {
            setInputValue(id, autoOpen[key]);
        });

        setInputValue('hideAddresses', customization.hideAddresses);
    }

    function collectSettingsFromForm() {
        const get = (id) => document.getElementById(id);

        const solana = {
            rpcHttp: get(SOLANA_FIELDS.rpcHttp)?.value.trim(),
            rpcWebsocket: get(SOLANA_FIELDS.rpcWebsocket)?.value.trim(),
            monitoringRpc: get(SOLANA_FIELDS.monitoringRpc)?.value.trim() || '',
            priceRpc: get(SOLANA_FIELDS.priceRpc)?.value.trim() || '',
            skipPreflight: get(SOLANA_FIELDS.skipPreflight)?.checked || false,
            priorityFee: parseNumber(get(SOLANA_FIELDS.priorityFee)?.value, 0),
            network: 'custom'
        };

        const quickBuyOptions = QUICK_BUY_IDS.map((id) => parseNumber(get(id)?.value, 0)).filter((value) => Number.isFinite(value) && value > 0);
        const quickSellOptions = QUICK_SELL_IDS.map((id) => parseNumber(get(id)?.value, 0)).filter((value) => Number.isFinite(value) && value > 0);

        const autoOpenLinks = {};
        Object.entries(AUTO_OPEN_FIELDS).forEach(([key, id]) => {
            autoOpenLinks[key] = get(id)?.checked || false;
        });

        const customization = {
            quickBuyOptions,
            quickSellOptions,
            autoOpenLinks,
            hideAddresses: get('hideAddresses')?.checked || false
        };

        const pumpportal = {
            apiKey: get(PUMPPORTAL_FIELDS.apiKey)?.value.trim() || '',
            priorityFee: parseNumber(get(PUMPPORTAL_FIELDS.priorityFee)?.value, 0.000001),
            pool: get(PUMPPORTAL_FIELDS.pool)?.value || 'pump'
        };

        const shyft = {
            enabled: get(SHYFT_FIELDS.enabled)?.checked || false,
            apiKey: get(SHYFT_FIELDS.apiKey)?.value.trim() || ''
        };
        
        const helius = {
            apiKey: get(HELIUS_FIELDS.apiKey)?.value.trim() || ''
        };

        const birdeye = {
            apiKey: get(BIRDEYE_FIELDS.apiKey)?.value.trim() || ''
        };

        const moralis = {
            apiKey: get(MORALIS_FIELDS.apiKey)?.value.trim() || ''
        };

        return {
            solana,
            customization,
            pumpportal,
            shyft,
            helius,
            birdeye,
            moralis
        };
    }

    async function handleSave() {
        if (!window.settingsManager) {
            showToast('Settings manager not ready yet.', 'error');
            console.warn('Settings manager unavailable');
            return;
        }

        const settingsPatch = collectSettingsFromForm();
        const { solana, customization, shyft, helius, birdeye, moralis } = settingsPatch;

        const rpcResult = await window.settingsManager.updateSolana(solana);
        if (!rpcResult.success) {
            showToast(`Failed to update RPC: ${rpcResult.error}`, 'error');
            addConsoleLog?.(`❌ Failed to update RPC: ${rpcResult.error}`, 'error');
            return;
        }
        
        // Log Solana settings to verify all RPCs are saved
        const verifySolanaSettings = window.settingsManager.getSettings();
        console.log('✅ Solana settings saved:', {
            rpcHttp: verifySolanaSettings?.solana?.rpcHttp,
            rpcWebsocket: verifySolanaSettings?.solana?.rpcWebsocket,
            monitoringRpc: verifySolanaSettings?.solana?.monitoringRpc,
            priceRpc: verifySolanaSettings?.solana?.priceRpc
        });

        window.settingsManager.updateCustomization(customization);
        
        // Save Shyft settings - ensure it's saved properly
        if (window.settingsManager.updateShyft) {
            window.settingsManager.updateShyft(shyft);
        } else {
            // Fallback: manually update and save
            const currentSettings = window.settingsManager.getSettings();
            currentSettings.shyft = {
                ...(currentSettings.shyft || {}),
                ...shyft
            };
            window.settingsManager.settings = currentSettings;
            window.settingsManager.saveSettings();
        }
        
        // Save Helius settings
        if (window.settingsManager.updateHelius) {
            window.settingsManager.updateHelius(helius);
        } else {
            // Fallback: manually update and save
            const currentSettings = window.settingsManager.getSettings();
            currentSettings.helius = {
                ...(currentSettings.helius || {}),
                ...helius
            };
            window.settingsManager.settings = currentSettings;
            window.settingsManager.saveSettings();
        }

        // Save Birdeye settings
        if (window.settingsManager.updateBirdeye) {
            window.settingsManager.updateBirdeye(birdeye);
        } else {
            // Fallback: manually update and save
            const currentSettings = window.settingsManager.getSettings();
            currentSettings.birdeye = {
                ...(currentSettings.birdeye || {}),
                ...birdeye
            };
            window.settingsManager.settings = currentSettings;
            window.settingsManager.saveSettings();
        }
        
        // Force a re-read to verify it was saved
        const verifySettings = window.settingsManager.getSettings();
        console.log('✅ Shyft settings saved:', verifySettings?.shyft);
        console.log('✅ Helius settings saved:', verifySettings?.helius);
        console.log('✅ Birdeye settings saved:', verifySettings?.birdeye);

        showToast('Settings saved successfully!', 'success');
        addConsoleLog?.('✅ Settings saved successfully', 'success');
        
        // Trigger settings updated event to refresh active views
        document.dispatchEvent(new CustomEvent('chaosSettingsUpdated', { 
            detail: window.settingsManager.getSettings() 
        }));
    }

    document.addEventListener('chaosSettingsUpdated', (event) => {
        populateSettingsForm(event.detail);
    });

    document.addEventListener('chaosSettingsManagerReady', (event) => {
        populateSettingsForm(event.detail);
    });

    document.addEventListener('chaosSettingsViewOpened', async () => {
        const snapshot = window.settingsManager?.getSettings();
        populateSettingsForm(snapshot);
        
        // Try to sync config from .env (backend API) if available
        try {
            const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? 'http://localhost:3000' 
                : (window.__CHAOSBOT_API_BASE__ || '/api');
            const configEndpoint = apiBase.startsWith('http') ? `${apiBase}/api/config` : `${apiBase}/config`;
            
            const response = await fetch(configEndpoint);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.config) {
                    // Merge .env config with existing settings (don't overwrite user changes)
                    const currentSettings = window.settingsManager.getSettings();
                    const envConfig = data.config;
                    
                    // Only fill in empty fields from .env
                    const mergedSettings = {
                        solana: {
                            ...currentSettings.solana,
                            rpcHttp: currentSettings.solana?.rpcHttp || envConfig.solana?.rpcHttp || '',
                            rpcWebsocket: currentSettings.solana?.rpcWebsocket || envConfig.solana?.rpcWebsocket || '',
                            monitoringRpc: currentSettings.solana?.monitoringRpc || envConfig.solana?.monitoringRpc || '',
                            priceRpc: currentSettings.solana?.priceRpc || envConfig.solana?.priceRpc || '',
                            priorityFee: currentSettings.solana?.priorityFee || envConfig.solana?.priorityFee || 0.0005
                        },
                        pumpportal: {
                            ...currentSettings.pumpportal,
                            apiKey: currentSettings.pumpportal?.apiKey || envConfig.pumpportal?.apiKey || '',
                            priorityFee: currentSettings.pumpportal?.priorityFee || envConfig.pumpportal?.priorityFee || 0.000001,
                            pool: currentSettings.pumpportal?.pool || envConfig.pumpportal?.pool || 'pump'
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
                        }
                    };
                    
                    // Update settings if we got new values from .env
                    if (envConfig.solana?.rpcHttp || envConfig.pumpportal?.apiKey) {
                        window.settingsManager.settings = {
                            ...currentSettings,
                            ...mergedSettings
                        };
                        window.settingsManager.saveSettings();
                        populateSettingsForm(mergedSettings);
                        console.log('✅ Synced settings from .env file');
                    }
                }
            }
        } catch (error) {
            // Silently fail - .env sync is optional
            console.debug('Could not sync config from .env (backend may not be running):', error.message);
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        // Wait a bit for settingsManager to initialize
        setTimeout(() => {
            const snapshot = window.settingsManager?.getSettings();
            if (snapshot) {
                populateSettingsForm(snapshot);
            } else {
                // Try loading directly from localStorage as fallback
                try {
                    const stored = localStorage.getItem('chaosbot_settings');
                    if (stored) {
                        const settings = JSON.parse(stored);
                        populateSettingsForm(settings);
                    }
                } catch (error) {
                    console.debug('Failed to load settings from localStorage:', error);
                }
            }
        }, 100);
    });
    
    // Also try to populate immediately if settingsManager is already ready
    if (window.settingsManager) {
        const snapshot = window.settingsManager.getSettings();
        if (snapshot) {
            populateSettingsForm(snapshot);
        }
    }

    window.saveSettings = handleSave;
    window.settingsUI = {
        populateSettingsForm,
        handleSave
    };
})();


