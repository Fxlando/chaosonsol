// Settings UI Controller
// Bridges DOM form inputs with SettingsManager

(function () {
    const SOLANA_FIELDS = {
        rpcHttp: 'solana-rpc-http',
        rpcWebsocket: 'solana-rpc-ws',
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

    function populateSettingsForm(settings) {
        if (!settings) return;

        const { solana = {}, customization = {}, pumpportal = {} } = settings;

        Object.entries(SOLANA_FIELDS).forEach(([key, id]) => {
            setInputValue(id, solana[key]);
        });

        // Populate PumpPortal settings
        Object.entries(PUMPPORTAL_FIELDS).forEach(([key, id]) => {
            setInputValue(id, pumpportal[key]);
        });

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

        return {
            solana,
            customization,
            pumpportal
        };
    }

    async function handleSave() {
        if (!window.settingsManager) {
            showToast('Settings manager not ready yet.', 'error');
            console.warn('Settings manager unavailable');
            return;
        }

        const settingsPatch = collectSettingsFromForm();
        const { solana, customization } = settingsPatch;

        const rpcResult = await window.settingsManager.updateSolana(solana);
        if (!rpcResult.success) {
            showToast(`Failed to update RPC: ${rpcResult.error}`, 'error');
            addConsoleLog?.(`❌ Failed to update RPC: ${rpcResult.error}`, 'error');
            return;
        }

        window.settingsManager.updateCustomization(customization);

        showToast('Settings saved successfully!', 'success');
        addConsoleLog?.('✅ Settings saved successfully', 'success');
    }

    document.addEventListener('chaosSettingsUpdated', (event) => {
        populateSettingsForm(event.detail);
    });

    document.addEventListener('chaosSettingsManagerReady', (event) => {
        populateSettingsForm(event.detail);
    });

    document.addEventListener('chaosSettingsViewOpened', () => {
        const snapshot = window.settingsManager?.getSettings();
        populateSettingsForm(snapshot);
    });

    document.addEventListener('DOMContentLoaded', () => {
        const snapshot = window.settingsManager?.getSettings();
        if (snapshot) {
            populateSettingsForm(snapshot);
        }
    });

    window.saveSettings = handleSave;
    window.settingsUI = {
        populateSettingsForm,
        handleSave
    };
})();


