// Settings UI Controller
// Bridges DOM form inputs with SettingsManager

(function () {
    const SOLANA_FIELDS = {
        rpcHttp: 'solana-rpc-http',
        rpcWebsocket: 'solana-rpc-ws',
        skipPreflight: 'skipPreflight',
        priorityFee: 'solana-priority-fee'
    };

    const JITO_FIELDS = {
        location: 'jito-location',
        bundleMaxTip: 'jito-bundle-max-tip',
        transactionMaxTip: 'jito-transaction-max-tip',
        forwarder: 'jito-forwarder'
    };

    const ASTRALANE_FIELDS = {
        location: 'astralane-location',
        apiKey: 'astralane-api-key',
        minPriorityFee: 'astralane-min-priority-fee',
        maxPriorityFee: 'astralane-max-priority-fee'
    };

    const LAUNCHPAD_FIELDS = {
        buySlippage: 'launchpad-buy-slippage',
        sellSlippage: 'launchpad-sell-slippage'
    };

    const DEX_FIELDS = {
        buySlippage: 'dex-buy-slippage',
        sellSlippage: 'dex-sell-slippage'
    };

    const PROXY_FIELD = 'proxy-endpoints';
    const DEFAULT_EXECUTOR_FIELD = 'default-executor-value';

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

        const { solana = {}, jito = {}, astralane = {}, launchpad = {}, dex = {}, proxies = {}, customization = {} } = settings;

        Object.entries(SOLANA_FIELDS).forEach(([key, id]) => {
            setInputValue(id, solana[key]);
        });

        Object.entries(JITO_FIELDS).forEach(([key, id]) => {
            setInputValue(id, jito[key]);
        });

        Object.entries(ASTRALANE_FIELDS).forEach(([key, id]) => {
            setInputValue(id, astralane[key]);
        });

        Object.entries(LAUNCHPAD_FIELDS).forEach(([key, id]) => {
            setInputValue(id, launchpad[key]);
        });

        Object.entries(DEX_FIELDS).forEach(([key, id]) => {
            setInputValue(id, dex[key]);
        });

        setInputValue(PROXY_FIELD, proxies.endpoints || '');

        const quickBuy = Array.isArray(customization.quickBuyOptions) ? customization.quickBuyOptions : [];
        QUICK_BUY_IDS.forEach((id, index) => setInputValue(id, quickBuy[index] ?? ''));

        const quickSell = Array.isArray(customization.quickSellOptions) ? customization.quickSellOptions : [];
        QUICK_SELL_IDS.forEach((id, index) => setInputValue(id, quickSell[index] ?? ''));

        if (customization.defaultExecutor) {
            setInputValue(DEFAULT_EXECUTOR_FIELD, customization.defaultExecutor);
            syncDefaultExecutorButtons(customization.defaultExecutor);
        }

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

        const jito = {
            location: get(JITO_FIELDS.location)?.value,
            bundleMaxTip: parseNumber(get(JITO_FIELDS.bundleMaxTip)?.value, 0),
            transactionMaxTip: parseNumber(get(JITO_FIELDS.transactionMaxTip)?.value, 0),
            forwarder: get(JITO_FIELDS.forwarder)?.value
        };

        const astralane = {
            location: get(ASTRALANE_FIELDS.location)?.value,
            apiKey: get(ASTRALANE_FIELDS.apiKey)?.value.trim(),
            minPriorityFee: parseNumber(get(ASTRALANE_FIELDS.minPriorityFee)?.value, 0),
            maxPriorityFee: parseNumber(get(ASTRALANE_FIELDS.maxPriorityFee)?.value, 0)
        };

        const launchpad = {
            buySlippage: parseNumber(get(LAUNCHPAD_FIELDS.buySlippage)?.value, 0),
            sellSlippage: parseNumber(get(LAUNCHPAD_FIELDS.sellSlippage)?.value, 0)
        };

        const dex = {
            buySlippage: parseNumber(get(DEX_FIELDS.buySlippage)?.value, 0),
            sellSlippage: parseNumber(get(DEX_FIELDS.sellSlippage)?.value, 0)
        };

        const proxies = {
            endpoints: get(PROXY_FIELD)?.value || ''
        };

        const quickBuyOptions = QUICK_BUY_IDS.map((id) => parseNumber(get(id)?.value, 0)).filter((value) => Number.isFinite(value) && value > 0);
        const quickSellOptions = QUICK_SELL_IDS.map((id) => parseNumber(get(id)?.value, 0)).filter((value) => Number.isFinite(value) && value > 0);

        const autoOpenLinks = {};
        Object.entries(AUTO_OPEN_FIELDS).forEach(([key, id]) => {
            autoOpenLinks[key] = get(id)?.checked || false;
        });

        const customization = {
            defaultExecutor: get(DEFAULT_EXECUTOR_FIELD)?.value || 'jito',
            quickBuyOptions,
            quickSellOptions,
            autoOpenLinks,
            hideAddresses: get('hideAddresses')?.checked || false
        };

        return {
            solana,
            jito,
            astralane,
            launchpad,
            dex,
            proxies,
            customization
        };
    }

    function syncDefaultExecutorButtons(value) {
        const jitoBtn = document.getElementById('default-executor-jito');
        const rpcBtn = document.getElementById('default-executor-rpc');

        if (!jitoBtn || !rpcBtn) return;

        const activeClasses = ['bg-purple-700', 'text-white'];
        const inactiveClasses = ['bg-neutral-800', 'text-gray-300'];

        [jitoBtn, rpcBtn].forEach((btn) => {
            btn.classList.remove(...activeClasses, ...inactiveClasses);
            btn.classList.add(...inactiveClasses);
        });

        const activeBtn = value === 'rpc' ? rpcBtn : jitoBtn;
        activeBtn.classList.remove(...inactiveClasses);
        activeBtn.classList.add(...activeClasses);
    }

    async function handleSave() {
        if (!window.settingsManager) {
            showToast('Settings manager not ready yet.', 'error');
            console.warn('Settings manager unavailable');
            return;
        }

        const settingsPatch = collectSettingsFromForm();
        const { solana, jito, astralane, launchpad, dex, proxies, customization } = settingsPatch;

        const rpcResult = await window.settingsManager.updateSolana(solana);
        if (!rpcResult.success) {
            showToast(`Failed to update RPC: ${rpcResult.error}`, 'error');
            addConsoleLog?.(`❌ Failed to update RPC: ${rpcResult.error}`, 'error');
            return;
        }

        window.settingsManager.updateJito(jito);
        window.settingsManager.updateAstralane(astralane);
        window.settingsManager.updateLaunchpad(launchpad);
        window.settingsManager.updateDex(dex);
        window.settingsManager.updateProxies(proxies);
        window.settingsManager.updateCustomization(customization);

        showToast('Settings saved successfully!', 'success');
        addConsoleLog?.('✅ Settings saved successfully', 'success');
    }

    function ensureDefaultExecutorHiddenInput() {
        const hidden = document.getElementById(DEFAULT_EXECUTOR_FIELD);
        if (!hidden) return;

        const jitoBtn = document.getElementById('default-executor-jito');
        const rpcBtn = document.getElementById('default-executor-rpc');

        [jitoBtn, rpcBtn].forEach((btn) => {
            if (!btn) return;
            btn.addEventListener('click', () => {
                hidden.value = btn.id.includes('rpc') ? 'rpc' : 'jito';
                syncDefaultExecutorButtons(hidden.value);
            });
        });
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
        ensureDefaultExecutorHiddenInput();
        const snapshot = window.settingsManager?.getSettings();
        if (snapshot) {
            populateSettingsForm(snapshot);
        }
    });

    window.saveSettings = handleSave;
    window.settingsUI = {
        populateSettingsForm,
        handleSave,
        syncDefaultExecutorButtons
    };
})();


