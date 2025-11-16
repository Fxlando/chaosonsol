// Real On-Chain Trading UI - Uses live on-chain data only
// 100% Solana Blockchain Integration

let solanaIntegration;
let fallbackSolanaConnection = null;
let cachedTokenProgramId = null;
let rtSelectedWallets = new Set();
let rtCurrentView = 'wallets';
let vanityKeyStore = [];
let vanityLaunchStore = [];
let vanityVisibility = new Set();
let rtAutoScroll = true;
let closeMobileSidebar = () => {};
const MIN_RENT_BUFFER_SOL = 0.001;
// Store selected sell percentage for each wallet (key: walletId_tokenMint, value: percentage)
let selectedSellPercentages = new Map();
// Store selected buy amount for each wallet (key: walletId_tokenMint, value: solAmount)
let selectedBuyAmounts = new Map();

const CREATOR_WALLET_STORAGE_KEY = 'chaosbot_creator_wallet';
const CREATOR_WALLET_TARGET_SOL = 1; // Target SOL used for sidebar progress

let creatorWalletState = {
    id: null,
    address: '',
    name: '',
    balance: null,
    tags: [],
    lastSynced: 0
};

let creatorWalletImportLock = false;

let collectFeesState = {
    initialized: false,
    loading: false,
    autoCollectEnabled: false,
    metrics: null,
    history: []
};

const VIEW_METADATA = {
    wallets: { title: 'Wallets', subtitle: 'Multi-wallet orchestration' },
    tokens: { title: 'Tokens', subtitle: 'Launch & manage assets' },
    instant: { title: 'Instant Trading', subtitle: 'Live fills & routing' },
    volume: { title: 'Volume Trading', subtitle: 'Coordinated executions' },
    smartsell: { title: 'Smart Sell AI', subtitle: 'Adaptive exits' },
    pumpfun: { title: 'Pump.fun Sniper', subtitle: 'Early launch monitor' },
    trade: { title: 'Manual Trade', subtitle: 'Jupiter swaps' },
    history: { title: 'Trade History', subtitle: 'Execution logs' },
    tasks: { title: 'Tasks', subtitle: 'Automation runbook' },
    pnl: { title: 'P&L Cards', subtitle: 'Performance tracking' },
    'collect-fees': { title: 'Collect Fees', subtitle: 'Automated cashouts' },
    blueprint: { title: 'Blueprint', subtitle: 'Automation recipes' },
    vanities: { title: 'Vanities', subtitle: 'Custom address lab' },
    settings: { title: 'Settings', subtitle: 'Platform configuration' },
    console: { title: 'Console', subtitle: 'Real-time logs' },
    generate: { title: 'Generate Wallets', subtitle: 'Batch creation' },
    import: { title: 'Import Wallets', subtitle: 'Bring existing keys' },
    fund: { title: 'Fund Wallets', subtitle: 'Distribute capital' },
    withdraw: { title: 'Withdraw', subtitle: 'Move funds out' },
    tag: { title: 'Tag Wallets', subtitle: 'Organise labels' },
    warm: { title: 'Warm Wallets', subtitle: 'Prepare for trading' },
    reclaim: { title: 'Reclaim Rent', subtitle: 'Optimise SOL usage' },
    export: { title: 'Export Wallets', subtitle: 'Backups & sharing' },
    redistribute: { title: 'Redistribute', subtitle: 'Balance wallets' },
    activate: { title: 'Activation', subtitle: 'Enable or pause bots' },
    grouping: { title: 'Grouping', subtitle: 'Cluster strategies' },
    'create-token': { title: 'Create Token', subtitle: 'Deploy new assets' },
    'copy-token': { title: 'Copy Token', subtitle: 'Clone liquidity' },
    'import-token': { title: 'Import Token', subtitle: 'Track existing tokens' },
    'launch-token': { title: 'Launch Token', subtitle: 'On-chain deployment' }
};

const REVEAL_SELECTORS = [
    '[data-reveal]',
    '.bg-neutral-900.rounded-lg',
    '.bg-neutral-900.rounded-xl',
    '.bg-neutral-900.rounded-2xl',
    '.bg-neutral-800.rounded-lg',
    '.bg-neutral-800.rounded-xl',
    '.bg-neutral-800.rounded-2xl',
    '.bg-black.rounded-xl'
];

let revealObserver = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Real On-Chain Trading Platform...');
    
    loadStoredCreatorWalletState();
    updateCreatorWalletUI();

    hydrateTopBar();
    setupAnimatedViews();
    setupScrollObserver();

    // FIRST: Set up navigation immediately - this is critical
    initializeEventListeners();
    setupMobileNavigation();
    setupMintSelectionToggle();
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Show wallets view by default
    switchView('wallets');
    
    // Try to initialize Solana integration (don't let errors block navigation)
    try {
        if (typeof SolanaIntegration !== 'undefined') {
            solanaIntegration = new SolanaIntegration();
        }
    } catch (error) {
        console.warn('Solana integration not available:', error);
    }
    
    // Load real data (don't let errors block navigation)
    try {
        await loadRealData();
    } catch (error) {
        console.warn('Error loading real data:', error);
    }
    
    // Start real-time updates (don't let errors block navigation)
    try {
        if (typeof startRealTimeUpdates === 'function') {
            startRealTimeUpdates();
        }
    } catch (error) {
        console.warn('Error starting real-time updates:', error);
    }
    
    try {
        await syncCreatorWalletFromBackend({ silent: true });
    } catch (error) {
        console.warn('Creator wallet sync skipped:', error);
    }
    
    // Add console log
    try {
        if (typeof addConsoleLog === 'function') {
            addConsoleLog('✅ System initialized - Real on-chain trading ready', 'success');
        }
    } catch (error) {
        console.warn('Error adding console log:', error);
    }

    initializeSettings();
    initializeCollectFeesView();
    loadArchivedImportedTokens();
    loadImportedTokensFromStorage();
    loadTokenDraftsFromStorage();
    loadVanityLaunchesFromStorage();
    loadVanityKeysFromStorage();
    refreshVanityLaunchPerformance().catch(error => {
        console.warn('Unable to refresh vanity launch performance:', error);
    });
    
    // Listen for settings changes and refresh token detail page if open
    document.addEventListener('chaosSettingsUpdated', () => {
        // Reinitialize Helius connection if settings changed (for token balance queries)
        if (window.solanaIntegration?.reinitHeliusConnection) {
            window.solanaIntegration.reinitHeliusConnection();
        }
        // If we're on the token detail page, reload it with new settings
        if (rtCurrentView === 'token-detail' && tokenRegistry.current) {
            console.log('🔄 Settings updated - refreshing token detail page...');
            
            // Stop existing streams/intervals
            stopTokenActivityStream();
            stopMetricsRefresh();
            
            // Reload the token detail page with new RPC settings
            const currentRecord = tokenRegistry.imported.get(tokenRegistry.current.mint) || tokenRegistry.current;
            if (currentRecord && currentRecord.mint) {
                setTimeout(() => {
                    loadLiveTokenDetail(currentRecord).catch(error => {
                        console.error('Failed to reload token detail after settings change:', error);
                    });
                }, 500); // Small delay to ensure settings are applied
            }
        }
    });
    
    console.log('✅ Real Trading Platform Ready');
});

// Load real blockchain data
async function loadRealData() {
    try {
        // Load real SOL price
        const solPrice = await solanaIntegration.getSolPrice();
        updateSOLPrice(solPrice);
        
        // Load saved wallets with real balances
        const wallets = await solanaIntegration.getAllWalletsWithBalances();
        renderWallets(wallets);
        updateTotalBalance(wallets);
        syncCreatorWalletFromWallets(wallets, {
            preferredId: creatorWalletState.id,
            fallbackAddress: creatorWalletState.address
        });
        
        // Check RPC health
        const rpcHealth = await solanaIntegration.checkRPCHealth();
        updateRPCStatus(rpcHealth);
        
        addConsoleLog(`✅ Loaded ${wallets.length} wallets with real balances`, 'info');
        updateTopbarSyncTimestamp(Date.now());

        if (collectFeesState.initialized) {
            await refreshCollectFeesView({ silent: true });
        }
    } catch (error) {
        console.error('Error loading real data:', error);
        addConsoleLog(`❌ Error loading data: ${error.message}`, 'error');
    }
}

// Connect wallet button handler
async function connectWalletHandler() {
    addConsoleLog('🔗 Connecting wallet...', 'info');
    
    const result = await solanaIntegration.connectWallet();
    
    if (result.success) {
        addConsoleLog(`✅ Wallet connected: ${result.publicKey}`, 'success');
        addConsoleLog(`💰 Balance: ${result.balance.toFixed(4)} SOL`, 'info');
        
        // Update UI to show connected wallet
        showConnectedWallet(result.publicKey, result.balance);
    } else {
        addConsoleLog(`❌ Connection failed: ${result.error}`, 'error');
        alert('Failed to connect wallet. Please install Phantom or Solflare wallet extension.');
    }
}

// Create new wallet
async function createNewWallet() {
    try {
        addConsoleLog('🔑 Generating new wallet...', 'info');
        
        const wallet = solanaIntegration.createWallet();
        
        // Show the user their new wallet details
        showNewWalletModal(wallet);
        
        addConsoleLog(`✅ New wallet created: ${wallet.publicKey}`, 'success');
    } catch (error) {
        addConsoleLog(`❌ Error creating wallet: ${error.message}`, 'error');
    }
}

// Import wallet
async function importWalletHandler(privateKey, name) {
    try {
        addConsoleLog('📥 Importing wallet...', 'info');
        
        const result = solanaIntegration.importWallet(privateKey);
        
        if (result.success) {
            // Get real balance
            const balance = await solanaIntegration.getBalance(result.publicKey);
            
            const wallet = {
                name: name || `Wallet-${Date.now()}`,
                publicKey: result.publicKey,
                balance: balance,
                tags: [],
                timestamp: Date.now()
            };
            
            solanaIntegration.saveWallet(wallet);
            
            addConsoleLog(`✅ Wallet imported: ${result.publicKey}`, 'success');
            addConsoleLog(`💰 Balance: ${balance.toFixed(4)} SOL`, 'info');
            
            // Reload wallets
            await loadRealData();
        } else {
            addConsoleLog(`❌ Import failed: ${result.error}`, 'error');
        }
    } catch (error) {
        addConsoleLog(`❌ Error importing wallet: ${error.message}`, 'error');
    }
}

// Real SOL transfer
async function transferSOLHandler(fromPrivateKey, toPublicKey, amount) {
    try {
        addConsoleLog(`💸 Transferring ${amount} SOL...`, 'info');
        
        const result = await solanaIntegration.transferSOL(fromPrivateKey, toPublicKey, amount);
        
        if (result.success) {
            addConsoleLog(`✅ Transfer successful!`, 'success');
            addConsoleLog(`📝 Signature: ${result.signature}`, 'info');
            
            // Open Solscan
            window.open(`https://solscan.io/tx/${result.signature}`, '_blank');
            
            // Reload balances
            await loadRealData();
        } else {
            addConsoleLog(`❌ Transfer failed: ${result.error}`, 'error');
        }
    } catch (error) {
        addConsoleLog(`❌ Error: ${error.message}`, 'error');
    }
}

// Render wallets with real data
function renderWallets(wallets) {
    const tbody = document.getElementById('wallets-tbody');
    
    if (!tbody) return;
    
    if (wallets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-12">
                    <div class="text-gray-400">
                        <div class="text-6xl mb-4">🔑</div>
                        <div class="text-xl font-semibold mb-2">No Wallets Yet</div>
                        <div class="text-sm mb-6">Create or import a wallet to get started</div>
                        <button onclick="showCreateWalletModal()" class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium">
                            Create Wallet
                        </button>
                        <button onclick="showImportWalletModal()" class="bg-neutral-700 hover:bg-neutral-600 text-white px-6 py-3 rounded-lg font-medium ml-3">
                            Import Wallet
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = wallets.map((wallet, index) => `
        <tr class="border-b border-neutral-800 hover:bg-neutral-800/50">
            <td class="p-4">
                <input 
                    type="checkbox" 
                    class="wallet-checkbox" 
                    data-address="${wallet.publicKey}"
                    onchange="toggleWalletSelection('${wallet.publicKey}', this.checked)"
                >
            </td>
            <td class="p-4">
                <div class="flex items-center gap-2">
                    <span class="text-xl">${getWalletEmoji(index)}</span>
                    <span class="font-medium">${wallet.name}</span>
                </div>
            </td>
            <td class="p-4">
                <div class="flex gap-1">
                    ${(wallet.tags || []).map(tag => `<span class="text-lg">${tag}</span>`).join('')}
                </div>
            </td>
            <td class="p-4">
                <div class="font-mono text-sm text-gray-400" data-address>
                    ${truncateAddress(wallet.publicKey)}
                </div>
            </td>
            <td class="p-4 text-center">-</td>
            <td class="p-4 text-center">-</td>
            <td class="p-4">
                <div class="font-mono text-green-400">
                    ${wallet.balance.toFixed(4)} SOL
                </div>
                <div class="text-xs text-gray-500">
                    $${(wallet.usdValue || 0).toFixed(2)}
                </div>
            </td>
            <td class="p-4">
                <div class="flex gap-2">
                    <button 
                        onclick="viewOnSolscan('${wallet.publicKey}')" 
                        class="text-gray-400 hover:text-white"
                        title="View on Solscan"
                    >
                        👁️
                    </button>
                    <button 
                        onclick="copyAddress('${wallet.publicKey}')" 
                        class="text-gray-400 hover:text-white"
                        title="Copy Address"
                    >
                        📋
                    </button>
                    <button 
                        onclick="refreshWalletBalance('${wallet.publicKey}')" 
                        class="text-gray-400 hover:text-white"
                        title="Refresh Balance"
                    >
                        🔄
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Update total balance
function updateTotalBalance(wallets) {
    if (!wallets || wallets.length === 0) {
        const balanceElement = document.getElementById('total-balance');
        if (balanceElement) {
            balanceElement.textContent = '0.0000 SOL';
        }
        return;
    }
    
    const total = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    const balanceElement = document.getElementById('total-balance');
    
    if (balanceElement) {
        balanceElement.textContent = `${total.toFixed(4)} SOL`;
    }
}

// Update SOL price
function updateSOLPrice(price) {
    const priceElement = document.getElementById('sol-price');
    if (priceElement) {
        priceElement.textContent = `$${price.toFixed(2)}`;
    }
}

// Update RPC status
function updateRPCStatus(health) {
    const statusElement = document.getElementById('rpc-status');
    const dotElement = document.getElementById('rpc-dot');
    
    if (statusElement && dotElement) {
        if (health.healthy) {
            statusElement.textContent = 'Online';
            dotElement.className = 'w-2 h-2 bg-green-500 rounded-full animate-pulse';
        } else {
            statusElement.textContent = 'Offline';
            dotElement.className = 'w-2 h-2 bg-red-500 rounded-full';
        }
    }

    const apiStatusPill = document.getElementById('topbar-api-status');
    if (apiStatusPill) {
        apiStatusPill.setAttribute('aria-status', health.healthy ? 'online' : 'offline');
        const label = apiStatusPill.querySelector('.label');
        if (label) {
            label.textContent = health.healthy ? 'API Online' : 'API Offline';
        }
    }
}

// Refresh single wallet balance
async function refreshWalletBalance(publicKey) {
    try {
        addConsoleLog(`🔄 Refreshing balance for ${truncateAddress(publicKey)}...`, 'info');
        
        const balance = await solanaIntegration.getBalance(publicKey);
        
        addConsoleLog(`✅ Balance: ${balance.toFixed(4)} SOL`, 'success');
        
        // Reload all wallets
        await loadRealData();
    } catch (error) {
        addConsoleLog(`❌ Error refreshing balance: ${error.message}`, 'error');
    }
}

// Real-time updates
function startRealTimeUpdates() {
    // Update SOL price every 30 seconds
    setInterval(async () => {
        try {
            const price = await solanaIntegration.getSolPrice();
            updateSOLPrice(price);
            updateTopbarSyncTimestamp(Date.now());
        } catch (error) {
            console.error('Error updating price:', error);
        }
    }, 30000);
    
    // Check RPC health every 60 seconds
    setInterval(async () => {
        try {
            const health = await solanaIntegration.checkRPCHealth();
            updateRPCStatus(health);
        } catch (error) {
            console.error('Error checking RPC:', error);
        }
    }, 60000);
}

// Helper functions
function truncateAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getWalletEmojiByIndex(index) {
    const emojis = ['🐘', '🦜', '🦈', '🐈', '🦩', '🦒', '😺', '🐰', '🐟', '🐕', '🐢', '🦊'];
    return emojis[index % emojis.length];
}

function viewOnSolscan(address) {
    window.open(`https://solscan.io/account/${address}`, '_blank');
}

function copyAddress(address) {
    navigator.clipboard.writeText(address);
    addConsoleLog(`📋 Address copied: ${truncateAddress(address)}`, 'info');
}

function toggleWalletSelection(address, isSelected) {
    if (isSelected) {
        rtSelectedWallets.add(address);
    } else {
        rtSelectedWallets.delete(address);
    }
    updateBulkActionsUI();
}

function updateBulkActionsUI() {
    const bulkActions = document.getElementById('bulk-actions');
    if (bulkActions) {
        if (rtSelectedWallets.size > 0) {
            bulkActions.style.display = 'block';
            bulkActions.innerHTML = `${rtSelectedWallets.size} wallet(s) selected`;
        } else {
            bulkActions.style.display = 'none';
        }
    }
}

// Console logging
function addConsoleLog(message, type = 'info') {
    const consoleOutput = document.getElementById('console-output');
    if (!consoleOutput) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    const colorClass = type === 'success' ? 'text-green-400' : type === 'error' ? 'text-red-400' : 'text-blue-400';
    
    const logEntry = document.createElement('div');
    logEntry.className = `py-1 ${colorClass}`;
    logEntry.textContent = `[${timestamp}] ${emoji} ${message}`;
    
    consoleOutput.appendChild(logEntry);
    
    // Auto-scroll if enabled
    if (rtAutoScroll) {
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
}

function toggleAutoScroll() {
    rtAutoScroll = !rtAutoScroll;

    const label = document.getElementById('auto-scroll-text');
    if (label) {
        label.textContent = `Auto-scroll: ${rtAutoScroll ? 'ON' : 'OFF'}`;
    }

    addConsoleLog(`Console auto-scroll ${rtAutoScroll ? 'enabled' : 'paused'}`, 'info');
}

function clearConsole() {
    const consoleOutput = document.getElementById('console-output');
    if (!consoleOutput) return;

    consoleOutput.innerHTML = '';
    addConsoleLog('Console cleared', 'info');
}

function setupMintSelectionToggle() {
    // Handle tag page mint selection
    const tagRadios = document.querySelectorAll('input[name="mint-selection"]');
    const tagCustomWrapper = document.getElementById('tag-custom-mints-wrapper');

    const toggleTag = () => {
        if (!tagCustomWrapper) return;
        const selected = document.querySelector('input[name="mint-selection"]:checked');
        if (selected && selected.value === 'custom') {
            tagCustomWrapper.classList.remove('hidden');
        } else {
            tagCustomWrapper.classList.add('hidden');
        }
    };

    tagRadios.forEach(radio => {
        radio.addEventListener('change', toggleTag);
    });

    toggleTag();

    // Handle warm page mint selection
    const warmRadios = document.querySelectorAll('input[name="mint-warm"]');
    const warmCustomWrapper = document.getElementById('warm-custom-mints-wrapper');

    const toggleWarm = () => {
        if (!warmCustomWrapper) return;
        const selected = document.querySelector('input[name="mint-warm"]:checked');
        if (selected && selected.value === 'custom') {
            warmCustomWrapper.classList.remove('hidden');
        } else {
            warmCustomWrapper.classList.add('hidden');
        }
    };

    warmRadios.forEach(radio => {
        radio.addEventListener('change', toggleWarm);
    });

    toggleWarm();
}

const missingGlobalHandlers = [
    'executeWithdrawWallets',
    'executeTagWallets',
    'executeWarmWallets',
    'executeRedistributeWallets',
    'executeCreateToken',
    'executeCopyToken',
    'executeImportToken',
    'loadWalletsForTokenCreation',
    'selectTokenByMint',
    'executeQuickBuy',
    'executeQuickSell',
    'executePumpFunBuy',
    'executePumpFunSell',
    'executeAddLiquidity',
    'executeRemoveLiquidity',
    'executeManualSwap',
    'runQuickAction'
];

function ensureGlobalFunction(name) {
    if (typeof window[name] === 'function') {
        return;
    }

    const fallbackHandler = (...args) => {
        const message = `${name} is not available in this build yet.`;
        if (typeof notify === 'function') {
            notify(message, 'warning');
        } else {
            console.warn(message, { args });
        }
        return null;
    };

    fallbackHandler.__fallback = true;
    window[name] = fallbackHandler;
}

missingGlobalHandlers.forEach(ensureGlobalFunction);

// Expose navigateToPage globally for inline onclick handlers
function navigateToPage(page) {
    switchView(page);
}
window.navigateToPage = navigateToPage;

function hydrateTopBar() {
    updateActiveViewLabel(rtCurrentView);
    updateTopbarSyncTimestamp(Date.now());
}

function setupAnimatedViews() {
    const views = document.querySelectorAll('.view');
    views.forEach(view => {
        if (!view.classList.contains('animated-view')) {
            view.classList.add('animated-view');
        }
    });
    const activeView = Array.from(views).find(view => !view.classList.contains('hidden'));
    if (activeView) {
        activeView.classList.add('is-visible');
    }
}

function setupScrollObserver() {
    if (typeof IntersectionObserver === 'undefined') {
        return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        const selector = REVEAL_SELECTORS.join(',');
        document.querySelectorAll(selector).forEach(element => {
            if (!element.classList.contains('reveal-ready')) {
                element.classList.add('reveal-ready');
            }
            element.classList.add('is-visible');
        });
        revealObserver = null;
        return;
    }

    revealObserver = new IntersectionObserver(handleRevealIntersection, {
        threshold: 0.15,
        rootMargin: '0px 0px -20px'
    });

    refreshScrollAnimations();
}

function handleRevealIntersection(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            if (revealObserver) {
                revealObserver.unobserve(entry.target);
            }
        }
    });
}

function refreshScrollAnimations(context) {
    const scope = context || document;
    const selector = REVEAL_SELECTORS.join(',');
    const elements = scope.querySelectorAll(selector);

    if (!revealObserver) {
        elements.forEach(element => {
            if (!element.classList.contains('reveal-ready')) {
                element.classList.add('reveal-ready');
            }
            element.classList.add('is-visible');
        });
        return;
    }

    let delayIndex = 0;
    elements.forEach(element => {
        const isNew = !element.classList.contains('reveal-ready');
        if (isNew) {
            element.classList.add('reveal-ready');
        }

        if (context) {
            element.classList.remove('is-visible');
        }

        if (isNew || context) {
            const delay = Math.min(delayIndex * 35, 240);
            element.style.setProperty('--reveal-delay', `${delay}ms`);
            delayIndex += 1;
        }

        revealObserver.observe(element);
    });
}

function formatViewName(viewName) {
    if (!viewName) return '';
    return viewName
        .replace(/-/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function updateActiveViewLabel(viewName) {
    const titleEl = document.getElementById('current-view-label');
    const subtitleEl = document.getElementById('current-view-subtitle');
    if (!titleEl || !subtitleEl) return;

    const meta = VIEW_METADATA[viewName] || {};
    const fallbackTitle = formatViewName(viewName);

    titleEl.textContent = meta.title || fallbackTitle || 'Chaos Bot';

    const subtitleText = meta.subtitle || '';
    if (subtitleText) {
        subtitleEl.textContent = subtitleText;
        subtitleEl.classList.remove('hidden');
    } else {
        subtitleEl.classList.add('hidden');
    }
}

function updateTopbarSyncTimestamp(timestamp = Date.now()) {
    const syncEl = document.getElementById('topbar-sync-timestamp');
    if (!syncEl) return;

    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    syncEl.textContent = date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}
function setupMobileNavigation() {
    const toggle = document.getElementById('mobile-nav-toggle');
    const backdrop = document.getElementById('mobile-nav-backdrop');
    const sidebar = document.getElementById('primary-sidebar');

    if (!toggle || !sidebar) {
        return;
    }

    const closeSidebar = () => {
        if (!document.body.classList.contains('sidebar-open')) {
            return;
        }
        document.body.classList.remove('sidebar-open');
        toggle.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
    };

    const openSidebar = () => {
        document.body.classList.add('sidebar-open');
        toggle.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
    };

    closeMobileSidebar = closeSidebar;

    toggle.addEventListener('click', () => {
        if (document.body.classList.contains('sidebar-open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    if (backdrop) {
        backdrop.addEventListener('click', closeSidebar);
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeSidebar();
        }
    });

    const desktopQuery = window.matchMedia('(min-width: 1025px)');
    const handleDesktopChange = (event) => {
        if (event.matches) {
            closeSidebar();
        }
    };

    if (typeof desktopQuery.addEventListener === 'function') {
        desktopQuery.addEventListener('change', handleDesktopChange);
    } else if (typeof desktopQuery.addListener === 'function') {
        desktopQuery.addListener(handleDesktopChange);
    }

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.matchMedia('(max-width: 1024px)').matches) {
                closeSidebar();
            }
        });
    });
}

// Initialize event listeners
function initializeEventListeners() {
    console.log('Setting up navigation listeners...');
    
    // Navigation - simple direct approach
    const navItems = document.querySelectorAll('.nav-item');
    console.log(`Found ${navItems.length} nav items`);
    
    if (navItems.length === 0) {
        console.error('No nav items found! Make sure the HTML is loaded.');
        // Try again after a short delay
        setTimeout(initializeEventListeners, 100);
        return;
    }
    
    navItems.forEach((item, index) => {
        const viewName = item.getAttribute('data-view');
        console.log(`Setting up nav item ${index}: ${viewName}`);
        
        if (!viewName) {
            console.warn(`Nav item ${index} has no data-view attribute`);
            return;
        }
        
        // Add click listener directly (don't clone, just attach)
        item.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const clickedViewName = this.getAttribute('data-view');
            console.log(`✅ Nav item clicked: ${clickedViewName}`);
            
            if (clickedViewName) {
                switchView(clickedViewName);
            }
        });
        
        // Make it clearly clickable
        item.style.cursor = 'pointer';
        item.style.userSelect = 'none';
    });
    
    console.log('✅ Navigation listeners set up successfully');
}

// Auto-refresh for tokens page
let tokensAutoRefreshInterval = null;
const TOKENS_AUTO_REFRESH_INTERVAL_MS = 30000; // 30 seconds

function startTokensAutoRefresh() {
    if (tokensAutoRefreshInterval) {
        clearInterval(tokensAutoRefreshInterval);
    }
    
    tokensAutoRefreshInterval = setInterval(async () => {
        if (rtCurrentView === 'tokens') {
            await refreshAllLaunchedTokenStats();
        }
    }, TOKENS_AUTO_REFRESH_INTERVAL_MS);
}

function stopTokensAutoRefresh() {
    if (tokensAutoRefreshInterval) {
        clearInterval(tokensAutoRefreshInterval);
        tokensAutoRefreshInterval = null;
    }
}

async function refreshAllLaunchedTokenStats() {
    const importedRecords = Array.from(tokenRegistry.imported.values());
    const launchedTokens = importedRecords.filter(record => record.mint && record.type !== 'draft');
    
    if (launchedTokens.length === 0) {
        return;
    }
    
    // Refresh stats for all launched tokens
    const refreshPromises = launchedTokens.map(async (record) => {
        try {
            const stats = await fetchTokenPerformance(record.mint);
            if (stats) {
                // Update the record with new stats
                const existing = tokenRegistry.imported.get(record.mint) || {};
                const updated = {
                    ...existing,
                    ...record,
                    stats: {
                        ...existing.stats,
                        ...stats
                    },
                    priceUsd: stats.priceUsd || existing.priceUsd,
                    marketCapUsd: stats.marketCapUsd || existing.marketCapUsd,
                    volume24hUsd: stats.volume24hUsd || existing.volume24hUsd,
                    updatedAt: Date.now()
                };
                
                tokenRegistry.imported.set(record.mint, updated);
            }
        } catch (error) {
            // Silently handle API errors (5xx) - API might be down
            if (!error.message || (!error.message.includes('530') && !error.message.includes('503') && !error.message.includes('502'))) {
                console.debug(`Failed to refresh stats for ${record.mint}:`, error.message || error);
            }
        }
    });
    
    await Promise.all(refreshPromises);
    
    // Re-render the table with updated stats
    renderTokensTable();
    
    // If a token detail view is open, refresh it too
    if (tokenRegistry.current && tokenRegistry.current.mint) {
        const currentRecord = tokenRegistry.imported.get(tokenRegistry.current.mint);
        if (currentRecord) {
            loadLiveTokenDetail(currentRecord).catch(console.error);
        }
    }
}

function switchView(viewName) {
    console.log(`switchView called with: ${viewName}`);
    
    if (!viewName) {
        console.error('switchView called without viewName');
        return;
    }
    
    const previousView = rtCurrentView;
    if (previousView === 'token-detail' && viewName !== 'token-detail') {
        stopTokenActivityStream();
    }
    
    rtCurrentView = viewName;
    
    // Start/stop auto-refresh based on view
    if (viewName === 'tokens') {
        startTokensAutoRefresh();
        // Also refresh immediately when switching to tokens view
        refreshAllLaunchedTokenStats().catch(console.error);
    } else {
        stopTokensAutoRefresh();
    }
    
    // Hide ALL views and pages
    const allViews = document.querySelectorAll('.view');
    console.log(`Hiding ${allViews.length} views`);
    allViews.forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('is-visible');
    });
    
    // Show selected view - try -view first, then -page
    let selectedView = document.getElementById(`${viewName}-view`);
    if (!selectedView) {
        selectedView = document.getElementById(`${viewName}-page`);
    }
    
    if (selectedView) {
        selectedView.classList.remove('hidden');
        requestAnimationFrame(() => {
            selectedView.classList.add('is-visible');
        });
        console.log(`✅ Showing view: ${viewName}`);
    } else {
        console.error(`❌ View not found: ${viewName}-view or ${viewName}-page`);
        // List all available views for debugging
        const availableViews = Array.from(allViews).map(v => v.id).filter(id => id);
        console.log('Available views:', availableViews);
    }
    
    // Update navigation styling
    document.querySelectorAll('.nav-item').forEach(item => {
        const itemView = item.getAttribute('data-view');
        if (itemView === viewName) {
            // Active state
            item.className = 'nav-item flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition bg-purple-900 text-white';
        } else {
            // Inactive state
            item.className = 'nav-item flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition text-gray-400 hover:bg-neutral-800 hover:text-white';
        }
    });
    
    updateActiveViewLabel(viewName);

    if (selectedView) {
        refreshScrollAnimations(selectedView);
    } else {
        refreshScrollAnimations();
    }

    if (typeof closeMobileSidebar === 'function') {
        closeMobileSidebar();
    }
    
    // Load view-specific data
    if (viewName === 'wallets') {
        // Load wallets using wallet-operations if available
        if (window.walletOperations && window.walletOperations.loadWallets) {
            window.walletOperations.loadWallets();
        } else if (typeof loadRealData === 'function') {
            loadRealData();
        }
    } else if (viewName === 'tokens') {
        renderTokensTable();
    } else if (viewName === 'instant') {
        // Load instant trading data
        loadInstantTradingData();
        startInstantTradingRefresh();
    } else {
        // Stop refresh when leaving instant view
        stopInstantTradingRefresh();
    }

    if (viewName === 'token-detail') {
        // Ensure token detail data is loaded when navigating to this view
        if (tokenRegistry.current && tokenRegistry.current.mint) {
            const currentRecord = tokenRegistry.imported.get(tokenRegistry.current.mint) || tokenRegistry.current;
            if (currentRecord) {
                console.log('Loading token detail data for:', currentRecord.mint);
                loadLiveTokenDetail(currentRecord).catch(error => {
                    console.error('Failed to load token detail data:', error);
                    notify(`Unable to load token metrics: ${error.message || error}`, 'error');
                });
            } else {
                console.warn('Token detail view opened but no token record found');
            }
        } else {
            console.warn('Token detail view opened but no current token set');
        }
    }

    if (viewName === 'collect-fees') {
        initializeCollectFeesView();
        refreshCollectFeesView().catch(error => {
            console.error('Collect fees refresh failed:', error);
        });
    }

    if (viewName === 'create-token') {
        prepareCreateTokenView().catch(error => {
            console.error('Failed to prepare create token view:', error);
            notify(`Unable to prepare create token view: ${error.message}`, 'error');
        });
    }

    if (viewName === 'launch-token') {
        prepareLaunchTokenView()
            .then(() => {
                if (tokenLaunchState.pendingDraftId) {
                    const draft = tokenRegistry.drafts.get(tokenLaunchState.pendingDraftId);
                    if (draft) {
                        hydrateLaunchConfiguratorFromDraft(draft);
                    }
                }
            })
            .catch((error) => {
                console.error('Failed to prepare launch token view:', error);
                notify(`Unable to prepare launch token view: ${error.message}`, 'error');
        });
    }

    if (viewName === 'blueprint') {
        renderBlueprintList().catch((error) => {
            console.error('Failed to render blueprint list:', error);
        });
    }

    if (viewName === 'vanities') {
        renderVanityLaunchList();
        renderVanityList();
        refreshVanityLaunchPerformance().catch(error => {
            console.warn('Unable to refresh vanity launch performance:', error);
        });
    }

    if (viewName === 'settings') {
        initializeSettings();
        document.dispatchEvent(new Event('chaosSettingsViewOpened'));
    }

    // Update selected wallet counts for wallet operation pages
    if (['withdraw', 'warm', 'redistribute', 'tag', 'fund'].includes(viewName)) {
        const selectedCount = getSelectedWalletIds().length;
        const countElement = document.getElementById(`${viewName}-selected-count`);
        if (countElement) {
            countElement.textContent = selectedCount;
        }
        
        // Update fund selected wallets list and setup toggles
        if (viewName === 'fund') {
            updateFundSelectedWallets();
            setupFundSourceToggle();
        }
    }

    // Re-initialize Lucide icons for the new view
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    if (typeof addConsoleLog === 'function') {
        addConsoleLog(`📱 Switched to ${viewName} view`, 'info');
    }
}

// Token Launch with Automations
let pumpFunTrading;
let multiWalletManager;
let vanityGenerator;
let settingsManager;

const tokenLaunchState = {
    initialized: false,
    wallets: [],
    selectedWalletId: '',
    isUploading: false,
    isSavingDraft: false,
    isLaunching: false,
    launchConfig: createDefaultLaunchConfig(),
    launchControlsReady: false,
    walletGroups: [],
    isLoadingGroups: false,
    automationControlsReady: false,
    pendingDraftId: null,
    activeLaunchDraftId: null,
    automations: {
        smartSell: {
            mode: 'creator',
            walletIds: [],
            groupId: ''
        },
        volumeBot: {
            mode: 'creator',
            walletIds: [],
            groupId: ''
        }
    },
    image: {
        base64: null,
        uri: null,
        gatewayUrl: null,
        contentType: null,
        fileName: null,
        size: 0
    }
};

function resetLaunchConfigState() {
    tokenLaunchState.launchConfig = createDefaultLaunchConfig();
    refreshLaunchWalletDependencies();
    renderLaunchBlueprintSummary();
}

const blueprintFormState = {
    controlsReady: false
};

const PUMPFUN_IMAGE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB limit to match Pump.fun
const EMBED_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // Embed directly only if <= 2 MB

// Initialize PumpFun Trading
function initializePumpFun() {
    if (!pumpFunTrading && solanaIntegration) {
        const settingsProvider = () => window.settingsManager?.getSettings();
        pumpFunTrading = new PumpFunTrading(solanaIntegration, settingsProvider);
        console.log('✅ PumpFun Trading initialized');
    }
}

// Initialize Multi-Wallet Manager
function initializeMultiWallet() {
    if (!multiWalletManager && solanaIntegration) {
        multiWalletManager = new MultiWalletManager(solanaIntegration);
        blueprintService.fetchList(true).catch((error) => {
            console.warn('Failed to preload blueprint list:', error);
        });
        console.log('✅ Multi-Wallet Manager initialized');
    }
}

// Initialize Vanity Generator
function initializeVanity() {
    if (!vanityGenerator) {
        vanityGenerator = new VanityGenerator();
        console.log('✅ Vanity Generator initialized');
    }
}

// Initialize Settings Manager
function initializeSettings(force = false) {
    if (!solanaIntegration) {
        console.warn('Solana integration not ready for settings initialization');
        return;
    }

    if (!settingsManager || force) {
        if (!settingsManager) {
            settingsManager = new SettingsManager(solanaIntegration);
            console.log('✅ Settings Manager initialized');
        } else if (force) {
            settingsManager.applySettings();
        }

        window.settingsManager = settingsManager;
    }

    if (settingsManager) {
        settingsManager.applySettings();
        document.dispatchEvent(
            new CustomEvent('chaosSettingsManagerReady', {
                detail: settingsManager.getSettings()
            })
        );
    }
}

function getFunctionBase() {
    const apiBase = getApiBase();
    // If it's already a full URL (localhost) or custom base, use it
    if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
        return apiBase;
    }
    // Otherwise use /api (api-server.js handles /api routes)
    return '/api';
}

function truncateAddress(address) {
    if (!address || address.length < 10) return address || '';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

async function prepareCreateTokenView() {
    const walletSelect = getElement('token-creator-wallet');
    const walletStatus = getElement('token-wallet-status');

    if (!walletSelect) {
        console.warn('Create token wallet select not found');
        return;
    }

    if (!tokenLaunchState.initialized) {
        setupTokenImageUploader();
        walletSelect.addEventListener('change', (event) => {
            const value = event.target.value;
            if (value === '__import_creator__') {
                event.target.value = tokenLaunchState.selectedWalletId || '';
                openCreatorWalletModal();
                return;
            }
            tokenLaunchState.selectedWalletId = value;
        });
        tokenLaunchState.initialized = true;
    }

    await loadCreatorWallets();
    await ensureWalletGroupsLoaded();
    setupLaunchAutomationWalletControls();

    if (typeof window.selectTokenPlatform === 'function') {
        window.selectTokenPlatform(uiHelperState.tokenPlatform || 'pumpfun', { silent: true });
    }

    toggleSmartSellConfig();
    toggleVolumeBotConfig();

    if (walletStatus && tokenLaunchState.wallets.length === 0) {
        walletStatus.textContent = 'No creator wallets available. Create wallets from the Wallets view.';
    }

    refreshTokenImageStatus();
}

function setupTokenImageUploader() {
    const dropzone = getElement('token-image-dropzone');
    const input = getElement('token-image-input');

    if (input) {
        input.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (file) {
                handleTokenImageFile(file);
            }
            input.value = '';
        });
    }

    if (!dropzone) {
        return;
    }

    const highlight = () => dropzone.classList.add('border-purple-500', 'bg-neutral-900/40');
    const unhighlight = () => dropzone.classList.remove('border-purple-500', 'bg-neutral-900/40');

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            highlight();
        });
    });

    ['dragleave', 'dragend'].forEach(eventName => {
        dropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
            unhighlight();
            refreshTokenImageStatus();
        });
    });

    dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        event.stopPropagation();
        unhighlight();
        const file = event.dataTransfer?.files?.[0];
        if (file) {
            handleTokenImageFile(file);
        }
    });
}

async function loadCreatorWallets() {
    const walletSelect = getElement('token-creator-wallet');
    const walletStatus = getElement('token-wallet-status');

    if (!walletSelect) return;

    try {
        if (!window.apiClient) {
            throw new Error('API client unavailable');
        }

        if (!window.apiClient.isConnected) {
            await window.apiClient.initialize();
        }

        const response = await window.apiClient.getAllWallets();
        let wallets = Array.isArray(response?.wallets) ? response.wallets : [];
        wallets = ensureCreatorWalletIncluded(wallets);

        if (wallets.length) {
            populateCreatorWalletSelect(walletSelect, wallets, { walletStatus });
            tokenLaunchState.wallets = wallets;
            refreshLaunchWalletDependencies();
            return;
        }

        // Fall back to local wallets if backend has none (useful during migration)
        let localWallets = Array.isArray(window.solana?.wallets) ? window.solana.wallets : [];
        localWallets = ensureCreatorWalletIncluded(localWallets);
        if (localWallets.length) {
            populateCreatorWalletSelect(walletSelect, localWallets, {
                walletStatus,
                local: true
            });
            tokenLaunchState.wallets = localWallets;
            refreshLaunchWalletDependencies();
            return;
        }

        const creatorOnly = ensureCreatorWalletIncluded([]);
        if (creatorOnly.length) {
            populateCreatorWalletSelect(walletSelect, creatorOnly, {
                walletStatus,
                local: true
            });
            tokenLaunchState.wallets = creatorOnly;
        } else {
            populateCreatorWalletSelect(walletSelect, [], { walletStatus });
            tokenLaunchState.wallets = [];
        }
        refreshLaunchWalletDependencies();
    } catch (error) {
        console.error('Failed to load creator wallets:', error);
        const operationsWallets =
            typeof window.walletOperations?.getWallets === 'function'
                ? window.walletOperations.getWallets()
                : [];

        if (operationsWallets.length) {
            const enrichedOperations = ensureCreatorWalletIncluded(operationsWallets);
            populateCreatorWalletSelect(walletSelect, enrichedOperations, {
                walletStatus,
                local: !operationsWallets[0]?.id,
                error
            });
            tokenLaunchState.wallets = enrichedOperations;
            refreshLaunchWalletDependencies();
            return;
        }

        let localWallets = Array.isArray(window.solana?.wallets) ? window.solana.wallets : [];
        localWallets = ensureCreatorWalletIncluded(localWallets);

        if (localWallets.length) {
            populateCreatorWalletSelect(walletSelect, localWallets, {
                walletStatus,
                local: true,
                error
            });
            tokenLaunchState.wallets = localWallets;
            refreshLaunchWalletDependencies();
            return;
        } else {
            const creatorOnly = ensureCreatorWalletIncluded([]);
            if (creatorOnly.length) {
                populateCreatorWalletSelect(walletSelect, creatorOnly, {
                    walletStatus,
                    local: true,
                    error
                });
                tokenLaunchState.wallets = creatorOnly;
                refreshLaunchWalletDependencies();
                return;
            }
        }

        walletSelect.innerHTML = '<option value="">Unable to load wallets</option>';
        walletSelect.disabled = true;
        if (walletStatus) {
            walletStatus.textContent = `Unable to load wallets (${error.message}). Import wallets from the Wallets view.`;
            walletStatus.classList.remove('text-gray-500');
            walletStatus.classList.add('text-red-400');
        }
    }
}

function populateCreatorWalletSelect(selectEl, wallets, options = {}) {
    const walletStatus = options.walletStatus;
    const isLocal = options.local;
    const error = options.error;

    selectEl.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = wallets.length ? 'Select wallet...' : 'No wallets available';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    selectEl.appendChild(defaultOption);

    const seenKeys = new Set();
    let hasCreatorWallet = false;

    wallets.forEach(wallet => {
        const value = wallet.id || wallet.publicKey;
        if (!value) return;

        const key =
            normalizeValueForMatch(value) ||
            normalizeValueForMatch(wallet.address) ||
            normalizeValueForMatch(wallet.pubkey);
        if (key && seenKeys.has(key)) {
            return;
        }
        if (key) {
            seenKeys.add(key);
        }

        const option = document.createElement('option');
        option.value = value;
        const baseLabel = wallet.name || 'Unnamed';
        const suffix = isLocal ? ' (local)' : '';
        const balance =
            typeof wallet.balance === 'number'
                ? wallet.balance
                : typeof wallet.solBalance === 'number'
                ? wallet.solBalance
                : null;
        const balanceLabel = typeof balance === 'number' ? ` • ${balance.toFixed(4)} SOL` : '';
        option.textContent = `${baseLabel}${suffix} • ${truncateAddress(
            wallet.publicKey || wallet.address || value
        )}${balanceLabel}`;

        if (typeof balance === 'number') {
            option.dataset.balance = balance.toFixed(4);
        }
        const normalizedTags = Array.isArray(wallet.tags)
            ? wallet.tags.map(normalizeValueForMatch)
            : [];
        if (
            normalizedTags.includes('creator') ||
            normalizeValueForMatch(wallet.publicKey || wallet.address || wallet.id) ===
                normalizeValueForMatch(creatorWalletState.address)
        ) {
            option.dataset.creator = 'true';
            hasCreatorWallet = true;
        }
        if (!wallet.name && normalizedTags.includes('creator')) {
            option.textContent = `Creator Wallet${balanceLabel}`;
        }
        selectEl.appendChild(option);
    });

    if (!hasCreatorWallet) {
        const importOption = document.createElement('option');
        importOption.value = '__import_creator__';
        importOption.textContent = '➕ Import Creator Key';
        importOption.dataset.action = 'import';
        const insertPosition = selectEl.children[1] || null;
        selectEl.insertBefore(importOption, insertPosition);
    }

    if (wallets.length > 0) {
        selectEl.disabled = false;
        selectEl.removeAttribute('disabled');
    } else {
        selectEl.disabled = true;
    }

    if (tokenLaunchState.selectedWalletId) {
        const matchingOption = Array.from(selectEl.options).find(
            opt => opt.value === tokenLaunchState.selectedWalletId
        );
        if (matchingOption) {
            matchingOption.selected = true;
            defaultOption.selected = false;
        }
    } else {
        const viableOption = Array.from(selectEl.options).find(
            (option) => option.value && option.value !== '__import_creator__'
        );
        if (viableOption) {
            viableOption.selected = true;
            defaultOption.selected = false;
            tokenLaunchState.selectedWalletId = viableOption.value;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    if (!walletStatus) return;

    if (wallets.length) {
        const sourceLabel = isLocal ? 'local storage' : 'backend';
        const baseMessage = `${wallets.length} wallet${wallets.length === 1 ? '' : 's'} available (${sourceLabel}).`;
        walletStatus.textContent = error
            ? `${baseMessage} (Backend unavailable: ${error.message || error})`
            : baseMessage;
        walletStatus.classList.remove('text-red-400');
        walletStatus.classList.remove('text-yellow-300');
        walletStatus.classList.add('text-gray-500');
        if (isLocal) {
            walletStatus.textContent += ' Import them through the backend to enable automations.';
            walletStatus.classList.add('text-yellow-300');
        }
    } else {
        walletStatus.textContent = 'No creator wallets available. Add wallets from the backend manager.';
        walletStatus.classList.remove('text-gray-500');
        walletStatus.classList.add('text-red-400');
    }
}

function refreshTokenImageStatus(message) {
    const statusEl = getElement('token-image-status');
    const preview = getElement('token-image-preview');

    if (message) {
        statusEl && (statusEl.textContent = message);
        return;
    }

    if (tokenLaunchState.image.uri) {
        statusEl && (statusEl.textContent = 'Image uploaded to IPFS successfully.');
        statusEl && statusEl.classList.remove('text-gray-400');
        statusEl && statusEl.classList.add('text-green-400');
    } else if (tokenLaunchState.image.base64) {
        statusEl && (statusEl.textContent = 'Image selected. It will be uploaded during launch.');
        statusEl && statusEl.classList.remove('text-gray-400', 'text-red-400');
        statusEl && statusEl.classList.add('text-yellow-300');
    } else {
        statusEl && (statusEl.textContent = 'Click to upload an image or drag and drop');
        statusEl && statusEl.classList.remove('text-yellow-300', 'text-green-400', 'text-red-400');
        statusEl && statusEl.classList.add('text-gray-400');
    }

    if (preview) {
        preview.classList.toggle('hidden', !tokenLaunchState.image.base64);
        if (tokenLaunchState.image.base64) {
            preview.src = tokenLaunchState.image.base64;
        }
    }
}

function uploadTokenImage() {
    const input = getElement('token-image-input');
    if (input) {
        input.click();
    } else {
        notify('Image uploader unavailable in this build.', 'error');
    }
}

async function handleTokenImageFile(file) {
    const statusEl = getElement('token-image-status');

    if (!file) return;

    if (!file.type.startsWith('image/')) {
        notify('Please select a valid image file.', 'error');
        refreshTokenImageStatus();
        return;
    }

    if (file.size > PUMPFUN_IMAGE_MAX_BYTES) {
        notify('Pump.fun allows images up to 15MB. Please choose a smaller file.', 'error');
        refreshTokenImageStatus('Image too large (max 15MB).');
        return;
    }

    try {
        tokenLaunchState.isUploading = true;
        if (statusEl) {
            statusEl.textContent = 'Processing image...';
            statusEl.classList.remove('text-gray-400', 'text-green-400', 'text-yellow-300');
            statusEl.classList.add('text-blue-300');
        }

        const base64 = await readFileAsDataURL(file);
        tokenLaunchState.image = {
            base64,
            uri: null,
            gatewayUrl: null,
            contentType: file.type,
            fileName: file.name,
            size: file.size
        };

        refreshTokenImageStatus();
    } catch (error) {
        console.error('Failed to process image:', error);
        notify(`Failed to process image: ${error.message}`, 'error');
        tokenLaunchState.image = {
            base64: null,
            uri: null,
            gatewayUrl: null,
            contentType: null,
            fileName: null,
            size: 0
        };
        refreshTokenImageStatus('Image processing failed. Try again.');
    } finally {
        tokenLaunchState.isUploading = false;
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}
async function ensureTokenImageUploaded() {
    if (!tokenLaunchState.image.base64 || tokenLaunchState.image.uri) {
        return tokenLaunchState.image.uri || null;
    }

    const statusEl = getElement('token-image-status');

    try {
        tokenLaunchState.isUploading = true;
        if (statusEl) {
            statusEl.textContent = 'Uploading image to IPFS...';
            statusEl.classList.remove('text-gray-400', 'text-yellow-300', 'text-green-400', 'text-red-400');
            statusEl.classList.add('text-blue-300');
        }

        const functionBase = getFunctionBase();
        const response = await fetch(`${functionBase}/upload-token-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileName: tokenLaunchState.image.fileName,
                contentType: tokenLaunchState.image.contentType,
                data: tokenLaunchState.image.base64,
                metadata: {
                    source: 'create-token',
                    tokenName: getElement('token-name')?.value || ''
                }
            })
        });

        const payload = await response.json();
        if (!response.ok || !payload.success) {
            throw new Error(payload?.error || `Upload failed with status ${response.status}`);
        }

        tokenLaunchState.image.uri = payload.uri;
        tokenLaunchState.image.gatewayUrl = payload.url;

        refreshTokenImageStatus();
        return payload.uri;
    } catch (error) {
        console.error('Image upload failed:', error);
        const canEmbed =
            tokenLaunchState.image.base64 &&
            typeof tokenLaunchState.image.base64 === 'string' &&
            tokenLaunchState.image.base64.startsWith('data:') &&
            tokenLaunchState.image.size <= EMBED_IMAGE_MAX_BYTES;

        if (canEmbed) {
            notify('IPFS upload unavailable. Embedding image directly into metadata.', 'warning');
            refreshTokenImageStatus('Embedding image directly in metadata.');
            return tokenLaunchState.image.base64;
        }

        notify(`Image upload failed and cannot embed locally: ${error.message}`, 'error');
        refreshTokenImageStatus('Image upload failed. Launch will proceed without artwork.');
        return null;
    } finally {
        tokenLaunchState.isUploading = false;
    }
}

function setSaveTokenButtonLoading(isLoading, message) {
    const button = document.getElementById('save-token-btn');
    if (!button) return;
    button.disabled = isLoading;
    if (isLoading) {
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.textContent = message || 'Saving...';
        button.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
        button.textContent = button.dataset.originalText || '💾 Save Token';
        delete button.dataset.originalText;
        button.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}

function resetCreateTokenForm() {
    ['token-name', 'token-symbol', 'token-description', 'token-website', 'token-twitter', 'token-telegram'].forEach(id => {
        const el = getElement(id);
        if (el) el.value = '';
    });

    const useVanity = getElement('use-vanity');
    if (useVanity) useVanity.checked = false;

    const smartSell = getElement('enable-smart-sell');
    if (smartSell) {
        smartSell.checked = false;
        toggleSmartSellConfig();
    }

    const volumeBot = getElement('enable-volume-bot');
    if (volumeBot) {
        volumeBot.checked = false;
        toggleVolumeBotConfig();
    }

    const initialBuy = getElement('initial-buy-amount');
    if (initialBuy) initialBuy.value = '0';

    tokenLaunchState.image = {
        base64: null,
        uri: null,
        gatewayUrl: null,
        contentType: null,
        fileName: null
    };
    refreshTokenImageStatus();

    resetLaunchConfigState();
    tokenLaunchState.pendingDraftId = null;
    tokenLaunchState.activeLaunchDraftId = null;
}

// Toggle automation config sections
function toggleSmartSellConfig() {
    const checkbox = document.getElementById('enable-smart-sell');
    const config = document.getElementById('smart-sell-config');
    if (checkbox && config) {
        config.classList.toggle('hidden', !checkbox.checked);
    }
}

function toggleVolumeBotConfig() {
    const checkbox = document.getElementById('enable-volume-bot');
    const config = document.getElementById('volume-bot-config');
    if (checkbox && config) {
        config.classList.toggle('hidden', !checkbox.checked);
        toggleVolumeGuardrails();
    }
}

function toggleVolumeGuardrails() {
    const checkbox = document.getElementById('volume-bot-guardrails-enabled');
    const guardrailPanel = document.getElementById('volume-bot-guardrail-config');
    if (checkbox && guardrailPanel) {
        const volumeEnabled = Boolean(document.getElementById('enable-volume-bot')?.checked);
        guardrailPanel.classList.toggle('hidden', !checkbox.checked || !volumeEnabled);
    }
}

function toggleBlueprintVolumeGuardrails() {
    const checkbox = document.getElementById('blueprint-volume-guardrails-enabled');
    const guardrailPanel = document.getElementById('blueprint-volume-guardrail-config');
    if (checkbox && guardrailPanel) {
        const volumeEnabled = Boolean(document.getElementById('blueprint-volume-enabled')?.checked);
        guardrailPanel.classList.toggle('hidden', !checkbox.checked || !volumeEnabled);
    }
}

function getLaunchAutomationSelectors(type) {
    if (type === 'smartSell') {
        return {
            mode: 'smart-sell-wallet-mode',
            walletWrapper: 'smart-sell-wallets-wrapper',
            walletSelect: 'smart-sell-wallet-select',
            groupWrapper: 'smart-sell-group-wrapper',
            groupSelect: 'smart-sell-group-select'
        };
    }
    return {
        mode: 'volume-bot-wallet-mode',
        walletWrapper: 'volume-bot-wallets-wrapper',
        walletSelect: 'volume-bot-wallet-select',
        groupWrapper: 'volume-bot-group-wrapper',
        groupSelect: 'volume-bot-group-select'
    };
}

function getWalletIdentifier(wallet) {
    return wallet?.id || wallet?.publicKey || wallet?.address || '';
}

function buildWalletOptionLabel(wallet) {
    const name = wallet?.name?.trim() || 'Unnamed';
    const address = truncateAddress(wallet?.publicKey || wallet?.address || wallet?.id || '');
    const balance =
        typeof wallet?.balance === 'number'
            ? ` • ${wallet.balance.toFixed(Math.min(wallet.balance > 1 ? 2 : 4, 4))} SOL`
            : '';
    return `${name} • ${address}${balance}`;
}

function setupLaunchAutomationWalletControls() {
    const types = ['smartSell', 'volumeBot'];

    if (!tokenLaunchState.automationControlsReady) {
        types.forEach((type) => {
            const selectors = getLaunchAutomationSelectors(type);
            const modeSelect = getElement(selectors.mode);
            const walletSelect = getElement(selectors.walletSelect);
            const groupSelect = getElement(selectors.groupSelect);

            if (modeSelect) {
                modeSelect.addEventListener('change', (event) => {
                    handleLaunchAutomationModeChange(type, event.target.value);
                });
            }

            if (walletSelect) {
                walletSelect.addEventListener('change', () => handleLaunchAutomationWalletSelectionChange(type));
            }

            if (groupSelect) {
                groupSelect.addEventListener('change', () => handleLaunchAutomationGroupSelectionChange(type));
            }
        });

        tokenLaunchState.automationControlsReady = true;
    }

    populateLaunchAutomationWalletOptions();
    populateLaunchAutomationGroupOptions();
    types.forEach((type) => reflectLaunchAutomationState(type));
}

function populateLaunchAutomationWalletOptions() {
    const wallets = Array.isArray(tokenLaunchState.wallets) ? tokenLaunchState.wallets : [];
    const types = ['smartSell', 'volumeBot'];

    types.forEach((type) => {
        const selectors = getLaunchAutomationSelectors(type);
        const selectEl = getElement(selectors.walletSelect);
        const state = tokenLaunchState.automations[type];

        if (!selectEl || !state) {
            return;
        }

        const previousIds = Array.isArray(state.walletIds) ? [...state.walletIds] : [];
        const selectedSet = new Set((state.walletIds || []).map((id) => id.toLowerCase()));
        selectEl.innerHTML = '';

        if (wallets.length === 0) {
            state.walletIds = previousIds;
            return;
        }

        wallets.forEach((wallet) => {
            const value = getWalletIdentifier(wallet);
            if (!value) return;

            const option = document.createElement('option');
            option.value = value;
            option.textContent = buildWalletOptionLabel(wallet);
            option.selected = selectedSet.has(value.toLowerCase());
            selectEl.appendChild(option);
        });

        state.walletIds = getSelectValues(selectEl);
    });
}

function populateLaunchAutomationGroupOptions() {
    const groups = Array.isArray(tokenLaunchState.walletGroups) ? tokenLaunchState.walletGroups : [];
    const types = ['smartSell', 'volumeBot'];

    types.forEach((type) => {
        const selectors = getLaunchAutomationSelectors(type);
        const selectEl = getElement(selectors.groupSelect);
        const state = tokenLaunchState.automations[type];

        if (!selectEl || !state) {
            return;
        }

        const previousValue = state.groupId || '';

        selectEl.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select group...';
        selectEl.appendChild(defaultOption);

        groups.forEach((group) => {
            const value = group?.id || group?.name;
            if (!value) return;
            const option = document.createElement('option');
            option.value = value;
            const walletCount = Number(group.walletCount);
            const countLabel = Number.isFinite(walletCount) && walletCount > 0 ? ` (${walletCount} wallets)` : '';
            option.textContent = `${group.name || value}${countLabel}`;
            selectEl.appendChild(option);
        });

        if (previousValue && Array.from(selectEl.options).some((opt) => opt.value === previousValue)) {
            selectEl.value = previousValue;
        } else if (groups.length > 0) {
            selectEl.value = '';
            state.groupId = '';
        }
    });
}

function getLaunchWallets() {
    return Array.isArray(tokenLaunchState.wallets) ? tokenLaunchState.wallets : [];
}

function findLaunchWalletById(walletId) {
    if (!walletId) {
        return null;
    }
    const id = String(walletId);
    return getLaunchWallets().find((wallet) => getWalletIdentifier(wallet) === id) || null;
}

function populateLaunchDevWalletSelect() {
    const selectEl = getElement('launch-dev-wallet');
    const statusEl = getElement('launch-dev-wallet-status');
    if (!selectEl) {
        return;
    }

    const wallets = getLaunchWallets();
    selectEl.innerHTML = '';

    if (wallets.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No wallets available';
        option.disabled = true;
        option.selected = true;
        selectEl.appendChild(option);
        selectEl.disabled = true;

        if (statusEl) {
            statusEl.textContent = 'No creator wallets available. Create wallets from the Wallets view.';
            statusEl.classList.remove('text-gray-500');
            statusEl.classList.add('text-red-400');
        }
        return;
    }

    selectEl.disabled = false;
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select dev wallet...';
    defaultOption.disabled = true;
    selectEl.appendChild(defaultOption);

    let selectedId = tokenLaunchState.launchConfig.devWalletId || tokenLaunchState.selectedWalletId || '';
    let selectionFound = false;

    wallets.forEach((wallet) => {
        const walletId = getWalletIdentifier(wallet);
        if (!walletId) {
            return;
        }
        const option = document.createElement('option');
        option.value = walletId;
        option.textContent = buildWalletOptionLabel(wallet);
        if (selectedId && walletId === selectedId) {
            option.selected = true;
            selectionFound = true;
        }
        selectEl.appendChild(option);
    });

    if (!selectionFound) {
        const firstWallet = wallets[0];
        if (firstWallet) {
            const firstId = getWalletIdentifier(firstWallet);
            const matchingOption = Array.from(selectEl.options).find((opt) => opt.value === firstId);
            if (matchingOption) {
                matchingOption.selected = true;
                selectedId = firstId;
            }
        }
    }

    if (selectedId) {
        defaultOption.selected = false;
        tokenLaunchState.launchConfig.devWalletId = selectedId;
        tokenLaunchState.selectedWalletId = selectedId;
    } else {
        defaultOption.selected = true;
        tokenLaunchState.launchConfig.devWalletId = '';
        tokenLaunchState.selectedWalletId = '';
    }

    if (statusEl) {
        statusEl.textContent = `${wallets.length} wallet${wallets.length === 1 ? '' : 's'} available.`;
        statusEl.classList.remove('text-red-400');
        statusEl.classList.add('text-gray-500');
    }
}

function updateBlockZeroModeUI() {
    const state = tokenLaunchState.launchConfig.blockZero || {};
    const enabled = Boolean(state.enabled);
    const mode = state.mode || 'quick';
    const quickCard = getElement('block-zero-quick');
    if (quickCard) {
        const isActive = enabled && mode === 'quick';
        quickCard.classList.toggle('border-purple-500', isActive);
        quickCard.classList.toggle('bg-purple-900/20', isActive);
        quickCard.classList.toggle('border-neutral-700', !isActive);
    }
    uiHelperState.blockZeroMode = mode;
}

function renderBlockZeroWalletList() {
    const container = getElement('block-zero-wallets');
    const limitIndicator = getElement('block-zero-limit-indicator');
    if (!container) {
        return;
    }

    const state = tokenLaunchState.launchConfig.blockZero;
    const enabled = Boolean(state.enabled);
    const selections = state.selections || (state.selections = {});
    const wallets = getLaunchWallets();
    const devWalletId = tokenLaunchState.launchConfig.devWalletId || '';

    if (!enabled) {
        container.innerHTML = '<div class="text-sm text-gray-500">Enable Block Zero to configure snipe wallets.</div>';
        if (limitIndicator) {
            limitIndicator.textContent = '';
        }
        updateBlockZeroSummary();
        return;
    }

    const eligibleWallets = wallets.filter((wallet) => {
        const walletId = getWalletIdentifier(wallet);
        return walletId && walletId !== devWalletId;
    });

    if (eligibleWallets.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-500">No eligible wallets found. Import additional wallets first.</div>';
        if (limitIndicator) {
            limitIndicator.textContent = '';
        }
        updateBlockZeroSummary();
        return;
    }

    const selectedIds = Object.keys(selections);
    const selectionSet = new Set(selectedIds);
    const limitReached = selectedIds.length >= BLOCK_ZERO_MAX_SELECTIONS;

    container.innerHTML = eligibleWallets
        .map((wallet) => {
            const walletId = getWalletIdentifier(wallet);
            const selected = selectionSet.has(walletId);
            const disabled = !selected && limitReached;
            const balance = safeNumber(wallet.balance ?? wallet.solBalance);
            const balanceLabel = balance !== null ? formatSol(balance) : null;
            const storedAmount = safeNumber(selections[walletId]?.amount);
            const amountValue = storedAmount !== null ? storedAmount : '';
            return `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg" data-block-zero-wallet-row="${escapeHtml(walletId)}">
                    <label class="flex items-start gap-3 text-sm text-gray-200">
                        <input type="checkbox" class="rounded mt-1" data-block-zero-checkbox value="${escapeHtml(walletId)}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                        <div>
                            <div class="font-medium">${escapeHtml(wallet.name || 'Unnamed Wallet')}</div>
                            <div class="text-xs text-gray-500">${escapeHtml(truncateAddress(wallet.publicKey || wallet.address || wallet.id || walletId))}${balanceLabel ? ` • ${escapeHtml(balanceLabel)}` : ''}</div>
                        </div>
                    </label>
                    <div class="flex items-center gap-2">
                        <input type="number" class="w-28 bg-black border border-neutral-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-neutral-500" data-block-zero-amount value="${amountValue !== '' ? escapeHtml(String(amountValue)) : ''}" step="0.001" min="0" ${selected ? '' : 'disabled'}>
                        <span class="text-xs text-gray-500 uppercase">SOL</span>
                    </div>
                </div>
            `;
        })
        .join('');

    container.querySelectorAll('[data-block-zero-checkbox]').forEach((checkbox) => {
        checkbox.addEventListener('change', handleBlockZeroCheckboxChange);
    });

    container.querySelectorAll('[data-block-zero-amount]').forEach((input) => {
        input.addEventListener('input', handleBlockZeroAmountChange);
    });

    if (limitIndicator) {
        limitIndicator.textContent = `${Math.min(selectedIds.length, BLOCK_ZERO_MAX_SELECTIONS)}/${BLOCK_ZERO_MAX_SELECTIONS} selected`;
    }

    updateBlockZeroSummary();
}

function handleLaunchDevWalletChange(event) {
    const value = event?.target?.value || '';
    tokenLaunchState.launchConfig.devWalletId = value;
    tokenLaunchState.selectedWalletId = value;

    if (value && tokenLaunchState.launchConfig.blockZero.selections[value]) {
        delete tokenLaunchState.launchConfig.blockZero.selections[value];
    }

    renderBlockZeroWalletList();
}

function handleDevBuyAmountChange(event) {
    const value = safeNumber(event?.target?.value);
    if (value !== null && value >= 0) {
        tokenLaunchState.launchConfig.devBuyAmount = value;
    } else if (event?.target?.value === '') {
        tokenLaunchState.launchConfig.devBuyAmount = null;
    }
}

function handleBlockZeroToggle(event) {
    const enabled = Boolean(event?.target?.checked);
    tokenLaunchState.launchConfig.blockZero.enabled = enabled;
    if (!enabled) {
        tokenLaunchState.launchConfig.blockZero.selections = {};
    }
    renderBlockZeroWalletList();
}

function handleBlockZeroCheckboxChange(event) {
    const checkbox = event?.target;
    if (!checkbox) return;
    const walletId = checkbox.value;
    if (!walletId) return;

    const state = tokenLaunchState.launchConfig.blockZero;
    const selections = state.selections || (state.selections = {});

    if (checkbox.checked) {
        const currentCount = Object.keys(selections).length;
        if (currentCount >= BLOCK_ZERO_MAX_SELECTIONS) {
            checkbox.checked = false;
            notify(`Quick Scope supports up to ${BLOCK_ZERO_MAX_SELECTIONS} wallets.`, 'warning');
            return;
        }
        selections[walletId] = selections[walletId] || { amount: null };
    } else {
        delete selections[walletId];
    }

    renderBlockZeroWalletList();
}

function handleBlockZeroAmountChange(event) {
    const input = event?.target;
    if (!input) return;
    const walletRow = input.closest('[data-block-zero-wallet-row]');
    const walletId = walletRow?.getAttribute('data-block-zero-wallet-row');
    if (!walletId) return;

    const value = safeNumber(input.value);
    if (!tokenLaunchState.launchConfig.blockZero.selections[walletId]) {
        tokenLaunchState.launchConfig.blockZero.selections[walletId] = { amount: null };
    }

    if (value !== null && value >= 0) {
        tokenLaunchState.launchConfig.blockZero.selections[walletId].amount = value;
    } else if (input.value === '') {
        tokenLaunchState.launchConfig.blockZero.selections[walletId].amount = null;
    }

    updateBlockZeroSummary();
}

function updateBlockZeroSummary() {
    const summaryEl = getElement('block-zero-summary');
    if (!summaryEl) return;

    const state = tokenLaunchState.launchConfig.blockZero;
    if (!state.enabled) {
        summaryEl.classList.add('hidden');
        summaryEl.textContent = '';
        return;
    }

    const selections = state.selections || {};
    const selectedIds = Object.keys(selections);
    if (selectedIds.length === 0) {
        summaryEl.classList.add('hidden');
        summaryEl.textContent = '';
        return;
    }

    const totalAmount = selectedIds.reduce((sum, walletId) => {
        const amount = safeNumber(selections[walletId]?.amount);
        return sum + (amount !== null && amount >= 0 ? amount : 0);
    }, 0);

    summaryEl.textContent = `${selectedIds.length}/${BLOCK_ZERO_MAX_SELECTIONS} wallets selected • Total buy ${formatSol(totalAmount)}`;
    summaryEl.classList.remove('hidden');
}

async function prepareLaunchTokenView(options = {}) {
    const { forceWalletReload = false } = options;
    const pendingDraftId = tokenLaunchState.pendingDraftId || null;

    if (pendingDraftId) {
        if (tokenLaunchState.activeLaunchDraftId !== pendingDraftId) {
            const draft = tokenRegistry.drafts.get(pendingDraftId);
            const configSource =
                draft?.launchConfig ||
                {
                    devWalletId: draft?.creatorWalletId || draft?.creatorWallet || '',
                    devBuyAmount: draft?.initialBuyAmount,
                    blockZero: draft?.blockZero || {}
                };
            tokenLaunchState.launchConfig = cloneLaunchConfig(configSource);
            tokenLaunchState.activeLaunchDraftId = pendingDraftId;
        }
    } else if (tokenLaunchState.activeLaunchDraftId) {
        tokenLaunchState.activeLaunchDraftId = null;
        resetLaunchConfigState();
    }

    if (tokenLaunchState.launchConfig.devWalletId) {
        tokenLaunchState.selectedWalletId = tokenLaunchState.launchConfig.devWalletId;
    }

    if (forceWalletReload || getLaunchWallets().length === 0) {
        try {
            await loadCreatorWallets();
        } catch (error) {
            console.error('Failed to load creator wallets for launch view:', error);
        }
    }

    if (!tokenLaunchState.launchControlsReady) {
        const devWalletSelect = getElement('launch-dev-wallet');
        devWalletSelect?.addEventListener('change', handleLaunchDevWalletChange);

        const devBuyInput = getElement('dev-buy-amount');
        devBuyInput?.addEventListener('input', handleDevBuyAmountChange);

        const blockZeroToggle = getElement('enable-block-zero');
        blockZeroToggle?.addEventListener('change', handleBlockZeroToggle);

        const quickCard = getElement('block-zero-quick');
        quickCard?.addEventListener('click', () => selectBlockZeroMode('quick'));

        tokenLaunchState.launchControlsReady = true;
    }

    populateLaunchDevWalletSelect();

    const devBuyInput = getElement('dev-buy-amount');
    if (devBuyInput) {
        const value = safeNumber(tokenLaunchState.launchConfig.devBuyAmount);
        devBuyInput.value = value !== null ? value : '';
    }

    const blockZeroToggle = getElement('enable-block-zero');
    if (blockZeroToggle) {
        blockZeroToggle.checked = Boolean(tokenLaunchState.launchConfig.blockZero.enabled);
    }

    updateBlockZeroModeUI();
    renderBlockZeroWalletList();
    updateBlockZeroSummary();
    renderLaunchBlueprintSummary();
}

function handleLaunchAutomationModeChange(type, mode) {
    const state = tokenLaunchState.automations[type];
    if (!state) {
        return;
    }

    state.mode = mode || 'creator';

    if (state.mode !== 'custom') {
        state.walletIds = [];
    }

    if (state.mode !== 'group') {
        state.groupId = '';
    }

    reflectLaunchAutomationState(type);

    if (state.mode === 'custom') {
        handleLaunchAutomationWalletSelectionChange(type);
    } else if (state.mode === 'group') {
        handleLaunchAutomationGroupSelectionChange(type);
    }
}

function handleLaunchAutomationWalletSelectionChange(type) {
    const selectors = getLaunchAutomationSelectors(type);
    const selectEl = getElement(selectors.walletSelect);
    const state = tokenLaunchState.automations[type];

    if (!selectEl || !state) {
        return;
    }

    state.walletIds = getSelectValues(selectEl);
}

function handleLaunchAutomationGroupSelectionChange(type) {
    const selectors = getLaunchAutomationSelectors(type);
    const selectEl = getElement(selectors.groupSelect);
    const state = tokenLaunchState.automations[type];

    if (!selectEl || !state) {
        return;
    }

    state.groupId = selectEl.value || '';
}

function reflectLaunchAutomationState(type) {
    const state = tokenLaunchState.automations[type];
    if (!state) {
        return;
    }

    const selectors = getLaunchAutomationSelectors(type);
    const modeSelect = getElement(selectors.mode);
    const walletWrapper = getElement(selectors.walletWrapper);
    const groupWrapper = getElement(selectors.groupWrapper);
    const walletSelect = getElement(selectors.walletSelect);
    const groupSelect = getElement(selectors.groupSelect);

    if (modeSelect) {
        modeSelect.value = state.mode || 'creator';
    }

    if (walletWrapper) {
        walletWrapper.classList.toggle('hidden', state.mode !== 'custom');
    }

    if (groupWrapper) {
        groupWrapper.classList.toggle('hidden', state.mode !== 'group');
    }

    if (walletSelect) {
        const selectedSet = new Set((state.walletIds || []).map((id) => id.toLowerCase()));
        Array.from(walletSelect.options).forEach((option) => {
            option.selected = selectedSet.has(option.value.toLowerCase());
        });
    }

    if (groupSelect) {
        groupSelect.value = state.groupId || '';
    }
}

async function ensureWalletGroupsLoaded() {
    if (tokenLaunchState.walletGroups.length || tokenLaunchState.isLoadingGroups) {
        return;
    }

    tokenLaunchState.isLoadingGroups = true;

    try {
        const response = await fetch('/api/groups', {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-cache'
        });

        if (response.ok) {
            const payload = await response.json();
            if (Array.isArray(payload)) {
                tokenLaunchState.walletGroups = payload;
            } else if (Array.isArray(payload?.groups)) {
                tokenLaunchState.walletGroups = payload.groups;
            }
        } else {
            console.warn(`Wallet group request failed with status ${response.status}`);
        }
    } catch (error) {
        console.warn('Unable to load wallet groups:', error);
    } finally {
        tokenLaunchState.isLoadingGroups = false;
    }
}

function resolveLaunchAutomationSelection(type, creatorWalletId) {
    const state =
        tokenLaunchState.automations[type] ||
        {
            mode: 'creator',
            walletIds: [],
            groupId: ''
        };

    const selection = {
        mode: state.mode || 'creator',
        walletIds: [],
        groupId: state.groupId || ''
    };

    if (selection.mode === 'custom') {
        selection.walletIds = Array.isArray(state.walletIds) ? state.walletIds.filter(Boolean) : [];
    } else if (selection.mode === 'creator') {
        if (creatorWalletId) {
            selection.walletIds = [creatorWalletId];
        }
    }

    return selection;
}
function getWalletGroupById(groupId) {
    if (!groupId) {
        return null;
    }
    return (
        tokenLaunchState.walletGroups.find(
            (group) =>
                (group?.id && group.id === groupId) ||
                (group?.name && group.name === groupId)
        ) || null
    );
}

function validateAutomationSelection(label, selection) {
    if (!selection) {
        return { valid: false, message: `Missing wallet selection for ${label}.` };
    }

    if (selection.mode === 'custom' && (!Array.isArray(selection.walletIds) || selection.walletIds.length === 0)) {
        return { valid: false, message: `Select at least one wallet for ${label}.` };
    }

    if (selection.mode === 'group' && !selection.groupId) {
        return { valid: false, message: `Choose a wallet group for ${label}.` };
    }

    if (selection.mode === 'creator' && (!Array.isArray(selection.walletIds) || selection.walletIds.length === 0)) {
        return { valid: false, message: `Select a creator wallet before enabling ${label}.` };
    }

    return { valid: true };
}

function collectLaunchAutomations(creatorWalletId, options = {}) {
    const { onWarning } = options || {};
    const warnings = [];
    const automationsPayload = {};
    let smartSellConfig = null;
    let volumeBotConfig = null;

    const emitWarning = (type, message) => {
        warnings.push({ type, message });
        if (typeof onWarning === 'function') {
            try {
                onWarning(type, message);
            } catch (error) {
                console.warn('Automation warning handler failed:', error);
            }
        }
    };

    const enableSmartSell = document.getElementById('enable-smart-sell')?.checked || false;
    if (enableSmartSell) {
        const selection = resolveLaunchAutomationSelection('smartSell', creatorWalletId);
        const validation = validateAutomationSelection('Smart Sell', selection);
        if (!validation.valid) {
            emitWarning('smartSell', validation.message);
        } else {
            const config = {
                enabled: true,
                walletSelector: selection,
                walletMode: selection.mode,
                walletIds: selection.mode !== 'group' ? selection.walletIds : undefined,
                walletGroupId: selection.mode === 'group' ? selection.groupId : undefined,
                walletGroupName:
                    selection.mode === 'group'
                        ? getWalletGroupById(selection.groupId)?.name || null
                        : null,
                profitTarget: parseFloat(document.getElementById('smart-sell-profit')?.value || '30'),
                stopLoss: parseFloat(document.getElementById('smart-sell-stoploss')?.value || '-15'),
                trailingStop: parseFloat(
                    document.getElementById('smart-sell-trailing')?.value || '10'
                ),
                partialSells: Boolean(document.getElementById('smart-sell-partial')?.checked),
                sellPercentages: [25, 25, 25, 25]
            };

            if (!Array.isArray(config.walletIds) || config.walletIds.length === 0) {
                delete config.walletIds;
            }
            if (!config.walletGroupId) {
                delete config.walletGroupId;
            }
            if (!config.walletGroupName) {
                delete config.walletGroupName;
            }

            smartSellConfig = config;
            automationsPayload.smartSell = config;
        }
    }

    const enableVolumeBot = document.getElementById('enable-volume-bot')?.checked || false;
    if (enableVolumeBot) {
        const selection = resolveLaunchAutomationSelection('volumeBot', creatorWalletId);
        const validation = validateAutomationSelection('Volume Bot', selection);
        if (!validation.valid) {
            emitWarning('volumeBot', validation.message);
        } else {
            const readNumber = (id) => {
                const value = parseFloat(document.getElementById(id)?.value ?? '');
                return Number.isFinite(value) ? value : null;
            };

            const config = {
                enabled: true,
                walletSelector: selection,
                walletMode: selection.mode,
                walletIds: selection.mode !== 'group' ? selection.walletIds : undefined,
                walletGroupId: selection.mode === 'group' ? selection.groupId : undefined,
                walletGroupName:
                    selection.mode === 'group'
                        ? getWalletGroupById(selection.groupId)?.name || null
                        : null,
                buyAmount: parseFloat(document.getElementById('volume-bot-amount')?.value || '0.01'),
                sellDelay: parseInt(document.getElementById('volume-bot-delay')?.value || '30', 10),
                cycles: parseInt(document.getElementById('volume-bot-cycles')?.value || '10', 10),
                randomizeAmounts: Boolean(document.getElementById('volume-bot-randomize')?.checked),
                randomizeDelay: Boolean(
                    document.getElementById('volume-bot-randomize-delay')?.checked
                )
            };

            const minAmount = readNumber('volume-bot-min-amount');
            const maxAmount = readNumber('volume-bot-max-amount');
            if (minAmount !== null) config.minAmount = minAmount;
            if (maxAmount !== null) config.maxAmount = maxAmount;

            const buyInterval = readNumber('volume-bot-buy-interval');
            const buyIntervalMin = readNumber('volume-bot-buy-interval-min');
            const buyIntervalMax = readNumber('volume-bot-buy-interval-max');
            if (buyInterval !== null) config.buyIntervalSeconds = buyInterval;
            if (buyIntervalMin !== null) config.buyIntervalMinSeconds = buyIntervalMin;
            if (buyIntervalMax !== null) config.buyIntervalMaxSeconds = buyIntervalMax;

            const sellInterval = readNumber('volume-bot-sell-interval');
            const sellIntervalMin = readNumber('volume-bot-sell-interval-min');
            const sellIntervalMax = readNumber('volume-bot-sell-interval-max');
            if (sellInterval !== null) config.sellIntervalSeconds = sellInterval;
            if (sellIntervalMin !== null) config.sellIntervalMinSeconds = sellIntervalMin;
            if (sellIntervalMax !== null) config.sellIntervalMaxSeconds = sellIntervalMax;

            const sellPercentMin = readNumber('volume-bot-sell-percent-min');
            const sellPercentMax = readNumber('volume-bot-sell-percent-max');
            if (sellPercentMin !== null) config.sellPercentageMin = sellPercentMin;
            if (sellPercentMax !== null) config.sellPercentageMax = sellPercentMax;

            const guardrailToggle = document.getElementById('volume-bot-guardrails-enabled');
            const guardrailsEnabled = Boolean(guardrailToggle?.checked);
            const guardrails = {
                enabled: guardrailsEnabled,
                realizedProfitTarget: readNumber('volume-bot-profit-target'),
                realizedLossLimit: readNumber('volume-bot-loss-limit')
            };
            if (guardrails.realizedProfitTarget === null) {
                delete guardrails.realizedProfitTarget;
            }
            if (guardrails.realizedLossLimit === null) {
                delete guardrails.realizedLossLimit;
            }

            config.guardrails = guardrails;

            if (config.buyAmount && config.minAmount === undefined && config.maxAmount === undefined) {
                config.minAmount = config.buyAmount;
                config.maxAmount = config.buyAmount;
            }

            if (!Array.isArray(config.walletIds) || config.walletIds.length === 0) {
                delete config.walletIds;
            }
            if (!config.walletGroupId) {
                delete config.walletGroupId;
            }
            if (!config.walletGroupName) {
                delete config.walletGroupName;
            }

            volumeBotConfig = config;
            automationsPayload.volumeBot = config;
        }
    }

    return {
        automationsPayload,
        smartSellConfig,
        volumeBotConfig,
        warnings
    };
}

function openLaunchLinks(tokenMint) {
    if (!tokenMint) return;

    const settings =
        (window.settingsManager && typeof window.settingsManager.getSettings === 'function'
            ? window.settingsManager.getSettings()
            : window.__CHAOS_SETTINGS__) || {};

    const autoOpen = settings.customization?.autoOpenLinks || {};

    const builders = {
        solscan: (mint) => `https://solscan.io/token/${mint}`,
        axiom: (mint) => `https://axiom.xyz/token/${mint}`,
        gmgn: (mint) => `https://gmgn.ai/swap/sol/${mint}`,
        pumpfun: (mint) => `https://pump.fun/coin/${mint}`,
        raydium: (mint) => `https://raydium.io/swap/?inputMint=sol&outputMint=${mint}`,
        bonk: (mint) => `https://bonkbot.io/?mint=${mint}`
    };

    Object.entries(autoOpen).forEach(([key, enabled]) => {
        if (!enabled) return;
        const builder = builders[key];
        if (!builder) return;
        try {
            const url = builder(tokenMint);
            if (url) {
                window.open(url, '_blank', 'noopener');
            }
        } catch (error) {
            console.warn(`Failed to open ${key} link for mint ${tokenMint}:`, error);
        }
    });
}

// Save Token Draft (Pre-Launch)
async function executeSaveTokenDraft() {
    if (tokenLaunchState.isSavingDraft) {
        notify('Save already in progress...', 'warning');
            return;
        }

        const name = document.getElementById('token-name')?.value?.trim();
        const symbol = document.getElementById('token-symbol')?.value?.trim();
        const description = document.getElementById('token-description')?.value?.trim();
        const website = document.getElementById('token-website')?.value?.trim();
        const twitter = document.getElementById('token-twitter')?.value?.trim();
        const telegram = document.getElementById('token-telegram')?.value?.trim();
        const useVanity = document.getElementById('use-vanity')?.checked || false;
    const initialBuyAmount = safeNumber(document.getElementById('initial-buy-amount')?.value);

        if (!name || !symbol) {
        notify('Token name and symbol are required to save a draft.', 'error');
        addConsoleLog('❌ Draft save aborted: missing name or symbol.', 'error');
            return;
        }

        const platform = uiHelperState.tokenPlatform || 'pumpfun';
        if (platform !== 'pumpfun') {
            notify(`Platform ${platform} is not supported yet. Please choose Pump.fun.`, 'error');
            addConsoleLog(`❌ Unsupported platform selected: ${platform}`, 'error');
            if (typeof window.selectTokenPlatform === 'function') {
                window.selectTokenPlatform('pumpfun');
            }
            return;
        }

    const creatorWalletId = tokenLaunchState.selectedWalletId || '';
    if (!creatorWalletId) {
        addConsoleLog('⚠️ No creator wallet selected. Draft will save, but assign a wallet before launch.', 'warning');
    }

    try {
        tokenLaunchState.isSavingDraft = true;
        setSaveTokenButtonLoading(true, 'Saving...');
        addConsoleLog('💾 Saving token configuration as draft...', 'info');

        const automationResult = collectLaunchAutomations(creatorWalletId, {
            onWarning: (type, message) => {
                const label = type === 'smartSell' ? 'Smart Sell' : 'Volume Bot';
                notify(`${message} Draft saved without ${label}.`, 'warning');
                addConsoleLog(`⚠️ ${label} disabled for draft: ${message}`, 'warning');
            }
        });

        const automationsPayload = automationResult.automationsPayload;
        const smartSellConfig = automationResult.smartSellConfig;
        const volumeBotConfig = automationResult.volumeBotConfig;

        const imageUri = await ensureTokenImageUploaded();
        const gatewayImage = tokenLaunchState.image.gatewayUrl || null;
        const normalizedImage = gatewayImage || resolveImageUrl(imageUri) || null;
        const embeddedImage =
            normalizedImage || !tokenLaunchState.image.base64 ? null : tokenLaunchState.image.base64;

        const metadata = {
            name,
            symbol,
            description,
            image: imageUri || undefined,
            twitter: twitter || undefined,
            telegram: telegram || undefined,
            website: website || undefined
        };

        const now = Date.now();
        const draftId = `draft-${now}-${Math.random().toString(36).slice(2, 8)}`;
        const walletDetails = resolveCreatorWalletDetails(creatorWalletId) || {};

        const launchConfig = cloneLaunchConfig({
            devWalletId: tokenLaunchState.launchConfig?.devWalletId || creatorWalletId || '',
            devBuyAmount:
                tokenLaunchState.launchConfig?.devBuyAmount ??
                (Number.isFinite(initialBuyAmount) ? initialBuyAmount : null),
            blockZero: tokenLaunchState.launchConfig?.blockZero || {}
        });

        const draftRecord = {
            id: draftId,
            type: 'draft',
            status: 'PRE-LAUNCH',
                        name,
                        symbol,
            description,
            website,
            twitter,
            telegram,
            image: normalizedImage || embeddedImage,
            imageUri: imageUri || tokenLaunchState.image.uri || null,
            imageBase64: embeddedImage,
                        platform,
            launchpad: 'Pump.fun',
            useVanity,
            automations: automationsPayload,
            automationsEnabled: {
                smartSell: Boolean(smartSellConfig),
                volumeBot: Boolean(volumeBotConfig)
            },
            creatorWalletId: creatorWalletId || '',
            creatorWallet: walletDetails.address || '',
                        creatorWalletLabel: walletDetails.name || '',
            createdAt: now,
            updatedAt: now,
            initialBuyAmount: Number.isFinite(initialBuyAmount) ? initialBuyAmount : null,
            metadata,
            metadataUri: null,
            notes: '',
            launchConfig
        };

        registerTokenDraft(draftRecord);
        tokenLaunchState.pendingDraftId = draftId;

        notify('Token saved as pre-launch draft. Manage it from the Tokens dashboard.', 'success');
        addConsoleLog('✅ Token draft saved to dashboard.', 'success');

            resetCreateTokenForm();
            setTimeout(() => {
                switchView('tokens');
        }, 600);
    } catch (error) {
        console.error('Token draft save failed:', error);
        notify(`Save failed: ${error.message}`, 'error');
        addConsoleLog(`❌ Draft save failed: ${error.message}`, 'error');
    } finally {
        tokenLaunchState.isSavingDraft = false;
        setSaveTokenButtonLoading(false);
    }
}

async function executeLaunchToken() {
    if (tokenLaunchState.isLaunching) {
        notify('Launch already in progress...', 'warning');
        return;
    }

    const launchButtonId = 'launch-token-submit';
    const labelForAutomation = (type) => (type === 'smartSell' ? 'Smart Sell' : 'Volume Bot');

    try {
        tokenLaunchState.isLaunching = true;
        setButtonLoading(launchButtonId, true, 'Launching...');
        addConsoleLog('🚀 Launch sequence initiated...', 'info');

        const activeDraftId =
            tokenLaunchState.activeLaunchDraftId ||
            tokenLaunchState.pendingDraftId ||
            (tokenRegistry.current?.type === 'draft' ? tokenRegistry.current.id : null);

        const draft = activeDraftId ? tokenRegistry.drafts.get(activeDraftId) : null;
        if (!draft) {
            throw new Error('Load or save a token draft before launching.');
        }

        const platform = draft.platform || uiHelperState.tokenPlatform || 'pumpfun';
        if (platform !== 'pumpfun') {
            throw new Error(`Platform ${platform} is not supported yet.`);
        }

        const creatorWalletId =
            tokenLaunchState.launchConfig?.devWalletId ||
            tokenLaunchState.selectedWalletId ||
            draft.creatorWalletId ||
            draft.creatorWallet ||
            '';

        if (!creatorWalletId) {
            throw new Error('Select a creator wallet before launching.');
        }

        const creatorWalletDetails = resolveCreatorWalletDetails(creatorWalletId) || {};

        const name = draft.name || draft.metadata?.name || '';
        const symbol = draft.symbol || draft.metadata?.symbol || '';
        if (!name || !symbol) {
            throw new Error('Draft is missing token name or symbol.');
        }

        const description = draft.description || draft.metadata?.description || '';
        const website = draft.website || draft.metadata?.website || draft.metadata?.external_url || '';
        const twitter = draft.twitter || draft.metadata?.twitter || '';
        const telegram = draft.telegram || draft.metadata?.telegram || '';

        const draftImageUrl = resolveImageUrl(
            draft.imageUri || draft.image || draft.metadata?.image || ''
        );
        if (draft.imageBase64 && !tokenLaunchState.image.base64) {
            tokenLaunchState.image.base64 = draft.imageBase64;
        }
        if (draftImageUrl) {
            tokenLaunchState.image.uri = tokenLaunchState.image.uri || draftImageUrl;
            tokenLaunchState.image.gatewayUrl = tokenLaunchState.image.gatewayUrl || draftImageUrl;
        }

        const imageUri = await ensureTokenImageUploaded();
        const metadata = {
            name,
            symbol,
            description,
            image: imageUri || draftImageUrl || undefined,
            twitter: twitter || undefined,
            telegram: telegram || undefined,
            website: website || undefined
        };

        const initialBuyFromState = safeNumber(tokenLaunchState.launchConfig?.devBuyAmount);
        const initialBuy =
            (Number.isFinite(initialBuyFromState) && initialBuyFromState >= 0
                ? initialBuyFromState
                : null) ??
            (Number.isFinite(draft.initialBuyAmount) && draft.initialBuyAmount >= 0
                ? draft.initialBuyAmount
                : 0);

        const automationResult = collectLaunchAutomations(creatorWalletId, {
            onWarning: (type, message) => {
                const label = labelForAutomation(type);
                notify(`${label} disabled: ${message}`, 'warning');
                addConsoleLog(`⚠️ ${label} disabled for launch: ${message}`, 'warning');
            }
        });

        const launchConfig = serializeLaunchConfig(tokenLaunchState.launchConfig);
        const options = {
            platform,
            useVanity: Boolean(draft.useVanity),
            blockZero: launchConfig.blockZero,
            automations: automationResult.automationsPayload,
            metadataUri: draft.metadataUri || null,
            draftId: draft.id,
            appliedBlueprint: launchConfig.appliedBlueprint || null
        };

        notify('Submitting launch transaction...', 'info');
        addConsoleLog(
            `🚀 Launching ${name} (${symbol}) using creator wallet ${creatorWalletId}...`,
            'info'
        );

        const launchResponse = await window.apiClient.launchToken(
            creatorWalletId,
            metadata,
            Number(initialBuy) || 0,
            options
        );

        if (!launchResponse?.success) {
            throw new Error(launchResponse?.error || launchResponse?.message || 'Launch failed');
        }

        notify('Token launched successfully!', 'success');
        addConsoleLog(`✅ Token launched: ${launchResponse.tokenMint}`, 'success');

        const launchRecord = {
            tokenMint: launchResponse.tokenMint,
            name,
            symbol,
            platform,
            logo: metadata.image || draftImageUrl || null,
            metadataUri: launchResponse.metadataUri || draft.metadataUri || null,
            creatorWalletId,
            creatorWallet: creatorWalletDetails.address || draft.creatorWallet || '',
            creatorWalletLabel: creatorWalletDetails.name || draft.creatorWalletLabel || '',
            initialBuyAmount: Number(initialBuy) || 0,
            launchedAt: Date.now(),
            appliedBlueprint: launchConfig.appliedBlueprint || null
        };

        await recordTokenLaunch(launchRecord);
        registerImportedToken({
            mint: launchResponse.tokenMint,
            name,
            symbol,
            description: metadata.description || draft.description || '',
            image: launchRecord.logo || metadata.image || draftImageUrl,
            metadataUri: launchResponse.metadataUri || draft.metadataUri || null,
            twitter: metadata.twitter || draft.twitter,
            telegram: metadata.telegram || draft.telegram,
            website: metadata.website || draft.website,
            platform,
            creatorWalletId,
            creatorWallet: launchRecord.creatorWallet,
            creatorWalletLabel: launchRecord.creatorWalletLabel,
            initialBuyAmount: Number(initialBuy) || 0,
            status: 'Launched',
            type: 'imported',
            launchedAt: Date.now()
        });

        if (draft.id) {
            removeTokenDraft(draft.id);
        }

        tokenLaunchState.pendingDraftId = null;
        tokenLaunchState.activeLaunchDraftId = null;
        resetLaunchConfigState();
        if (typeof updateCreatorWalletSummary === 'function') {
            updateCreatorWalletSummary();
        }

        openLaunchLinks(launchResponse.tokenMint);

        // Execute blueprint if one was applied
        if (launchConfig.appliedBlueprint?.id) {
            try {
                addConsoleLog(`🔄 Executing blueprint for launched token...`, 'info');
                
                // Refresh blueprint list to get latest data
                await blueprintService.fetchList(true);
                
                const blueprint = blueprintService.getById(launchConfig.appliedBlueprint.id);
                if (blueprint) {
                    // Update blueprint settings with the new token mint
                    const updatedBlueprint = {
                        ...blueprint,
                        settings: {
                            ...blueprint.settings,
                            tokenMint: launchResponse.tokenMint
                        }
                    };
                    
                    // Update the blueprint in the store with the new token mint
                    try {
                        const updatePayload = buildBlueprintApiPayload(updatedBlueprint);
                        await blueprintService.update(blueprint.id, updatePayload);
                    } catch (updateError) {
                        console.warn('Failed to update blueprint token mint, executing with current settings:', updateError);
                    }
                    
                    // Execute the blueprint
                    addConsoleLog(`🚀 Starting blueprint "${blueprint.name}" for token ${launchResponse.tokenMint}...`, 'info');
                    const run = await blueprintService.execute(blueprint.id);
                    
                    if (run) {
                        notify(`Blueprint "${blueprint.name}" started successfully!`, 'success');
                        addConsoleLog(`✅ Blueprint execution started (Run ID: ${run.id})`, 'success');
                    } else {
                        throw new Error('Blueprint execution returned no run ID');
                    }
                } else {
                    addConsoleLog(`⚠️ Blueprint ${launchConfig.appliedBlueprint.id} not found`, 'warning');
                }
            } catch (blueprintError) {
                console.error('Failed to execute blueprint after launch:', blueprintError);
                addConsoleLog(`❌ Blueprint execution failed: ${blueprintError.message}`, 'error');
                notify(`Blueprint execution failed: ${blueprintError.message}`, 'warning');
                // Don't fail the entire launch if blueprint execution fails
            }
        }

        try {
            await loadCreatorWallets();
        } catch (walletError) {
            console.warn('Unable to refresh creator wallets after launch:', walletError);
        }

        if (typeof window.walletOperations?.loadWallets === 'function') {
            try {
                await window.walletOperations.loadWallets();
            } catch (opsError) {
                console.warn('Unable to refresh wallet operations after launch:', opsError);
            }
        }
    } catch (error) {
        console.error('Token launch failed:', error);
        notify(`Launch failed: ${error.message}`, 'error');
        addConsoleLog(`❌ Token launch failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(launchButtonId, false);
        tokenLaunchState.isLaunching = false;
    }
}

async function executeCopyToken() {
    const button = document.getElementById('copy-token-submit');
    try {
        const mintInput = document.getElementById('copy-mint-address');
        const useVanityInput = document.getElementById('copy-use-vanity');
        const mintAddress = mintInput?.value?.trim() || '';
        const platform = uiHelperState.copyPlatform || 'pumpfun';
        const useVanity = Boolean(useVanityInput?.checked);

        if (!mintAddress) {
            notify('Enter the source mint you want to copy.', 'warning');
            mintInput?.focus();
            return;
        }

        if (!validateMintAddress(mintAddress)) {
            notify('That mint address is not valid. Please double-check it.', 'error');
            mintInput?.focus();
            return;
        }

        if (platform !== 'pumpfun') {
            notify(`Copying via ${platform} isn't supported yet. Choose Pump.fun.`, 'warning');
            return;
        }

        const walletId = await resolveCreatorWalletId();

        setButtonLoading(button, true, 'Copying token…');
        await ensureApiClientReady();

        addConsoleLog(`📋 Copying token ${mintAddress} with wallet ${walletId}...`, 'info');
        notify('Copying token metadata and deploying new mint on Pump.fun…', 'info');

        const response = await window.apiClient.copyToken(walletId, mintAddress, {
            platform,
            useVanity
        });

        if (!response?.success) {
            throw new Error(response?.error || 'Copy request failed');
        }

        const copiedMetadata = response.copiedMetadata || {};
        const template = response.draftTemplate || {};
        const walletDetails = resolveCreatorWalletDetails(walletId) || {};
        const now = Date.now();
        const draftId = template.id || `draft-${now}-${Math.random().toString(36).slice(2, 8)}`;
        const rawImage = copiedMetadata.image || template.image || '';
        const normalizedImage = resolveImageUrl(rawImage) || rawImage || null;
        const metadataUri =
            response.metadataUri ||
            template.metadataUri ||
            copiedMetadata.metadataUri ||
            '';

        const draftRecord = {
            id: draftId,
            type: 'draft',
            status: 'PRE-LAUNCH',
            name: copiedMetadata.name || template.name || '',
            symbol: copiedMetadata.symbol || template.symbol || '',
            description: copiedMetadata.description || template.description || '',
            website: template.website || copiedMetadata.website || '',
            twitter: template.twitter || copiedMetadata.twitter || '',
            telegram: template.telegram || copiedMetadata.telegram || '',
            image: normalizedImage,
            imageUri: rawImage || null,
            platform,
            launchpad: 'Pump.fun',
            sourceMint: mintAddress,
            creatorWalletId: walletId || '',
            creatorWallet: walletDetails.address || '',
            creatorWalletLabel: walletDetails.name || '',
            createdAt: now,
            updatedAt: now,
            metadata: copiedMetadata,
            metadataUri,
            useVanity: Boolean(useVanity),
            automations: {},
            automationsEnabled: {},
            initialBuyAmount: null
        };

        registerTokenDraft(draftRecord);
        tokenLaunchState.pendingDraftId = draftRecord.id;
        tokenLaunchState.activeLaunchDraftId = draftRecord.id;
        tokenLaunchState.launchConfig = cloneLaunchConfig({
            devWalletId: walletId || '',
            devBuyAmount: null,
            blockZero: {}
        });
        tokenLaunchState.selectedWalletId = walletId || tokenLaunchState.selectedWalletId || '';

        populateTokenDetailView(draftRecord);

        addConsoleLog(
            `✅ Token metadata copied into draft ${draftRecord.name || draftRecord.symbol || draftRecord.id}`,
            'success'
        );
        notify('Token metadata copied into your drafts. Configure it from the Tokens tab.', 'success');

        navigateToPage('tokens');
    } catch (error) {
        console.error('Copy token error:', error);
        notify(`Copy failed: ${error.message}`, 'error');
        addConsoleLog(`❌ Copy token failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

async function executeImportToken() {
    const button = document.getElementById('import-token-submit');
    try {
        const mintInput = document.getElementById('import-mint-address');
        const mintAddress = mintInput?.value?.trim() || '';
        const platform = 'pumpfun';

        if (!mintAddress) {
            notify('Enter the mint address you want to import.', 'warning');
            mintInput?.focus();
            return;
        }

        if (!validateMintAddress(mintAddress)) {
            notify('That mint address is not valid. Please double-check it.', 'error');
            mintInput?.focus();
            return;
        }

        // First, check if token is already in our registry (launched through this app)
        const existingToken = tokenRegistry.imported.get(mintAddress);
        if (existingToken && existingToken.name && existingToken.symbol) {
            addConsoleLog(`✅ Found existing token data for ${mintAddress}`, 'info');
            notify(`Token already imported: ${existingToken.name || existingToken.symbol}`, 'info');
            populateTokenDetailView(existingToken);
            renderTokensTable();
            navigateToPage('token-detail');
            return;
        }

        setButtonLoading(button, true, 'Importing token…');
        await ensureApiClientReady();

        addConsoleLog(`📥 Importing token ${mintAddress}...`, 'info');
        notify('Fetching token metadata from multiple sources…', 'info');

        // Try backend API first
        let response = null;
        let info = {};
        
        try {
            response = await window.apiClient.importToken(mintAddress, { platform });
            if (response?.success && response.token) {
                info = response.token;
            }
        } catch (apiError) {
            console.debug('Backend API import failed, trying frontend fallbacks:', apiError.message);
        }
        
        // Enhanced frontend metadata fetching with multiple fallbacks
        // This ensures we get name, symbol, and image even if backend fails
        if (!info.name || !info.symbol || !info.image) {
            try {
                const enhancedMetadata = await fetchPumpFunTokenDetails(mintAddress);
                if (enhancedMetadata) {
                    // Merge enhanced metadata, prioritizing existing values
                    info = {
                        ...info,
                        name: info.name || enhancedMetadata.name || null,
                        symbol: info.symbol || enhancedMetadata.symbol || null,
                        image: info.image || enhancedMetadata.image || enhancedMetadata.logoURI || null,
                        description: info.description || enhancedMetadata.description || null,
                        marketCap: info.marketCap || enhancedMetadata.marketCap || null,
                        price: info.price || enhancedMetadata.priceUsd || null,
                        website: info.website || enhancedMetadata.website || null,
                        twitter: info.twitter || enhancedMetadata.twitter || null,
                        telegram: info.telegram || enhancedMetadata.telegram || null
                    };
                }
            } catch (metadataError) {
                console.debug('Enhanced metadata fetch failed:', metadataError.message);
            }
        }

        const record = {
            mint: info.mint || mintAddress,
            name: info.name || 'Imported Token',
            symbol: info.symbol || mintAddress.slice(0, 4).toUpperCase() || '',
            description: info.description || '',
            image: info.image || '',
            status: 'Imported',
            type: 'imported',
            launchpad: platform || 'Pump.fun',
            metadataUri: info.metadataUri || response?.source?.metadataUri || '',
            website: info.website || response?.source?.website || null,
            twitter: info.twitter || response?.source?.twitter || null,
            telegram: info.telegram || response?.source?.telegram || null,
            marketCap: info.marketCap || null,
            price: info.price || null,
            totalSupply: info.totalSupply || info.supply || null,
            decimals: info.decimals || 9
        };

        registerImportedToken(record);

        addConsoleLog(`✅ Imported token metadata for ${record.mint}`, 'success');
        notify(`Token imported: ${record.name || record.symbol || record.mint}`, 'success');

        populateTokenDetailView(record);
        renderTokensTable();
        navigateToPage('token-detail');
    } catch (error) {
        console.error('Import token error:', error);
        notify(`Import failed: ${error.message}`, 'error');
        addConsoleLog(`❌ Import token failed: ${error.message}`, 'error');
    } finally {
        setButtonLoading(button, false);
    }
}

// View active automations

window.executeCopyToken = executeCopyToken;
window.executeImportToken = executeImportToken;
function viewActiveAutomations() {
    if (!pumpFunTrading) {
        addConsoleLog('⚠️ No automations running', 'info');
        return;
    }
    
    const automations = pumpFunTrading.getActiveAutomations();
    
    if (automations.length === 0) {
        addConsoleLog('⚠️ No active automations', 'info');
    } else {
        addConsoleLog(`🤖 Active Automations: ${automations.length}`, 'info');
        automations.forEach(bot => {
            addConsoleLog(`   ${bot.type}: ${bot.id} - ${bot.status}`, 'info');
        });
    }
}

// Stop automation
function stopAutomation(botId) {
    if (!pumpFunTrading) return;
    
    const result = pumpFunTrading.stopAutomation(botId);
    if (result) {
        addConsoleLog(`🛑 Automation stopped: ${botId}`, 'info');
    }
}

// ==================== BLUEPRINT FUNCTIONS ====================

let blueprintWalletLoadPromise = null;
let blueprintWalletLoadAttempts = 0;

function enableSimpleMultiSelect(selectEl) {
    if (!selectEl || selectEl.dataset.simpleMultiSelect === 'true') {
        return;
    }

    selectEl.addEventListener('mousedown', (event) => {
        const option = event.target;
        if (!option || option.tagName !== 'OPTION') {
            return;
        }

        event.preventDefault();
        option.selected = !option.selected;

        const changeEvent = new Event('change', { bubbles: true });
        selectEl.dispatchEvent(changeEvent);
    });

    selectEl.dataset.simpleMultiSelect = 'true';
}
function collectBlueprintWallets() {
    const walletMap = new Map();

    const addWallets = (list) => {
        if (!Array.isArray(list)) {
            return;
        }
        list.forEach((wallet) => {
            const identifier = getWalletIdentifier(wallet);
            if (!identifier) {
                return;
            }
            const key = identifier.toString().toLowerCase();
            if (!walletMap.has(key)) {
                walletMap.set(key, { ...wallet });
            }
        });
    };

    try {
        if (typeof window.walletOperations?.getWallets === 'function') {
            addWallets(window.walletOperations.getWallets());
        }
    } catch (error) {
        console.warn('Unable to read wallet operations cache for blueprints:', error);
    }

    addWallets(tokenLaunchState?.wallets);
    addWallets(Array.isArray(solanaIntegration?.wallets) ? solanaIntegration.wallets : null);
    addWallets(Array.isArray(window.solana?.wallets) ? window.solana.wallets : null);

    const wallets = Array.from(walletMap.values());

    wallets.sort((a, b) => {
        const nameA = (a?.name || '').toLowerCase();
        const nameB = (b?.name || '').toLowerCase();
        if (nameA && nameB && nameA !== nameB) {
            return nameA.localeCompare(nameB);
        }
        if (nameA && !nameB) {
            return -1;
        }
        if (!nameA && nameB) {
            return 1;
        }
        const addrA = (a?.publicKey || a?.address || a?.id || '').toLowerCase();
        const addrB = (b?.publicKey || b?.address || b?.id || '').toLowerCase();
        return addrA.localeCompare(addrB);
    });

    return wallets;
}

function scheduleBlueprintWalletReload() {
    if (
        blueprintWalletLoadPromise ||
        blueprintWalletLoadAttempts > 2 ||
        typeof window.walletOperations?.loadWallets !== 'function'
    ) {
        return;
    }

    try {
        blueprintWalletLoadAttempts += 1;
        const result = window.walletOperations.loadWallets();
        if (result && typeof result.then === 'function') {
            blueprintWalletLoadPromise = result
                .catch((error) => {
                    console.warn('Failed to load wallets for blueprint selector:', error);
                })
                .finally(() => {
                    blueprintWalletLoadPromise = null;
                    populateBlueprintAutomationWalletOptions();
                });
        } else {
            blueprintWalletLoadPromise = Promise.resolve()
                .finally(() => {
                    blueprintWalletLoadPromise = null;
                    populateBlueprintAutomationWalletOptions();
                });
        }
    } catch (error) {
        console.warn('Wallet reload threw for blueprint selector:', error);
        blueprintWalletLoadPromise = null;
    }
}

function getBlueprintWalletPayload() {
    return collectBlueprintWallets();
}

function getBlueprintAutomationSelectors(prefix) {
    return {
        mode: `${prefix}-wallet-mode`,
        walletWrapper: `${prefix}-wallets-wrapper`,
        walletSelect: `${prefix}-wallet-select`,
        groupWrapper: `${prefix}-group-wrapper`,
        groupSelect: `${prefix}-group-select`
    };
}

function toggleBlueprintAutomationWrappers(prefix, mode) {
    const selectors = getBlueprintAutomationSelectors(prefix);
    const walletWrapper = getElement(selectors.walletWrapper);
    const groupWrapper = getElement(selectors.groupWrapper);

    if (walletWrapper) {
        walletWrapper.classList.toggle('hidden', mode !== 'custom');
    }
    if (groupWrapper) {
        groupWrapper.classList.toggle('hidden', mode !== 'group');
    }
}

function populateBlueprintAutomationWalletOptions() {
    const wallets = collectBlueprintWallets();
    const placeholdersNeeded = wallets.length === 0;

    if (placeholdersNeeded) {
        scheduleBlueprintWalletReload();
    }

    const prefixes = ['blueprint-smart-sell', 'blueprint-volume'];

    prefixes.forEach((prefix) => {
        const selectors = getBlueprintAutomationSelectors(prefix);
        const selectEl = getElement(selectors.walletSelect);
        if (!selectEl) return;

        const previousValues = new Set(getSelectValues(selectEl).map((value) => value.toLowerCase()));
        selectEl.innerHTML = '';

        if (placeholdersNeeded) {
            const placeholder = document.createElement('option');
            placeholder.textContent = blueprintWalletLoadPromise ? 'Loading wallets...' : 'No wallets available';
            placeholder.disabled = true;
            selectEl.appendChild(placeholder);
            return;
        }

        wallets.forEach((wallet) => {
            const value = getWalletIdentifier(wallet);
            if (!value) return;
            const option = document.createElement('option');
            option.value = value;
            option.textContent = buildWalletOptionLabel(wallet);
            option.selected = previousValues.has(value.toLowerCase());
            selectEl.appendChild(option);
        });

        enableSimpleMultiSelect(selectEl);
    });
}

function populateBlueprintAutomationGroupOptions() {
    const prefixes = ['blueprint-smart-sell', 'blueprint-volume'];
    const groups = Array.isArray(tokenLaunchState.walletGroups) ? tokenLaunchState.walletGroups : [];

    prefixes.forEach((prefix) => {
        const selectors = getBlueprintAutomationSelectors(prefix);
        const selectEl = getElement(selectors.groupSelect);
        if (!selectEl) return;

        const previousValue = selectEl.value;

        selectEl.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Select group...';
        selectEl.appendChild(defaultOption);

        groups.forEach((group) => {
            const value = group?.id || group?.name;
            if (!value) return;
            const option = document.createElement('option');
            option.value = value;
            const walletCount = Number(group?.walletCount);
            const countLabel = Number.isFinite(walletCount) && walletCount > 0 ? ` (${walletCount} wallets)` : '';
            option.textContent = `${group?.name || value}${countLabel}`;
            selectEl.appendChild(option);
        });

        if (previousValue && Array.from(selectEl.options).some((opt) => opt.value === previousValue)) {
            selectEl.value = previousValue;
        } else {
            selectEl.value = '';
        }
    });
}

function setupBlueprintAutomationControls() {
    if (!blueprintFormState.controlsReady) {
        const prefixes = ['blueprint-smart-sell', 'blueprint-volume'];
        prefixes.forEach((prefix) => {
            const selectors = getBlueprintAutomationSelectors(prefix);
            const modeSelect = getElement(selectors.mode);
            if (modeSelect) {
                modeSelect.addEventListener('change', (event) => {
                    toggleBlueprintAutomationWrappers(prefix, event.target.value);
                });
            }
        });
        blueprintFormState.controlsReady = true;
    }

    populateBlueprintAutomationWalletOptions();
    populateBlueprintAutomationGroupOptions();

    const prefixes = ['blueprint-smart-sell', 'blueprint-volume'];
    prefixes.forEach((prefix) => {
        const selectors = getBlueprintAutomationSelectors(prefix);
        const modeSelect = getElement(selectors.mode);
        if (modeSelect) {
            toggleBlueprintAutomationWrappers(prefix, modeSelect.value || 'all');
        }
    });

    const volumeToggle = getElement('blueprint-volume-enabled');
    if (volumeToggle && !volumeToggle.dataset.guardrailHandler) {
        volumeToggle.addEventListener('change', toggleBlueprintVolumeGuardrails);
        volumeToggle.dataset.guardrailHandler = 'true';
    }
    toggleBlueprintVolumeGuardrails();
}

function resetBlueprintAutomationSelectors() {
    const prefixes = ['blueprint-smart-sell', 'blueprint-volume'];
    prefixes.forEach((prefix) => {
        const selectors = getBlueprintAutomationSelectors(prefix);
        const modeSelect = getElement(selectors.mode);
        const walletSelect = getElement(selectors.walletSelect);
        const groupSelect = getElement(selectors.groupSelect);

        if (modeSelect) {
            modeSelect.value = 'all';
        }
        if (walletSelect) {
            Array.from(walletSelect.options).forEach((option) => {
                option.selected = false;
            });
        }
        if (groupSelect) {
            groupSelect.value = '';
        }
        toggleBlueprintAutomationWrappers(prefix, 'all');
    });
}

function readBlueprintAutomationSelector(prefix) {
    const selectors = getBlueprintAutomationSelectors(prefix);
    const mode = getElement(selectors.mode)?.value || 'all';
    const walletIds = mode === 'custom' ? getSelectValues(getElement(selectors.walletSelect)) : [];
    const groupId = mode === 'group' ? (getElement(selectors.groupSelect)?.value || '') : '';
    return {
        mode,
        walletIds,
        groupId
    };
}

function validateBlueprintAutomationSelection(label, enabled, selection) {
    if (!enabled) {
        return { valid: true };
    }
    if (!selection) {
        return { valid: false, message: `Missing wallet configuration for ${label}.` };
    }
    if (selection.mode === 'custom' && (!Array.isArray(selection.walletIds) || selection.walletIds.length === 0)) {
        return { valid: false, message: `Select at least one wallet for ${label}.` };
    }
    if (selection.mode === 'group' && !selection.groupId) {
        return { valid: false, message: `Choose a wallet group for ${label}.` };
    }
    return { valid: true };
}

function describeAutomationSelector(automationConfig) {
    if (!automationConfig) {
        return 'Default wallets';
    }
    if (automationConfig.enabled === false) {
        return 'Disabled';
    }
    const selector = automationConfig.walletSelector || {};
    switch (selector.mode) {
        case 'all':
            return 'All active wallets';
        case 'custom': {
            const count = Array.isArray(selector.walletIds) ? selector.walletIds.length : 0;
            return count > 0 ? `${count} wallet${count === 1 ? '' : 's'} selected` : 'Specific wallets (none selected)';
        }
        case 'group': {
            if (selector.groupId || selector.walletGroupId || automationConfig.walletGroupName || automationConfig.walletGroupId) {
                const groupLabel =
                    automationConfig.walletGroupName ||
                    selector.walletGroupName ||
                    selector.groupName ||
                    automationConfig.walletGroupId ||
                    selector.groupId ||
                    'Unnamed group';
                return `Group: ${groupLabel}`;
            }
            return 'Wallet group (not selected)';
        }
        case 'creator':
            return 'Creator wallet';
        default:
            return 'Default wallets';
    }
}

// Create blueprint
async function createBlueprint(type) {
    initializeMultiWallet();
    
    const name = prompt('Blueprint Name:');
    if (!name) return;
    
    try {
        const templateConfig = blueprintTemplates[type] || blueprintTemplates.custom;
        const payload = buildBlueprintApiPayload({
            name,
            type: templateConfig.type || type,
            template: type,
            description: templateConfig.description,
            notes: templateConfig.notes,
            wallets: getBlueprintWalletPayload(),
            settings: {
                launch: templateConfig.launch
                    ? JSON.parse(JSON.stringify(templateConfig.launch))
                    : {},
                automations: templateConfig.automations
                    ? JSON.parse(JSON.stringify(templateConfig.automations))
                    : {}
            }
        });

        const blueprint = await blueprintService.create(payload);
        addConsoleLog(`✅ Blueprint created: ${blueprint?.name || name}`, 'success');
        notify(`Blueprint "${blueprint?.name || name}" created successfully.`, 'success');
        await renderBlueprintList(true);
    } catch (error) {
        console.error('Blueprint creation failed:', error);
        notify(`Failed to create blueprint: ${error.message}`, 'error');
    }
}

// Execute blueprint
async function executeBlueprint(blueprintId) {
    initializeMultiWallet();
    
    addConsoleLog(`🚀 Executing blueprint: ${blueprintId}`, 'info');
    
    try {
        const run = await blueprintService.execute(blueprintId);
        addConsoleLog(`✅ Blueprint run queued (ID: ${run?.id || 'unknown'})`, 'success');
        notify('Blueprint execution started. Monitor blueprint runs for progress.', 'success');
        await renderBlueprintList(true);
    } catch (error) {
        addConsoleLog(`❌ Blueprint failed: ${error.message}`, 'error');
        notify(`Blueprint execution failed: ${error.message}`, 'error');
    }
}

// Stop blueprint
function stopBlueprint(blueprintId) {
    if (multiWalletManager) {
        multiWalletManager.stopBlueprint(blueprintId);
        addConsoleLog(`🛑 Blueprint stopped: ${blueprintId}`, 'info');
    }
}

// ==================== FEE COLLECTION FUNCTIONS ====================

function initializeCollectFeesView() {
    if (collectFeesState.initialized) {
        return;
    }

    if (!document.getElementById('collect-fees-view')) {
        console.warn('Collect Fees view not present in DOM');
        return;
    }

    initializeMultiWallet();

    collectFeesState.autoCollectEnabled = loadAutoCollectPreference();
    updateAutoCollectLabel();

    if (multiWalletManager?.getFeeHistory) {
        collectFeesState.history = multiWalletManager.getFeeHistory();
    }

    renderFeeHistory(collectFeesState.history);
    collectFeesState.initialized = true;

    refreshCollectFeesView({ silent: true }).catch(error => {
        console.warn('Initial collect fees refresh failed:', error);
    });
}

async function refreshCollectFeesView(options = {}) {
    if (!collectFeesState.initialized) {
        return;
    }

    if (!solanaIntegration) {
        console.warn('Solana integration not ready for fee refresh');
        return;
    }

    if (collectFeesState.loading) {
        if (!options.allowConcurrent) {
            return;
        }
    }

    const { silent = false } = options;

    collectFeesState.loading = true;
    if (!silent) {
        setCollectFeesLoading(true);
    }

    try {
        initializeMultiWallet();

        const walletsWithBalances = await solanaIntegration.getAllWalletsWithBalances();
        const metrics = await calculateCollectFeesMetrics(walletsWithBalances);

        if (multiWalletManager?.getFeeHistory) {
            collectFeesState.history = multiWalletManager.getFeeHistory();
        }

        metrics.tradingLastCollected = getLastCollectionTimestamp(collectFeesState.history, ['trading', 'all']);
        metrics.rentLastCollected = getLastCollectionTimestamp(collectFeesState.history, ['rent', 'all']);

        // Count launched tokens for creator fees
        const importedRecords = Array.from(tokenRegistry.imported.values());
        const launchedTokens = importedRecords.filter(record => {
            const isDraft = record.type === 'draft' || !record.mint;
            return !isDraft && record.mint && (record.type === 'launch' || record.status === 'Launched' || (record.type !== 'imported' && record.type !== 'copy'));
        });
        metrics.creatorTokensCount = launchedTokens.length;
        metrics.creatorLastCollected = getLastCollectionTimestamp(collectFeesState.history, ['creator', 'all']);

        collectFeesState.metrics = metrics;

        updateCollectFeesDisplay(metrics);
        renderFeeHistory(collectFeesState.history);
    } catch (error) {
        console.error('Failed to refresh collect fees view:', error);
        addConsoleLog(`❌ Fee dashboard refresh failed: ${error.message}`, 'error');
    } finally {
        collectFeesState.loading = false;
        if (!silent) {
            setCollectFeesLoading(false);
        }
    }
}

async function calculateCollectFeesMetrics(wallets = []) {
    const metrics = {
        tradingFees: 0,
        rentFees: 0,
        totalFees: 0,
        tradingWallets: 0,
        rentWallets: 0,
        rentClosableAccounts: 0,
        usdValue: 0,
        solPrice: 0
    };

    try {
        metrics.solPrice = await solanaIntegration.getSolPrice();
    } catch (error) {
        console.warn('Unable to fetch SOL price for fee dashboard:', error);
    }

    if (!Array.isArray(wallets) || wallets.length === 0) {
        return metrics;
    }

    for (const wallet of wallets) {
        if (!wallet?.publicKey) {
            continue;
        }

        const balance = Number(wallet.balance) || 0;
        const collectable = Math.max(0, balance - MIN_RENT_BUFFER_SOL);

        if (collectable > 0) {
            metrics.tradingFees += collectable;
            metrics.tradingWallets += 1;
        }

        const rentInfo = await estimateRentReclaimForWallet(wallet.publicKey);
        if (rentInfo.rentLamports > 0) {
            metrics.rentFees += rentInfo.rentLamports / (window.solanaWeb3?.LAMPORTS_PER_SOL || 1_000_000_000);
            metrics.rentWallets += rentInfo.closableAccounts > 0 ? 1 : 0;
            metrics.rentClosableAccounts += rentInfo.closableAccounts;
        }
    }

    metrics.totalFees = metrics.tradingFees + metrics.rentFees;
    metrics.usdValue = metrics.totalFees * metrics.solPrice;

    return metrics;
}

async function estimateRentReclaimForWallet(publicKeyString) {
    if (!solanaIntegration?.connection || !window.solanaWeb3?.PublicKey) {
        return { rentLamports: 0, closableAccounts: 0 };
    }

    try {
        if (!window.__CHAOSBOT_TOKEN_PROGRAM) {
            window.__CHAOSBOT_TOKEN_PROGRAM = new window.solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        }

        const owner = new window.solanaWeb3.PublicKey(publicKeyString);
        const response = await solanaIntegration.connection.getParsedTokenAccountsByOwner(owner, {
            programId: window.__CHAOSBOT_TOKEN_PROGRAM
        });

        if (!response?.value) {
            return { rentLamports: 0, closableAccounts: 0 };
        }

        let rentLamports = 0;
        let closableAccounts = 0;

        for (const account of response.value) {
            const lamports = Number(account.account?.lamports) || 0;
            const tokenAmount = account.account?.data?.parsed?.info?.tokenAmount;

            let hasBalance = false;
            if (tokenAmount) {
                if (typeof tokenAmount.uiAmount === 'number') {
                    hasBalance = tokenAmount.uiAmount > 0;
                } else if (typeof tokenAmount.uiAmountString === 'string') {
                    hasBalance = Number(tokenAmount.uiAmountString) > 0;
                } else if (typeof tokenAmount.amount === 'string') {
                    try {
                        hasBalance = BigInt(tokenAmount.amount) > 0n;
                    } catch (error) {
                        hasBalance = Number(tokenAmount.amount) > 0;
                    }
                }
            }

            if (!hasBalance && lamports > 0) {
                rentLamports += lamports;
                closableAccounts += 1;
            }
        }

        return { rentLamports, closableAccounts };
    } catch (error) {
        console.warn(`Rent estimation failed for ${publicKeyString}:`, error.message);
        return { rentLamports: 0, closableAccounts: 0 };
    }
}

function updateCollectFeesDisplay(data = {}) {
    const metrics = {
        tradingFees: Number(data.tradingFees) || 0,
        rentFees: Number(data.rentFees) || 0,
        totalFees: Number(data.totalFees) || 0,
        tradingWallets: Number(data.tradingWallets) || 0,
        rentWallets: Number(data.rentWallets) || 0,
        usdValue: Number(data.usdValue) || 0,
        tradingLastCollected: data.tradingLastCollected || null,
        rentLastCollected: data.rentLastCollected || null,
        creatorTokensCount: Number(data.creatorTokensCount) || 0,
        creatorLastCollected: data.creatorLastCollected || null
    };

    const tradingFeesEl = document.getElementById('trading-fees');
    const rentFeesEl = document.getElementById('rent-fees');
    const totalFeesEl = document.getElementById('total-fees');
    const tradingWalletsEl = document.getElementById('trading-wallets');
    const rentWalletsEl = document.getElementById('rent-wallets');
    const tradingLastEl = document.getElementById('trading-last');
    const rentLastEl = document.getElementById('rent-last');
    const usdEl = document.getElementById('fees-usd');
    const creatorTokensCountEl = document.getElementById('creator-tokens-count');
    const creatorLastEl = document.getElementById('creator-last');

    if (tradingFeesEl) tradingFeesEl.textContent = `${metrics.tradingFees.toFixed(4)} SOL`;
    if (rentFeesEl) rentFeesEl.textContent = `${metrics.rentFees.toFixed(4)} SOL`;
    if (totalFeesEl) totalFeesEl.textContent = `${metrics.totalFees.toFixed(4)} SOL`;
    if (tradingWalletsEl) tradingWalletsEl.textContent = metrics.tradingWallets.toString();
    if (rentWalletsEl) rentWalletsEl.textContent = metrics.rentWallets.toString();
    if (usdEl) usdEl.textContent = `$${metrics.usdValue.toFixed(2)}`;
    if (creatorTokensCountEl) creatorTokensCountEl.textContent = metrics.creatorTokensCount.toString();
    if (creatorLastEl) {
        creatorLastEl.textContent = metrics.creatorLastCollected ? formatTimestamp(metrics.creatorLastCollected) : 'Never';
    }

    if (tradingLastEl) {
        tradingLastEl.textContent = metrics.tradingLastCollected ? formatTimestamp(metrics.tradingLastCollected) : 'Never';
    }

    if (rentLastEl) {
        rentLastEl.textContent = metrics.rentLastCollected ? formatTimestamp(metrics.rentLastCollected) : 'Never';
    }

    updateAutoCollectLabel();
}

function renderFeeHistory(history = []) {
    const tbody = document.getElementById('fees-history-body');
    if (!tbody) {
        return;
    }

    if (!Array.isArray(history) || history.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="p-8 text-center text-gray-500">
                    <div class="flex flex-col items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-inbox w-8 h-8 text-gray-600"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                        <span>No collection history yet</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    const rows = history.slice(0, 25).map(entry => {
        const isCreatorFee = entry.category === 'creator';
        const successful = Number(entry.successful) || 0;
        const processed = isCreatorFee 
            ? (Number(entry.tokensProcessed) || Number(entry.walletsProcessed) || 0)
            : (Number(entry.walletsProcessed) || entry.walletIds?.length || 0);
        const amount = isCreatorFee ? null : (Number(entry.totalCollected) || 0);
        const source = isCreatorFee ? 'Tokens' : 'Wallets';

        const statusClass = successful === processed
            ? 'text-green-400'
            : successful === 0
                ? 'text-red-400'
                : 'text-yellow-400';

        return `
            <tr class="border-b border-neutral-800 hover:bg-neutral-800/40 transition">
                <td class="p-4 text-sm text-gray-300">${formatTimestamp(entry.timestamp)}</td>
                <td class="p-4 text-sm text-gray-300">${getFeeCategoryLabel(entry.category)}</td>
                <td class="p-4 text-sm font-mono ${isCreatorFee ? 'text-amber-200' : 'text-purple-200'}">${isCreatorFee ? 'N/A' : `${amount.toFixed(4)} SOL`}</td>
                <td class="p-4 text-sm text-gray-300">${source}: ${processed}</td>
                <td class="p-4 text-sm font-mono ${statusClass}">${successful}/${processed}</td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = rows;
}

function getLastCollectionTimestamp(history = [], categories = []) {
    if (!Array.isArray(history) || history.length === 0) {
        return null;
    }

    const match = history.find(entry => {
        if (!entry || Number(entry.successful) === 0) {
            return false;
        }
        return categories.includes(entry.category);
    });

    return match ? match.timestamp : null;
}

function getFeeCategoryLabel(category) {
    switch (category) {
        case 'trading':
            return 'Trading';
        case 'rent':
            return 'Rent';
        case 'creator':
            return 'Creator Fees';
        case 'custom':
            return 'Custom';
        case 'all':
        default:
            return 'All Wallets';
    }
}

function formatTimestamp(timestamp) {
    if (!timestamp) {
        return 'Never';
    }
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return 'Never';
    }
    return date.toLocaleString();
}

function setCollectFeesLoading(isLoading) {
    const selectors = [
        'button[onclick="collectAllFees()"]',
        'button[onclick="collectTradingFees()"]',
        'button[onclick="collectRentFees()"]'
    ];

    selectors.forEach(selector => {
        const button = document.querySelector(selector);
        if (!button) return;

        if (isLoading) {
            button.setAttribute('disabled', 'disabled');
            button.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            button.removeAttribute('disabled');
            button.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
}

function loadAutoCollectPreference() {
    try {
        const stored = localStorage.getItem('chaosbot_auto_collect_enabled');
        return stored === 'true';
    } catch (error) {
        console.warn('Auto collect preference load failed:', error);
        return false;
    }
}

function storeAutoCollectPreference(value) {
    try {
        localStorage.setItem('chaosbot_auto_collect_enabled', value ? 'true' : 'false');
    } catch (error) {
        console.warn('Auto collect preference save failed:', error);
    }
}

function updateAutoCollectLabel() {
    const label = document.getElementById('auto-collect');
    if (!label) {
        return;
    }

    if (collectFeesState.autoCollectEnabled) {
        label.textContent = 'Enabled';
        label.className = 'text-sm font-mono text-green-400';
    } else {
        label.textContent = 'Disabled';
        label.className = 'text-sm font-mono text-gray-400';
    }
}
// Collect all fees (trading + rent, optionally creator fees)
async function collectAllFees(options = {}) {
    const includeCreatorFees = options.includeCreatorFees ?? true; // Default to true
    
    // Collect wallet fees (trading + rent) first
    initializeMultiWallet();
    
    if (!solanaIntegration.wallets || solanaIntegration.wallets.length === 0) {
        addConsoleLog('❌ No wallets found!', 'error');
        alert('No wallets to collect from. Add wallets first.');
        return;
    }
    
    const config = {
        targetWallet: options.targetWallet || window.__reclaimRentConfig?.targetAddress || null,
        walletIds: Array.isArray(options.walletIds) ? options.walletIds : null,
        closeEmptyAccounts: options.closeEmptyAccounts ?? window.__reclaimRentConfig?.closeEmptyAccounts ?? true,
        includeActive: options.includeActive ?? window.__reclaimRentConfig?.includeActive ?? true,
        confirmMessage: options.confirmMessage || null,
        category: options.category || (options.walletIds ? 'custom' : 'all')
    };

    // Ask for target wallet
    let targetWallet = config.targetWallet;
    if (!targetWallet) {
        targetWallet = prompt('Enter target wallet address to collect fees to:');
    }
    if (!targetWallet) return;
    
    // Build confirmation message
    const walletCount = config.walletIds ? config.walletIds.length : solanaIntegration.wallets.length;
    let confirmMsg = `Collect fees from ${walletCount} wallet${walletCount === 1 ? '' : 's'} to ${targetWallet}?`;
    
    if (includeCreatorFees) {
        const importedRecords = Array.from(tokenRegistry.imported.values());
        const launchedTokens = importedRecords.filter(record => {
            const isDraft = record.type === 'draft' || !record.mint;
            return !isDraft && record.mint && (record.type === 'launch' || record.status === 'Launched' || (record.type !== 'imported' && record.type !== 'copy'));
        });
        if (launchedTokens.length > 0) {
            confirmMsg += `\n\nThis will collect:\n- Trading & Rent fees from wallets\n- Creator fees from ${launchedTokens.length} token(s)`;
        } else {
            confirmMsg += `\n\nThis will collect Trading & Rent fees from wallets.`;
        }
    } else {
        confirmMsg += `\n\nThis will transfer all available SOL (minus rent) to the target wallet.`;
    }
    
    const confirm = window.confirm(config.confirmMessage || confirmMsg);
    if (!confirm) return;
    
    addConsoleLog(`💎 Starting fee collection (${config.category}${includeCreatorFees ? ' + creator fees' : ''})...`, 'info');
    setCollectFeesLoading(true);
    
    const results = {
        walletFees: null,
        creatorFees: null
    };
    
    try {
        // Collect wallet fees (trading + rent)
        const walletResult = await multiWalletManager.collectFees(targetWallet, {
            walletIds: config.walletIds,
            category: config.category
        });
        window.__reclaimRentConfig = null;
        results.walletFees = walletResult;
        
        if (walletResult.success) {
            addConsoleLog(`✅ Wallet fee collection complete!`, 'success');
            addConsoleLog(`   Total collected: ${walletResult.totalCollected.toFixed(4)} SOL`, 'success');
            addConsoleLog(`   Wallets processed: ${walletResult.walletsProcessed}`, 'info');
            addConsoleLog(`   Successful: ${walletResult.successful}`, 'info');
        } else {
            addConsoleLog(`❌ Wallet fee collection failed: ${walletResult.error}`, 'error');
        }
        
        // Collect creator fees if requested
        if (includeCreatorFees) {
            try {
                await collectAllCreatorFees({ skipConfirm: true, skipRefresh: true });
                results.creatorFees = { success: true };
            } catch (error) {
                addConsoleLog(`⚠️ Creator fee collection failed: ${error.message}`, 'warning');
                results.creatorFees = { success: false, error: error.message };
            }
        }
        
        // Show summary
        const walletSuccess = results.walletFees?.success;
        const creatorSuccess = results.creatorFees?.success !== false;
        const walletAmount = results.walletFees?.totalCollected || 0;
        
        if (walletSuccess) {
            let summary = `✅ Collected ${walletAmount.toFixed(4)} SOL from ${results.walletFees.successful} wallets!`;
            if (includeCreatorFees) {
                summary += `\n${creatorSuccess ? '✅' : '⚠️'} Creator fees: ${creatorSuccess ? 'Collected' : 'Failed'}`;
            }
            alert(summary);
        } else {
            alert(`Fee collection failed: ${results.walletFees?.error || 'Unknown error'}`);
        }
        
        // Refresh wallets and view
        await loadRealData();
        await refreshCollectFeesView();
        
    } catch (error) {
        window.__reclaimRentConfig = null;
        console.error('Fee collection threw error:', error);
        addConsoleLog(`❌ Fee collection error: ${error.message}`, 'error');
        alert(`Fee collection error: ${error.message}`);
    } finally {
        setCollectFeesLoading(false);
    }
}
// Collect trading fees
async function collectTradingFees() {
    addConsoleLog('💰 Collecting trading fees...', 'info');
    await collectAllFees({ category: 'trading' });
}

// Collect creator fees from Pump.fun
async function collectCreatorFees(tokenMint = null, options = {}) {
    // Get token from current view if not provided
    if (!tokenMint) {
        const currentToken = tokenRegistry.current;
        if (!currentToken || !currentToken.mint) {
            addConsoleLog('❌ No token selected. Please view a token first.', 'error');
            alert('No token selected. Please view a token first.');
            return;
        }
        tokenMint = currentToken.mint;
    }

    // Check if token is launched (not a draft)
    const tokenRecord = tokenRegistry.imported.get(tokenMint);
    if (!tokenRecord) {
        addConsoleLog('❌ Token not found in registry.', 'error');
        alert('Token not found. Please ensure this is a token you launched.');
        return;
    }

    const isDraft = tokenRecord.type === 'draft' || !tokenRecord.mint;
    if (isDraft) {
        addConsoleLog('❌ This token has not been launched yet.', 'error');
        alert('This token has not been launched yet. Only launched tokens can collect creator fees.');
        return;
    }

    // Get PumpPortal settings
    const settings = window.settingsManager?.getSettings() || window.__CHAOS_SETTINGS__ || {};
    const pumpportalSettings = settings.pumpportal || {};
    let apiKey = pumpportalSettings.apiKey || options.apiKey || '';
    const priorityFee = pumpportalSettings.priorityFee ?? 0.000001;
    const pool = pumpportalSettings.pool || 'pump';

    if (!apiKey) {
        const userApiKey = prompt('PumpPortal API key is required to collect creator fees.\n\nEnter your PumpPortal API key:');
        if (!userApiKey || !userApiKey.trim()) {
            addConsoleLog('❌ API key is required to collect creator fees.', 'error');
            return;
        }
        // Save API key to settings
        if (window.settingsManager) {
            const currentSettings = window.settingsManager.getSettings();
            if (!currentSettings.pumpportal) {
                currentSettings.pumpportal = {};
            }
            currentSettings.pumpportal.apiKey = userApiKey.trim();
            window.settingsManager.saveSettings(currentSettings);
        }
        apiKey = userApiKey.trim();
    }

    // Show confirmation dialog (unless skipped)
    if (!options.skipConfirm) {
        const confirmMessage = `Collect Creator Fees for Token\n\n` +
            `Token Mint: ${tokenMint.substring(0, 8)}...${tokenMint.substring(tokenMint.length - 8)}\n` +
            `Priority Fee: ${priorityFee} SOL\n` +
            `Pool: ${pool}\n\n` +
            `This will claim all available creator fees from Pump.fun for this token.\n\n` +
            `Continue?`;

        if (!window.confirm(confirmMessage)) {
            addConsoleLog('Creator fee collection cancelled.', 'info');
            return;
        }
    }

    addConsoleLog(`💎 Collecting creator fees for ${tokenMint.substring(0, 8)}...`, 'info');

    try {
        // Build request payload
        const payload = {
            action: 'collectCreatorFee',
            priorityFee: priorityFee,
            pool: pool
        };

        // For pump.fun, mint is not needed (collects all at once)
        // For meteora-dbc, mint is required
        if (pool === 'meteora-dbc') {
            payload.mint = tokenMint;
        }

        // Call PumpPortal Lightning Transaction API
        const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || `API returned status ${response.status}`);
        }

        // Check for errors in response
        if (data.error) {
            throw new Error(data.error);
        }

        // Success - transaction signature should be in data
        const signature = data.signature || data.tx || data.transaction;
        if (signature) {
            addConsoleLog(`✅ Creator fees collected successfully!`, 'success');
            addConsoleLog(`   Transaction: https://solscan.io/tx/${signature}`, 'info');
            
            const solscanUrl = `https://solscan.io/tx/${signature}`;
            const viewTx = window.confirm(`Creator fees collected successfully!\n\nTransaction: ${signature}\n\nOpen in Solscan?`);
            if (viewTx) {
                window.open(solscanUrl, '_blank', 'noopener');
            }
        } else {
            addConsoleLog(`✅ Creator fee collection request submitted.`, 'success');
            addConsoleLog(`   Response: ${JSON.stringify(data)}`, 'info');
        }

    } catch (error) {
        console.error('Creator fee collection error:', error);
        addConsoleLog(`❌ Failed to collect creator fees: ${error.message}`, 'error');
        alert(`Failed to collect creator fees: ${error.message}`);
    }
}

// Check available creator fees from Pump.fun
async function checkCreatorFees() {
    // Get all launched tokens
    const importedRecords = Array.from(tokenRegistry.imported.values());
    const launchedTokens = importedRecords.filter(record => {
        const isDraft = record.type === 'draft' || !record.mint;
        return !isDraft && record.mint && (record.type === 'launch' || record.status === 'Launched' || (record.type !== 'imported' && record.type !== 'copy'));
    });

    if (launchedTokens.length === 0) {
        addConsoleLog('ℹ️ No launched tokens found. Launch a token first to earn creator fees.', 'info');
        alert('No launched tokens found. Launch a token first to earn creator fees.');
        return;
    }

    addConsoleLog(`🔍 Checking creator fees for ${launchedTokens.length} token(s)...`, 'info');

    // Get PumpPortal settings
    const settings = window.settingsManager?.getSettings() || window.__CHAOS_SETTINGS__ || {};
    const pumpportalSettings = settings.pumpportal || {};
    const apiKey = pumpportalSettings.apiKey || '';

    if (!apiKey) {
        const info = `To check creator fees, you need a PumpPortal API key.\n\n` +
            `Creator fees are earned from trading activity on your tokens.\n` +
            `You can check fees directly on Pump.fun or collect them using the "Collect All" button.\n\n` +
            `Would you like to:\n` +
            `1. Open Pump.fun to check fees manually?\n` +
            `2. Enter your API key to check programmatically?`;
        
        const choice = window.confirm(info + '\n\nOK = Open Pump.fun\nCancel = Enter API Key');
        
        if (choice) {
            // Open Pump.fun for each token
            launchedTokens.forEach(token => {
                if (token.mint) {
                    window.open(`https://pump.fun/coin/${token.mint}`, '_blank', 'noopener');
                }
            });
            return;
        } else {
            const userApiKey = prompt('Enter your PumpPortal API key:');
            if (!userApiKey || !userApiKey.trim()) {
                return;
            }
            // Save API key
            if (window.settingsManager) {
                const currentSettings = window.settingsManager.getSettings();
                if (!currentSettings.pumpportal) {
                    currentSettings.pumpportal = {};
                }
                currentSettings.pumpportal.apiKey = userApiKey.trim();
                window.settingsManager.saveSettings(currentSettings);
            }
        }
    }

    // Note: PumpPortal API doesn't have a direct endpoint to check available fees
    // The fees are collected all at once, so we can't check individual amounts
    // We'll show information about the tokens and provide links
    
    let message = `Creator Fees Information\n\n` +
        `You have ${launchedTokens.length} launched token(s):\n\n`;
    
    launchedTokens.slice(0, 10).forEach((token, index) => {
        const name = token.name || token.symbol || 'Unnamed Token';
        const mint = token.mint || 'Unknown';
        message += `${index + 1}. ${name}\n   ${mint.substring(0, 8)}...${mint.substring(mint.length - 8)}\n\n`;
    });
    
    if (launchedTokens.length > 10) {
        message += `... and ${launchedTokens.length - 10} more token(s)\n\n`;
    }
    
    message += `Creator fees are earned from trading activity on Pump.fun.\n` +
        `Fees are collected all at once for all your tokens.\n\n` +
        `To check fees:\n` +
        `• Visit each token's page on Pump.fun\n` +
        `• Or use "Collect All" to attempt collection\n\n` +
        `Would you like to open all token pages on Pump.fun?`;
    
    const openPages = window.confirm(message);
    if (openPages) {
        launchedTokens.forEach((token, index) => {
            setTimeout(() => {
                if (token.mint) {
                    window.open(`https://pump.fun/coin/${token.mint}`, '_blank', 'noopener');
                }
            }, index * 500); // Stagger opens to avoid popup blocking
        });
        addConsoleLog(`✅ Opening ${launchedTokens.length} token page(s) on Pump.fun...`, 'info');
    } else {
        addConsoleLog(`ℹ️ Use "Collect All Creator Fees" to attempt collection. Fees are collected all at once.`, 'info');
    }
}

// Collect all creator fees from all launched tokens
async function collectAllCreatorFees(options = {}) {
    // Get all launched tokens
    const importedRecords = Array.from(tokenRegistry.imported.values());
    const launchedTokens = importedRecords.filter(record => {
        const isDraft = record.type === 'draft' || !record.mint;
        return !isDraft && record.mint && (record.type === 'launch' || record.status === 'Launched' || (record.type !== 'imported' && record.type !== 'copy'));
    });

    if (launchedTokens.length === 0) {
        addConsoleLog('❌ No launched tokens found. Launch a token first to collect creator fees.', 'error');
        alert('No launched tokens found. Launch a token first to collect creator fees.');
        return;
    }

    // Get PumpPortal settings
    const settings = window.settingsManager?.getSettings() || window.__CHAOS_SETTINGS__ || {};
    const pumpportalSettings = settings.pumpportal || {};
    let apiKey = pumpportalSettings.apiKey || '';
    const priorityFee = pumpportalSettings.priorityFee ?? 0.000001;
    const pool = pumpportalSettings.pool || 'pump';

    if (!apiKey) {
        const userApiKey = prompt(`PumpPortal API key is required to collect creator fees.\n\nEnter your PumpPortal API key:`);
        if (!userApiKey || !userApiKey.trim()) {
            addConsoleLog('❌ API key is required to collect creator fees.', 'error');
            return;
        }
        // Save API key to settings
        if (window.settingsManager) {
            const currentSettings = window.settingsManager.getSettings();
            if (!currentSettings.pumpportal) {
                currentSettings.pumpportal = {};
            }
            currentSettings.pumpportal.apiKey = userApiKey.trim();
            window.settingsManager.saveSettings(currentSettings);
        }
        apiKey = userApiKey.trim();
    }

    // Show confirmation dialog (unless skipped)
    if (!options.skipConfirm) {
        const confirmMessage = `Collect Creator Fees from All Tokens\n\n` +
            `Tokens: ${launchedTokens.length} launched token(s)\n` +
            `Priority Fee: ${priorityFee} SOL\n` +
            `Pool: ${pool}\n\n` +
            `This will claim all available creator fees from Pump.fun for all your launched tokens.\n\n` +
            `Continue?`;

        if (!window.confirm(confirmMessage)) {
            addConsoleLog('Creator fee collection cancelled.', 'info');
            return;
        }
    }

    addConsoleLog(`💎 Collecting creator fees from ${launchedTokens.length} token(s)...`, 'info');

    let successCount = 0;
    let failCount = 0;
    const collectionResults = [];

    // For pump.fun, we can collect all at once (no mint needed)
    // For meteora-dbc, we need to collect per token
    if (pool === 'pump') {
        // Collect all at once for pump.fun
        try {
            const payload = {
                action: 'collectCreatorFee',
                priorityFee: priorityFee,
                pool: pool
            };

            const response = await fetch(`https://pumpportal.fun/api/trade?api-key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || data.message || `API returned status ${response.status}`);
            }

            const signature = data.signature || data.tx || data.transaction;
            if (signature) {
                successCount = launchedTokens.length;
                addConsoleLog(`✅ Creator fees collected successfully for all tokens!`, 'success');
                addConsoleLog(`   Transaction: https://solscan.io/tx/${signature}`, 'info');
                collectionResults.push({ success: true, signature, tokens: launchedTokens.length });
            } else {
                addConsoleLog(`✅ Creator fee collection request submitted.`, 'success');
                collectionResults.push({ success: true, response: data, tokens: launchedTokens.length });
            }
        } catch (error) {
            failCount = launchedTokens.length;
            console.error('Creator fee collection error:', error);
            addConsoleLog(`❌ Failed to collect creator fees: ${error.message}`, 'error');
            collectionResults.push({ success: false, error: error.message, tokens: launchedTokens.length });
        }
    } else {
        // Collect per token for meteora-dbc
        for (const token of launchedTokens) {
            try {
                await collectCreatorFees(token.mint, { apiKey, skipConfirm: true });
                successCount++;
                collectionResults.push({ success: true, mint: token.mint });
            } catch (error) {
                failCount++;
                collectionResults.push({ success: false, mint: token.mint, error: error.message });
            }
        }
    }

    // Show summary
    const summary = `Creator Fee Collection Complete\n\n` +
        `✅ Successful: ${successCount}\n` +
        `❌ Failed: ${failCount}\n\n` +
        `${successCount > 0 ? 'Some fees were collected successfully!' : 'All collections failed.'}`;

    if (!options.skipConfirm) {
        alert(summary);
    }
    addConsoleLog(`📊 Collection summary: ${successCount} success, ${failCount} failed`, successCount > 0 ? 'success' : 'error');

    // Record in fee history
    if (multiWalletManager && multiWalletManager.feeCollectionHistory) {
        const historyEntry = {
            id: `creator-fee-${Date.now()}`,
            timestamp: Date.now(),
            totalCollected: 0, // Creator fees aren't tracked as SOL amount
            walletsProcessed: launchedTokens.length,
            successful: successCount,
            category: 'creator',
            source: 'tokens',
            tokensProcessed: launchedTokens.length,
            tokensSuccessful: successCount,
            results: collectionResults
        };
        multiWalletManager.feeCollectionHistory.push(historyEntry);
        multiWalletManager.saveFeeHistory();
    }

    // Refresh the view (unless skipped)
    if (!options.skipRefresh) {
        await refreshCollectFeesView();
    }
}

// Collect rent fees
async function collectRentFees(targetWallet = null, options = {}) {
    addConsoleLog('🏠 Collecting rent fees...', 'info');
    const config = window.__reclaimRentConfig || {};
    const shouldCloseAccounts = options.closeEmptyAccounts ?? config.closeEmptyAccounts;
    if (shouldCloseAccounts) {
        addConsoleLog('⚠️ Token account closure automation is not yet available. Manual review required after collection.', 'warning');
    }
    await collectAllFees({
        targetWallet: targetWallet || config.targetAddress,
        walletIds: options.walletIds || config.walletIds,
        closeEmptyAccounts: shouldCloseAccounts,
        includeActive: options.includeActive ?? config.includeActive,
        category: 'rent'
    });
}

// Toggle auto-collect
function toggleAutoCollect() {
    collectFeesState.autoCollectEnabled = !collectFeesState.autoCollectEnabled;
    storeAutoCollectPreference(collectFeesState.autoCollectEnabled);
    updateAutoCollectLabel();

    addConsoleLog(`⚙️ Auto-collect ${collectFeesState.autoCollectEnabled ? 'enabled' : 'disabled'}`, 'info');
    if (collectFeesState.autoCollectEnabled) {
        addConsoleLog('ℹ️ Auto-collect will monitor balances when the dashboard is open.', 'info');
    }
}

// ==================== VANITY FUNCTIONS ====================

// Generate vanity address
async function generateVanity() {
    initializeVanity();
    
    const pattern = prompt('Enter desired pattern (e.g., "CAT", "SOL", "PUMP"):');
    if (!pattern) return;
    
    const position = confirm('Prefix? (OK = Prefix, Cancel = Suffix)') ? 'prefix' : 'suffix';
    
    // Show estimate
    const estimate = vanityGenerator.estimateGeneration(pattern, position);
    addConsoleLog(`🎯 Pattern: ${pattern} (${position})`, 'info');
    addConsoleLog(`   Difficulty: ${estimate.difficulty}`, 'info');
    addConsoleLog(`   Estimated time: ${estimate.estimatedTime}`, 'info');
    
    const proceed = confirm(`Generate vanity address with pattern "${pattern}"?\n\nDifficulty: ${estimate.difficulty}\nEstimated time: ${estimate.estimatedTime}\n\nThis may take a while!`);
    if (!proceed) return;
    
    addConsoleLog('🔨 Generating vanity address...', 'info');
    addConsoleLog('⏳ This may take several minutes...', 'info');
    
    const result = await vanityGenerator.generateVanity({
        pattern: pattern,
        position: position,
        caseSensitive: false,
        maxAttempts: 10000000
    });
    
    if (result.success) {
        addConsoleLog(`✅ VANITY ADDRESS FOUND!`, 'success');
        addConsoleLog(`   Address: ${result.vanity.publicKey}`, 'success');
        addConsoleLog(`   Attempts: ${result.vanity.attempts.toLocaleString()}`, 'info');
        addConsoleLog(`   Time: ${result.vanity.timeTaken.toFixed(2)}s`, 'info');
        
        // Ask to save as wallet
        const saveName = prompt(`Vanity address found!\n\n${result.vanity.publicKey}\n\nSave as wallet? Enter name:`);
        if (saveName) {
            const wallet = vanityGenerator.saveVanityAsWallet(result.vanity, saveName);
            solanaIntegration.saveWallet(wallet);
            addConsoleLog(`✅ Saved as wallet: ${saveName}`, 'success');
            await loadRealData();
        }
        
    } else {
        addConsoleLog(`❌ Generation failed: ${result.error}`, 'error');
    }
}

// Stop vanity generation
function stopVanityGeneration() {
    if (vanityGenerator) {
        vanityGenerator.stopGeneration();
        addConsoleLog('🛑 Vanity generation stopped', 'info');
    }
}

// ==================== SETTINGS FUNCTIONS ====================

// Update RPC
async function updateRPCEndpoint(network, customUrl = null) {
    initializeSettings();
    
    addConsoleLog(`🔄 Updating RPC to ${network}...`, 'info');
    
    const result = await settingsManager.updateRPC(network, customUrl);
    
    if (result.success) {
        addConsoleLog(`✅ RPC updated to ${network}`, 'success');
        addConsoleLog(`   URL: ${result.url}`, 'info');
        addConsoleLog(`   Block height: ${result.health.blockHeight}`, 'info');
        
        // Refresh data with new RPC
        await loadRealData();
    } else {
        addConsoleLog(`❌ RPC update failed: ${result.error}`, 'error');
    }
}

// Test RPC connection
async function testRPCConnection() {
    initializeSettings();
    
    const url = prompt('Enter RPC URL to test:');
    if (!url) return;
    
    addConsoleLog(`🔍 Testing RPC: ${url}`, 'info');
    
    const result = await settingsManager.testRPC(url);
    
    if (result.success) {
        addConsoleLog(`✅ RPC test successful!`, 'success');
        addConsoleLog(`   Block height: ${result.blockHeight}`, 'info');
        addConsoleLog(`   Slot: ${result.slot}`, 'info');
        addConsoleLog(`   Latency: ${result.latency}`, 'info');
    } else {
        addConsoleLog(`❌ RPC test failed: ${result.error}`, 'error');
    }
}

// Update Jito settings
function updateJitoSettings(enabled, tipAmount) {
    initializeSettings();
    
    settingsManager.updateJito({
        enabled: enabled,
        tipAmount: tipAmount || 0.001
    });
    
    addConsoleLog(`✅ Jito ${enabled ? 'enabled' : 'disabled'}`, 'success');
}

// Update slippage
function updateSlippage(slippage) {
    initializeSettings();
    
    settingsManager.updateTrading({ defaultSlippage: slippage });
    addConsoleLog(`✅ Slippage set to ${slippage}%`, 'success');
}

// Update priority fee
function updatePriorityFee(fee) {
    initializeSettings();
    
    const parsedFee = Number(fee);
    const safeFee = Number.isFinite(parsedFee) ? parsedFee : 0;
    settingsManager.updateSolana({ priorityFee: safeFee });
    addConsoleLog(`✅ Priority fee set to ${safeFee} SOL`, 'success');
}

// Reset settings to defaults
function resetSettings() {
    initializeSettings();
    
    const confirm = window.confirm('Reset all settings to defaults?');
    if (!confirm) return;
    
    settingsManager.resetToDefaults();
    addConsoleLog('✅ Settings reset to defaults', 'success');
}

// Export settings
function exportSettings() {
    initializeSettings();
    
    settingsManager.exportSettings();
    addConsoleLog('✅ Settings exported', 'success');
}

// Import settings
async function importSettings() {
    initializeSettings();
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const result = await settingsManager.importSettings(file);
        
        if (result.success) {
            addConsoleLog('✅ Settings imported successfully', 'success');
            settingsManager.applySettings();
        } else {
            addConsoleLog(`❌ Import failed: ${result.error}`, 'error');
        }
    };
    
    input.click();
}

// Export functions for inline onclick handlers
window.connectWalletHandler = connectWalletHandler;
window.createNewWallet = createNewWallet;
window.importWalletHandler = importWalletHandler;
window.transferSOLHandler = transferSOLHandler;
window.viewOnSolscan = viewOnSolscan;
window.copyAddress = copyAddress;
window.refreshWalletBalance = refreshWalletBalance;
window.toggleWalletSelection = toggleWalletSelection;
window.toggleSmartSellConfig = toggleSmartSellConfig;
window.toggleVolumeBotConfig = toggleVolumeBotConfig;
window.toggleVolumeGuardrails = toggleVolumeGuardrails;
window.toggleBlueprintVolumeGuardrails = toggleBlueprintVolumeGuardrails;
window.executeSaveTokenDraft = executeSaveTokenDraft;
window.executeCreateAndLaunchToken = executeSaveTokenDraft;
window.viewActiveAutomations = viewActiveAutomations;
window.stopAutomation = stopAutomation;
window.createBlueprint = createBlueprint;
window.executeBlueprint = executeBlueprint;
window.stopBlueprint = stopBlueprint;
window.openCreateBlueprintModal = openCreateBlueprintModal;
window.submitBlueprintForm = submitBlueprintForm;
window.applyBlueprint = applyBlueprint;
window.deleteBlueprint = deleteBlueprint;
window.renderBlueprintList = renderBlueprintList;
window.openLaunchBlueprintModal = openLaunchBlueprintModal;
window.applyBlueprintToLaunchFromSelector = applyBlueprintToLaunchFromSelector;
window.collectAllFees = collectAllFees;
window.collectTradingFees = collectTradingFees;
window.collectRentFees = collectRentFees;
window.collectCreatorFees = collectCreatorFees;
window.collectAllCreatorFees = collectAllCreatorFees;
window.checkCreatorFees = checkCreatorFees;
window.toggleAutoCollect = toggleAutoCollect;
window.enterDeleteTokenMode = enterDeleteTokenMode;
window.exitDeleteTokenMode = exitDeleteTokenMode;
window.toggleTokenDeleteSelection = toggleTokenDeleteSelection;
window.toggleSelectAllTokens = toggleSelectAllTokens;
window.deleteSelectedTokens = deleteSelectedTokens;
window.generateVanity = generateVanity;
window.stopVanityGeneration = stopVanityGeneration;
window.updateRPCEndpoint = updateRPCEndpoint;
window.testRPCConnection = testRPCConnection;
window.updateJitoSettings = updateJitoSettings;
window.updateSlippage = updateSlippage;
window.updatePriorityFee = updatePriorityFee;
window.resetSettings = resetSettings;
window.exportSettings = exportSettings;
window.importSettings = importSettings;
window.handleRuntimeTaskAction = handleRuntimeTaskAction;
// Instant Trading Functions
async function loadInstantTradingData() {
    try {
        const API_BASE = getApiBase();
        // api-server.js handles both /api/instant-trading/status and /instant-trading/status
        const endpoint = API_BASE.startsWith('http') 
            ? `${API_BASE}/api/instant-trading/status` 
            : `${API_BASE}/instant-trading/status`;
        
        console.log('Loading instant trading data from:', endpoint);
        
        const response = await fetch(endpoint);
        
        if (response.ok) {
            const data = await response.json();
            updateInstantTradingStatus(data);
        } else {
            console.error('Failed to load instant trading status');
            updateInstantTradingStatus({
                available: false,
                connected: false,
                isRunning: false,
                message: 'Failed to connect to API'
            });
        }
    } catch (error) {
        console.error('Error loading instant trading data:', error);
        updateInstantTradingStatus({
            available: false,
            connected: false,
            isRunning: false,
            error: error.message
        });
    }
}

function updateInstantTradingStatus(data) {
    const statusEl = document.getElementById('instant-trading-status');
    if (!statusEl) {
        console.warn('instant-trading-status element not found');
        return;
    }
    
    if (data.available && data.connected && data.isRunning) {
        statusEl.innerHTML = `
            <div class="bg-green-900/20 border border-green-700 rounded-lg p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <h3 class="text-lg font-semibold text-green-400">Instant Trading System - Running</h3>
                </div>
                ${data.currentToken ? `
                    <p class="text-sm text-gray-300 mb-2">
                        <span class="text-gray-400">Token:</span> 
                        <span class="font-mono">${data.currentToken.substring(0, 8)}...${data.currentToken.substring(data.currentToken.length - 6)}</span>
                    </p>
                ` : ''}
                ${data.stats ? `
                    <div class="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <div class="text-2xl font-bold text-purple-400">${data.stats.totalDetections || 0}</div>
                            <div class="text-xs text-gray-500">Total Detections</div>
                        </div>
                        <div>
                            <div class="text-2xl font-bold text-green-400">${data.stats.successfulSells || 0}</div>
                            <div class="text-xs text-gray-500">Successful Sells</div>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        // Update statistics
        if (data.stats) {
            const totalDetectionsEl = document.getElementById('total-detections');
            const successfulSellsEl = document.getElementById('successful-sells');
            const totalSellsEl = document.getElementById('total-sells');
            const successRateEl = document.getElementById('success-rate');
            
            if (totalDetectionsEl) totalDetectionsEl.textContent = data.stats.totalDetections || 0;
            if (successfulSellsEl) successfulSellsEl.textContent = data.stats.successfulSells || 0;
            if (totalSellsEl) totalSellsEl.textContent = data.stats.totalSells || 0;
            if (successRateEl && data.stats.totalSells > 0) {
                const rate = ((data.stats.successfulSells / data.stats.totalSells) * 100).toFixed(1);
                successRateEl.textContent = `${rate}%`;
            }
        }
    } else if (data.available && data.connected) {
        statusEl.innerHTML = `
            <div class="bg-yellow-900/20 border border-yellow-700 rounded-lg p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <h3 class="text-lg font-semibold text-yellow-400">Instant Trading System - Stopped</h3>
                </div>
                <p class="text-sm text-gray-300">${data.message || 'System is available but not currently running'}</p>
            </div>
        `;
    } else {
        statusEl.innerHTML = `
            <div class="bg-red-900/20 border border-red-700 rounded-lg p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-3 h-3 bg-red-500 rounded-full"></div>
                    <h3 class="text-lg font-semibold text-red-400">Instant Trading System - Not Available</h3>
                </div>
                <p class="text-sm text-gray-300">${data.message || 'Start the bot to activate instant trading'}</p>
                ${data.error ? `<p class="text-xs text-red-400 mt-2">Error: ${data.error}</p>` : ''}
            </div>
        `;
    }
    
    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Auto-refresh instant trading status when on instant view
let instantTradingRefreshInterval = null;

function startInstantTradingRefresh() {
    if (instantTradingRefreshInterval) {
        clearInterval(instantTradingRefreshInterval);
    }
    
    instantTradingRefreshInterval = setInterval(() => {
        if (rtCurrentView === 'instant') {
            loadInstantTradingData();
        }
    }, 30000); // Refresh every 30 seconds
}

function stopInstantTradingRefresh() {
    if (instantTradingRefreshInterval) {
        clearInterval(instantTradingRefreshInterval);
        instantTradingRefreshInterval = null;
    }
}

window.switchView = switchView;
window.initializeEventListeners = initializeEventListeners;
window.loadInstantTradingData = loadInstantTradingData;

console.log('✅ Real Trading UI JavaScript loaded');

function createDefaultLaunchConfig() {
    return {
        devWalletId: '',
        devBuyAmount: null,
        appliedBlueprint: null,
        blockZero: {
            enabled: false,
            mode: 'quick',
            selections: {}
        }
    };
}

const BLOCK_ZERO_MAX_SELECTIONS = 3;

function cloneLaunchConfig(source = {}) {
    const base = createDefaultLaunchConfig();
    if (!source || typeof source !== 'object') {
        return base;
    }

    const devWalletId =
        source.devWalletId ||
        source.creatorWalletId ||
        source.creatorWallet ||
        source.walletId ||
        '';
    if (devWalletId) {
        base.devWalletId = String(devWalletId);
    }

    const devAmount = safeNumber(
        source.devBuyAmount ?? source.devBuy ?? source.initialBuyAmount ?? source.initialBuy
    );
    if (devAmount !== null && devAmount >= 0) {
        base.devBuyAmount = devAmount;
    }

    const blockZero = source.blockZero || {};
    base.blockZero.enabled = Boolean(blockZero.enabled);
    base.blockZero.mode = blockZero.mode === 'quick' ? 'quick' : 'quick';

    const selections = {};
    if (blockZero && typeof blockZero === 'object') {
        const rawSelections = blockZero.selections || blockZero.wallets || blockZero.entries;
        if (Array.isArray(rawSelections)) {
            rawSelections.forEach((entry) => {
                if (!entry) return;
                const walletId =
                    entry.walletId || entry.id || getWalletIdentifier(entry) || entry.publicKey || '';
                if (!walletId) return;
                const amount = safeNumber(entry.amount ?? entry.buyAmount ?? entry.value);
                selections[walletId] = {
                    amount: amount !== null && amount >= 0 ? amount : null
                };
            });
        } else if (rawSelections && typeof rawSelections === 'object') {
            Object.entries(rawSelections).forEach(([walletId, entry]) => {
                if (!walletId) return;
                const amount = safeNumber(
                    (entry && typeof entry === 'object' ? entry.amount : entry) ?? null
                );
                selections[walletId] = {
                    amount: amount !== null && amount >= 0 ? amount : null
                };
            });
        }
    }
    base.blockZero.selections = selections;

    if (source.appliedBlueprint && typeof source.appliedBlueprint === 'object') {
        const applied = source.appliedBlueprint;
        const id = applied.id || applied.blueprintId || '';
        if (id) {
            base.appliedBlueprint = {
                id,
                name: applied.name || applied.title || '',
                type: applied.type || applied.template || 'custom',
                appliedAt: applied.appliedAt || Date.now()
            };
        }
    }

    return base;
}

function serializeLaunchConfig(config = {}) {
    const clone = cloneLaunchConfig(config);
    const serializedSelections = {};
    Object.entries(clone.blockZero.selections || {}).forEach(([walletId, entry]) => {
        if (!walletId) return;
        serializedSelections[walletId] = {
            amount: safeNumber(entry?.amount)
        };
    });
    const appliedBlueprint =
        clone.appliedBlueprint && clone.appliedBlueprint.id
            ? {
                  id: clone.appliedBlueprint.id,
                  name: clone.appliedBlueprint.name || '',
                  type: clone.appliedBlueprint.type || 'custom',
                  appliedAt: clone.appliedBlueprint.appliedAt || Date.now()
              }
            : null;
    return {
        devWalletId: clone.devWalletId || '',
        devBuyAmount: safeNumber(clone.devBuyAmount),
        appliedBlueprint,
        blockZero: {
            enabled: Boolean(clone.blockZero.enabled),
            mode: clone.blockZero.mode || 'quick',
            selections: serializedSelections
        }
    };
}

function refreshLaunchWalletDependencies() {
    if (!tokenLaunchState.launchControlsReady) {
        return;
    }
    populateLaunchDevWalletSelect();
    updateBlockZeroModeUI();
    renderBlockZeroWalletList();
    updateBlockZeroSummary();
}

// ==================== UI HELPER REGISTRATION ====================

const uiHelperState = {
    fundMode: 'standard',
    tagExecutor: 'jito',
    warmExecutor: 'jito',
    redistributeMode: 'standard',
    tokenPlatform: 'pumpfun',
    copyPlatform: 'pumpfun',
    blockZeroMode: 'quick',
    tagFilters: new Set(),
    vanityFilter: 'available',
    tokenDeleteMode: false,
    selectedTokensForDelete: new Set(),
    tokenFilter: 'active'
};

const tokenRegistry = {
    imported: new Map(),
    drafts: new Map(),
    current: null,
    currentSource: null
};

const IMPORTED_TOKEN_STORAGE_KEY = 'chaosbot_imported_tokens_v1';
const IMPORTED_TOKEN_ARCHIVE_STORAGE_KEY = 'chaosbot_imported_archives_v1';

const tokenDetailViewState = {
    currentKey: null,
    loading: false,
    lastRuntime: null,
    holdingsSource: 'jito',
    activityIntervalId: null,
    currentActivity: [], // Store current activity feed for WebSocket updates
    metricsRefreshIntervalId: null, // Interval for frequent market cap/price updates
    bondingCurveRefreshIntervalId: null, // Interval for bonding curve updates (less frequent)
    bondingCurveCache: { percent: null, timestamp: 0 } // Cache bonding curve to avoid recalculating every 3 seconds
};

let archivedImportedTokens = new Set();

function loadArchivedImportedTokens() {
    try {
        const raw = localStorage.getItem(IMPORTED_TOKEN_ARCHIVE_STORAGE_KEY);
        if (!raw) {
            archivedImportedTokens = new Set();
            return;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            archivedImportedTokens = new Set(
                parsed
                    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
                    .filter((value) => Boolean(value))
            );
        } else {
            archivedImportedTokens = new Set();
        }
    } catch (error) {
        console.warn('Failed to load archived imported tokens:', error);
        archivedImportedTokens = new Set();
    }
}

function persistArchivedImportedTokens() {
    try {
        localStorage.setItem(
            IMPORTED_TOKEN_ARCHIVE_STORAGE_KEY,
            JSON.stringify(Array.from(archivedImportedTokens))
        );
    } catch (error) {
        console.error('Failed to persist archived imported tokens:', error);
    }
}

function setImportedTokenArchivedState(mint, archived) {
    if (!mint) {
        return;
    }
    const key = mint.toLowerCase();
    if (archived) {
        archivedImportedTokens.add(key);
    } else {
        archivedImportedTokens.delete(key);
    }
    persistArchivedImportedTokens();
}

function persistImportedTokens() {
    try {
        const payload = Array.from(tokenRegistry.imported.values()).map((record) => ({
            mint: record.mint,
            name: record.name || '',
            symbol: record.symbol || '',
            image: record.image || null,
            platform: record.platform || '',
            creatorWalletId: record.creatorWalletId || '',
            creatorWallet: record.creatorWallet || '',
            creatorWalletLabel: record.creatorWalletLabel || '',
            status: record.status || '',
            type: record.type || 'imported',
            addedAt: record.addedAt || Date.now(),
            updatedAt: record.updatedAt || record.addedAt || Date.now(),
            metadataUri: record.metadataUri || '',
            description: record.description || '',
            notes: record.notes || '',
            balance: record.balance ?? null,
            realizedProfit: record.realizedProfit ?? null,
            archived: Boolean(record.archived)
        }));

        localStorage.setItem(IMPORTED_TOKEN_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error('Error persisting imported tokens:', error);
    }
}

function loadImportedTokensFromStorage() {
    tokenRegistry.imported.clear();

    try {
        const raw = localStorage.getItem(IMPORTED_TOKEN_STORAGE_KEY);
        if (!raw) {
            renderTokensTable();
            return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            renderTokensTable();
            return;
        }

        parsed.forEach((entry) => {
            if (!entry) return;
            const mint = typeof entry.mint === 'string' ? entry.mint.trim() : '';
            if (!mint) return;

            const normalizedMint = mint;
            const archived = entry.archived ?? archivedImportedTokens.has(normalizedMint.toLowerCase());

            tokenRegistry.imported.set(normalizedMint, {
                ...entry,
                mint: normalizedMint,
                id: normalizedMint,
                type: entry.type || 'imported',
                image: entry.image ? resolveImageUrl(entry.image) : null,
                addedAt: entry.addedAt || Date.now(),
                updatedAt: entry.updatedAt || entry.addedAt || Date.now(),
                archived: Boolean(archived)
            });
        });
    } catch (error) {
        console.error('Error loading imported tokens:', error);
        tokenRegistry.imported.clear();
    }

    renderTokensTable();
}

const runtimeTaskRegistry = new Map();

const FALLBACK_RPC_ENDPOINT =
    'https://rpc.shyft.to?api_key=6AC3vTBB5lObDYTm';
const FALLBACK_LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * Get Solana connection with support for dedicated RPCs
 * Uses enhanced-token-fetchers.js getSolanaConnection if available, otherwise falls back
 * @param {string} purpose - 'price' for price/market cap updates, 'monitoring' for trade monitoring, or null for general use
 */
function getSolanaConnection(purpose = null) {
    // Use enhanced getSolanaConnection if available (supports dedicated RPCs)
    if (window.enhancedTokenFetchers?.getSolanaConnection) {
        return window.enhancedTokenFetchers.getSolanaConnection(purpose);
    }
    
    // Fallback to solanaIntegration connection for general use
    if (!purpose && solanaIntegration?.connection) {
        return solanaIntegration.connection;
    }

    // If we need a dedicated RPC but enhanced fetchers aren't available, try to get from settings
    if (purpose && window.settingsManager?.getSettings) {
        try {
            const settings = window.settingsManager.getSettings();
            let rpcUrl = null;
            
            if (purpose === 'price' && settings?.solana?.priceRpc) {
                rpcUrl = settings.solana.priceRpc;
            } else if (purpose === 'monitoring' && settings?.solana?.monitoringRpc) {
                // Convert WebSocket to HTTP for monitoring
                rpcUrl = settings.solana.monitoringRpc.replace('wss://', 'https://').replace('ws://', 'http://');
            } else if (settings?.solana?.rpcHttp) {
                rpcUrl = settings.solana.rpcHttp;
            }
            
            if (rpcUrl && window.solanaWeb3?.Connection) {
                return new window.solanaWeb3.Connection(rpcUrl, 'confirmed');
            }
        } catch (error) {
            console.debug('Failed to get dedicated RPC from settings:', error);
        }
    }

    // Final fallback
    if (!fallbackSolanaConnection && window.solanaWeb3?.Connection) {
        fallbackSolanaConnection = new window.solanaWeb3.Connection(
            solanaIntegration?.rpcEndpoint || FALLBACK_RPC_ENDPOINT,
            'confirmed'
        );
    }

    return fallbackSolanaConnection || null;
}

function getKnownWallets() {
    const collection = [];
    const pushUnique = (wallet, sourceIndex) => {
        if (!wallet) return;
        const address = wallet.publicKey || wallet.address || wallet.pubkey || wallet.walletAddress;
        if (!address) return;
        const key = address.trim();
        if (!key) return;
        if (collection.some((entry) => entry.address === key)) {
            return;
        }
        collection.push({
            id:
                wallet.id ||
                wallet.walletId ||
                wallet.publicKey ||
                wallet.address ||
                wallet.pubkey ||
                key,
            address: key,
            name: String(wallet.name || wallet.label || wallet.alias || wallet.displayName || ''),
            emoji: wallet.emoji || getWalletEmoji(String(wallet.name || wallet.label || wallet.alias || wallet.displayName || '') || sourceIndex || collection.length),
            balance: typeof wallet.balance === 'number' ? wallet.balance : null,
            tags: Array.isArray(wallet.tags) ? wallet.tags : []
        });
    };

    if (Array.isArray(tokenLaunchState.wallets)) {
        tokenLaunchState.wallets.forEach((wallet, index) => pushUnique(wallet, index));
    }

    if (Array.isArray(window.solana?.wallets)) {
        window.solana.wallets.forEach((wallet, index) => pushUnique(wallet, index));
    }

    if (typeof window.walletOperations?.getWallets === 'function') {
        try {
            const opsWallets = window.walletOperations.getWallets();
            if (Array.isArray(opsWallets)) {
                opsWallets.forEach((wallet, index) => pushUnique(wallet, index));
            }
        } catch (error) {
            console.warn('Unable to include wallet-operations wallets:', error);
        }
    }

    return collection;
}

function truncateMiddle(value, prefix = 4, suffix = 4) {
    if (!value || typeof value !== 'string') {
        return '';
    }
    if (value.length <= prefix + suffix + 3) {
        return value;
    }
    return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

function resetTokenMetrics() {
    const metricIds = [
        'metric-profit-loss',
        'metric-profit-loss-detail',
        'metric-amount-invested',
        'metric-amount-invested-detail',
        'metric-token-holdings',
        'metric-token-holdings-detail',
        'metric-holdings-value',
        'metric-holdings-value-detail',
        'metric-amount-sold',
        'metric-amount-sold-detail',
        'metric-price-per-token',
        'metric-price-per-token-detail',
        'metric-market-cap',
        'metric-market-cap-detail',
        'metric-bonding-percent'
    ];

    metricIds.forEach((id) => {
        const el = getElement(id);
        if (!el) return;
        if (id.endsWith('-detail')) {
            el.textContent = '';
        } else {
            el.textContent = '—';
        }
    });

    const bar = getElement('metric-bonding-bar');
    if (bar) {
        bar.style.width = '0%';
    }
}
// Track if this is the first update for smooth initial render
let isFirstMetricsUpdate = true;

function updateTokenMetrics({
    priceSol = null,
    priceUsd = null,
    marketCapUsd = null,
    bondingPercent = null,
    isBondingComplete = false,
    totalTokenHoldings = null,
    holdingsValueSol = null,
    holdingsValueUsd = null,
    amountInvestedSol = null,
    amountSoldSol = null,
    profitLossSol = null,
    isUnrealizedProfit = false,
    solPrice = null,
    source = ''
} = {}) {
    // Early return if token detail page is not visible
    const tokenDetailPage = document.getElementById('token-detail-page');
    if (!tokenDetailPage || tokenDetailPage.classList.contains('hidden')) {
        // Silently return - this is expected when navigating away from the page
        return;
    }
    
    // Preserve existing profit/loss values from state when not explicitly provided
    // This prevents partial updates (e.g., bondingPercent only) from resetting profit/loss to null
    const profitLossState = tokenDetailViewState.currentProfitLoss || {};
    if (profitLossSol === null && profitLossState.profitLossSol !== undefined) {
        profitLossSol = profitLossState.profitLossSol;
        isUnrealizedProfit = profitLossState.isUnrealizedProfit ?? false;
    }
    
    // Preserve existing holdings values when not explicitly provided
    const holdingsState = tokenDetailViewState.currentHoldings || {};
    if (totalTokenHoldings === null && holdingsState.totalTokenBalance !== undefined) {
        totalTokenHoldings = holdingsState.totalTokenBalance;
    }
    if (holdingsValueSol === null && holdingsState.holdingsValueSol !== undefined) {
        holdingsValueSol = holdingsState.holdingsValueSol;
    }
    if (holdingsValueUsd === null && holdingsState.holdingsValueUsd !== undefined) {
        holdingsValueUsd = holdingsState.holdingsValueUsd;
    }
    
    // Preserve investment/sold amounts when not explicitly provided
    if (amountInvestedSol === null && profitLossState.amountInvestedSol !== undefined) {
        amountInvestedSol = profitLossState.amountInvestedSol;
    }
    if (amountSoldSol === null && profitLossState.amountSoldSol !== undefined) {
        amountSoldSol = profitLossState.amountSoldSol;
    }
    
    // Preserve solPrice from state if not provided (needed for USD calculations)
    if (solPrice === null && tokenDetailViewState.solPrice !== undefined) {
        solPrice = tokenDetailViewState.solPrice;
    }
    
    const formatMaybeSol = (value) => (value !== null ? formatSol(value) : '—');
    const formatMaybeUsd = (value) => (value !== null ? formatUSD(value) : '—');

    const priceDisplay = (() => {
        if (priceSol === null && priceUsd === null) {
            return '—';
        }
        if (priceSol !== null && priceUsd !== null) {
            return `${priceSol.toFixed(priceSol >= 1 ? 3 : 6)} SOL (${formatUSD(priceUsd)})`;
        }
        if (priceSol !== null) {
            return `${priceSol.toFixed(priceSol >= 1 ? 3 : 6)} SOL`;
        }
        return formatUSD(priceUsd);
    })();

    // Profit/Loss display - show actual value even if unrealized
    let profitDisplay = '—';
    let profitDetail = '';
    
    if (profitLossSol !== null) {
        // Always show the actual profit/loss value
        const profitLossUsd = profitLossSol * (solPrice || 0);
        profitDisplay = formatUSD(profitLossUsd);
        
        // Show detail with SOL amount and whether it's realized or unrealized
        const solDisplay = formatSol(profitLossSol);
        if (isUnrealizedProfit) {
            profitDetail = `${solDisplay} (Unrealized)`;
        } else {
            profitDetail = `${solDisplay} (Realized + Unrealized)`;
        }
    }
    // REMOVED: Do NOT show holdingsValueSol as profit/loss
    // Holdings value is NOT the same as profit/loss. If we don't have actual profit/loss data,
    // show "—" instead of misleading holdings value. This prevents showing 12.38 SOL as profit.

    // Amount Invested display - show USD value if available, otherwise show SOL or $0
    const amountInvestedDisplay = amountInvestedSol !== null && amountInvestedSol > 0
        ? (solPrice && solPrice > 0 ? formatUSD(amountInvestedSol * solPrice) : formatSol(amountInvestedSol))
        : (totalTokenHoldings !== null && totalTokenHoldings > 0 && holdingsValueUsd !== null && holdingsValueUsd > 0 
            ? formatUSD(holdingsValueUsd) 
            : '$0');
    const holdingsDisplay =
        totalTokenHoldings !== null
            ? `${totalTokenHoldings.toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens`
            : '—';
    const holdingsDetail =
        holdingsValueSol !== null
            ? `${formatSol(holdingsValueSol)}${holdingsValueUsd !== null ? ` (${formatUSD(holdingsValueUsd)})` : ''}`
            : '';

    // Amount Sold display - show "$0" if no sales data, USD value if sold
    const amountSoldDisplay = amountSoldSol !== null && amountSoldSol > 0 
        ? (solPrice && solPrice > 0 ? formatUSD(amountSoldSol * solPrice) : formatSol(amountSoldSol))
        : '$0';
    const amountSoldDetail =
        amountSoldSol !== null && amountSoldSol > 0 && solPrice !== null 
            ? formatUSD(amountSoldSol * solPrice) 
            : '$0';

    const priceDetail = source ? `Source: ${source.toUpperCase()}` : '';
    const marketCapDisplay = marketCapUsd !== null ? formatUSD(marketCapUsd) : '—';

    const bondingDisplay =
        bondingPercent !== null && Number.isFinite(bondingPercent)
            ? `${Math.max(0, Math.min(100, bondingPercent)).toFixed(1)}%`
            : '—';

    // Smooth metric updates using requestAnimationFrame to prevent flash
    // Only animate if the value is actually changing (not initial load)
    const updateMetricSmoothly = (element, value, isInitialLoad = false) => {
        if (!element) return;
        
        const currentValue = element.textContent.trim();
        const isValueChanging = currentValue !== value && currentValue !== '—' && currentValue !== '';
        
        // For initial load or if value isn't changing, update immediately without animation
        if (isInitialLoad || !isValueChanging) {
            element.textContent = value;
            element.classList.add('metric-value');
            return;
        }
        
        // For subsequent updates, use smooth animation
        element.classList.add('metric-value', 'updating');
        requestAnimationFrame(() => {
            element.textContent = value;
            requestAnimationFrame(() => {
                element.classList.remove('updating');
            });
        });
    };

    // Use isInitialLoad flag for first update to prevent pop
    const isInitialLoad = isFirstMetricsUpdate;
    isFirstMetricsUpdate = false;
    
    // Apply color to profit/loss based on value (green for profit, red for loss)
    const profitLossEl = getElement('metric-profit-loss');
    const profitLossDetailEl = getElement('metric-profit-loss-detail');
    
    if (profitLossEl) {
        // Remove existing color classes
        profitLossEl.classList.remove('text-emerald-400', 'text-emerald-300', 'text-rose-400', 'text-rose-300', 'text-white', 'text-gray-400');
        
        // Apply color based on profit/loss value
        if (profitLossSol !== null) {
            if (profitLossSol > 0) {
                profitLossEl.classList.add('text-emerald-400'); // Green for profit
            } else if (profitLossSol < 0) {
                profitLossEl.classList.add('text-rose-400'); // Red for loss
            } else {
                profitLossEl.classList.add('text-white'); // White for break-even
            }
        } else {
            profitLossEl.classList.add('text-white'); // Default white
        }
    }
    
    // Also apply color to detail text
    if (profitLossDetailEl) {
        // Remove existing color classes
        profitLossDetailEl.classList.remove('text-emerald-400', 'text-emerald-300', 'text-rose-400', 'text-rose-300', 'text-gray-500', 'text-gray-400');
        
        // Apply color based on profit/loss value
        if (profitLossSol !== null) {
            if (profitLossSol > 0) {
                profitLossDetailEl.classList.add('text-emerald-300'); // Lighter green for detail
            } else if (profitLossSol < 0) {
                profitLossDetailEl.classList.add('text-rose-300'); // Lighter red for detail
            } else {
                profitLossDetailEl.classList.add('text-gray-400'); // Gray for break-even
            }
        } else {
            profitLossDetailEl.classList.add('text-gray-500'); // Default gray
        }
    }
    
    updateMetricSmoothly(profitLossEl, profitDisplay, isInitialLoad);
    updateMetricSmoothly(profitLossDetailEl, profitDetail, isInitialLoad);
    updateMetricSmoothly(getElement('metric-amount-invested'), amountInvestedDisplay, isInitialLoad);
    
    const investedDetailEl = getElement('metric-amount-invested-detail');
    if (investedDetailEl) {
        let detailValue = '';
        if (amountInvestedSol !== null && amountInvestedSol > 0 && solPrice !== null) {
            detailValue = formatUSD(amountInvestedSol * solPrice);
        } else if (totalTokenHoldings !== null && totalTokenHoldings > 0 && holdingsValueUsd !== null && holdingsValueUsd > 0) {
            // Show holdings value as detail if no investment amount
            detailValue = `Holdings: ${formatUSD(holdingsValueUsd)}`;
        } else if (amountInvestedSol === null || amountInvestedSol === 0) {
            detailValue = '$0';
        }
        updateMetricSmoothly(investedDetailEl, detailValue, isInitialLoad);
    }

    // Debug: Log what we're trying to display
    console.log('📊 Updating metric displays:', {
        totalTokenHoldings,
        holdingsDisplay,
        holdingsValueSol,
        holdingsValueUsd,
        holdingsDetail,
        amountInvestedSol,
        amountInvestedDisplay
    });
    
    const tokenHoldingsEl = getElement('metric-token-holdings');
    const tokenHoldingsDetailEl = getElement('metric-token-holdings-detail');
    const holdingsValueEl = getElement('metric-holdings-value');
    const holdingsValueDetailEl = getElement('metric-holdings-value-detail');
    
    console.log('📊 Metric elements found:', {
        tokenHoldingsEl: !!tokenHoldingsEl,
        tokenHoldingsDetailEl: !!tokenHoldingsDetailEl,
        holdingsValueEl: !!holdingsValueEl,
        holdingsValueDetailEl: !!holdingsValueDetailEl
    });
    
    updateMetricSmoothly(tokenHoldingsEl, holdingsDisplay, isInitialLoad);
    updateMetricSmoothly(tokenHoldingsDetailEl, holdingsDetail, isInitialLoad);
    
    // Format holdings value - handle null/0 values properly
    const holdingsValueDisplay = holdingsValueSol !== null && holdingsValueSol > 0 
        ? formatSol(holdingsValueSol) 
        : (totalTokenHoldings !== null && totalTokenHoldings > 0 ? 'Calculating...' : '—');
    updateMetricSmoothly(holdingsValueEl, holdingsValueDisplay, isInitialLoad);
    
    if (holdingsValueDetailEl) {
        const detailValue = holdingsValueUsd !== null && holdingsValueUsd > 0 
            ? formatUSD(holdingsValueUsd) 
            : '';
        updateMetricSmoothly(holdingsValueDetailEl, detailValue, isInitialLoad);
    }

    updateMetricSmoothly(getElement('metric-amount-sold'), amountSoldDisplay, isInitialLoad);
    updateMetricSmoothly(getElement('metric-amount-sold-detail'), amountSoldDetail, isInitialLoad);
    updateMetricSmoothly(getElement('metric-price-per-token'), priceDisplay, isInitialLoad);
    updateMetricSmoothly(getElement('metric-price-per-token-detail'), priceDetail, isInitialLoad);
    updateMetricSmoothly(getElement('metric-market-cap'), marketCapDisplay, isInitialLoad);

    const marketCapDetailEl = getElement('metric-market-cap-detail');
    if (marketCapDetailEl) {
        const detailValue = marketCapUsd !== null && solPrice
            ? `${formatSol(marketCapUsd / solPrice)} equivalent`
            : '';
        updateMetricSmoothly(marketCapDetailEl, detailValue);
    }

    const bondingPercentEl = getElement('metric-bonding-percent');
    if (bondingPercentEl) {
        // Smooth update with fade transition
        bondingPercentEl.classList.add('metric-value', 'updating');
        requestAnimationFrame(() => {
            if (isBondingComplete) {
                bondingPercentEl.textContent = '100%';
                bondingPercentEl.classList.remove('text-gray-300');
                bondingPercentEl.classList.add('text-emerald-400', 'font-semibold');
            } else {
                bondingPercentEl.textContent = bondingDisplay;
                bondingPercentEl.classList.remove('text-emerald-400', 'font-semibold');
                bondingPercentEl.classList.add('text-gray-300');
            }
            requestAnimationFrame(() => {
                bondingPercentEl.classList.remove('updating');
            });
        });
    }

    const bondingBar = getElement('metric-bonding-bar');
    if (bondingBar) {
        const width = bondingPercent !== null && Number.isFinite(bondingPercent)
            ? `${Math.max(0, Math.min(100, bondingPercent))}%`
            : '0%';
        bondingBar.style.width = width;
        
        // Update bar color based on completion status
        if (isBondingComplete) {
            bondingBar.classList.remove('bg-purple-500');
            bondingBar.classList.add('bg-emerald-500');
        } else {
            bondingBar.classList.remove('bg-emerald-500');
            bondingBar.classList.add('bg-purple-500');
        }
    }
    
    // Show/hide completion badge and message
    const completeBadge = getElement('bonding-complete-badge');
    const completeMessage = getElement('bonding-complete-message');
    const bondingMetric = getElement('bonding-curve-metric');
    
    if (isBondingComplete) {
        if (completeBadge) completeBadge.classList.remove('hidden');
        if (completeMessage) completeMessage.classList.remove('hidden');
        if (bondingMetric) {
            bondingMetric.classList.add('border-emerald-500/50', 'bg-emerald-950/20');
            bondingMetric.classList.remove('border-neutral-900');
        }
    } else {
        if (completeBadge) completeBadge.classList.add('hidden');
        if (completeMessage) completeMessage.classList.add('hidden');
        if (bondingMetric) {
            bondingMetric.classList.remove('border-emerald-500/50', 'bg-emerald-950/20');
            bondingMetric.classList.add('border-neutral-900');
        }
    }
    
    // Debug: Log which elements were found/updated
    const allMetricIds = [
        'metric-profit-loss', 'metric-profit-loss-detail',
        'metric-amount-invested', 'metric-amount-invested-detail',
        'metric-token-holdings', 'metric-token-holdings-detail',
        'metric-holdings-value', 'metric-holdings-value-detail',
        'metric-amount-sold', 'metric-amount-sold-detail',
        'metric-price-per-token', 'metric-price-per-token-detail',
        'metric-market-cap', 'metric-market-cap-detail',
        'metric-bonding-percent', 'metric-bonding-bar'
    ];
    const foundElements = allMetricIds.filter(id => getElement(id) !== null);
    const missingElements = allMetricIds.filter(id => getElement(id) === null);
    if (missingElements.length > 0) {
        console.warn('Missing metric elements:', missingElements);
    }
    if (foundElements.length > 0) {
        console.log(`✅ Updated ${foundElements.length} metric elements`);
    }
}

function updateTokenLastRuntime(timestamp = null) {
    const runtimeEl = getElement('token-last-runtime');
    if (!runtimeEl) {
        return;
    }
    if (!timestamp) {
        runtimeEl.textContent = '—';
        return;
    }
    runtimeEl.textContent = formatRelativeTime(timestamp);
}

function resetHoldingsTable({ message = 'Holdings will populate once the token is launched.', isLoading = false } = {}) {
    const body = getElement('token-holdings-body');
    if (!body) return;
    const loadingIcon = isLoading ? '<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin"></i>' : '';
    body.innerHTML = `
        <tr>
            <td colspan="5" class="py-10 px-4 text-center text-sm text-gray-500 bg-black/30">
                <div class="flex items-center justify-center gap-2">
                ${loadingIcon}
                <span>${escapeHtml(message)}</span>
                </div>
            </td>
        </tr>
    `;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

async function renderLaunchBlueprintList() {
    const listEl = getElement('launch-blueprint-list');
    const emptyEl = getElement('launch-blueprint-empty');
    if (!listEl || !emptyEl) {
        return;
    }

    const ready = ensureMultiWalletReady();
    let blueprints = [];

    if (ready) {
        try {
            blueprints = await blueprintService.fetchList();
        } catch (error) {
            console.warn('Unable to load blueprint list:', error);
            notify(`Unable to load blueprints: ${error.message}`, 'error');
        }
    }

    if (!ready || blueprints.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        listEl.classList.add('hidden');
        return;
    }

    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');

    const appliedBlueprintId = tokenLaunchState.launchConfig?.appliedBlueprint?.id || null;

    const cards = blueprints
        .slice()
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        .map((blueprint) => {
            const launch = blueprint.settings?.launch || {};
            const automations = blueprint.settings?.automations || {};
            const launchDetails = [];
            const isApplied = appliedBlueprintId && appliedBlueprintId === blueprint.id;

            if (launch.devBuyAmount !== undefined) {
                launchDetails.push(`Dev buy ${formatSol(launch.devBuyAmount)}`);
            }
            if (launch.initialBuyAmount !== undefined) {
                launchDetails.push(`Initial buy ${formatSol(launch.initialBuyAmount)}`);
            }
            if (automations.smartSell?.enabled) {
                launchDetails.push('Smart Sell enabled');
            }
            if (automations.volumeBot?.enabled) {
                launchDetails.push('Volume Bot enabled');
            }

            const detailText = launchDetails.length
                ? launchDetails.join(' • ')
                : 'No launch notes provided';

            return `
                <div class="bg-neutral-800 border ${isApplied ? 'border-purple-500/50' : 'border-neutral-700'} rounded-lg px-5 py-4">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <div class="text-sm font-semibold text-white flex items-center gap-2">
                                ${escapeHtml(blueprint.name || 'Untitled Blueprint')}
                                ${
                                    isApplied
                                        ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-purple-700/30 text-purple-200">Applied</span>'
                                        : ''
                                }
                            </div>
                            <div class="text-xs text-gray-500 mt-1">${escapeHtml(blueprint.description || 'No description')}</div>
                        </div>
                        <span class="text-[11px] text-gray-500">${formatRelativeTime(blueprint.updatedAt || blueprint.createdAt || Date.now())}</span>
                    </div>
                    <div class="mt-3 text-xs text-gray-400">${escapeHtml(detailText)}</div>
                    <div class="mt-4 flex items-center justify-end gap-2">
                        <button class="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs rounded transition"
                            onclick="applyBlueprintToLaunchFromSelector('${blueprint.id}')">
                            ${isApplied ? 'Reapply' : 'Apply'}
                        </button>
                        <button class="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-gray-200 text-xs rounded transition"
                            onclick="navigateToPage('blueprint'); closeModal('launch-blueprint-modal')">
                            Manage
                        </button>
                    </div>
                </div>
            `;
        })
        .join('');

    listEl.innerHTML = cards;
}

function openLaunchBlueprintModal() {
    if (!ensureMultiWalletReady()) {
        notify('Load wallets before applying a blueprint.', 'warning');
    }
    renderLaunchBlueprintList()
        .catch((error) => {
            console.error('Failed to render launch blueprint list:', error);
        })
        .finally(() => {
            window.openModal('launch-blueprint-modal');
        });
}

async function applyBlueprintToLaunchFromSelector(blueprintId) {
    if (!ensureMultiWalletReady()) {
        return;
    }

    try {
        await blueprintService.fetchList();
    } catch (error) {
        notify(`Unable to load blueprints: ${error.message}`, 'error');
        return;
    }

    const blueprint = blueprintService.getById(blueprintId);
    if (!blueprint) {
        notify('Blueprint not found.', 'error');
        return;
    }

    applyBlueprintToLaunch(blueprint);
    closeModal('launch-blueprint-modal');

    try {
        await prepareLaunchTokenView();
    } catch (error) {
        console.warn('Unable to refresh launch view after blueprint apply:', error);
    }

    navigateToPage('launch-token');
}

function renderTokenHoldingsTable(holdings = [], { priceSol = null, priceUsd = null } = {}) {
    const body = getElement('token-holdings-body');
    if (!body) {
        return;
    }

    // Filter out holdings with zero or null token balance
    const validHoldings = holdings.filter(h => 
        h.tokenBalance !== null && 
        h.tokenBalance !== undefined && 
        Number.isFinite(h.tokenBalance) && 
        h.tokenBalance > 0
    );
    
    if (!Array.isArray(holdings) || validHoldings.length === 0) {
        resetHoldingsTable({ message: 'No token holdings detected across managed wallets.' });
        return;
    }

    const rows = validHoldings
        .map((holding) => {
            const solBalanceLabel =
                holding.solBalance !== null && holding.solBalance !== undefined
                    ? formatSol(holding.solBalance)
                    : '—';

            const tokenBalanceLabel =
                holding.tokenBalance !== null && holding.tokenBalance !== undefined
                    ? `${holding.tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                    : '—';

            let tokenValueLabel = '';
            if (priceSol !== null && holding.tokenBalance !== null) {
                const valueSol = holding.tokenBalance * priceSol;
                const valueUsd =
                    priceUsd !== null && priceSol > 0 ? valueSol * (priceUsd / priceSol) : null;
                tokenValueLabel = `${formatSol(valueSol)}${
                    valueUsd !== null ? ` (${formatUSD(valueUsd)})` : ''
                }`;
            }

            const walletTags =
                Array.isArray(holding.tags) && holding.tags.length
                    ? `<div class="flex flex-wrap gap-1 mt-1">${holding.tags
                          .map(
                              (tag) =>
                                  `<span class="px-2 py-0.5 text-[10px] rounded-full bg-neutral-900 text-gray-400 border border-neutral-800">${escapeHtml(
                                      tag
                                  )}</span>`
                          )
                          .join('')}</div>`
                    : '';

            let actionMarkup = '<span class="text-xs text-gray-500">Read-only wallet</span>';

            if (holding.walletId) {
                const quickBuyOptions = [0.1, 0.5, 1];
                const quickBuyButtons = quickBuyOptions
                    .map(
                        (amount) => {
                            // Check if this amount is selected
                            const key = `${holding.walletId}_${holding.tokenMint || ''}`;
                            const selected = selectedBuyAmounts.get(key);
                            const isSelected = selected && selected.solAmount === amount;
                            
                            const baseClasses = 'px-2 py-1 rounded-md text-[11px] font-medium border transition';
                            const defaultClasses = 'bg-neutral-900 text-gray-300 border-neutral-800 hover:bg-neutral-800';
                            const selectedClasses = 'bg-emerald-900/70 text-emerald-200 border-emerald-800 hover:bg-emerald-800/80';
                            
                            return `
                            <button class="${baseClasses} ${isSelected ? selectedClasses : defaultClasses}"
                                data-wallet-id="${holding.walletId}"
                                data-token-mint="${holding.tokenMint || ''}"
                                data-buy-amount="${amount}"
                                onclick="handleBuyAmountSelection('${holding.walletId}', '${holding.address}', '${holding.tokenMint || ''}', ${amount})">
                                ${amount}
                    </button>`;
                        }
                    )
                    .join('');

                const sellButtons =
                    holding.tokenBalance && holding.tokenBalance > 0
                        ? [25, 50, 100]
                              .map(
                                  (percentage) => {
                                      // Check if this percentage is selected
                                      const key = `${holding.walletId}_${holding.tokenMint || ''}`;
                                      const selected = selectedSellPercentages.get(key);
                                      const isSelected = selected && selected.percentage === percentage;
                                      
                                      const baseClasses = 'px-2 py-1 rounded-md text-[11px] border transition';
                                      const defaultClasses = 'bg-neutral-900 text-gray-400 border-neutral-800 hover:bg-neutral-800';
                                      const selectedClasses = 'bg-rose-900/70 text-rose-200 border-rose-800 hover:bg-rose-800/80';
                                      
                                      return `
                                <button class="${baseClasses} ${isSelected ? selectedClasses : defaultClasses}"
                                    data-wallet-id="${holding.walletId}"
                                    data-token-mint="${holding.tokenMint || ''}"
                                    data-percentage="${percentage}"
                                    onclick="handleSellPercentageSelection('${holding.walletId}', '${holding.address}', '${holding.tokenMint || ''}', ${percentage}, ${holding.tokenBalance})">
                                ${percentage}%
                            </button>`;
                                  }
                              )
                              .join('')
                        : '';

                actionMarkup = `
                    <div class="flex flex-wrap items-center justify-end gap-2">
                        <div class="flex items-center gap-1">${quickBuyButtons}</div>
                        <button class="px-3 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition border border-emerald-500/40"
                            onclick="handleWalletTradeAction('buy', '${holding.walletId}', '${holding.address}', '${holding.tokenMint || ''}')">
                            Buy
                        </button>
                        ${sellButtons}
                        ${
                            holding.tokenBalance && holding.tokenBalance > 0
                                ? `<button class="px-3 py-1 rounded-md text-xs font-semibold bg-rose-900/70 text-rose-200 border border-rose-900 hover:bg-rose-800/80 transition"
                                    onclick="handleWalletTradeAction('sell', '${holding.walletId}', '${holding.address}', '${holding.tokenMint || ''}')">
                                    Sell
                                </button>`
                                : ''
                        }
                    </div>
                `;
            }

            return `
                <tr class="border-b border-neutral-900/60 hover:bg-black/40 transition">
                    <td class="py-4 pl-4">
                        <div class="flex items-center gap-3">
                            <span class="text-xl">${escapeHtml(holding.emoji || '👛')}</span>
                            <div>
                                <div class="text-sm font-semibold text-white">${escapeHtml(holding.name || 'Unnamed Wallet')}</div>
                                ${walletTags}
                            </div>
                        </div>
                    </td>
                    <td class="py-4 text-gray-400">
                        <div class="flex items-center gap-2">
                            <code class="font-mono text-xs text-gray-300 bg-black/40 px-2 py-1 rounded-md border border-neutral-900">${escapeHtml(
                                truncateMiddle(holding.address)
                            )}</code>
                            <button class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-neutral-900 text-gray-300 border border-neutral-800 hover:bg-neutral-800 transition"
                                onclick="copyAddress('${holding.address}')">
                                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                                Copy
                            </button>
                        </div>
                    </td>
                    <td class="py-4 text-gray-300">
                        <div class="font-medium">${solBalanceLabel}</div>
                    </td>
                    <td class="py-4 text-gray-300">
                        <div class="font-medium">${tokenBalanceLabel}</div>
                        ${tokenValueLabel ? `<div class="text-[11px] text-gray-500 mt-1">${tokenValueLabel}</div>` : ''}
                    </td>
                    <td class="py-4 pr-4">
                        ${actionMarkup}
                    </td>
                </tr>
            `;
        })
        .join('');

    body.innerHTML = rows;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Track previous activity entries for incremental updates
let previousActivityEntries = new Map(); // Map of signature -> entry

function renderTokenActivity(entries = [], { loading = false, isLive = false, solPrice = null } = {}) {
    const empty = getElement('token-activity-empty');
    const tableWrapper = getElement('token-activity-table');
    const tbody = getElement('token-activity-body');

    if (!empty || !tableWrapper || !tbody) {
        return;
    }

    if (loading) {
        empty.classList.remove('hidden');
        empty.innerHTML = `
            <div class="flex items-center justify-center text-sm text-gray-500">
                <i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i>
                <span>${isLive ? 'Streaming live trades…' : 'Loading activity…'}</span>
            </div>
        `;
        tableWrapper.classList.add('hidden');
        return;
    }

    if (!Array.isArray(entries) || entries.length === 0) {
        empty.classList.remove('hidden');
        empty.innerHTML = `
            <div class="text-sm text-gray-500">
                ${isLive ? 'No live trades captured yet.' : 'No activity recorded.'}
            </div>
        `;
        tableWrapper.classList.add('hidden');
        previousActivityEntries.clear();
        return;
    }

    tableWrapper.classList.remove('hidden');
    empty.classList.add('hidden');

    // Use requestAnimationFrame for smooth updates
    requestAnimationFrame(() => {
        // Create a map of current entries by signature for comparison
        const currentEntriesMap = new Map();
        entries.forEach(entry => {
            const key = entry.signature || `${entry.wallet}-${entry.timestamp}-${entry.type}`;
            currentEntriesMap.set(key, entry);
        });

        // Find new entries (not in previous map)
        const newEntries = entries.filter(entry => {
            const key = entry.signature || `${entry.wallet}-${entry.timestamp}-${entry.type}`;
            return !previousActivityEntries.has(key);
        });

        // If we have new entries, add them incrementally for smooth animation
        if (newEntries.length > 0 && previousActivityEntries.size > 0) {
            // Add new rows at the top with fade-in animation
            newEntries.forEach((entry, index) => {
                const row = createActivityRow(entry, solPrice);
                row.style.opacity = '0';
                row.style.transform = 'translateY(-10px)';
                tbody.insertBefore(row, tbody.firstChild);
                
                // Animate in
                requestAnimationFrame(() => {
                    row.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    row.style.opacity = '1';
                    row.style.transform = 'translateY(0)';
                });
            });

            // Remove old entries that are no longer in the list (keep only top 20)
            const existingRows = Array.from(tbody.children);
            const maxRows = 20;
            if (existingRows.length > maxRows) {
                for (let i = maxRows; i < existingRows.length; i++) {
                    existingRows[i].style.transition = 'opacity 0.2s ease, transform 0.2s ease';
                    existingRows[i].style.opacity = '0';
                    existingRows[i].style.transform = 'translateX(-10px)';
                    setTimeout(() => {
                        if (existingRows[i].parentNode) {
                            existingRows[i].remove();
                        }
                    }, 200);
                }
            }
        } else {
            // Full render for initial load or when structure changes significantly
    const rows = entries
                .slice(0, 20) // Limit to 20 rows for performance
                .map((entry) => createActivityRow(entry, solPrice).outerHTML)
                .join('');
            
            tbody.innerHTML = rows;
        }

        // Update previous entries map
        previousActivityEntries = currentEntriesMap;
    });
}

function createActivityRow(entry, solPrice) {
    const row = document.createElement('tr');
    row.className = 'border-b border-neutral-800 last:border-b-0 activity-row';
    
            const age = entry.timestamp ? formatRelativeTime(entry.timestamp) : '—';
            const walletLabel = entry.wallet ? truncateMiddle(entry.wallet) : '—';
            const typeBadgeClass =
                entry.type === 'buy'
                    ? 'text-emerald-300'
                    : entry.type === 'sell'
                    ? 'text-rose-300'
                    : 'text-gray-300';
    
    // Build amount label with SOL and USD
    let amountLabel = '—';
    if (entry.amountSol !== undefined && entry.amountSol !== null) {
        const solAmount = entry.amountSol.toFixed(entry.amountSol >= 1 ? 3 : 6);
        if (solPrice && solPrice > 0) {
            const usdAmount = entry.amountSol * solPrice;
            amountLabel = `${solAmount} SOL<br><span class="text-gray-400 text-xs">${formatUSD(usdAmount)}</span>`;
        } else {
            amountLabel = `${solAmount} SOL`;
        }
    } else if (entry.amountTokens !== undefined && entry.amountTokens !== null) {
        amountLabel = `${entry.amountTokens.toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens`;
    }

    row.innerHTML = `
                    <td class="py-2 text-sm text-gray-400">${escapeHtml(age)}</td>
                    <td class="py-2 text-sm text-gray-300">${escapeHtml(walletLabel)}</td>
                    <td class="py-2 text-sm ${typeBadgeClass} font-medium text-uppercase">${escapeHtml((entry.type || '—').toUpperCase())}</td>
        <td class="py-2 text-sm text-right text-gray-200">${amountLabel.includes('<') ? amountLabel : escapeHtml(amountLabel)}</td>
            `;

    return row;
}

// PumpPortal WebSocket Manager
let pumpPortalWebSocket = null;
let pumpPortalSubscriptions = new Set(); // Track subscribed token mints
let pumpPortalReconnectAttempts = 0;
const PUMPPORTAL_WS_BASE = 'wss://pumpportal.fun/api/data';
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

function getPumpPortalApiKey() {
    // Try to get API key from settings
    try {
        if (typeof window.settingsManager !== 'undefined' && window.settingsManager.getSettings) {
            const settings = window.settingsManager.getSettings();
            return settings?.pumpportal?.apiKey || '';
        }
        // Fallback: try localStorage
        const stored = localStorage.getItem('chaosbot_settings');
        if (stored) {
            const settings = JSON.parse(stored);
            return settings?.pumpportal?.apiKey || '';
        }
    } catch (error) {
        console.debug('Failed to get PumpPortal API key from settings:', error);
    }
    return '';
}

function getPumpPortalWebSocketUrl() {
    const apiKey = getPumpPortalApiKey();
    if (apiKey) {
        return `${PUMPPORTAL_WS_BASE}?api-key=${encodeURIComponent(apiKey)}`;
    }
    // Connect without API key (restricted to bonding curve trades only)
    return PUMPPORTAL_WS_BASE;
}

function connectPumpPortalWebSocket() {
    if (pumpPortalWebSocket && pumpPortalWebSocket.readyState === WebSocket.OPEN) {
        return; // Already connected
    }

    try {
        const wsUrl = getPumpPortalWebSocketUrl();
        const apiKey = getPumpPortalApiKey();
        
        if (apiKey) {
            console.log('🔑 Connecting to PumpPortal WebSocket with API key');
        } else {
            console.log('⚠️ Connecting to PumpPortal WebSocket without API key (bonding curve trades only)');
        }
        
        pumpPortalWebSocket = new WebSocket(wsUrl);

        pumpPortalWebSocket.onopen = () => {
            console.log('✅ PumpPortal WebSocket connected');
            pumpPortalReconnectAttempts = 0;
            
            // Re-subscribe to all active subscriptions
            pumpPortalSubscriptions.forEach(mint => {
                subscribeToTokenTrades(mint);
            });
        };

        pumpPortalWebSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handlePumpPortalMessage(data);
            } catch (error) {
                console.warn('Failed to parse PumpPortal message:', error);
            }
        };

        pumpPortalWebSocket.onerror = (error) => {
            // Silently handle WebSocket errors - connection issues are expected
            // Browser will log the error anyway, no need to duplicate
            console.debug('PumpPortal WebSocket error (expected):', error);
        };

        pumpPortalWebSocket.onclose = () => {
            // Only log if we have active subscriptions (connection was intentional)
            if (pumpPortalSubscriptions.size > 0) {
                console.debug('PumpPortal WebSocket closed');
            }
            pumpPortalWebSocket = null;
            
            // Attempt to reconnect if we have active subscriptions
            if (pumpPortalSubscriptions.size > 0 && pumpPortalReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                pumpPortalReconnectAttempts++;
                console.log(`Reconnecting to PumpPortal WebSocket (attempt ${pumpPortalReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(() => {
                    connectPumpPortalWebSocket();
                }, RECONNECT_DELAY_MS);
            }
        };
    } catch (error) {
        console.error('Failed to create PumpPortal WebSocket:', error);
    }
}

function subscribeToTokenTrades(mint) {
    if (!mint) return;
    
    // Add to subscriptions first (will be subscribed when connection is ready)
    pumpPortalSubscriptions.add(mint);
    
    if (!pumpPortalWebSocket || pumpPortalWebSocket.readyState !== WebSocket.OPEN) {
        // If connection is in progress (CONNECTING), wait for it
        if (pumpPortalWebSocket && pumpPortalWebSocket.readyState === WebSocket.CONNECTING) {
            pumpPortalWebSocket.addEventListener('open', () => {
                sendPumpPortalSubscribe('subscribeTokenTrade', [mint]);
            }, { once: true });
            return;
        }
        
        // Start new connection
        connectPumpPortalWebSocket();
        
        // Wait for connection to open, then subscribe
        const checkConnection = setInterval(() => {
            if (pumpPortalWebSocket && pumpPortalWebSocket.readyState === WebSocket.OPEN) {
                clearInterval(checkConnection);
                sendPumpPortalSubscribe('subscribeTokenTrade', [mint]);
            } else if (pumpPortalWebSocket && pumpPortalWebSocket.readyState === WebSocket.CLOSED) {
                clearInterval(checkConnection);
                // Connection failed, will retry on next attempt
            }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => clearInterval(checkConnection), 5000);
        return;
    }

    // Connection is ready, subscribe immediately
    sendPumpPortalSubscribe('subscribeTokenTrade', [mint]);
}

function unsubscribeFromTokenTrades(mint) {
    if (!mint || !pumpPortalSubscriptions.has(mint)) return;
    
    if (pumpPortalWebSocket && pumpPortalWebSocket.readyState === WebSocket.OPEN) {
        sendPumpPortalSubscribe('unsubscribeTokenTrade', [mint]);
    }
    
    pumpPortalSubscriptions.delete(mint);
    
    // Close connection if no more subscriptions
    if (pumpPortalSubscriptions.size === 0 && pumpPortalWebSocket) {
        pumpPortalWebSocket.close();
        pumpPortalWebSocket = null;
    }
}

function sendPumpPortalSubscribe(method, keys) {
    if (!pumpPortalWebSocket || pumpPortalWebSocket.readyState !== WebSocket.OPEN) {
        // Silently skip if not ready - will retry when connection is established
        return;
    }

    try {
        const payload = {
            method: method,
            keys: keys
        };
        pumpPortalWebSocket.send(JSON.stringify(payload));
    } catch (error) {
        console.error('Failed to send PumpPortal subscription:', error);
    }
}

function handlePumpPortalMessage(data) {
    // Handle different message types from PumpPortal
    // PumpPortal sends trade data in various formats - check for trade indicators
    const isTrade = data.type === 'trade' || 
                    data.action === 'buy' || 
                    data.action === 'sell' ||
                    data.event === 'trade' ||
                    data.side === 'buy' ||
                    data.side === 'sell' ||
                    (data.mint && (data.solAmount || data.tokenAmount));
    
    if (isTrade) {
        const currentMint = tokenRegistry.current?.mint;
        if (!currentMint) return;
        
        // Check if this trade is for the current token
        const tradeMint = data.mint || data.token || data.tokenMint || data.tokenAddress;
        if (tradeMint && tradeMint.toLowerCase() === currentMint.toLowerCase()) {
            // Extract trade data from various possible formats
            const timestamp = data.timestamp || data.time || data.createdAt || Date.now();
            const wallet = data.wallet || data.account || data.user || data.authority || data.address || '';
            const type = data.action === 'buy' || data.side === 'buy' ? 'buy' : 
                        data.action === 'sell' || data.side === 'sell' ? 'sell' : 'trade';
            
            // Try to extract amounts - PumpPortal might use different field names
            let amountSol = data.solAmount || data.amount || data.sol || data.solIn || null;
            let amountTokens = data.tokenAmount || data.amountTokens || data.tokens || data.tokenOut || null;
            
            // If amounts are strings, try to parse them
            if (typeof amountSol === 'string') {
                amountSol = parseFloat(amountSol) || null;
            }
            if (typeof amountTokens === 'string') {
                amountTokens = parseFloat(amountTokens) || null;
            }
            
            // Add to activity feed
            const activityEntry = {
                timestamp: typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime() || Date.now(),
                wallet: wallet,
                type: type,
                amountSol: amountSol,
                amountTokens: amountTokens
            };
            
            // Get current activity and prepend new trade
            const currentActivity = tokenDetailViewState.currentActivity || [];
            const updatedActivity = [activityEntry, ...currentActivity].slice(0, 50); // Keep last 50
            tokenDetailViewState.currentActivity = updatedActivity;
            
            // Get solPrice for USD conversion
            const solPrice = tokenDetailViewState.solPrice || null;
            renderTokenActivity(updatedActivity, { isLive: true, solPrice });
            
            // Trigger metrics refresh when new trade is detected
                if (tokenRegistry.current && tokenRegistry.current.mint === currentMint) {
                refreshMetricsOnEvent(currentMint, 'new-trade');
            }
        }
    }
}

function stopTokenActivityStream() {
    // Unsubscribe from WebSocket if active
    const currentMint = tokenRegistry.current?.mint;
    if (currentMint) {
        unsubscribeFromTokenTrades(currentMint);
        unsubscribeFromShyftTokenAccount(currentMint);
        unsubscribeFromSolanaRpcTokenAccount(currentMint);
    }
    
    // Also clear any polling interval (fallback)
    if (tokenDetailViewState.activityIntervalId) {
        clearInterval(tokenDetailViewState.activityIntervalId);
        tokenDetailViewState.activityIntervalId = null;
    }
}

// Event-driven metrics refresh system
// Updates only on events (buy/sell actions, new trades, price changes) + fallback polling
let lastExternalApiCall = 0;
const EXTERNAL_API_INTERVAL = 5000; // Call Jupiter/DexScreener every 5 seconds max
let solPriceCache = { value: null, timestamp: 0 };
const SOL_PRICE_CACHE_DURATION = 30000; // Cache SOL price for 30 seconds

// Debouncing for event-driven updates
let metricsRefreshDebounceTimer = null;
const METRICS_REFRESH_DEBOUNCE = 2000; // Wait 2 seconds after last event before refreshing
let lastMetricsRefresh = 0;
const MIN_METRICS_REFRESH_INTERVAL = 3000; // Minimum 3 seconds between refreshes

// Event-driven metrics refresh function
async function refreshMetricsOnEvent(mint, reason = 'event') {
    if (!mint) return;
    
    // Check if we're on the token detail page for this mint
    const tokenDetailPage = document.getElementById('token-detail-page');
    if (!tokenDetailPage || tokenDetailPage.classList.contains('hidden')) {
        return;
    }

    if (!tokenRegistry.current || tokenRegistry.current.mint !== mint) {
        return;
    }
    
    // Debounce rapid events
    const now = Date.now();
    if (now - lastMetricsRefresh < MIN_METRICS_REFRESH_INTERVAL) {
        // Clear existing debounce timer and set a new one
        if (metricsRefreshDebounceTimer) {
            clearTimeout(metricsRefreshDebounceTimer);
        }
        metricsRefreshDebounceTimer = setTimeout(() => {
            refreshMetricsOnEvent(mint, reason);
        }, METRICS_REFRESH_DEBOUNCE);
        return;
    }
    
    lastMetricsRefresh = now;
    console.log(`🔄 Refreshing metrics (${reason}) for`, mint);
    
    try {
        // Get SOL price (cached)
        let currentSolPrice = solPriceCache.value;
        if (!currentSolPrice || (now - solPriceCache.timestamp) > SOL_PRICE_CACHE_DURATION) {
            try {
                currentSolPrice = await (solanaIntegration?.getSolPrice?.() || Promise.resolve(null));
                if (currentSolPrice) {
                    solPriceCache = { value: currentSolPrice, timestamp: now };
                    tokenDetailViewState.solPrice = currentSolPrice;
                }
            } catch (error) {
                console.debug('SOL price fetch failed, using cache:', error.message);
            }
        }
        
        // Fetch fresh price and market cap data
        const priceDetails = await fetchTokenPriceDetails(mint, { 
            solPrice: currentSolPrice,
            preferOnChain: false
        });
        
        if (priceDetails) {
            const hasData = priceDetails.priceUsd !== null || priceDetails.marketCapUsd !== null || priceDetails.priceSol !== null;
            
            if (hasData) {
                // Use cached bonding curve value
                const bondingCache = tokenDetailViewState.bondingCurveCache;
                const bondingPercent = bondingCache?.percent ?? null;
                const isBondingComplete = bondingCache?.isComplete ?? false;
                
                // Get current holdings from state to preserve them if not refreshing
                const currentHoldings = tokenDetailViewState.currentHoldings || null;
                
                // Also refresh holdings if this is a user action or fallback polling
                let holdingsData = null;
                if (reason === 'user-action' || reason === 'fallback-polling') {
                    try {
                        const holdingsResult = await fetchWalletHoldingsForMint(mint, { 
                            source: tokenDetailViewState.holdingsSource || 'jito',
                            priceSol: priceDetails.priceSol
                        });
                        holdingsData = holdingsResult.summary || { totalTokenBalance: 0, totalHoldingsSol: 0 };
                    } catch (error) {
                        console.debug('Holdings refresh failed:', error.message);
                    }
                }
                
                // Calculate holdings values
                let totalTokenHoldings = null;
                let holdingsValueSol = null;
                let holdingsValueUsd = null;
                
                if (holdingsData && holdingsData.totalTokenBalance > 0) {
                    totalTokenHoldings = holdingsData.totalTokenBalance;
                    holdingsValueSol = priceDetails.priceSol ? holdingsData.totalTokenBalance * priceDetails.priceSol : holdingsData.totalHoldingsSol;
                    holdingsValueUsd = holdingsValueSol && currentSolPrice ? holdingsValueSol * currentSolPrice : null;
                } else if (currentHoldings && currentHoldings.totalTokenBalance > 0 && priceDetails.priceSol) {
                    // Preserve existing holdings if we have price but didn't refresh holdings
                    totalTokenHoldings = currentHoldings.totalTokenBalance;
                    holdingsValueSol = currentHoldings.totalTokenBalance * priceDetails.priceSol;
                    holdingsValueUsd = holdingsValueSol && currentSolPrice ? holdingsValueSol * currentSolPrice : null;
                }
                
                // Preserve profit/loss calculation from initial load
                const profitLossState = tokenDetailViewState.currentProfitLoss || {};
                
                // Preserve profit/loss from state - only recalculate if we have investment data AND holdings changed
                let profitLossSol = profitLossState.profitLossSol ?? null;
                let isUnrealizedProfit = profitLossState.isUnrealizedProfit ?? false;
                
                // Only recalculate profit/loss if:
                // 1. Holdings were actually refreshed (holdingsData exists)
                // 2. We have investment data (amountInvestedSol) to calculate real profit/loss
                // DO NOT recalculate if we don't have investment data - holdingsValueSol is NOT profit
                if (holdingsData && holdingsData.totalTokenBalance > 0 && priceDetails.priceSol) {
                    const amountInvestedSol = profitLossState.amountInvestedSol ?? null;
                    const amountSoldSol = profitLossState.amountSoldSol ?? null;
                    
                    // Only recalculate if we have investment data - this gives us accurate profit/loss
                    if (holdingsValueSol !== null && amountInvestedSol !== null && amountInvestedSol > 0) {
                        profitLossSol = holdingsValueSol + (amountSoldSol || 0) - amountInvestedSol;
                        isUnrealizedProfit = false;
                    }
                    // If no investment data, preserve existing profitLossSol from state
                    // Don't set it to holdingsValueSol - that's not profit, that's just holdings value
                }
                
                // Update metrics with fresh data (preserve holdings and profit/loss if not refreshing them)
                updateTokenMetrics({
                    priceSol: priceDetails.priceSol,
                    priceUsd: priceDetails.priceUsd,
                    marketCapUsd: priceDetails.marketCapUsd,
                    bondingPercent,
                    isBondingComplete,
                    totalTokenHoldings,
                    holdingsValueSol,
                    holdingsValueUsd,
                    amountInvestedSol: profitLossState.amountInvestedSol ?? null,
                    amountSoldSol: profitLossState.amountSoldSol ?? null,
                    profitLossSol,
                    isUnrealizedProfit,
                    solPrice: currentSolPrice,
                    source: priceDetails.source || ''
                });
            }
        }
    } catch (error) {
        console.warn('Metrics refresh error:', error.message);
    }
}

function startMetricsRefresh(mint, solPrice = null) {
    stopMetricsRefresh(); // Clear any existing interval
    
    if (!mint) return;
    
    // Initialize SOL price cache
    if (solPrice) {
        solPriceCache = { value: solPrice, timestamp: Date.now() };
        tokenDetailViewState.solPrice = solPrice;
    }
    
    // Event-driven updates with 30-second fallback polling
    console.log('🔄 Starting event-driven metrics refresh for', mint, '- updates on events + 30s fallback');
    
    // Do an immediate update on start (but preserve existing holdings)
    (async () => {
        try {
            const priceDetails = await fetchTokenPriceDetails(mint, { 
                solPrice: solPrice || solPriceCache.value,
                preferOnChain: false
            });
            if (priceDetails && (priceDetails.priceUsd !== null || priceDetails.marketCapUsd !== null || priceDetails.priceSol !== null)) {
                // Preserve existing holdings from state if available
                const currentHoldings = tokenDetailViewState.currentHoldings || null;
                let totalTokenHoldings = null;
                let holdingsValueSol = null;
                let holdingsValueUsd = null;
                
                if (currentHoldings && currentHoldings.totalTokenBalance > 0) {
                    totalTokenHoldings = currentHoldings.totalTokenBalance;
                    // Recalculate with new price if available
                    if (priceDetails.priceSol) {
                        holdingsValueSol = currentHoldings.totalTokenBalance * priceDetails.priceSol;
                        const currentSolPrice = solPrice || solPriceCache.value;
                        holdingsValueUsd = holdingsValueSol && currentSolPrice ? holdingsValueSol * currentSolPrice : currentHoldings.holdingsValueUsd;
                    } else {
                        // Use cached values if no new price
                        holdingsValueSol = currentHoldings.holdingsValueSol;
                        holdingsValueUsd = currentHoldings.holdingsValueUsd;
                    }
                }
                
                // Preserve profit/loss calculation from state
                const profitLossState = tokenDetailViewState.currentProfitLoss || {};
                let profitLossSol = profitLossState.profitLossSol ?? null;
                let isUnrealizedProfit = profitLossState.isUnrealizedProfit ?? false;
                
                // Only recalculate profit/loss if we have investment data
                // DO NOT set profitLossSol to holdingsValueSol - that's not profit, that's just holdings value
                if (holdingsValueSol !== null && profitLossState.amountInvestedSol !== null && profitLossState.amountInvestedSol > 0) {
                    profitLossSol = holdingsValueSol + (profitLossState.amountSoldSol || 0) - profitLossState.amountInvestedSol;
                    isUnrealizedProfit = false;
                }
                // If no investment data, preserve existing profitLossSol from state
                // Don't recalculate - holdingsValueSol is NOT profit
                
                updateTokenMetrics({
                    priceSol: priceDetails.priceSol,
                    priceUsd: priceDetails.priceUsd,
                    marketCapUsd: priceDetails.marketCapUsd,
                    totalTokenHoldings,
                    holdingsValueSol,
                    holdingsValueUsd,
                    amountInvestedSol: profitLossState.amountInvestedSol ?? null,
                    amountSoldSol: profitLossState.amountSoldSol ?? null,
                    profitLossSol,
                    isUnrealizedProfit,
                    solPrice: solPrice || solPriceCache.value,
                    source: priceDetails.source || ''
                });
            }
        } catch (error) {
            console.debug('Initial metrics refresh error:', error.message);
        }
    })();
    
    // Fallback polling every 30 seconds (safety net for missed events)
    tokenDetailViewState.metricsRefreshIntervalId = setInterval(async () => {
        // Check if token detail page is visible
        const tokenDetailPage = document.getElementById('token-detail-page');
        if (!tokenDetailPage || tokenDetailPage.classList.contains('hidden')) {
            stopMetricsRefresh();
            return;
        }
        
        // Only refresh if we're still on the token detail page for this mint
        if (!tokenRegistry.current || tokenRegistry.current.mint !== mint) {
            stopMetricsRefresh();
            return;
        }
        
        // Fallback refresh (only if no recent event-driven refresh)
        const timeSinceLastRefresh = Date.now() - lastMetricsRefresh;
        if (timeSinceLastRefresh < 25000) {
            // Recent event-driven refresh, skip this fallback
            return;
        }
        
        console.log('🔄 Fallback metrics refresh (30s interval)');
        await refreshMetricsOnEvent(mint, 'fallback-polling');
    }, 30000); // 30 seconds fallback polling
}

function stopMetricsRefresh() {
    if (tokenDetailViewState.metricsRefreshIntervalId) {
        clearInterval(tokenDetailViewState.metricsRefreshIntervalId);
        tokenDetailViewState.metricsRefreshIntervalId = null;
    }
    if (tokenDetailViewState.bondingCurveRefreshIntervalId) {
        clearInterval(tokenDetailViewState.bondingCurveRefreshIntervalId);
        tokenDetailViewState.bondingCurveRefreshIntervalId = null;
    }
}

/**
 * Start bonding curve refresh (less frequent - every 30 seconds)
 * Bonding curve doesn't change as fast as price/market cap
 */
function startBondingCurveRefresh(mint) {
    // Clear any existing interval
    if (tokenDetailViewState.bondingCurveRefreshIntervalId) {
        clearInterval(tokenDetailViewState.bondingCurveRefreshIntervalId);
    }
    
    if (!mint) return;
    
    // Refresh every 30 seconds (bonding curve changes slowly)
    tokenDetailViewState.bondingCurveRefreshIntervalId = setInterval(async () => {
        // Check if token detail page is visible
        const tokenDetailPage = document.getElementById('token-detail-page');
        if (!tokenDetailPage || tokenDetailPage.classList.contains('hidden')) {
            stopMetricsRefresh();
            return;
        }
        
        // Only refresh if we're still on the token detail page for this mint
        if (!tokenRegistry.current || tokenRegistry.current.mint !== mint) {
            stopMetricsRefresh();
            return;
        }
        
        // Check if cache is still fresh (less than 30 seconds old)
        const cache = tokenDetailViewState.bondingCurveCache;
        const now = Date.now();
        if (cache.percent !== null && (now - cache.timestamp) < 30000) {
            // Use cached value - no need to recalculate
            return;
        }
        
        try {
            console.log('🔄 Refreshing bonding curve (30s interval)...');
            let bondingPercent = null;
            let isBondingComplete = false;
            
            // Try Moralis API first
            if (window.enhancedTokenFetchers?.fetchMoralisBondingCurve) {
                try {
                    const moralisBonding = await window.enhancedTokenFetchers.fetchMoralisBondingCurve(mint);
                    if (moralisBonding && moralisBonding.bondingCurvePercentage !== null) {
                        bondingPercent = moralisBonding.bondingCurvePercentage;
                        isBondingComplete = moralisBonding.isComplete === true || bondingPercent >= 100;
                        console.log('✅ Bonding curve refreshed from Moralis:', bondingPercent + '%');
                    }
                } catch (error) {
                    console.debug('Moralis bonding curve refresh failed:', error.message);
                }
            }
            
            // Fallback to on-chain calculation
            if (bondingPercent === null) {
                try {
                    const onChainPercent = await calculateBondingCurvePercent(mint);
                    if (onChainPercent !== null) {
                        bondingPercent = onChainPercent;
                        isBondingComplete = bondingPercent >= 100;
                        console.log('✅ Bonding curve refreshed from on-chain:', bondingPercent + '%');
                    }
                } catch (error) {
                    console.debug('On-chain bonding curve refresh failed:', error.message);
                }
            }
            
            // Update cache and UI if we got new data
            if (bondingPercent !== null) {
                tokenDetailViewState.bondingCurveCache = {
                    percent: bondingPercent,
                    isComplete: isBondingComplete,
                    timestamp: Date.now()
                };
                
                // Update only the bonding curve metric (don't reload everything)
                updateTokenMetrics({
                    bondingPercent,
                    isBondingComplete
                    // Other fields will keep their existing values
                });
            }
        } catch (error) {
            console.debug('Bonding curve refresh error:', error.message);
        }
    }, 30000); // Every 30 seconds
}

// Shyft WebSocket Manager for Real-time Transaction Monitoring
let shyftWebSocket = null;
let shyftSubscriptions = new Map(); // Map of mint -> subscription ID
let shyftReconnectAttempts = 0;
const SHYFT_MAX_RECONNECT_ATTEMPTS = 5;
const SHYFT_RECONNECT_DELAY_MS = 3000;

// Solana RPC WebSocket Manager for Live Trade Monitoring (fallback/alternative)
let solanaRpcWebSocket = null;
let solanaRpcSubscriptions = new Map(); // Map of mint -> subscription ID
let solanaRpcReconnectAttempts = 0;
const SOLANA_RPC_MAX_RECONNECT_ATTEMPTS = 5;
const SOLANA_RPC_RECONNECT_DELAY_MS = 3000;

function getShyftSettings() {
    try {
        if (typeof window.settingsManager !== 'undefined' && window.settingsManager.getSettings) {
            const settings = window.settingsManager.getSettings();
            return settings?.shyft || {};
        }
        // Fallback: try localStorage
        const stored = localStorage.getItem('chaosbot_settings');
        if (stored) {
            const settings = JSON.parse(stored);
            return settings?.shyft || {};
        }
    } catch (error) {
        console.debug('Failed to get Shyft settings:', error);
    }
    return {};
}

function getShyftWebSocketUrl() {
    const settings = getShyftSettings();
    const apiKey = settings?.apiKey || '';
    if (!apiKey) {
        return null;
    }
    return `wss://rpc.shyft.to?api_key=${encodeURIComponent(apiKey)}`;
}

function connectShyftWebSocket() {
    const settings = getShyftSettings();
    if (!settings?.enabled || !settings?.apiKey) {
        return; // Shyft monitoring not enabled
    }

    if (shyftWebSocket && shyftWebSocket.readyState === WebSocket.OPEN) {
        return; // Already connected
    }

    const wsUrl = getShyftWebSocketUrl();
    if (!wsUrl) {
        return;
    }

    try {
        console.log('🔵 Connecting to Shyft WebSocket for transaction monitoring...');
        shyftWebSocket = new WebSocket(wsUrl);

        shyftWebSocket.onopen = () => {
            console.log('✅ Shyft WebSocket connected');
            shyftReconnectAttempts = 0;
            
            // Re-subscribe to all active subscriptions
            shyftSubscriptions.forEach((subscriptionId, mint) => {
                subscribeToShyftTokenAccount(mint);
            });
        };

        shyftWebSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleShyftMessage(data);
            } catch (error) {
                console.debug('Failed to parse Shyft message:', error);
            }
        };

        shyftWebSocket.onerror = (error) => {
            console.debug('Shyft WebSocket error:', error);
        };

        shyftWebSocket.onclose = () => {
            console.debug('Shyft WebSocket closed');
            shyftWebSocket = null;
            
            // Attempt to reconnect if we have active subscriptions
            if (shyftSubscriptions.size > 0 && shyftReconnectAttempts < SHYFT_MAX_RECONNECT_ATTEMPTS) {
                shyftReconnectAttempts++;
                console.log(`Reconnecting to Shyft WebSocket (attempt ${shyftReconnectAttempts}/${SHYFT_MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(() => {
                    connectShyftWebSocket();
                }, SHYFT_RECONNECT_DELAY_MS);
            }
        };
    } catch (error) {
        console.error('Failed to create Shyft WebSocket:', error);
    }
}

function sendShyftRequest(method, params) {
    if (!shyftWebSocket || shyftWebSocket.readyState !== WebSocket.OPEN) {
        return;
    }

    const requestId = Date.now() + Math.random();
    const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: method,
        params: params
    };

    shyftWebSocket.send(JSON.stringify(request));
    return requestId;
}

function subscribeToShyftTokenAccount(mint) {
    if (!mint) return;

    const settings = getShyftSettings();
    if (!settings?.enabled || !settings?.apiKey) {
        return; // Shyft monitoring not enabled
    }

    // Get the token mint public key
    if (!window.solanaWeb3?.PublicKey) {
        console.warn('Solana Web3 not available for Shyft subscription');
        return;
    }

    try {
        const mintPubkey = new window.solanaWeb3.PublicKey(mint);
        
        // Subscribe to account changes for the token mint
        // This will notify us of all transactions involving this token
        const subscriptionId = sendShyftRequest('accountSubscribe', [
            mintPubkey.toBase58(),
            {
                encoding: 'jsonParsed',
                commitment: 'confirmed'
            }
        ]);

        if (subscriptionId) {
            shyftSubscriptions.set(mint, subscriptionId);
            console.log(`🔵 Subscribed to Shyft monitoring for token: ${mint.substring(0, 8)}...`);
        }
    } catch (error) {
        console.error('Failed to subscribe to Shyft token account:', error);
    }
}

function unsubscribeFromShyftTokenAccount(mint) {
    if (!mint || !shyftSubscriptions.has(mint)) return;

    const subscriptionId = shyftSubscriptions.get(mint);
    sendShyftRequest('accountUnsubscribe', [subscriptionId]);
    shyftSubscriptions.delete(mint);

    // Close connection if no more subscriptions
    if (shyftSubscriptions.size === 0 && shyftWebSocket) {
        shyftWebSocket.close();
    }
}

function handleShyftMessage(data) {
    // Handle subscription notifications
    if (data.method === 'accountNotification' && data.params) {
        const accountData = data.params.result?.value;
        if (!accountData) return;

        // Find which token this notification is for
        const mint = Array.from(shyftSubscriptions.keys()).find(m => {
            // Check if this account data matches our subscribed mint
            // This is a simplified check - in practice, you'd need to parse the account data
            return true; // Placeholder - would need proper account data parsing
        });

        if (mint && tokenRegistry.current && tokenRegistry.current.mint === mint) {
            // Trigger activity refresh when we detect account changes
            // This indicates a transaction occurred
            console.log('🔵 Shyft detected account change for token:', mint.substring(0, 8));
            
            // Refresh activity feed
            if (tokenDetailViewState.currentActivity) {
    fetchPumpFunTradeFeed(mint, 20).then(latest => {
                    const solPrice = tokenDetailViewState.solPrice || null;
                    renderTokenActivity(latest, { isLive: true, solPrice });
        tokenDetailViewState.currentActivity = latest;
    }).catch(error => {
                    console.debug('Shyft-triggered activity refresh failed:', error);
                });
            }
        }
    }
}

// Solana RPC WebSocket Manager (FREE - Public RPC)
function getSolanaRpcWebSocketUrl() {
    // Use RPC Pool Manager if available (intelligent rotation & failover)
    if (window.rpcPoolManager) {
        try {
            const wsUrl = window.rpcPoolManager.getWebSocketUrl();
            if (wsUrl) {
                return wsUrl;
            }
        } catch (error) {
            console.debug('RPC Pool Manager WebSocket failed, falling back to legacy method:', error);
        }
    }
    
    // Fallback to legacy method
    // Try to get dedicated monitoring RPC from settings first
    try {
        if (typeof window.settingsManager !== 'undefined' && window.settingsManager.getSettings) {
            const settings = window.settingsManager.getSettings();
            // Check for dedicated monitoring RPC (for live trade monitoring)
            const monitoringRpc = settings?.solana?.monitoringRpc;
            if (monitoringRpc && monitoringRpc.trim() && monitoringRpc.startsWith('wss://')) {
                console.log('🔵 Using dedicated monitoring RPC:', monitoringRpc);
                return monitoringRpc.trim();
            }
            // Fallback to main WebSocket RPC
            const wsUrl = settings?.solana?.rpcWebsocket;
            if (wsUrl && wsUrl.startsWith('wss://')) {
                return wsUrl;
            }
        }
    } catch (error) {
        console.debug('Failed to get RPC WebSocket from settings:', error);
    }
    
    // Fallback to public Solana RPC WebSocket (FREE)
    return 'wss://api.mainnet-beta.solana.com';
}

function connectSolanaRpcWebSocket() {
    if (solanaRpcWebSocket && solanaRpcWebSocket.readyState === WebSocket.OPEN) {
        return; // Already connected
    }

    const wsUrl = getSolanaRpcWebSocketUrl();
    
    try {
        console.log('🔵 Connecting to Solana RPC WebSocket for live monitoring (FREE)...');
        solanaRpcWebSocket = new WebSocket(wsUrl);

        solanaRpcWebSocket.onopen = () => {
            console.log('✅ Solana RPC WebSocket connected (FREE monitoring active)');
            solanaRpcReconnectAttempts = 0;
            
            // Re-subscribe to all active subscriptions
            solanaRpcSubscriptions.forEach((subscriptionId, mint) => {
                subscribeToSolanaRpcTokenAccount(mint);
            });
        };

        solanaRpcWebSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleSolanaRpcMessage(data);
            } catch (error) {
                console.debug('Failed to parse Solana RPC message:', error);
            }
        };

        solanaRpcWebSocket.onerror = (error) => {
            console.debug('Solana RPC WebSocket error:', error);
        };

        solanaRpcWebSocket.onclose = () => {
            console.debug('Solana RPC WebSocket closed');
            solanaRpcWebSocket = null;
            
            // Mark RPC as rate limited if we got a 403/429 error
            // This will cause the pool manager to rotate to next RPC
            if (window.rpcPoolManager && wsUrl) {
                // Check if it was a rate limit error (we can't detect this from onclose, but we'll rotate anyway)
                // The pool manager will handle rotation on next connection attempt
            }
            
            // Attempt to reconnect if we have active subscriptions
            if (solanaRpcSubscriptions.size > 0 && solanaRpcReconnectAttempts < SOLANA_RPC_MAX_RECONNECT_ATTEMPTS) {
                solanaRpcReconnectAttempts++;
                console.log(`Reconnecting to Solana RPC WebSocket (attempt ${solanaRpcReconnectAttempts}/${SOLANA_RPC_MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(() => {
                    connectSolanaRpcWebSocket();
                }, SOLANA_RPC_RECONNECT_DELAY_MS);
            }
        };
    } catch (error) {
        console.error('Failed to create Solana RPC WebSocket:', error);
    }
}

function sendSolanaRpcRequest(method, params) {
    if (!solanaRpcWebSocket || solanaRpcWebSocket.readyState !== WebSocket.OPEN) {
        return;
    }

    const requestId = Date.now() + Math.random();
    const request = {
        jsonrpc: '2.0',
        id: requestId,
        method: method,
        params: params
    };

    solanaRpcWebSocket.send(JSON.stringify(request));
    return requestId;
}

function subscribeToSolanaRpcTokenAccount(mint) {
    if (!mint) return;

    // Get the token mint public key
    if (!window.solanaWeb3?.PublicKey) {
        console.warn('Solana Web3 not available for RPC subscription');
            return;
        }

        try {
        const mintPubkey = new window.solanaWeb3.PublicKey(mint);
        
        // Subscribe to account changes for the token mint
        const subscriptionId = sendSolanaRpcRequest('accountSubscribe', [
            mintPubkey.toBase58(),
            {
                encoding: 'jsonParsed',
                commitment: 'confirmed'
            }
        ]);

        if (subscriptionId) {
            solanaRpcSubscriptions.set(mint, subscriptionId);
            console.log(`🔵 Subscribed to Solana RPC monitoring (FREE) for token: ${mint.substring(0, 8)}...`);
        }
        } catch (error) {
        console.error('Failed to subscribe to Solana RPC token account:', error);
    }
}

function unsubscribeFromSolanaRpcTokenAccount(mint) {
    if (!mint || !solanaRpcSubscriptions.has(mint)) return;

    const subscriptionId = solanaRpcSubscriptions.get(mint);
    sendSolanaRpcRequest('accountUnsubscribe', [subscriptionId]);
    solanaRpcSubscriptions.delete(mint);

    // Close connection if no more subscriptions
    if (solanaRpcSubscriptions.size === 0 && solanaRpcWebSocket) {
        solanaRpcWebSocket.close();
    }
}

function handleSolanaRpcMessage(data) {
    // Handle subscription notifications
    if (data.method === 'accountNotification' && data.params) {
        const accountData = data.params.result?.value;
        if (!accountData) return;

        // Find which token this notification is for
        const mint = Array.from(solanaRpcSubscriptions.keys()).find(m => {
            // Check if this account data matches our subscribed mint
            return true; // Simplified - would need proper account data parsing
        });

        if (mint && tokenRegistry.current && tokenRegistry.current.mint === mint) {
            // Trigger activity refresh when we detect account changes
            console.log('🔵 Solana RPC (FREE) detected account change for token:', mint.substring(0, 8));
            
            // Refresh activity feed
            if (tokenDetailViewState.currentActivity) {
                fetchPumpFunTradeFeed(mint, 20).then(latest => {
                    const solPrice = tokenDetailViewState.solPrice || null;
                    renderTokenActivity(latest, { isLive: true, solPrice });
                    tokenDetailViewState.currentActivity = latest;
                }).catch(error => {
                    console.debug('Solana RPC-triggered activity refresh failed:', error);
                });
            }
        }
    }
}

function startTokenActivityStream(mint) {
    stopTokenActivityStream();
    if (!mint) {
        return;
    }

    // Use PumpPortal WebSocket for real-time updates
    subscribeToTokenTrades(mint);
    
    // Also use Shyft WebSocket if enabled
    const settings = getShyftSettings();
    if (settings?.enabled && settings?.apiKey) {
        connectShyftWebSocket();
        // Wait a bit for connection, then subscribe
        setTimeout(() => {
            subscribeToShyftTokenAccount(mint);
        }, 500);
    } else {
        // Fallback: Use public Solana RPC WebSocket (FREE - best option for free monitoring)
        // WebSocket subscriptions don't count against HTTP rate limits
        connectSolanaRpcWebSocket();
        setTimeout(() => {
            subscribeToSolanaRpcTokenAccount(mint);
        }, 500);
    }
    
    // Get solPrice for USD conversion
    const getSolPriceForActivity = async () => {
        try {
            return await (solanaIntegration?.getSolPrice?.() || Promise.resolve(null));
        } catch (error) {
            return null;
        }
    };
    
    // Event-driven: Only do initial fetch on load, then rely on WebSocket for all updates
    getSolPriceForActivity().then(solPrice => {
        tokenDetailViewState.solPrice = solPrice;
        // Initial fetch to populate activity feed with recent trades
        fetchPumpFunTradeFeed(mint, 20).then(latest => {
            renderTokenActivity(latest, { isLive: true, solPrice });
            tokenDetailViewState.currentActivity = latest;
        }).catch(error => {
            // Silently handle API downtime - WebSocket will provide updates
            console.debug('Initial trade feed fetch failed (WebSocket will provide updates):', error.message);
        });
    });
    
    // No polling - fully event-driven via WebSocket subscriptions
    // Activity feed updates only when:
    // 1. WebSocket detects new trades (PumpPortal, Shyft, or Solana RPC)
    // 2. User performs buy/sell actions
    console.log('🔄 Activity feed is now event-driven - updates only on trade detection');
}

/**
 * Fetch trade feed from Pump.fun API with enhanced fallback
 * Note: Browser console may show "Fetch failed loading" errors for failed requests.
 * These are expected when Pump.fun APIs are down or return 404/530, and are handled gracefully.
 * The application continues to work even when these APIs fail.
 */
async function fetchPumpFunTradeFeed(mint, limit = 20) {
    if (!mint) {
        return [];
    }
    
    // Use enhanced fetcher if available (has on-chain fallback)
    if (window.enhancedTokenFetchers?.fetchPumpFunTradeFeed) {
        try {
            const trades = await window.enhancedTokenFetchers.fetchPumpFunTradeFeed(mint, limit);
            if (trades && trades.length > 0) {
                return trades;
            }
        } catch (error) {
            console.warn('Enhanced trade feed fetch failed, trying original method:', error.message);
        }
    }

    const normalizedLimit = Math.max(limit, 20);
    const endpoints = [
        `${VANITY_LAUNCH_STATS_ENDPOINT_BASE}/coins/${mint}`,
        `${VANITY_LAUNCH_STATS_ENDPOINT_BASE}/coins/${mint}/trades`,
        `https://pump.fun/api/trades/${mint}?offset=0&limit=${normalizedLimit}`,
        `https://pump.fun/api/recent-trades?mint=${mint}&limit=${normalizedLimit}`
    ];

    const collectedEntries = [];

    const collectFromPayload = (payload) => {
        if (!payload) return;
        const collections = [];
        if (Array.isArray(payload)) {
            collections.push(payload);
        } else if (typeof payload === 'object') {
            Object.values(payload).forEach((value) => {
                if (Array.isArray(value)) {
                    collections.push(value);
                }
            });
        }

        collections.forEach((collection) => {
            collection.forEach((item) => {
                const rawType = String(
                    item?.type ||
                        item?.action ||
                        item?.side ||
                        item?.event_type ||
                        item?.transaction_type ||
                        item?.trade_type ||
                        ''
                ).toLowerCase();

                let type = 'trade';
                if (rawType.includes('buy')) {
                    type = 'buy';
                } else if (rawType.includes('sell')) {
                    type = 'sell';
                }

                const timestamp =
                    normalizeTimestamp(
                        item?.timestamp ||
                            item?.time ||
                            item?.blockTime ||
                            item?.block_timestamp ||
                            item?.created_at ||
                            item?.ts
                    ) || null;

                const amountSol = safeNumber(
                    item?.sol_amount ||
                        item?.solAmount ||
                        item?.amountSol ||
                        item?.amount_sol ||
                        item?.sol ||
                        item?.in_sol ||
                        item?.sol_value
                );

                const amountTokens = safeNumber(
                    item?.token_amount ||
                        item?.tokenAmount ||
                        item?.amountTokens ||
                        item?.token_quantity ||
                        item?.quantity_tokens
                );

                const wallet =
                    item?.wallet ||
                    item?.owner ||
                    item?.trader ||
                    item?.buyer ||
                    item?.seller ||
                    item?.user ||
                    item?.authority ||
                    item?.address ||
                    item?.signature ||
                    null;

                if (!timestamp && !wallet && amountSol === null && amountTokens === null) {
                    return;
                }

                collectedEntries.push({
                    timestamp: timestamp || Date.now(),
                    wallet: wallet || '',
                    type,
                    amountSol: amountSol !== null ? amountSol : null,
                    amountTokens: amountTokens !== null ? amountTokens : null
                });
            });
        });
    };

    for (const endpoint of endpoints) {
        try {
            // Suppress console errors for expected API failures
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                },
                // Add signal to allow cancellation if needed
                signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : null
            }).catch(error => {
                // Silently handle network errors and expected API failures
                const errorMessage = error.message || String(error);
                const isExpectedError = errorMessage.includes('530') || 
                                     errorMessage.includes('503') || 
                                     errorMessage.includes('502') ||
                                     errorMessage.includes('504') ||
                                     errorMessage.includes('404') ||
                                     errorMessage.includes('Failed to fetch') ||
                                     errorMessage.includes('NetworkError') ||
                                     errorMessage.includes('aborted');
                // Return null for expected errors, re-throw unexpected ones
                if (isExpectedError) {
                    return null;
                }
                throw error;
            });
            
            // If fetch returned null (expected error), skip this endpoint
            if (!response) {
                continue;
            }
            
            // Silently handle 5xx errors (API downtime) and 404s (endpoint not available)
            if (!response.ok) {
                const status = response.status;
                // Silently skip 404 and 5xx errors - these are expected API issues
                if (status === 404 || status >= 500) {
                    continue;
                }
                // Only log non-5xx, non-404 errors as they might indicate a real issue
                if (status < 500) {
                    console.debug(`Trade feed endpoint returned ${status} (${endpoint})`);
                }
                continue;
            }

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const payload = await response.json();
                collectFromPayload(payload);
            } else {
                const text = await response.text();
                try {
                    const payload = JSON.parse(text);
                    collectFromPayload(payload);
                } catch (parseError) {
                    // Only log if it's not a 5xx/404 response
                    console.debug(`Pump.fun trade feed returned non-JSON (${endpoint})`);
                }
            }

            if (collectedEntries.length >= normalizedLimit) {
                break;
            }
    } catch (error) {
            // Silently handle network errors and 5xx errors - API might be down
            // Browser will log these in console anyway, no need to duplicate
            const errorMessage = error.message || String(error);
            const isApiDown = errorMessage.includes('530') || 
                             errorMessage.includes('503') || 
                             errorMessage.includes('502') ||
                             errorMessage.includes('504') ||
                             errorMessage.includes('404') ||
                             errorMessage.includes('Failed to fetch') ||
                             errorMessage.includes('NetworkError') ||
                             errorMessage.includes('aborted');
            
            // Don't log expected errors - browser console already shows them
            // Only log truly unexpected errors at debug level
            if (!isApiDown) {
                console.debug(`Trade feed fetch error (${endpoint}):`, errorMessage);
            }
        }
    }

    if (!collectedEntries.length) {
        return [];
    }

    const deduped = new Map();
    collectedEntries.forEach((entry) => {
        const key = [
            entry.timestamp || 0,
            entry.wallet || '',
            entry.type || '',
            entry.amountSol !== null ? entry.amountSol.toFixed(9) : '',
            entry.amountTokens !== null ? entry.amountTokens.toFixed(9) : ''
        ].join('|');

        if (!deduped.has(key)) {
            deduped.set(key, entry);
        }
    });

    return Array.from(deduped.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, limit);
}

async function fetchPumpFunTokenDetails(mint) {
    if (!mint) return null;
    
    // Use enhanced fetcher if available, otherwise fallback to API client
    if (window.enhancedTokenFetchers?.fetchPumpFunTokenDetails) {
        try {
            return await window.enhancedTokenFetchers.fetchPumpFunTokenDetails(mint);
        } catch (error) {
            console.warn('Enhanced token details fetch failed, trying API client:', error.message);
        }
    }
    
    // Fallback to original API client method
    try {
        await ensureApiClientReady();
        const info = await window.apiClient.getPumpFunToken(mint);
        if (!info) {
            return null;
        }
        if (info.success === false && !info.marketCap && !info.price) {
            return null;
        }
        return info;
    } catch (error) {
        console.warn(`Pump.fun token lookup failed for ${mint}:`, error.message || error);
        return null;
    }
}

async function fetchTokenPriceDetails(mint, { solPrice = null } = {}) {
    // Use enhanced fetcher if available (has multiple fallbacks)
    if (window.enhancedTokenFetchers?.fetchTokenPriceDetails) {
        try {
            return await window.enhancedTokenFetchers.fetchTokenPriceDetails(mint, { solPrice });
        } catch (error) {
            console.warn('Enhanced price fetch failed, trying API client:', error.message);
        }
    }
    
    // Fallback to original API client method
    try {
        await ensureApiClientReady();
    } catch (error) {
        console.warn('API client unavailable for price lookup:', error.message || error);
    }

    try {
        const response = await window.apiClient.getTokenPrice(mint);
        if (!response || response.success === false) {
            return { priceSol: null, priceUsd: null, source: null, marketCapUsd: null };
        }

        let priceSol = null;
        let priceUsd = null;
        if (response.source === 'pumpfun') {
            priceUsd = safeNumber(response.price);
            if (priceUsd !== null && solPrice) {
                priceSol = priceUsd / solPrice;
            }
        } else if (response.source === 'jupiter') {
            const tokensPerSol = safeNumber(response.price);
            if (tokensPerSol && tokensPerSol > 0) {
                priceSol = 1 / tokensPerSol;
                if (solPrice) {
                    priceUsd = priceSol * solPrice;
                }
            }
        }

        return {
            priceSol,
            priceUsd,
            source: response.source || null,
            marketCapUsd: safeNumber(response.marketCap)
        };
    } catch (error) {
        console.warn(`Token price lookup failed for ${mint}:`, error.message || error);
        return { priceSol: null, priceUsd: null, source: null, marketCapUsd: null };
    }
}

async function fetchTokenBalanceViaConnection(connection, walletAddress, mint) {
    if (!connection || !walletAddress || !mint || !window.solanaWeb3?.PublicKey) {
        return null;
    }
    try {
        const owner = new window.solanaWeb3.PublicKey(walletAddress);
        const mintKey = new window.solanaWeb3.PublicKey(mint);
        const response = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintKey });
        if (!response?.value?.length) {
            return 0;
        }
        const tokenAmount = response.value[0]?.account?.data?.parsed?.info?.tokenAmount;
        if (!tokenAmount) {
            return 0;
        }
        if (typeof tokenAmount.uiAmount === 'number') {
            return tokenAmount.uiAmount;
        }
        if (typeof tokenAmount.uiAmountString === 'string') {
            return Number(tokenAmount.uiAmountString);
        }
        if (typeof tokenAmount.amount === 'string' && tokenAmount.decimals !== undefined) {
            const raw = Number(tokenAmount.amount);
            if (Number.isFinite(raw)) {
                return raw / Math.pow(10, tokenAmount.decimals);
            }
        }
        return 0;
    } catch (error) {
        console.warn(`Token balance fetch failed for ${walletAddress} / ${mint}:`, error.message || error);
        return null;
    }
}

async function fetchSolBalanceViaConnection(connection, walletAddress) {
    if (!connection || !walletAddress || !window.solanaWeb3?.PublicKey) {
        return null;
    }
    try {
        const publicKey = new window.solanaWeb3.PublicKey(walletAddress);
        const lamports = await connection.getBalance(publicKey);
        const denominator = window.solanaWeb3?.LAMPORTS_PER_SOL || FALLBACK_LAMPORTS_PER_SOL;
        return lamports / denominator;
    } catch (error) {
        console.warn(`SOL balance fetch failed for ${walletAddress}:`, error.message || error);
        return null;
    }
}
async function fetchWalletHoldingsForMint(mint, { priceSol = null, source = 'jito' } = {}) {
    const connection = getSolanaConnection();
    
    // Try to get wallets from multiple sources
    let wallets = getKnownWallets();
    
    // If no wallets found, try to fetch from backend API
    if (wallets.length === 0 && window.apiClient && typeof window.apiClient.getAllWallets === 'function') {
        try {
            await ensureApiClientReady();
            const response = await window.apiClient.getAllWallets();
            if (response?.success && Array.isArray(response.wallets)) {
                wallets = response.wallets.map(w => ({
                    id: w.id || w.address || w.publicKey,
                    address: w.address || w.publicKey,
                    name: String(w.name || w.label || w.alias || w.displayName || ''),
                    balance: w.balance || null,
                    tags: Array.isArray(w.tags) ? w.tags : []
                }));
            }
        } catch (error) {
            console.warn('Failed to fetch wallets from backend API:', error);
        }
    }
    
    // Also try to get wallets from walletOperations if available
    if (wallets.length === 0 && typeof window.walletOperations?.getWallets === 'function') {
        try {
            const opsWallets = window.walletOperations.getWallets();
            if (Array.isArray(opsWallets) && opsWallets.length > 0) {
                wallets = opsWallets.map(w => ({
                    id: w.id || w.address || w.publicKey,
                    address: w.address || w.publicKey || w.pubkey,
                    name: String(w.name || w.label || w.alias || w.displayName || ''),
                    balance: w.balance || null,
                    tags: Array.isArray(w.tags) ? w.tags : []
                }));
            }
        } catch (error) {
            console.warn('Failed to get wallets from walletOperations:', error);
        }
    }
    
    if (!connection || wallets.length === 0) {
        console.warn('No wallets available for holdings check. Connection:', !!connection, 'Wallets:', wallets.length);
        return { holdings: [], summary: { totalTokenBalance: 0, totalHoldingsSol: 0 } };
    }

    const useRpcOnly = source === 'rpc';

    const results = await Promise.all(
        wallets.map(async (wallet, index) => {
            const address = wallet.address;
            if (!address) {
                return null;
            }

            let tokenBalance = null;
            if (!useRpcOnly && solanaIntegration?.getTokenBalance) {
                try {
                    tokenBalance = await solanaIntegration.getTokenBalance(address, mint);
                } catch (error) {
                    console.warn(`Token balance via Solana integration failed (${address}):`, error.message || error);
                }
            }
            if (tokenBalance === null) {
                tokenBalance = await fetchTokenBalanceViaConnection(connection, address, mint);
            }

            let solBalance = typeof wallet.balance === 'number' ? wallet.balance : null;
            if (solBalance === null && !useRpcOnly && solanaIntegration?.getBalance) {
                try {
                    solBalance = await solanaIntegration.getBalance(address);
                } catch (error) {
                    console.warn(`SOL balance via Solana integration failed (${address}):`, error.message || error);
                }
            }
            if (solBalance === null) {
                solBalance = await fetchSolBalanceViaConnection(connection, address);
            }

            const walletName = String(wallet.name || wallet.label || wallet.alias || wallet.displayName || '');
            return {
                walletId: wallet.id || null,
                address,
                name: walletName,
                emoji: wallet.emoji || getWalletEmoji(walletName || index),
                tags: Array.isArray(wallet.tags) ? wallet.tags : [],
                solBalance: solBalance !== null && Number.isFinite(solBalance) ? solBalance : null,
                tokenBalance: tokenBalance !== null && Number.isFinite(tokenBalance) ? tokenBalance : null,
                tokenMint: mint
            };
        })
    );

    const holdings = results.filter(Boolean);

    const summary = holdings.reduce(
        (acc, holding) => {
            if (holding.tokenBalance && Number.isFinite(holding.tokenBalance)) {
                acc.totalTokenBalance += holding.tokenBalance;
                if (priceSol !== null) {
                    acc.totalHoldingsSol += holding.tokenBalance * priceSol;
                }
            }
            return acc;
        },
        { totalTokenBalance: 0, totalHoldingsSol: 0 }
    );

    return { holdings, summary };
}
async function fetchRuntimeAutomationsForMint(mint) {
    const tasks = [];
    const stats = {
        totalVolume: 0,
        activeSessions: 0
    };

    try {
        await ensureApiClientReady();
    } catch (error) {
        console.warn('Unable to connect to automation backend:', error.message || error);
        return { tasks, stats };
    }

    const [volumeResp, smartResp] = await Promise.all([
        window.apiClient
            .getVolumeSessions()
            .catch((error) => {
                console.warn('Volume session lookup failed:', error.message || error);
                return null;
            }),
        window.apiClient
            .getSmartSellPositions()
            .catch((error) => {
                console.warn('Smart Sell positions lookup failed:', error.message || error);
                return null;
            })
    ]);

    if (volumeResp?.success && Array.isArray(volumeResp.sessions)) {
        const relevantSessions = volumeResp.sessions.filter(
            (session) => (session?.tokenMint || '').toLowerCase() === mint.toLowerCase()
        );
        relevantSessions.forEach((session, index) => {
            const sessionVolume = safeNumber(session?.stats?.totalVolume) || 0;
            stats.totalVolume += sessionVolume;
            if (session?.isActive) {
                stats.activeSessions += 1;
            }

            const walletCount = Array.isArray(session.walletIds) ? session.walletIds.length : 0;
            const resumeAvailable = walletCount > 0 && session?.config;

            const detailFragments = [];
            detailFragments.push(`Wallets: ${walletCount}`);
            if (session?.stats?.cyclesCompleted) {
                detailFragments.push(`Cycles: ${session.stats.cyclesCompleted}`);
            }
            if (sessionVolume > 0) {
                detailFragments.push(`Volume ${sessionVolume.toFixed(sessionVolume >= 1 ? 3 : 6)} SOL`);
            }

            const isActive = Boolean(session?.isActive);
            const taskKey = `volume-${session?.id || index}`;

            tasks.push({
                key: taskKey,
                source: 'runtime',
                type: 'volumeBot',
                title: 'Volume Bot',
                subtitle: detailFragments.join(' • '),
                icon: 'activity',
                iconBackground: 'bg-blue-900/60',
                statusLabel: isActive ? 'Running' : 'Stopped',
                statusClass: isActive ? 'bg-emerald-900/60 text-emerald-200' : 'bg-neutral-800 text-gray-300',
                statusState: isActive ? 'running' : 'paused',
                metadata: {
                    type: 'volumeBot',
                    sessionId: session?.id || null,
                    walletIds: session?.walletIds || [],
                    config: session?.config || null,
                    tokenMint: mint
                },
                actions: [
                    {
                        type: 'resume',
                        icon: 'play',
                        label: 'Resume',
                        intent: 'green',
                        disabled: isActive || !resumeAvailable
                    },
                    {
                        type: 'pause',
                        icon: 'pause',
                        label: 'Pause',
                        intent: 'yellow',
                        disabled: !isActive
                    },
                    {
                        type: 'stop',
                        icon: 'square',
                        label: 'Stop',
                        intent: 'red',
                        disabled: !isActive
                    }
                ]
            });
        });
    }

    if (smartResp?.success && Array.isArray(smartResp.positions)) {
        const relevantPositions = smartResp.positions.filter(
            (position) => (position?.tokenMint || '').toLowerCase() === mint.toLowerCase()
        );

        relevantPositions.forEach((position, index) => {
            const isEnabled = position.enabled !== false;
            const detailFragments = [];
            if (position.walletId) {
                detailFragments.push(`Wallet ${truncateMiddle(position.walletId)}`);
            }
            if (position.profitLoss !== undefined && position.profitLoss !== null) {
                detailFragments.push(`PnL ${position.profitLoss.toFixed(4)} SOL`);
            }
            if (position.entryPrice !== undefined && position.entryPrice !== null) {
                detailFragments.push(`Entry ${position.entryPrice.toFixed(6)} SOL`);
            }

            const taskKey = `smartsell-${position.walletId || index}`;

            tasks.push({
                key: taskKey,
                source: 'runtime',
               type: 'smartSell',
                title: 'Smart Sell',
                subtitle: detailFragments.join(' • '),
                icon: 'shield',
                iconBackground: 'bg-purple-900/60',
                statusLabel: isEnabled ? 'Monitoring' : 'Paused',
                statusClass: isEnabled ? 'bg-emerald-900/60 text-emerald-200' : 'bg-yellow-900/60 text-yellow-200',
                statusState: isEnabled ? 'running' : 'paused',
                metadata: {
                    type: 'smartSell',
                    walletId: position.walletId || null,
                    tokenMint: position.tokenMint || mint,
                    canResume: false
                },
                actions: [
                    {
                        type: 'resume',
                        icon: 'play',
                        label: 'Resume',
                        intent: 'green',
                        disabled: isEnabled
                    },
                    {
                        type: 'pause',
                        icon: 'pause',
                        label: 'Pause',
                        intent: 'yellow',
                        disabled: !isEnabled
                    },
                    {
                        type: 'stop',
                        icon: 'square',
                        label: 'Stop',
                        intent: 'red',
                        disabled: false
                    }
                ]
            });
        });
    }

    // Add Bump task if running
    if (bumpTaskConfig.running && bumpTaskConfig.tokenMint === mint) {
        const walletCount = bumpTaskConfig.walletIds.length;
        const statusLabel = bumpTaskConfig.running ? 'Running' : 'Stopped';
        const statusClass = bumpTaskConfig.running 
            ? 'bg-emerald-900/60 text-emerald-200' 
            : 'bg-neutral-800 text-gray-300';
        
        tasks.push({
            key: bumpTaskConfig.taskId || `bump-${mint}`,
            source: 'runtime',
            type: 'bump',
            title: 'Bump',
            subtitle: `${bumpTaskConfig.currentIteration}/${bumpTaskConfig.iterations} iterations • ${bumpTaskConfig.buyAmount} SOL each • ${walletCount} wallet(s)`,
            icon: 'zap',
            iconBackground: 'bg-orange-900/60',
            statusLabel,
            statusClass,
            statusState: bumpTaskConfig.running ? 'running' : 'paused',
            metadata: {
                type: 'bump',
                tokenMint: mint,
                config: { ...bumpTaskConfig }
            },
            actions: [
                {
                    type: 'stop',
                    icon: 'square',
                    label: 'Stop',
                    intent: 'red',
                    disabled: !bumpTaskConfig.running
                }
            ]
        });
    }

    // Add Bulk Sell task if running
    if (bulkSellTaskConfig.running && bulkSellTaskConfig.tokenMint === mint) {
        const walletCount = bulkSellTaskConfig.walletIds.length;
        const statusLabel = bulkSellTaskConfig.running ? 'Running' : 'Stopped';
        const statusClass = bulkSellTaskConfig.running 
            ? 'bg-emerald-900/60 text-emerald-200' 
            : 'bg-neutral-800 text-gray-300';
        
        const methodLabel = bulkSellTaskConfig.method === 'jito-individual' ? 'Jito (Individual)' :
                            bulkSellTaskConfig.method === 'jito-bundle' ? 'Jito (Bundle)' :
                            'RPC (Individual)';
        
        tasks.push({
            key: bulkSellTaskConfig.taskId || `bulk-sell-${mint}`,
            source: 'runtime',
            type: 'bulkSell',
            title: 'Bulk Sell',
            subtitle: `${methodLabel} • ${bulkSellTaskConfig.sellPercentage}% from ${walletCount} wallet(s)`,
            icon: 'rows',
            iconBackground: 'bg-red-900/60',
            statusLabel,
            statusClass,
            statusState: bulkSellTaskConfig.running ? 'running' : 'paused',
            metadata: {
                type: 'bulkSell',
                tokenMint: mint,
                config: { ...bulkSellTaskConfig }
            },
            actions: [
                {
                    type: 'stop',
                    icon: 'square',
                    label: 'Stop',
                    intent: 'red',
                    disabled: !bulkSellTaskConfig.running
                }
            ]
        });
    }

    // Add Sell Buyback task if running
    if (sellBuybackTaskConfig.running && sellBuybackTaskConfig.tokenMint === mint) {
        const buyWalletCount = sellBuybackTaskConfig.buyWallets.length;
        const statusLabel = sellBuybackTaskConfig.running ? 'Running' : 'Stopped';
        const statusClass = sellBuybackTaskConfig.running 
            ? 'bg-emerald-900/60 text-emerald-200' 
            : 'bg-neutral-800 text-gray-300';
        
        // Get sell wallet name
        const allWallets = collectBlueprintWallets();
        const sellWallet = allWallets.find(w => {
            const id = w.id || w.address || w.publicKey || '';
            return id === sellBuybackTaskConfig.sellWalletId;
        });
        const sellWalletName = sellWallet?.name || 'Unknown';
        
        tasks.push({
            key: sellBuybackTaskConfig.taskId || `sell-buyback-${mint}`,
            source: 'runtime',
            type: 'sellBuyback',
            title: 'Sell Buyback',
            subtitle: `Sell ${sellBuybackTaskConfig.sellPercentage}% from ${sellWalletName} • Buy back with ${buyWalletCount} wallet(s)`,
            icon: 'repeat-2',
            iconBackground: 'bg-blue-900/60',
            statusLabel,
            statusClass,
            statusState: sellBuybackTaskConfig.running ? 'running' : 'paused',
            metadata: {
                type: 'sellBuyback',
                tokenMint: mint,
                config: { ...sellBuybackTaskConfig }
            },
            actions: [
                {
                    type: 'stop',
                    icon: 'square',
                    label: 'Stop',
                    intent: 'red',
                    disabled: !sellBuybackTaskConfig.running
                }
            ]
        });
    }

    return { tasks, stats };
}

async function loadLiveTokenDetail(record) {
    if (!record || !record.mint) {
        return;
    }

    const runtimeKey = record.mint;
    if (tokenDetailViewState.loading && tokenDetailViewState.currentKey === runtimeKey) {
        return;
    }

    tokenDetailViewState.loading = true;
    tokenDetailViewState.currentKey = runtimeKey;

    resetHoldingsTable({ message: 'Syncing wallet balances…', isLoading: true });
    renderTokenTaskList(record, { loading: true });
    
    // Get solPrice early for activity rendering
    let solPrice = null;
    try {
        solPrice = await (solanaIntegration?.getSolPrice?.() || Promise.resolve(null));
        tokenDetailViewState.solPrice = solPrice;
    } catch (error) {
        console.debug('Failed to get solPrice for activity:', error);
    }
    
    renderTokenActivity([], { loading: true, isLive: true, solPrice });

    try {
        const holdingsSource = tokenDetailViewState.holdingsSource || 'jito';

        // Fetch data in parallel, but handle trade feed errors gracefully
        const [pumpFunInfoResult, priceDetailsResult, runtimeAutomationsResult, holdingsResultResult, activityResult] = await Promise.allSettled([
            fetchPumpFunTokenDetails(record.mint),
            fetchTokenPriceDetails(record.mint, { solPrice }),
            fetchRuntimeAutomationsForMint(record.mint),
            fetchWalletHoldingsForMint(record.mint, { source: holdingsSource }),
            fetchPumpFunTradeFeed(record.mint, 20).catch(error => {
                // Silently handle trade feed errors - API might be down
                return [];
            })
        ]);
        
        // Extract values from settled promises
        const pumpFunInfo = pumpFunInfoResult.status === 'fulfilled' ? pumpFunInfoResult.value : null;
        if (pumpFunInfoResult.status === 'rejected') {
            console.debug('⚠️ Pump.fun token details fetch failed:', pumpFunInfoResult.reason?.message || pumpFunInfoResult.reason);
        }
        
        const priceDetails = priceDetailsResult.status === 'fulfilled' ? priceDetailsResult.value : { priceSol: null, priceUsd: null, source: '' };
        if (priceDetailsResult.status === 'rejected') {
            console.warn('⚠️ Price fetch failed:', priceDetailsResult.reason?.message || priceDetailsResult.reason);
            // Try to retry price fetch once more as a fallback
            try {
                console.log('🔄 Retrying price fetch...');
                const retryPriceDetails = await fetchTokenPriceDetails(record.mint, { solPrice });
                if (retryPriceDetails && (retryPriceDetails.priceSol !== null || retryPriceDetails.priceUsd !== null)) {
                    Object.assign(priceDetails, retryPriceDetails);
                    console.log('✅ Price fetch retry successful');
                }
            } catch (retryError) {
                console.debug('⚠️ Price fetch retry also failed:', retryError.message);
            }
        }
        
        const runtimeAutomations = runtimeAutomationsResult.status === 'fulfilled' ? runtimeAutomationsResult.value : { tasks: [], stats: { totalVolume: 0, activeSessions: 0 } };
        const holdingsResult = holdingsResultResult.status === 'fulfilled' ? holdingsResultResult.value : { holdings: [], summary: { totalTokenBalance: 0, totalHoldingsSol: 0 } };
        const activity = activityResult.status === 'fulfilled' ? activityResult.value : [];

        const priceSol = priceDetails.priceSol ?? null;
        const priceUsd = priceDetails.priceUsd ?? null;
        const marketCapUsd = priceDetails.marketCapUsd ?? (pumpFunInfo ? safeNumber(pumpFunInfo.marketCap) : null);
        // Extract bonding curve percentage and completion status
        let bondingPercent = null;
        let isBondingComplete = false;
        
        // Debug: Log what we got from the API
        if (pumpFunInfo) {
            console.log('🔍 Pump.fun API response keys:', Object.keys(pumpFunInfo));
            console.log('🔍 Bonding curve data:', {
                bondingCurve: pumpFunInfo.bondingCurve,
                bondingCurvePercentage: pumpFunInfo.bondingCurvePercentage,
                complete_percent: pumpFunInfo.complete_percent,
                complete: pumpFunInfo.complete,
                graduated: pumpFunInfo.graduated,
                raydium: pumpFunInfo.raydium
            });
        }
        
        if (pumpFunInfo) {
            // Check for normalized bonding curve data
            if (pumpFunInfo.bondingCurve?.percentComplete !== undefined && pumpFunInfo.bondingCurve.percentComplete !== null) {
                bondingPercent = safeNumber(pumpFunInfo.bondingCurve.percentComplete);
                isBondingComplete = pumpFunInfo.bondingCurve.isComplete === true || bondingPercent === 100;
                console.log('✅ Found bonding curve from normalized data:', bondingPercent);
            } else if (pumpFunInfo.bondingCurvePercentage !== undefined && pumpFunInfo.bondingCurvePercentage !== null) {
                bondingPercent = safeNumber(pumpFunInfo.bondingCurvePercentage);
                isBondingComplete = bondingPercent === 100;
                console.log('✅ Found bonding curve from bondingCurvePercentage:', bondingPercent);
            }
            
            // Also check direct fields from API
            if (bondingPercent === null) {
                if (pumpFunInfo.complete_percent !== undefined) {
                    bondingPercent = safeNumber(pumpFunInfo.complete_percent);
                    isBondingComplete = bondingPercent === 100 || pumpFunInfo.complete === true;
                    console.log('✅ Found bonding curve from complete_percent:', bondingPercent);
                } else if (pumpFunInfo.complete === true) {
                    bondingPercent = 100;
                    isBondingComplete = true;
                    console.log('✅ Token is complete (boolean flag)');
                } else if (pumpFunInfo.graduated === true || pumpFunInfo.raydium === true) {
                    bondingPercent = 100;
                    isBondingComplete = true;
                    console.log('✅ Token has graduated to Raydium');
                }
            }
        }
        
        // Fallback 1: Try Moralis API for bonding curve data
        if (bondingPercent === null && record.mint) {
            try {
                console.log('🔄 Attempting to fetch bonding curve from Moralis API...');
                if (window.enhancedTokenFetchers?.fetchMoralisBondingCurve) {
                    const moralisBonding = await window.enhancedTokenFetchers.fetchMoralisBondingCurve(record.mint);
                    if (moralisBonding && moralisBonding.bondingCurvePercentage !== null) {
                        bondingPercent = moralisBonding.bondingCurvePercentage;
                        isBondingComplete = moralisBonding.isComplete === true || bondingPercent >= 100;
                        console.log('✅ Found bonding curve from Moralis:', bondingPercent + '%');
                    }
                }
            } catch (error) {
                console.debug('⚠️ Moralis bonding curve fetch failed:', error.message);
            }
        }
        
        // Fallback 2: Try to calculate from on-chain data if APIs don't provide it
        if (bondingPercent === null && record.mint) {
            try {
                console.log('🔄 Attempting to calculate bonding curve from on-chain data...');
                const onChainPercent = await calculateBondingCurvePercent(record.mint);
                if (onChainPercent !== null) {
                    bondingPercent = onChainPercent;
                    isBondingComplete = bondingPercent >= 100;
                    console.log('✅ Calculated bonding curve from on-chain:', bondingPercent + '%');
                }
            } catch (error) {
                console.debug('⚠️ On-chain bonding curve calculation failed:', error.message);
            }
        }

        const holdingsSummary = holdingsResult.summary || { totalTokenBalance: 0, totalHoldingsSol: 0 };
        
        // Calculate holdings value - always use current price if available
        let holdingsValueSol = null;
        if (priceSol !== null && holdingsSummary.totalTokenBalance > 0) {
            holdingsValueSol = holdingsSummary.totalTokenBalance * priceSol;
            console.log('💰 Calculated holdingsValueSol:', {
                tokenBalance: holdingsSummary.totalTokenBalance,
                priceSol: priceSol,
                holdingsValueSol: holdingsValueSol
            });
        } else if (holdingsSummary.totalHoldingsSol > 0) {
            holdingsValueSol = holdingsSummary.totalHoldingsSol;
            console.log('💰 Using totalHoldingsSol from summary:', holdingsValueSol);
        } else if (holdingsSummary.totalTokenBalance > 0) {
            // If we have tokens but no price yet, log it for debugging
            console.warn('⚠️ Have token balance but no priceSol yet:', {
                totalTokenBalance: holdingsSummary.totalTokenBalance,
                priceSol: priceSol,
                priceUsd: priceUsd
            });
        }
        
        const holdingsValueUsd =
            holdingsValueSol !== null && solPrice ? holdingsValueSol * solPrice : null;

        console.log('💰 Final holdings values:', {
            holdingsValueSol,
            holdingsValueUsd,
            solPrice,
            hasPrice: priceSol !== null
        });

        // Calculate amount invested from multiple sources
        let amountInvestedSol = safeNumber(record.initialBuyAmount);
        
        // Fallback 1: Calculate from activity feed (sum of buy transactions from YOUR wallets only)
        if (amountInvestedSol === null && Array.isArray(activity) && activity.length > 0) {
            // Get list of your wallet addresses
            const yourWallets = getKnownWallets();
            const yourWalletAddresses = new Set(
                yourWallets.map(w => (w.address || w.publicKey || w.id || '').toLowerCase()).filter(Boolean)
            );
            
            // Filter to only buy transactions from your wallets
            const yourBuyTransactions = activity.filter(t => {
                if (t.type !== 'buy' || !t.amountSol || t.amountSol <= 0) return false;
                // Check if the trade wallet matches any of your wallets
                const tradeWallet = (t.wallet || t.address || '').toLowerCase();
                return yourWalletAddresses.has(tradeWallet) || 
                       Array.from(yourWalletAddresses).some(addr => tradeWallet.includes(addr) || addr.includes(tradeWallet));
            });
            
            if (yourBuyTransactions.length > 0) {
                amountInvestedSol = yourBuyTransactions.reduce((sum, t) => sum + (t.amountSol || 0), 0);
                console.log('✅ Calculated amount invested from YOUR wallet trades:', amountInvestedSol, 'SOL', `(${yourBuyTransactions.length} buy transactions)`);
            } else {
                console.log('ℹ️ No buy transactions found from your wallets in activity feed');
            }
        }
        
        // Fallback 2: Estimate from current holdings if we have price (rough estimate)
        if (amountInvestedSol === null && holdingsSummary.totalTokenBalance > 0 && priceSol !== null) {
            // Rough estimate: assume average entry price is 50% of current price (conservative)
            // This is just a placeholder until we have real transaction data
            amountInvestedSol = holdingsSummary.totalTokenBalance * priceSol * 0.5;
            console.log('⚠️ Estimated amount invested from holdings (rough estimate):', amountInvestedSol, 'SOL');
        }

        // Calculate amount sold from multiple sources
        let amountSoldSol = null;
        
        // Source 1: Runtime automations stats
        if (runtimeAutomations.stats.totalVolume > 0) {
            amountSoldSol = runtimeAutomations.stats.totalVolume;
        }
        
        // Fallback: Calculate from activity feed (sum of sell transactions from YOUR wallets only)
        if (amountSoldSol === null && Array.isArray(activity) && activity.length > 0) {
            // Get list of your wallet addresses
            const yourWallets = getKnownWallets();
            const yourWalletAddresses = new Set(
                yourWallets.map(w => (w.address || w.publicKey || w.id || '').toLowerCase()).filter(Boolean)
            );
            
            // Filter to only sell transactions from your wallets
            const yourSellTransactions = activity.filter(t => {
                if (t.type !== 'sell' || !t.amountSol || t.amountSol <= 0) return false;
                // Check if the trade wallet matches any of your wallets
                const tradeWallet = (t.wallet || t.address || '').toLowerCase();
                return yourWalletAddresses.has(tradeWallet) || 
                       Array.from(yourWalletAddresses).some(addr => tradeWallet.includes(addr) || addr.includes(tradeWallet));
            });
            
            if (yourSellTransactions.length > 0) {
                amountSoldSol = yourSellTransactions.reduce((sum, t) => sum + (t.amountSol || 0), 0);
                console.log('✅ Calculated amount sold from YOUR wallet trades:', amountSoldSol, 'SOL', `(${yourSellTransactions.length} sell transactions)`);
            } else {
                console.log('ℹ️ No sell transactions found from your wallets in activity feed');
            }
        }

        // Calculate profit/loss - ONLY if we have investment data
        // DO NOT calculate profit from holdingsValueSol alone - that's not profit, that's just holdings value
        let profitLossSol = null;
        let isUnrealizedProfit = false;
        if (holdingsValueSol !== null && amountInvestedSol !== null && amountInvestedSol > 0) {
            const soldComponent = amountSoldSol || 0;
            profitLossSol = holdingsValueSol + soldComponent - amountInvestedSol;
            isUnrealizedProfit = false;
            console.log('💰 Calculated profit/loss (with investment data):', {
                holdingsValueSol,
                amountSoldSol: soldComponent,
                amountInvestedSol,
                profitLossSol
            });
        } else if (amountSoldSol !== null && amountSoldSol > 0) {
            // If we have realized sales but no investment data, show only realized profit
            // This is actual profit from sales, not holdings value
            profitLossSol = amountSoldSol;
            isUnrealizedProfit = false;
            console.log('💰 Showing realized profit from sales:', profitLossSol, 'SOL');
        }
        // If no investment data and no sales, profitLossSol remains null
        // Holdings value is NOT profit - don't show it as profit

        // Log data for debugging
        const metricsData = {
            priceSol,
            priceUsd,
            marketCapUsd,
            bondingPercent,
            totalTokenHoldings: holdingsSummary.totalTokenBalance,
            holdingsValueSol,
            holdingsValueUsd,
            amountInvestedSol,
            amountSoldSol,
            profitLossSol,
            solPrice,
            source: priceDetails.source || (pumpFunInfo?.success ? 'pumpfun' : '')
        };
        console.log('Token metrics data:', metricsData);
        
        // Provide helpful feedback about missing data
        console.log('📊 Holdings Summary:', {
            totalTokenBalance: holdingsSummary.totalTokenBalance,
            totalHoldingsSol: holdingsSummary.totalHoldingsSol,
            holdingsCount: holdingsResult.holdings?.length || 0
        });
        
        if (holdingsSummary.totalTokenBalance === 0) {
            console.warn('⚠️ No token holdings found. Make sure wallets are loaded and contain tokens for this mint.');
            console.log('💡 Wallets checked:', holdingsResult.holdings?.length || 0);
            if (holdingsResult.holdings && holdingsResult.holdings.length > 0) {
                console.log('💡 Wallet details:', holdingsResult.holdings.map(h => ({
                    address: truncateMiddle(h.address),
                    tokenBalance: h.tokenBalance,
                    name: h.name
                })));
            }
        }
        
        if (amountInvestedSol === null) {
            console.warn('⚠️ Amount invested not available. Sources tried: record.initialBuyAmount, activity feed buys, holdings estimate.');
        }
        
        if (marketCapUsd === null) {
            console.debug('ℹ️ Market cap unavailable - Pump.fun API may be down or token not fully launched.');
        }
        if (bondingPercent === null) {
            console.debug('ℹ️ Bonding curve data unavailable - token may have completed bonding or API unavailable.');
        }

        // Cache bonding curve data (only recalculate every 30 seconds)
        if (bondingPercent !== null) {
            tokenDetailViewState.bondingCurveCache = {
                percent: bondingPercent,
                isComplete: isBondingComplete,
                timestamp: Date.now()
            };
        }
        
        // Ensure we always show data if we have holdings, even if investment amount is unknown
        const finalAmountInvested = amountInvestedSol ?? null;
        const finalAmountSold = amountSoldSol ?? null;
        
        // If we have holdings but no investment amount, we can still show other metrics
        console.log('📊 Final Metrics Calculation:', {
            totalTokenHoldings: holdingsSummary.totalTokenBalance,
            holdingsValueSol,
            holdingsValueUsd,
            amountInvestedSol: finalAmountInvested,
            amountSoldSol: finalAmountSold,
            profitLossSol,
            hasPrice: priceSol !== null,
            hasHoldings: holdingsSummary.totalTokenBalance > 0
        });
        
        // Store holdings and profit/loss in state for preservation during event-driven refreshes
        tokenDetailViewState.currentHoldings = {
            totalTokenBalance: holdingsSummary.totalTokenBalance,
            holdingsValueSol,
            holdingsValueUsd
        };
        // CRITICAL: Don't store suspicious profit/loss values in state
        // If profitLossSol is suspiciously close to holdingsValueSol or too large without investment data, don't store it
        let safeProfitLossSol = profitLossSol;
        if (profitLossSol !== null) {
            // Check if it's suspiciously close to holdings value (within 0.5 SOL)
            if (holdingsValueSol !== null) {
                const diff = Math.abs(profitLossSol - holdingsValueSol);
                if (diff < 0.5) {
                    console.warn(`🚫 NOT STORING: profitLossSol (${profitLossSol} SOL) too close to holdingsValueSol (${holdingsValueSol} SOL, diff: ${diff.toFixed(6)} SOL)`);
                    safeProfitLossSol = null;
                }
            }
            // Check if it's a large value (>1 SOL) without investment data
            if (safeProfitLossSol !== null && profitLossSol > 1.0 && (finalAmountInvested === null || finalAmountInvested === 0)) {
                console.warn(`🚫 NOT STORING: Large profitLossSol (${profitLossSol} SOL) without investment data - likely holdings value, not profit`);
                safeProfitLossSol = null;
            }
        }
        
        tokenDetailViewState.currentProfitLoss = {
            profitLossSol: safeProfitLossSol,
            isUnrealizedProfit: safeProfitLossSol !== null ? isUnrealizedProfit : false,
            amountInvestedSol: finalAmountInvested,
            amountSoldSol: finalAmountSold
        };
        
        updateTokenMetrics({
            priceSol,
            priceUsd,
            marketCapUsd,
            bondingPercent,
            isBondingComplete,
            totalTokenHoldings: holdingsSummary.totalTokenBalance,
            holdingsValueSol,
            holdingsValueUsd,
            amountInvestedSol: finalAmountInvested,
            amountSoldSol: finalAmountSold,
            profitLossSol,
            isUnrealizedProfit,
            solPrice,
            source: priceDetails.source || (pumpFunInfo?.success ? 'pumpfun' : '')
        });
        
        // Start bonding curve refresh (every 30 seconds - it doesn't change that fast)
        startBondingCurveRefresh(record.mint);

        renderTokenHoldingsTable(holdingsResult.holdings, {
            priceSol,
            priceUsd
        });

        renderTokenTaskList(record, {
            runtimeTasks: runtimeAutomations.tasks
        });

        // Store solPrice for activity rendering
        tokenDetailViewState.solPrice = solPrice;
        renderTokenActivity(activity, { isLive: true, solPrice });
        startTokenActivityStream(record.mint);
        
        // Start frequent market cap/price refresh (every 3 seconds for fast updates)
        startMetricsRefresh(record.mint, solPrice);

        tokenDetailViewState.lastRuntime = Date.now();
        updateTokenLastRuntime(tokenDetailViewState.lastRuntime);
        
        console.log('✅ Token detail data loaded successfully');
        console.log('📊 Data summary:', {
            hasPrice: priceSol !== null || priceUsd !== null,
            hasMarketCap: marketCapUsd !== null,
            hasHoldings: holdingsSummary.totalTokenBalance > 0,
            hasActivity: activity.length > 0,
            hasAutomations: runtimeAutomations.tasks.length > 0
        });
        console.log('💰 Price data:', { priceSol, priceUsd, marketCapUsd, source: priceDetails.source });
        console.log('📦 Holdings:', { totalTokenBalance: holdingsSummary.totalTokenBalance, holdingsValueSol, holdingsValueUsd });
        console.log('📈 Activity:', { count: activity.length });
    } catch (error) {
        console.error('❌ Failed to load live token data:', error);
        console.error('Error stack:', error.stack);
        console.error('Error details:', {
            message: error.message,
            name: error.name,
            mint: record.mint
        });
        notify(`Unable to load live token dashboard: ${error.message || error}`, 'error');
        resetHoldingsTable({ message: 'Live holdings unavailable. Try reloading or check RPC connection.' });
        
        // Still try to update metrics with whatever data we have (nulls)
        updateTokenMetrics({
            priceSol: null,
            priceUsd: null,
            marketCapUsd: null,
            bondingPercent: null,
            totalTokenHoldings: null,
            holdingsValueSol: null,
            holdingsValueUsd: null,
            amountInvestedSol: safeNumber(record.initialBuyAmount),
            amountSoldSol: null,
            profitLossSol: null,
            solPrice: null,
            source: ''
        });
    } finally {
        tokenDetailViewState.loading = false;
    }
}

// Handle buy amount selection (doesn't execute, just stores the selection)
function handleBuyAmountSelection(walletId, walletAddress, tokenMint, solAmount) {
    const amount = Number(solAmount);
    
    if (!Number.isFinite(amount) || amount <= 0) {
        notify('Invalid buy amount.', 'warning');
        return;
    }
    
    const key = `${walletId}_${tokenMint}`;
    selectedBuyAmounts.set(key, {
        solAmount: amount,
        walletAddress: walletAddress
    });
    
    // Update UI to show selected amount
    updateBuyAmountButtons(walletId, tokenMint);
    
    // Show feedback
    const current = tokenRegistry.current;
    if (current && current.mint === tokenMint) {
        addConsoleLog(`📌 Selected ${amount} SOL buy from ${walletAddress}`, 'info');
    }
}

// Handle sell percentage selection (doesn't execute, just stores the selection)
function handleSellPercentageSelection(walletId, walletAddress, tokenMint, percentage, tokenBalance) {
    const key = `${walletId}_${tokenMint}`;
    selectedSellPercentages.set(key, {
        percentage: percentage,
        tokenBalance: tokenBalance,
        walletAddress: walletAddress
    });
    
    // Update UI to show selected percentage
    updateSellPercentageButtons(walletId, tokenMint);
    
    // Show feedback
    const current = tokenRegistry.current;
    if (current && current.mint === tokenMint) {
        const tokenAmount = tokenBalance * (percentage / 100);
        addConsoleLog(`📌 Selected ${percentage}% sell (${tokenAmount.toFixed(6)} tokens) from ${walletAddress}`, 'info');
    }
}

// Update buy amount button styles to show selected state
function updateBuyAmountButtons(walletId, tokenMint) {
    const key = `${walletId}_${tokenMint}`;
    const selected = selectedBuyAmounts.get(key);
    
    // Find all buy amount buttons for this wallet/token
    const buttons = document.querySelectorAll(`[data-wallet-id="${walletId}"][data-token-mint="${tokenMint}"][data-buy-amount]`);
    buttons.forEach(button => {
        const buttonAmount = parseFloat(button.getAttribute('data-buy-amount'));
        if (selected && selected.solAmount === buttonAmount) {
            // Selected style
            button.className = button.className.replace(/bg-neutral-900|bg-neutral-800/g, 'bg-emerald-900/70');
            button.className = button.className.replace(/text-gray-300|text-gray-400/g, 'text-emerald-200');
            button.className = button.className.replace(/border-neutral-800/g, 'border-emerald-800');
        } else {
            // Default style
            button.className = button.className.replace(/bg-emerald-900\/70/g, 'bg-neutral-900');
            button.className = button.className.replace(/text-emerald-200/g, 'text-gray-300');
            button.className = button.className.replace(/border-emerald-800/g, 'border-neutral-800');
        }
    });
}

// Update sell percentage button styles to show selected state
function updateSellPercentageButtons(walletId, tokenMint) {
    const key = `${walletId}_${tokenMint}`;
    const selected = selectedSellPercentages.get(key);
    
    // Find all percentage buttons for this wallet/token
    const buttons = document.querySelectorAll(`[data-wallet-id="${walletId}"][data-token-mint="${tokenMint}"][data-percentage]`);
    buttons.forEach(button => {
        const buttonPercentage = parseInt(button.getAttribute('data-percentage'));
        if (selected && selected.percentage === buttonPercentage) {
            // Selected style
            button.className = button.className.replace(/bg-neutral-900|bg-neutral-800/g, 'bg-rose-900/70');
            button.className = button.className.replace(/text-gray-400|text-gray-300/g, 'text-rose-200');
            button.className = button.className.replace(/border-neutral-800/g, 'border-rose-800');
        } else {
            // Default style
            button.className = button.className.replace(/bg-rose-900\/70/g, 'bg-neutral-900');
            button.className = button.className.replace(/text-rose-200/g, 'text-gray-400');
            button.className = button.className.replace(/border-rose-800/g, 'border-neutral-800');
        }
    });
}

async function handleWalletTradeAction(action, walletId, walletAddress, tokenMint, percentage = null, tokenBalance = null) {
    const current = tokenRegistry.current;
    if (!walletId) {
        notify('This wallet is tracked read-only. Import the private key to trade.', 'warning');
        return;
    }

    try {
        await ensureApiClientReady();
    } catch (error) {
        notify(`Backend unavailable: ${error.message || error}`, 'error');
        return;
    }

    try {
        if (action === 'buy') {
            // Check for selected buy amount first
            const key = `${walletId}_${tokenMint}`;
            const selected = selectedBuyAmounts.get(key);
            
            let amount;
            if (selected && selected.solAmount) {
                amount = selected.solAmount;
                // Clear selection after use
                selectedBuyAmounts.delete(key);
                updateBuyAmountButtons(walletId, tokenMint);
            } else {
                // Fallback to prompt if no selection
                const input = prompt('Enter SOL amount to buy with this wallet:', '0.1');
                amount = Number(input);
                if (!Number.isFinite(amount) || amount <= 0) {
                    notify('Buy cancelled.', 'info');
                    return;
                }
            }
            
            addConsoleLog(`🟢 Executing buy of ${amount} SOL from ${walletAddress}`, 'info');
            
            // Get trading settings from settings manager
            const tradingSettings = window.settingsManager?.getSettings()?.trading || {};
            const slippagePercent = tradingSettings.defaultSlippage || 10; // 10% default
            const priorityFeeSol = tradingSettings.priorityFee || 0.0005; // 0.0005 SOL default
            
            try {
                const response = await window.apiClient.buyToken(walletId, tokenMint, amount, { 
                    executor: 'jito',
                    slippage: slippagePercent, // Will be converted to bps in backend
                    priorityFee: priorityFeeSol // Will be converted to lamports in backend
                });
                
                if (!response?.success) {
                    // Provide more detailed error message
                    const errorMsg = response?.error || 'Transaction failed';
                    console.error('Buy transaction error:', {
                        walletId,
                        tokenMint,
                        amount,
                        error: errorMsg,
                        fullResponse: response
                    });
                    throw new Error(errorMsg);
                }
                
                notify(`✅ Successfully bought with ${amount} SOL`, 'success');
                
                // Trigger immediate metrics refresh
                if (current && current.mint === tokenMint) {
                    refreshMetricsOnEvent(tokenMint, 'user-action');
                }
            } catch (buyError) {
                // Enhanced error handling
                console.error('Buy transaction failed:', {
                    error: buyError,
                    walletId,
                    tokenMint,
                    amount
                });
                
                let errorMessage = buyError.message || 'Transaction failed';
                
                // Provide more user-friendly error messages
                if (errorMessage.includes('insufficient funds') || errorMessage.includes('balance')) {
                    errorMessage = 'Insufficient SOL balance for this purchase';
                } else if (errorMessage.includes('slippage') || errorMessage.includes('price')) {
                    errorMessage = 'Price moved too much (slippage exceeded). Try again.';
                } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
                    errorMessage = 'Network error. Please check your connection and try again.';
                }
                
                throw new Error(errorMessage);
            }
        } else if (action === 'sell' || action === 'sell-percentage') {
            // For 'sell' action, check for selected percentage first
            let sellPercentage = percentage;
            let sellTokenBalance = tokenBalance;
            
            if (action === 'sell') {
                const key = `${walletId}_${tokenMint}`;
                const selected = selectedSellPercentages.get(key);
                
                if (!selected || !selected.percentage) {
                    notify('Please select a sell percentage (25%, 50%, or 100%) before clicking Sell.', 'warning');
                    return;
                }
                
                sellPercentage = selected.percentage;
                sellTokenBalance = selected.tokenBalance;
                
                // Clear selection after use
                selectedSellPercentages.delete(key);
            }
            
            if (!sellTokenBalance || sellTokenBalance <= 0) {
                notify('No token balance available to sell.', 'warning');
                return;
            }
            
            const tokenAmount = sellTokenBalance * (sellPercentage / 100);
            if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
                notify('Sell amount is zero.', 'warning');
                return;
            }
            
            addConsoleLog(
                `🔻 Executing sell: ${sellPercentage}% (${tokenAmount.toFixed(6)} tokens) from ${walletAddress}`,
                'info'
            );
            
            // Get trading settings from settings manager
            const tradingSettings = window.settingsManager?.getSettings()?.trading || {};
            const slippagePercent = tradingSettings.defaultSlippage || 10; // 10% default
            const priorityFeeSol = tradingSettings.priorityFee || 0.0005; // 0.0005 SOL default
            
            try {
                const response = await window.apiClient.sellToken(walletId, tokenMint, tokenAmount, { 
                    executor: 'jito',
                    slippage: slippagePercent, // Will be converted to bps in backend
                    priorityFee: priorityFeeSol // Will be converted to lamports in backend
                });
                
                if (!response?.success) {
                    // Provide more detailed error message
                    const errorMsg = response?.error || 'Transaction failed';
                    console.error('Sell transaction error:', {
                        walletId,
                        tokenMint,
                        tokenAmount,
                        error: errorMsg,
                        fullResponse: response
                    });
                    throw new Error(errorMsg);
                }
                
                notify(`✅ Successfully sold ${sellPercentage}% (${tokenAmount.toFixed(6)} tokens)`, 'success');
                
                // Trigger immediate metrics refresh
                if (current && current.mint === tokenMint) {
                    refreshMetricsOnEvent(tokenMint, 'user-action');
                }
                
                // Update UI to clear selection
                if (action === 'sell') {
                    updateSellPercentageButtons(walletId, tokenMint);
                }
            } catch (sellError) {
                // Enhanced error handling
                console.error('Sell transaction failed:', {
                    error: sellError,
                    walletId,
                    tokenMint,
                    tokenAmount,
                    percentage: sellPercentage
                });
                
                let errorMessage = sellError.message || 'Transaction failed';
                
                // Provide more user-friendly error messages
                if (errorMessage.includes('insufficient funds') || errorMessage.includes('balance')) {
                    errorMessage = 'Insufficient balance for transaction fees or token amount';
                } else if (errorMessage.includes('slippage') || errorMessage.includes('price')) {
                    errorMessage = 'Price moved too much (slippage exceeded). Try again.';
                } else if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
                    errorMessage = 'Network error. Please check your connection and try again.';
                }
                
                throw new Error(errorMessage);
            }
        }

        if (current && current.mint === tokenMint) {
            // Also reload full detail after delay (for holdings update)
            setTimeout(() => loadLiveTokenDetail(current), 1500);
        }
    } catch (error) {
        console.error('Wallet action failed:', error);
        notify(`Trade failed: ${error.message || error}`, 'error');
    }
}

async function handleQuickBuy(walletId, walletAddress, tokenMint, solAmount) {
    // Just select the amount, don't execute
    handleBuyAmountSelection(walletId, walletAddress, tokenMint, solAmount);
}

function resyncTokenHoldings() {
    const current = tokenRegistry.current;
    if (!current) {
        notify('Select a token before syncing holdings.', 'warning');
        return;
    }

    if (current.type === 'draft') {
        notify('Launch the token before syncing holdings.', 'info');
        resetHoldingsTable({ message: 'Holdings will populate once the token is launched.' });
        return;
    }

    resetHoldingsTable({ message: 'Syncing wallet balances…', isLoading: true });
    loadLiveTokenDetail(current).catch((error) => {
        console.error('Unable to re-sync holdings:', error);
        notify(`Unable to re-sync holdings: ${error.message || error}`, 'error');
    });
}

async function handleRuntimeTaskAction(action, taskKey) {
    const task = runtimeTaskRegistry.get(taskKey);
    if (!task) {
        notify('Runtime task metadata unavailable.', 'error');
        return;
    }

    if (!tokenRegistry.current) {
        notify('Select a token before managing runtime tasks.', 'warning');
        return;
    }

    try {
        await ensureApiClientReady();
    } catch (error) {
        notify(`Backend unavailable: ${error.message || error}`, 'error');
        return;
    }

    try {
        if (task.type === 'volumeBot') {
            const { sessionId, walletIds, config, tokenMint } = task.metadata || {};
            if (action === 'stop' || action === 'pause') {
                if (!sessionId) {
                    notify('Volume session id unavailable.', 'error');
                    return;
                }
                await window.apiClient.stopVolumeSession(sessionId);
                notify(action === 'pause' ? 'Volume bot paused.' : 'Volume bot stopped.', 'success');
            } else if (action === 'resume') {
                if (!Array.isArray(walletIds) || !walletIds.length || !config) {
                    notify('Volume bot resume requires wallet selection and config. Reapply blueprint to restart.', 'warning');
                    return;
                }
                const mint = tokenMint || tokenRegistry.current.mint;
                await window.apiClient.startVolumeSession(walletIds, mint, config);
                notify('Volume bot resumed.', 'success');
            }
        } else if (task.type === 'smartSell') {
            const { walletId, tokenMint } = task.metadata || {};
            if (!walletId) {
                notify('Smart Sell wallet unavailable.', 'error');
                return;
            }
            if (action === 'resume') {
                notify('Resume Smart Sell from Blueprint view or prepare launch. (Coming soon)', 'info');
                return;
            }
            await window.apiClient.removeSmartSellPosition(walletId, tokenMint || tokenRegistry.current.mint);
            notify('Smart Sell automation stopped.', 'success');
        } else if (task.type === 'bump') {
            if (action === 'stop' || action === 'pause') {
                stopBumpTask();
            } else {
                notify('Bump task can only be stopped.', 'info');
            }
        } else if (task.type === 'bulkSell') {
            if (action === 'stop' || action === 'pause') {
                stopBulkSellTask();
            } else {
                notify('Bulk Sell task can only be stopped.', 'info');
            }
        } else if (task.type === 'sellBuyback') {
            if (action === 'stop' || action === 'pause') {
                stopSellBuybackTask();
            } else {
                notify('Sell Buyback task can only be stopped.', 'info');
            }
        } else if (task.type === 'launch') {
            notify('Launch tasks are managed automatically during deploy.', 'info');
            return;
        } else {
            notify('Unsupported runtime task type.', 'warning');
            return;
        }

        await loadLiveTokenDetail(tokenRegistry.current);
    } catch (error) {
        console.error('Runtime task action failed:', error);
        notify(`Task action failed: ${error.message || error}`, 'error');
    }
}

function truncateText(value, maxLength = 80) {
    if (!value || value.length <= maxLength) {
        return value || '';
    }
    return `${value.slice(0, maxLength - 1)}…`;
}

function formatNumber(value, { decimals = 2, fallback = '—', compact = false } = {}) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return fallback;
    }
    const formatter = new Intl.NumberFormat('en-US', {
        notation: compact ? 'compact' : 'standard',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    return formatter.format(Number(value));
}

function formatUsd(value) {
    if (!Number.isFinite(value)) {
        return '—';
    }
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: value >= 1_000_000 ? 'compact' : 'standard',
        maximumFractionDigits: value >= 1 ? 2 : 4
    });
    return formatter.format(value);
}

function resolveMetadataUri(uri) {
    if (!uri || typeof uri !== 'string') {
        return '';
    }
    if (uri.startsWith('ipfs://')) {
        return `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
    }
    return uri;
}

function setButtonLoading(buttonOrId, isLoading, loadingText) {
    const button = typeof buttonOrId === 'string' ? document.getElementById(buttonOrId) : buttonOrId;
    if (!button) return;
    if (isLoading) {
        button.dataset.originalText = button.dataset.originalText || button.textContent;
        button.textContent = loadingText || 'Please wait...';
        button.disabled = true;
        button.classList.add('opacity-70', 'cursor-not-allowed');
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        delete button.dataset.originalText;
        button.disabled = false;
        button.classList.remove('opacity-70', 'cursor-not-allowed');
    }
}

function tokenAvatar(record) {
    const defaultIcon = '<span class="text-2xl">🪙</span>';
    const pumpFunLogo = 'https://pump.fun/logo.png';
    
    // Check if image is missing, null, undefined, or empty string
    // This applies to ALL tokens: imported, launched, drafts, etc.
    const hasImage = record?.image && typeof record.image === 'string' && record.image.trim().length > 0;
    
    if (!hasImage) {
        // Use pump.fun logo as fallback for tokens without images (including imported tokens)
        return `
            <div class="w-10 h-10 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
                <img src="${pumpFunLogo}" alt="Token" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<span class=\\'text-2xl\\'>🪙</span>';" />
            </div>
        `;
    }
    
    const imageUrl = resolveImageUrl(record.image) || record.image;
    return `
        <div class="w-10 h-10 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(record.name || 'Token')}" class="w-full h-full object-cover" loading="lazy" onerror="this.onerror=null; this.src='${pumpFunLogo}'; this.onerror=function(){this.style.display='none'; this.parentElement.innerHTML='<span class=\\'text-2xl\\'>🪙</span>';};" />
        </div>
    `;
}

function registerImportedToken(record = {}) {
    if (!record.mint) {
        return;
    }

    const normalizedMint = record.mint;
    const existing = tokenRegistry.imported.get(normalizedMint) || {};
    const merged = {
        ...existing,
        ...record,
        id: normalizedMint,
        mint: normalizedMint,
        type: record.type || existing.type || 'imported',
        status: record.status || existing.status || (record.type === 'copy' ? 'Copied' : existing.status || 'Imported'),
        addedAt: existing.addedAt || Date.now(),
        updatedAt: Date.now(),
        archived: Boolean(
            record.archived ??
            existing.archived ??
            archivedImportedTokens.has(normalizedMint.toLowerCase())
        )
    };

    if (merged.image) {
        merged.image = resolveImageUrl(merged.image);
    }

    if (record.archived === true) {
        setImportedTokenArchivedState(normalizedMint, true);
    } else if (record.archived === false) {
        setImportedTokenArchivedState(normalizedMint, false);
    }

    tokenRegistry.imported.set(normalizedMint, merged);
    persistImportedTokens();
    renderTokensTable();
}

function renderTokensTable() {
    const tbody = document.getElementById('tokens-table-body');
    if (!tbody) {
        return;
    }

    const draftRecords = Array.from(tokenRegistry.drafts.values());
    const importedRecords = Array.from(tokenRegistry.imported.values());
    const records = [...draftRecords, ...importedRecords].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const filter = uiHelperState.tokenFilter || 'active';
    const filteredRecords = records.filter((record) => {
        const isArchived = Boolean(record.archived);
        if (filter === 'archived') {
            return isArchived;
        }
        if (filter === 'all') {
            return true;
        }
        return !isArchived;
    });

    if (filteredRecords.length === 0) {
        const emptyMessage =
            filter === 'archived'
                ? 'No archived tokens yet. Archive a draft to track it here.'
                : 'No tokens tracked yet. Copy or import a Pump.fun token to populate this table.';
        const colspan = uiHelperState.tokenDeleteMode ? 7 : 6;
        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="p-12 text-center text-gray-500">
                    <div class="flex flex-col items-center gap-2">
                        <i data-lucide="inbox" class="w-10 h-10"></i>
                        <p class="text-base font-medium">${escapeHtml(
                            filter === 'archived' ? 'No archived tokens' : 'No tokens tracked yet'
                        )}</p>
                        <p class="text-sm text-gray-500">${escapeHtml(emptyMessage)}</p>
                    </div>
                </td>
            </tr>
        `;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        return;
    }

    tbody.innerHTML = filteredRecords.map(buildTokenRow).join('');
    attachTokenRowHandlers();

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

function buildTokenRow(record) {
    const isDraft = record.type === 'draft';
    const balanceLabel =
        !isDraft && record.balance !== undefined && record.balance !== null
        ? `${record.balance.toFixed ? record.balance.toFixed(4) : record.balance} SOL`
        : '—';
    const realizedProfitLabel =
        !isDraft && record.realizedProfit !== undefined && record.realizedProfit !== null
        ? `${formatUsd(record.realizedProfit)}`
        : '—';

    let statusClass = 'bg-blue-900/40 text-blue-200';
    if (isDraft) {
        statusClass = 'bg-yellow-900/40 text-yellow-200';
    } else if (record.type === 'copy') {
        statusClass = 'bg-purple-900/40 text-purple-200';
    }

    const statusLabel = (() => {
        if (record.status) {
            return record.status;
        }
        if (isDraft) {
            return 'Pre-Launch';
        }
        return record.type === 'copy' ? 'Copied' : 'Imported';
    })();

    const description = record.description ? truncateText(record.description, 90) : 'No description available.';
    const addressCell = isDraft
        ? '<span class="italic text-gray-500">Not launched yet</span>'
        : `<span class="font-mono text-sm text-gray-300">${escapeHtml(record.mint)}</span>`;
    const launchpadLabel = record.launchpad || (record.platform ? record.platform : isDraft ? 'Pump.fun' : 'Pump.fun');
    const rowSource = isDraft ? 'draft' : 'imported';
    const identifier = isDraft ? record.id : record.mint;

    // Add price and market cap info if available
    const stats = record.stats || {};
    const priceInfo = stats.priceUsd ? `$${formatNumber(stats.priceUsd, { decimals: 6, compact: true })}` : null;
    const marketCapInfo = stats.marketCapUsd ? `$${formatNumber(stats.marketCapUsd, { decimals: 0, compact: true })}` : null;
    const priceChange24h = stats.priceChange24hPct !== null && stats.priceChange24hPct !== undefined 
        ? `${stats.priceChange24hPct >= 0 ? '+' : ''}${stats.priceChange24hPct.toFixed(2)}%`
        : null;
    
    // Build stats display
    let statsDisplay = '';
    if (!isDraft && (priceInfo || marketCapInfo || priceChange24h)) {
        const statsParts = [];
        if (priceInfo) {
            statsParts.push(`<span class="text-green-400 font-medium">${priceInfo}</span>`);
        }
        if (priceChange24h) {
            const changeColor = parseFloat(priceChange24h) >= 0 ? 'text-green-400' : 'text-red-400';
            statsParts.push(`<span class="${changeColor} text-xs">${priceChange24h}</span>`);
        }
        if (marketCapInfo) {
            statsParts.push(`<span class="text-gray-400 text-xs">MC: ${marketCapInfo}</span>`);
        }
        if (statsParts.length > 0) {
            statsDisplay = `<div class="flex flex-wrap items-center gap-2 mt-1">${statsParts.join(' • ')}</div>`;
        }
    }

    const isDeleteMode = uiHelperState.tokenDeleteMode;
    const isSelected = uiHelperState.selectedTokensForDelete.has(identifier);
    const checkboxCell = isDeleteMode 
        ? `<td class="p-4">
            <input type="checkbox" 
                   class="token-delete-checkbox w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-red-600 focus:ring-red-500 focus:ring-offset-neutral-900 cursor-pointer" 
                   data-token-id="${escapeHtml(identifier)}"
                   data-token-source="${rowSource}"
                   ${isSelected ? 'checked' : ''}
                   onchange="toggleTokenDeleteSelection('${escapeHtml(identifier)}', this.checked)">
        </td>`
        : '<td></td>';

    return `
        <tr data-token-id="${escapeHtml(identifier)}" data-token-source="${rowSource}" class="border-b border-neutral-800 hover:bg-neutral-800/40 transition ${isDeleteMode ? '' : 'cursor-pointer'} ${isSelected ? 'bg-red-900/20' : ''}">
            ${checkboxCell}
            <td class="p-4">
                <div class="flex items-center gap-3">
                    ${tokenAvatar(record)}
                    <div class="flex-1">
                        <div class="text-white font-semibold flex items-center gap-2">
                            <span>${escapeHtml(record.name || 'Unnamed')}</span>
                            ${record.symbol ? `<span class="text-xs text-gray-400">(${escapeHtml(record.symbol)})</span>` : ''}
                        </div>
                        <div class="text-xs text-gray-500 mt-1">${escapeHtml(description)}</div>
                        ${statsDisplay}
                    </div>
                </div>
            </td>
            <td class="p-4 font-mono text-sm text-gray-300">${addressCell}</td>
            <td class="p-4 text-gray-300">${balanceLabel}</td>
            <td class="p-4 text-gray-300">${realizedProfitLabel}</td>
            <td class="p-4 text-gray-300">
                <span class="px-2 py-1 rounded-full text-xs bg-purple-900/40 text-purple-200">${escapeHtml(launchpadLabel)}</span>
            </td>
            <td class="p-4">
                <span class="px-2 py-1 rounded-full text-xs ${statusClass}">${escapeHtml(statusLabel)}</span>
            </td>
        </tr>
    `;
}

function attachTokenRowHandlers() {
    const tbody = document.getElementById('tokens-table-body');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-token-id]').forEach((row) => {
        // Don't attach click handler in delete mode (checkboxes handle selection)
        if (!uiHelperState.tokenDeleteMode) {
        row.addEventListener('click', () => {
            const identifier = row.getAttribute('data-token-id');
            const source = row.getAttribute('data-token-source') || 'imported';
            viewTokenDetails(identifier, source);
        });
        }
    });
}

// Enter delete mode for tokens
function enterDeleteTokenMode() {
    uiHelperState.tokenDeleteMode = true;
    uiHelperState.selectedTokensForDelete.clear();
    
    const deleteBtn = getElement('delete-tokens-btn');
    const selectHeader = getElement('token-select-header');
    
    if (deleteBtn) {
        deleteBtn.innerHTML = `
            <i data-lucide="x" class="w-4 h-4"></i>
            <span>Cancel</span>
        `;
        deleteBtn.onclick = exitDeleteTokenMode;
        deleteBtn.classList.remove('bg-red-700', 'hover:bg-red-600');
        deleteBtn.classList.add('bg-neutral-800', 'hover:bg-neutral-700');
    }
    
    if (selectHeader) {
        selectHeader.innerHTML = '<input type="checkbox" id="select-all-tokens" class="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-red-600 focus:ring-red-500 cursor-pointer" onchange="toggleSelectAllTokens(this.checked)">';
    }
    
    renderTokensTable();
    
    // Add delete button next to Cancel
    const buttonContainer = deleteBtn?.parentElement;
    if (buttonContainer && !getElement('confirm-delete-tokens-btn')) {
        const confirmDeleteBtn = document.createElement('button');
        confirmDeleteBtn.id = 'confirm-delete-tokens-btn';
        confirmDeleteBtn.className = 'bg-red-700 hover:bg-red-600 text-white text-sm py-1.5 px-3 rounded flex items-center gap-2 transition';
        confirmDeleteBtn.innerHTML = `
            <i data-lucide="trash-2" class="w-4 h-4"></i>
            <span>Delete Selected</span>
        `;
        confirmDeleteBtn.onclick = deleteSelectedTokens;
        deleteBtn.insertAdjacentElement('afterend', confirmDeleteBtn);
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    notify('Select tokens to delete, then click "Delete Selected"', 'info');
}

// Exit delete mode
function exitDeleteTokenMode() {
    uiHelperState.tokenDeleteMode = false;
    uiHelperState.selectedTokensForDelete.clear();
    
    const deleteBtn = getElement('delete-tokens-btn');
    const selectHeader = getElement('token-select-header');
    const confirmDeleteBtn = getElement('confirm-delete-tokens-btn');
    
    if (deleteBtn) {
        deleteBtn.innerHTML = `
            <i data-lucide="trash-2" class="w-4 h-4"></i>
            <span>Delete Token</span>
        `;
        deleteBtn.onclick = enterDeleteTokenMode;
        deleteBtn.classList.add('bg-red-700', 'hover:bg-red-600');
        deleteBtn.classList.remove('bg-neutral-800', 'hover:bg-neutral-700');
    }
    
    if (selectHeader) {
        selectHeader.innerHTML = '';
    }
    
    if (confirmDeleteBtn) {
        confirmDeleteBtn.remove();
    }
    
    renderTokensTable();
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Toggle token selection for deletion
function toggleTokenDeleteSelection(tokenId, isSelected) {
    if (isSelected) {
        uiHelperState.selectedTokensForDelete.add(tokenId);
    } else {
        uiHelperState.selectedTokensForDelete.delete(tokenId);
    }
    
    // Update select all checkbox
    const selectAllCheckbox = getElement('select-all-tokens');
    if (selectAllCheckbox) {
        const tbody = document.getElementById('tokens-table-body');
        const allCheckboxes = tbody?.querySelectorAll('.token-delete-checkbox') || [];
        const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
        selectAllCheckbox.checked = checkedCount === allCheckboxes.length && allCheckboxes.length > 0;
        selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
    }
    
    // Update row highlighting
    const row = document.querySelector(`tr[data-token-id="${tokenId}"]`);
    if (row) {
        if (isSelected) {
            row.classList.add('bg-red-900/20');
        } else {
            row.classList.remove('bg-red-900/20');
        }
    }
}

// Toggle select all tokens
function toggleSelectAllTokens(selectAll) {
    const tbody = document.getElementById('tokens-table-body');
    if (!tbody) return;
    
    const checkboxes = tbody.querySelectorAll('.token-delete-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll;
        const tokenId = checkbox.getAttribute('data-token-id');
        toggleTokenDeleteSelection(tokenId, selectAll);
    });
}

// Delete selected tokens
async function deleteSelectedTokens() {
    const selectedIds = Array.from(uiHelperState.selectedTokensForDelete);
    
    if (selectedIds.length === 0) {
        notify('No tokens selected for deletion', 'warning');
        return;
    }
    
    const tokenCount = selectedIds.length;
    const confirmMessage = `Are you sure you want to permanently delete ${tokenCount} token${tokenCount === 1 ? '' : 's'}?\n\n` +
        `This will remove ${tokenCount === 1 ? 'it' : 'them'} from the entire project/website.\n\n` +
        `This action cannot be undone.`;
    
    if (!window.confirm(confirmMessage)) {
        return;
    }
    
    addConsoleLog(`🗑️ Deleting ${tokenCount} token(s)...`, 'info');
    
    let deletedCount = 0;
    let failedCount = 0;
    let deletedDrafts = false;
    
    for (const identifier of selectedIds) {
        try {
            // Check if it's a draft or imported token
            // Try both the identifier and case variations
            const isDraft = tokenRegistry.drafts.has(identifier) || 
                           Array.from(tokenRegistry.drafts.keys()).some(key => 
                               key.toLowerCase() === identifier.toLowerCase()
                           );
            
            if (isDraft) {
                // Find the actual draft key (case-insensitive)
                const draftKey = Array.from(tokenRegistry.drafts.keys()).find(key => 
                    key === identifier || key.toLowerCase() === identifier.toLowerCase()
                );
                
                if (draftKey) {
                    // Delete from drafts registry
                    tokenRegistry.drafts.delete(draftKey);
                    // Persist drafts (removeTokenDraft calls persistTokenDrafts)
                    removeTokenDraft(draftKey);
                    deletedDrafts = true;
                }
            } else {
                // Delete from imported tokens - try all case variations
                const normalizedMint = identifier.toLowerCase();
                const originalMint = identifier;
                
                // Remove from registry (try all variations)
                tokenRegistry.imported.delete(identifier);
                tokenRegistry.imported.delete(normalizedMint);
                tokenRegistry.imported.delete(originalMint);
                
                // Also check all keys for case-insensitive match
                const matchingKeys = Array.from(tokenRegistry.imported.keys()).filter(key => 
                    key.toLowerCase() === normalizedMint
                );
                matchingKeys.forEach(key => tokenRegistry.imported.delete(key));
                
                // Remove from archived set
                archivedImportedTokens.delete(identifier);
                archivedImportedTokens.delete(normalizedMint);
                archivedImportedTokens.delete(originalMint);
                
                // Remove from localStorage archived set
                setImportedTokenArchivedState(identifier, false);
            }
            
            deletedCount++;
        } catch (error) {
            console.error(`Error deleting token ${identifier}:`, error);
            failedCount++;
        }
    }
    
    // Persist changes - this will save the current state (without deleted tokens)
    persistImportedTokens();
    
    // Also persist drafts if any were deleted (removeTokenDraft already calls persistTokenDrafts, but ensure it's called)
    if (deletedDrafts) {
        persistTokenDrafts();
    }
    
    // Clear selections and exit delete mode
    uiHelperState.selectedTokensForDelete.clear();
    exitDeleteTokenMode();
    
    // Refresh table
    renderTokensTable();
    
    // Show result
    if (deletedCount > 0) {
        addConsoleLog(`✅ Successfully deleted ${deletedCount} token(s)`, 'success');
        notify(`Deleted ${deletedCount} token${deletedCount === 1 ? '' : 's'}`, 'success');
    }
    
    if (failedCount > 0) {
        addConsoleLog(`❌ Failed to delete ${failedCount} token(s)`, 'error');
        notify(`Failed to delete ${failedCount} token${failedCount === 1 ? '' : 's'}`, 'error');
    }
}

function updateTokenDetailLinks(record = {}) {
    const websiteLink = document.getElementById('selected-token-website');
    const twitterLink = document.getElementById('selected-token-twitter');
    const telegramLink = document.getElementById('selected-token-telegram');
    const metadataLink = document.getElementById('selected-token-metadata');

    const setLink = (element, url) => {
        if (!element) return;
        if (url) {
            element.href = url;
            element.classList.remove('opacity-40', 'pointer-events-none');
        } else {
            element.href = '#';
            element.classList.add('opacity-40', 'pointer-events-none');
        }
    };

    setLink(websiteLink, record.website);
    setLink(twitterLink, record.twitter);
    setLink(telegramLink, record.telegram);
    setLink(metadataLink, record.metadataUri ? resolveMetadataUri(record.metadataUri) : null);
}
function deriveAutomationState(config) {
    if (!config) {
        return { mode: 'creator', walletIds: [], groupId: '' };
    }

    const selector = config.walletSelector || {};
    const rawWalletIds =
        (Array.isArray(selector.walletIds) && selector.walletIds.length && selector.walletIds) ||
        (Array.isArray(config.walletIds) && config.walletIds.length && config.walletIds) ||
        (Array.isArray(config.wallets) &&
            config.wallets
                .map((wallet) =>
                    typeof wallet === 'string'
                        ? wallet
                        : wallet?.walletId || wallet?.id || wallet?.address || wallet?.publicKey || ''
                )
                .filter(Boolean)) ||
        [];

    const modeCandidate =
        config.walletMode ||
        selector.mode ||
        config.mode ||
        (selector.groupId || config.walletGroupId || config.groupId ? 'group' : rawWalletIds.length ? 'custom' : 'creator');

    return {
        mode: modeCandidate || 'creator',
        walletIds: rawWalletIds.map((value) => (typeof value === 'string' ? value : String(value))).filter(Boolean),
        groupId:
            selector.groupId ||
            config.walletGroupId ||
            config.groupId ||
            (typeof selector.group === 'string' ? selector.group : '') ||
            ''
    };
}
function hydrateCreateTokenFormFromDraft(record) {
    if (!record) {
        return;
    }

    const applyValue = (id, value = '') => {
        const el = getElement(id);
        if (!el) return;
        el.value = value ?? '';
    };

    const creatorWalletId =
        tokenLaunchState.selectedWalletId ||
        record.creatorWalletId ||
        record.creatorWallet ||
        tokenLaunchState.launchConfig?.devWalletId ||
        '';

    applyValue('token-name', record.name || '');
    applyValue('token-symbol', record.symbol || '');
    applyValue('token-description', record.description || '');
    applyValue('token-website', record.website || '');
    applyValue('token-twitter', record.twitter || '');
    applyValue('token-telegram', record.telegram || '');
    applyValue('initial-buy-amount', record.initialBuyAmount ?? '');

    const useVanity = getElement('use-vanity');
    if (useVanity) {
        useVanity.checked = Boolean(record.useVanity);
    }

    uiHelperState.tokenPlatform = record.platform || uiHelperState.tokenPlatform || 'pumpfun';
    if (typeof window.selectTokenPlatform === 'function') {
        window.selectTokenPlatform(uiHelperState.tokenPlatform, { silent: true });
    }

    const assignCreatorWallet = () => {
        if (!creatorWalletId) {
            return;
        }
        const selectEl = getElement('token-creator-wallet');
        if (!selectEl) {
            return;
        }
        const option = Array.from(selectEl.options).find((opt) => opt.value === creatorWalletId);
        if (option) {
            selectEl.value = option.value;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    assignCreatorWallet();
    setTimeout(assignCreatorWallet, 300);

    tokenLaunchState.image = {
        base64: record.image || record.imageUri || tokenLaunchState.image.base64 || null,
        uri: record.imageUri || null,
        gatewayUrl: record.image || record.imageUri || null,
        contentType: null,
        fileName: null,
        size: 0
    };
    refreshTokenImageStatus();

    const automations = record.automations || {};
    const automationsEnabled = record.automationsEnabled || {};
    const smartSellConfig = automations.smartSell || (automationsEnabled.smartSell ? { enabled: true } : null);
    const volumeConfig = automations.volumeBot || (automationsEnabled.volumeBot ? { enabled: true } : null);

    tokenLaunchState.automations.smartSell = deriveAutomationState(smartSellConfig);
    tokenLaunchState.automations.volumeBot = deriveAutomationState(volumeConfig);

    const smartSellToggle = getElement('enable-smart-sell');
    if (smartSellToggle) {
        smartSellToggle.checked = Boolean(smartSellConfig?.enabled);
        toggleSmartSellConfig();
        if (smartSellConfig) {
            applyValue('smart-sell-profit', smartSellConfig.profitTarget ?? smartSellConfig.profit ?? '');
            applyValue('smart-sell-stoploss', smartSellConfig.stopLoss ?? '');
            applyValue('smart-sell-trailing', smartSellConfig.trailingStop ?? '');
            const partialToggle = getElement('smart-sell-partial');
            if (partialToggle) {
                partialToggle.checked =
                    smartSellConfig.partialSells !== undefined ? Boolean(smartSellConfig.partialSells) : partialToggle.checked;
            }
        }
    }

    const volumeToggle = getElement('enable-volume-bot');
    if (volumeToggle) {
        volumeToggle.checked = Boolean(volumeConfig?.enabled);
        toggleVolumeBotConfig();
        if (volumeConfig) {
            const assignNumber = (id, value) => {
                if (value === undefined || value === null || value === '') return;
                applyValue(id, value);
            };
            assignNumber('volume-bot-amount', volumeConfig.buyAmount);
            assignNumber('volume-bot-min-amount', volumeConfig.minAmount);
            assignNumber('volume-bot-max-amount', volumeConfig.maxAmount);
            assignNumber('volume-bot-delay', volumeConfig.sellDelay);
            assignNumber('volume-bot-cycles', volumeConfig.cycles);
            assignNumber('volume-bot-buy-interval', volumeConfig.buyIntervalSeconds);
            assignNumber('volume-bot-buy-interval-min', volumeConfig.buyIntervalMinSeconds);
            assignNumber('volume-bot-buy-interval-max', volumeConfig.buyIntervalMaxSeconds);
            assignNumber('volume-bot-sell-interval', volumeConfig.sellIntervalSeconds);
            assignNumber('volume-bot-sell-interval-min', volumeConfig.sellIntervalMinSeconds);
            assignNumber('volume-bot-sell-interval-max', volumeConfig.sellIntervalMaxSeconds);
            assignNumber('volume-bot-sell-percent-min', volumeConfig.sellPercentageMin);
            assignNumber('volume-bot-sell-percent-max', volumeConfig.sellPercentageMax);

            const randomizeAmounts = getElement('volume-bot-randomize');
            if (randomizeAmounts) {
                randomizeAmounts.checked = volumeConfig.randomizeAmounts !== undefined ? Boolean(volumeConfig.randomizeAmounts) : randomizeAmounts.checked;
            }
            const randomizeDelay = getElement('volume-bot-randomize-delay');
            if (randomizeDelay) {
                randomizeDelay.checked = volumeConfig.randomizeDelay !== undefined ? Boolean(volumeConfig.randomizeDelay) : randomizeDelay.checked;
            }

            const guardrailToggle = getElement('volume-bot-guardrails-enabled');
            if (guardrailToggle) {
                guardrailToggle.checked = Boolean(volumeConfig.guardrails?.enabled);
                toggleVolumeGuardrails();
                if (volumeConfig.guardrails) {
                    assignNumber('volume-bot-profit-target', volumeConfig.guardrails.realizedProfitTarget);
                    assignNumber('volume-bot-loss-limit', volumeConfig.guardrails.realizedLossLimit);
                }
            }
        }
    }

    setupLaunchAutomationWalletControls();
    setTimeout(() => {
        populateLaunchAutomationWalletOptions();
        populateLaunchAutomationGroupOptions();
        reflectLaunchAutomationState('smartSell');
        reflectLaunchAutomationState('volumeBot');
    }, 0);
}

function setTokenHoldingsSource(source, { silent = false, skipReload = false } = {}) {
    const normalized = source === 'rpc' ? 'rpc' : 'jito';
    tokenDetailViewState.holdingsSource = normalized;

    const activeClasses = ['bg-purple-600', 'text-white', 'shadow-lg', 'shadow-purple-500/30'];
    const inactiveClasses = ['bg-neutral-900', 'text-gray-400'];

    const applyState = (button, active) => {
        if (!button) return;
        button.classList.remove(
            ...activeClasses,
            ...inactiveClasses,
            'shadow-lg',
            'shadow-purple-500/30'
        );
        if (active) {
            button.classList.add(...activeClasses);
        } else {
            button.classList.add(...inactiveClasses);
        }
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    };

    applyState(getElement('token-holdings-source-jito'), normalized === 'jito');
    applyState(getElement('token-holdings-source-rpc'), normalized === 'rpc');

    if (!silent) {
        notify(`Holdings source switched to ${normalized.toUpperCase()}.`, 'info');
    }

    const current = tokenRegistry.current;
    if (!skipReload && current && current.type !== 'draft') {
        tokenDetailViewState.loading = false;
        loadLiveTokenDetail(current).catch((error) => {
            console.error('Failed to refresh holdings after source change:', error);
        });
    }
}

function handleTokenEdit() {
    const current = tokenRegistry.current;
    if (!current) {
        notify('Select a token before editing.', 'warning');
        return;
    }
    if (current.type !== 'draft') {
        notify('Editing is available for saved drafts only.', 'warning');
        return;
    }

    tokenLaunchState.pendingDraftId = current.id;
    tokenLaunchState.activeLaunchDraftId = current.id;
    tokenLaunchState.launchConfig = cloneLaunchConfig(
        current.launchConfig || {
            devWalletId: current.creatorWalletId || current.creatorWallet || '',
            devBuyAmount: current.devBuyAmount ?? current.initialBuyAmount,
            blockZero: current.blockZero || {}
        }
    );
    tokenLaunchState.selectedWalletId =
        tokenLaunchState.launchConfig.devWalletId ||
        current.creatorWalletId ||
        current.creatorWallet ||
        tokenLaunchState.selectedWalletId ||
        '';

    const automations = current.automations || {};
    const automationsEnabled = current.automationsEnabled || {};
    tokenLaunchState.automations.smartSell = deriveAutomationState(
        automations.smartSell || (automationsEnabled.smartSell ? { enabled: true } : null)
    );
    tokenLaunchState.automations.volumeBot = deriveAutomationState(
        automations.volumeBot || (automationsEnabled.volumeBot ? { enabled: true } : null)
    );

    tokenLaunchState.image = {
        base64: current.image || current.imageUri || tokenLaunchState.image.base64 || null,
        uri: current.imageUri || null,
        gatewayUrl: current.image || current.imageUri || null,
        contentType: null,
        fileName: null,
        size: 0
    };

    navigateToPage('create-token');
    setTimeout(() => {
        hydrateCreateTokenFormFromDraft(current);
        notify('Draft loaded into Create Token view.', 'info');
        if (typeof addConsoleLog === 'function') {
            addConsoleLog(
                `✏️ Editing draft ${current.name || current.symbol || current.id}`,
                'info'
            );
        }
    }, 240);
}

function handleTokenArchive() {
    const current = tokenRegistry.current;
    if (!current) {
        notify('Select a token before archiving.', 'warning');
        return;
    }

    const nextState = !current.archived;
    let updatedRecord = current;

    if (current.type === 'draft') {
        registerTokenDraft({ ...current, archived: nextState });
        const refreshed = tokenRegistry.drafts.get(current.id);
        if (refreshed) {
            updatedRecord = refreshed;
        }
    } else {
        const mint = current.mint;
        if (!mint) {
            notify('Unable to archive token without a mint address.', 'error');
            return;
        }
        updatedRecord = {
            ...current,
            archived: nextState,
            updatedAt: Date.now()
        };
        tokenRegistry.imported.set(mint, updatedRecord);
        setImportedTokenArchivedState(mint, nextState);
        persistImportedTokens();
    }

    tokenRegistry.current = updatedRecord;
    populateTokenDetailView(updatedRecord);
    renderTokensTable();

    if (typeof addConsoleLog === 'function') {
        addConsoleLog(
            nextState
                ? `📦 Archived token ${updatedRecord.name || updatedRecord.mint || updatedRecord.id}`
                : `♻️ Restored token ${updatedRecord.name || updatedRecord.mint || updatedRecord.id}`,
            nextState ? 'info' : 'success'
        );
    }

    notify(
        nextState
            ? 'Token archived. View it under Archived tokens.'
            : 'Token restored to Active tokens.',
        nextState ? 'info' : 'success'
    );

    // If archiving (not unarchiving), navigate back to tokens page
    if (nextState) {
        // Small delay to show the notification
        setTimeout(() => {
            switchView('tokens');
        }, 500);
    }
}

function populateTokenDetailView(record) {
    if (!record) return;
    // Reset first update flag when switching to a new token
    isFirstMetricsUpdate = true;
    stopTokenActivityStream();
    stopMetricsRefresh();
    tokenRegistry.current = record;
    tokenRegistry.currentSource = record.type === 'draft' ? 'draft' : 'imported';
    tokenDetailViewState.currentKey = record.mint || record.id || null;
    tokenDetailViewState.lastRuntime = null;
    updateTokenLastRuntime(null);

    const nameEl = document.getElementById('selected-token-name');
    const titleEl = document.getElementById('selected-token-title');
    const subtitleEl = document.getElementById('selected-token-subtitle');
    const addressEl = document.getElementById('selected-token-address');
    const iconEl = document.getElementById('selected-token-icon');
    const statusEl = document.getElementById('token-status');
    const copyIcon = document.getElementById('selected-token-copy');
    const prepareButton = document.getElementById('prepare-launch-btn');
    const platformEl = document.getElementById('selected-token-platform');

    const isDraft = record.type === 'draft';

    if (nameEl) {
        nameEl.textContent = record.name || 'Token';
    }

    if (titleEl) {
        titleEl.textContent = record.name || 'Token';
        if (subtitleEl) {
            subtitleEl.textContent = record.symbol ? `(${record.symbol})` : '';
        }
    }

    if (addressEl) {
        addressEl.textContent = isDraft ? 'Not launched yet' : record.mint;
    }
    
    // Update GMGN price chart iframe
    const gmgnChartEl = document.getElementById('gmgn-price-chart');
    if (gmgnChartEl && record.mint && !isDraft) {
        // Format: https://www.gmgn.cc/kline/sol/{token CA}
        const gmgnUrl = `https://www.gmgn.cc/kline/sol/${record.mint}`;
        
        // Only update if URL is different to avoid unnecessary reloads
        if (gmgnChartEl.src !== gmgnUrl) {
            // Clear src first to properly destroy old chart
            gmgnChartEl.src = '';
            // Small delay to let cleanup complete, then load new chart
            setTimeout(() => {
                if (gmgnChartEl && record.mint) {
                    gmgnChartEl.src = gmgnUrl;
                }
            }, 100);
        }
    } else if (gmgnChartEl) {
        // Hide chart for drafts or tokens without mint
        if (gmgnChartEl.src) {
            gmgnChartEl.src = '';
        }
    }

    if (iconEl) {
        const pumpFunLogo = 'https://pump.fun/logo.png';
        const hasImage = record?.image && typeof record.image === 'string' && record.image.trim().length > 0;
        const imageUrl = hasImage ? (resolveImageUrl(record.image) || record.image) : pumpFunLogo;
        
        // Always use an img tag to ensure proper styling and fallback behavior
        iconEl.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(record.name || 'Token')}" class="w-full h-full object-cover rounded-full" loading="lazy" onerror="this.onerror=null; this.src='${pumpFunLogo}'; this.onerror=function(){this.style.display='none'; this.parentElement.innerHTML='<span class=\\'text-4xl\\'>🪙</span>';};" />`;
    }

    if (statusEl) {
        const statusLabel = (record.status || (isDraft ? 'PRE-LAUNCH' : record.type?.toUpperCase() || 'ACTIVE')).toString();
        statusEl.textContent = statusLabel;
        statusEl.className = 'inline-flex items-center px-2 py-1 text-xs rounded-full';
        const normalized = statusLabel.toLowerCase();
        if (normalized.includes('running') || normalized.includes('live')) {
            statusEl.classList.add('bg-emerald-900/60', 'text-emerald-200');
        } else if (normalized.includes('queued') || normalized.includes('pre')) {
            statusEl.classList.add('bg-blue-900/50', 'text-blue-200');
        } else if (normalized.includes('paused')) {
            statusEl.classList.add('bg-yellow-900/60', 'text-yellow-200');
        } else {
            statusEl.classList.add('bg-neutral-800', 'text-gray-200');
        }
    }

    if (platformEl) {
        const sourceLabel = typeof record.source === 'string' ? record.source : '';
        const fallbackPlatform =
            record.type === 'draft'
                ? ''
                : record.provider ||
                  (sourceLabel && sourceLabel.toLowerCase() === 'pumpfun' ? 'Pump.fun' : '') ||
                  (record.launchSource && typeof record.launchSource === 'string'
                      ? record.launchSource
                      : '');
        const platform =
            record.launchPlatform ||
            record.platform ||
            sourceLabel ||
            (typeof record.launchSource === 'string' ? record.launchSource : '') ||
            record.market ||
            fallbackPlatform;
        if (platform) {
            platformEl.textContent = platform;
            platformEl.classList.remove('hidden');
        } else {
            platformEl.textContent = '';
            platformEl.classList.add('hidden');
        }
    }

    const editButton = getElement('token-edit-btn');
    if (editButton) {
        const isEditableDraft = record.type === 'draft';
        const editLabel = editButton.querySelector('span');
        editButton.disabled = !isEditableDraft;
        editButton.classList.toggle('opacity-60', !isEditableDraft);
        editButton.classList.toggle('pointer-events-none', !isEditableDraft);
        editButton.setAttribute('aria-disabled', isEditableDraft ? 'false' : 'true');
        editButton.title = isEditableDraft ? 'Edit draft configuration' : 'Editing is available for saved drafts';
        if (editLabel) {
            editLabel.textContent = 'Edit';
        }
    }

    const archiveButton = getElement('token-archive-btn');
    if (archiveButton) {
        const archiveLabel = archiveButton.querySelector('span');
        const isArchived = Boolean(record.archived);
        if (archiveLabel) {
            archiveLabel.textContent = isArchived ? 'Unarchive' : 'Archive';
        }
        archiveButton.setAttribute('aria-pressed', isArchived ? 'true' : 'false');
        archiveButton.title = isArchived ? 'Restore token to Active' : 'Archive token';
    }

    const collectFeesButton = getElement('token-collect-fees-btn');
    if (collectFeesButton) {
        if (isDraft) {
            collectFeesButton.classList.add('hidden');
        } else {
            collectFeesButton.classList.remove('hidden');
        }
    }

    // Show/hide Collect Creator Fees button (only for launched tokens)
    const collectCreatorFeesButton = getElement('token-collect-creator-fees-btn');
    if (collectCreatorFeesButton) {
        // Only show for launched tokens (not drafts, not imported)
        const isLaunched = !isDraft && record.mint && (record.type === 'launch' || record.status === 'Launched' || (record.type !== 'imported' && record.type !== 'copy'));
        if (isLaunched) {
            collectCreatorFeesButton.classList.remove('hidden');
        } else {
            collectCreatorFeesButton.classList.add('hidden');
        }
    }

    setTokenHoldingsSource(tokenDetailViewState.holdingsSource || 'jito', {
        silent: true,
        skipReload: true
    });

    if (copyIcon) {
        copyIcon.setAttribute('type', 'button');
        if (isDraft) {
            copyIcon.classList.add('opacity-40', 'pointer-events-none');
            copyIcon.setAttribute('disabled', 'disabled');
            copyIcon.onclick = null;
        } else {
            copyIcon.classList.remove('opacity-40', 'pointer-events-none');
            copyIcon.removeAttribute('disabled');
        copyIcon.onclick = async () => {
            try {
                await navigator.clipboard.writeText(record.mint);
                notify('Token mint copied to clipboard.', 'success');
            } catch (error) {
                notify('Unable to copy mint address.', 'error');
            }
        };
        }
    }

    if (prepareButton) {
        if (isDraft) {
            prepareButton.classList.remove('hidden');
        } else {
            prepareButton.classList.add('hidden');
        }
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    updateTokenDetailLinks(record);

    resetTokenMetrics();
    resetHoldingsTable({
        message: isDraft
            ? 'Holdings will populate once the token is launched.'
            : 'Fetching live wallet balances…'
    });
    // Use stored solPrice if available
    const solPrice = tokenDetailViewState.solPrice || null;
    renderTokenActivity([], { isLive: !isDraft, loading: !isDraft, solPrice });

    if (isDraft) {
        renderTokenTaskList(record, { runtimeTasks: [] });
        return;
    }

    renderTokenTaskList(record, { loading: true });

    if (!record.mint) {
        notify('Token mint unavailable; live dashboards require a mint address.', 'warning');
        return;
    }

    loadLiveTokenDetail(record).catch((error) => {
        console.error('Failed to load live token detail:', error);
        notify(`Unable to load live token metrics: ${error.message}`, 'error');
    });
}

function buildAutomationTaskEntries(record = {}, runtimeTasks = []) {
    const tasks = [];
    const isDraft = record?.type === 'draft';
    const automations = record?.automations || {};
    const enabledMap = record?.automationsEnabled || {};

    const statusLabel = (record?.status || (isDraft ? 'PRE-LAUNCH' : 'LAUNCHED')).toString();
    const hasRuntimeLaunch = Array.isArray(runtimeTasks) && runtimeTasks.some((task) => task.key === 'launch_token');

    if (!hasRuntimeLaunch) {
        let launchState = 'queued';
        let launchClass = 'bg-blue-900/50 text-blue-200';
        let launchLabel = 'Queued';

        const normalized = statusLabel.toLowerCase();
        // Check if token has been launched (has mint address and is not a draft)
        const isLaunched = !isDraft && record?.mint && record.mint.length > 0;
        
        if (normalized.includes('running') || normalized.includes('launching')) {
            launchState = 'running';
            launchClass = 'bg-amber-900/60 text-amber-200';
            launchLabel = 'Running';
        } else if (isLaunched || normalized.includes('live') || normalized.includes('launched') || normalized.includes('imported')) {
            // Token is launched if it has a mint address (imported tokens are already launched)
            launchState = 'completed';
            launchClass = 'bg-emerald-900/60 text-emerald-200';
            launchLabel = 'Completed';
        }

        tasks.push({
            key: 'launch_token',
            source: isDraft ? 'draft' : 'runtime',
            type: 'launch',
            title: 'Launch Token',
            subtitle: isDraft ? 'Prepare Launch to deploy blueprint' : `Status: ${statusLabel}`,
            icon: 'rocket',
            iconBackground: 'bg-orange-900/60',
            statusLabel: launchLabel,
            statusClass: launchClass,
            statusState: launchState,
            actions: []
        });
    }

    if (isDraft) {
        const describeAutomation = (key, config, defaults = {}) => {
            if (!config || typeof config !== 'object') {
                return null;
            }
            const normalizedConfig = { ...config };
            const enabled =
                (enabledMap && Object.prototype.hasOwnProperty.call(enabledMap, key)
                    ? Boolean(enabledMap[key])
                    : normalizedConfig.enabled !== false);

            const selectorDescription = describeAutomationSelector(normalizedConfig);
            const details = [];

            const entry = {
                key,
                source: 'draft',
                type: key,
                title: defaults.title || key,
                icon: defaults.icon || 'settings',
                iconBackground: defaults.iconBackground || 'bg-neutral-800',
                statusLabel: enabled ? 'Queued' : 'Paused',
                statusClass: enabled ? 'bg-blue-900/50 text-blue-200' : 'bg-yellow-900/60 text-yellow-200',
                statusState: enabled ? 'queued' : 'paused',
                subtitle: selectorDescription,
                actions: [
                    { type: 'resume', icon: 'play', label: 'Play', intent: 'green', disabled: enabled },
                    { type: 'pause', icon: 'pause', label: 'Pause', intent: 'yellow', disabled: !enabled },
                    { type: 'remove', icon: 'square', label: 'Remove', intent: 'red', disabled: false }
                ]
            };

            if (key === 'smartSell') {
                entry.icon = 'shield';
                entry.iconBackground = 'bg-purple-900/60';
                entry.title = 'Smart Sell';
                const profitTarget = safeNumber(normalizedConfig.profitTarget);
                const stopLoss = safeNumber(normalizedConfig.stopLoss);
                const trailingStop = safeNumber(normalizedConfig.trailingStop);
                details.push(`Profit ${profitTarget !== null ? `${profitTarget}%` : 'Auto'}`);
                details.push(`Stop ${stopLoss !== null ? `${stopLoss}%` : 'Unset'}`);
                details.push(`Trailing ${trailingStop !== null ? `${trailingStop}%` : 'Disabled'}`);
            } else if (key === 'volumeBot') {
                entry.icon = 'activity';
                entry.iconBackground = 'bg-blue-900/60';
                entry.title = 'Volume Bot';
                const minAmount = safeNumber(normalizedConfig.minAmount);
                const maxAmount = safeNumber(normalizedConfig.maxAmount);
                const buyAmount = safeNumber(normalizedConfig.buyAmount);

                const buyLabel = (() => {
                    if (minAmount !== null && maxAmount !== null) {
                        if (minAmount === maxAmount) {
                            return formatSol(minAmount);
                        }
                        return `${formatSol(minAmount)} - ${formatSol(maxAmount)}`;
                    }
                    if (minAmount !== null) {
                        return `≥ ${formatSol(minAmount)}`;
                    }
                    if (maxAmount !== null) {
                        return `≤ ${formatSol(maxAmount)}`;
                    }
                    if (buyAmount !== null) {
                        return formatSol(buyAmount);
                    }
                    return 'Adaptive';
                })();
                details.push(`Buy size ${buyLabel}`);

                const cycles = safeNumber(normalizedConfig.cycles);
                if (cycles !== null) {
                    details.push(`Cycles ${cycles}`);
                }
                const guardrails = normalizedConfig.guardrails || {};
                if (guardrails.enabled === false) {
                    details.push('Guardrails disabled');
                } else if (guardrails.realizedProfitTarget || guardrails.realizedLossLimit) {
                    details.push(
                        `Guardrails TP ${guardrails.realizedProfitTarget ?? '—'} / SL ${guardrails.realizedLossLimit ?? '—'}`
                    );
                } else {
                    details.push('Guardrails enabled');
                }
            }

            entry.subtitle = details.join(' • ') || selectorDescription || defaults.subtitle || '';
            return entry;
        };

        const smartSellEntry = describeAutomation('smartSell', automations.smartSell, { title: 'Smart Sell' });
        if (smartSellEntry) {
            tasks.push(smartSellEntry);
        }

        const volumeEntry = describeAutomation('volumeBot', automations.volumeBot, { title: 'Volume Bot' });
        if (volumeEntry) {
            tasks.push(volumeEntry);
        }
    }

    if (Array.isArray(runtimeTasks) && runtimeTasks.length) {
        runtimeTasks.forEach((task) => {
            const normalizedTask = {
                key: task.key,
                source: task.source || 'runtime',
                type: task.type || task.key,
                title: task.title || 'Automation',
                subtitle: task.subtitle || '',
                icon: task.icon || 'cpu',
                iconBackground: task.iconBackground || 'bg-neutral-800',
                statusLabel: task.statusLabel || 'Running',
                statusClass: task.statusClass || 'bg-emerald-900/60 text-emerald-200',
                statusState: task.statusState || 'running',
                actions: Array.isArray(task.actions) ? task.actions : [],
                metadata: task.metadata || {}
            };
            tasks.push(normalizedTask);
        });
    }

    return tasks;
}
function renderTokenTaskList(record, options = {}) {
    const body = getElement('token-tasks-body');
    const emptyState = getElement('token-tasks-empty');
    const tableWrapper = getElement('token-tasks-table');
    const summaryEl = getElement('token-tasks-summary');

    if (!body || !emptyState || !tableWrapper || !summaryEl) {
        return;
    }

    if (options.loading) {
        tableWrapper.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.innerHTML = `
            <div class="flex items-center justify-center gap-2 text-sm text-gray-500">
                <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
                <span>Loading automation status…</span>
            </div>
        `;
        summaryEl.textContent = '';
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        return;
    }

    const runtimeTasks = Array.isArray(options.runtimeTasks) ? options.runtimeTasks : [];
    const tasks = buildAutomationTaskEntries(record, runtimeTasks);

    runtimeTaskRegistry.clear();
    tasks.filter((task) => task.source === 'runtime').forEach((task) => runtimeTaskRegistry.set(task.key, task));

    if (!tasks.length) {
        body.innerHTML = '';
        tableWrapper.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.textContent = 'No automations configured for this token.';
        summaryEl.textContent = '';
        return;
    }

    tableWrapper.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const runningCount = tasks.filter((task) => task.statusState === 'running').length;
    const queuedCount = tasks.filter((task) => task.statusState === 'queued').length;
    const totalLabel = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
    const statusFragments = [];
    if (runningCount) statusFragments.push(`${runningCount} running`);
    if (queuedCount) statusFragments.push(`${queuedCount} queued`);
    summaryEl.textContent = statusFragments.length ? `${totalLabel} • ${statusFragments.join(', ')}` : totalLabel;

    const actionsToHtml = (task) => {
        const actionButtons = [];
        
        // Add Edit button for configurable tasks
        const canEdit = task.type === 'volumeBot' || task.type === 'smartSell' || task.type === 'launch';
        if (canEdit) {
            const editHandler = task.source === 'runtime' 
                ? `handleRuntimeTaskAction('edit', '${task.key}')`
                : `handleTokenTaskAction('edit', '${task.key}')`;
            actionButtons.push(`
                <button
                    class="inline-flex items-center justify-center w-8 h-8 rounded-full border border-blue-500/40 text-blue-200 hover:text-blue-100 transition"
                    onclick="${editHandler}"
                    title="Edit ${escapeHtml(task.title || 'task')}"
                >
                    <i data-lucide="settings" class="w-4 h-4"></i>
                </button>
            `);
        }

        // Add existing action buttons
        if (Array.isArray(task.actions) && task.actions.length) {
            task.actions.forEach((action) => {
                const isRuntime = task.source === 'runtime';
                const disabled = action.disabled;
                const handler = isRuntime
                    ? `handleRuntimeTaskAction('${action.type}', '${task.key}')`
                    : `handleTokenTaskAction('${action.type}', '${task.key}')`;

                const intentClass =
                    action.intent === 'green'
                        ? 'border-emerald-500/40 text-emerald-200 hover:text-emerald-100'
                        : action.intent === 'yellow'
                        ? 'border-amber-500/40 text-amber-200 hover:text-amber-100'
                        : 'border-rose-500/40 text-rose-200 hover:text-rose-100';

                const baseClass =
                    'inline-flex items-center justify-center w-8 h-8 rounded-full border transition';
                const disabledClass = disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '';

                actionButtons.push(`
                    <button
                        class="${baseClass} ${intentClass} ${disabledClass}"
                        ${disabled ? 'disabled' : `onclick="${handler}"`}
                        title="${escapeHtml(action.label || action.type)}"
                    >
                        <i data-lucide="${escapeHtml(action.icon || 'zap')}" class="w-4 h-4"></i>
                    </button>
                `);
            });
        }
        
        if (actionButtons.length === 0) {
            return '<span class="text-xs text-gray-500">—</span>';
        }
        
        return actionButtons.join('');
    };

    const rowsHtml = tasks
        .map((task) => {
            const subtitle = task.subtitle ? `<div class="text-xs text-gray-400">${escapeHtml(task.subtitle)}</div>` : '';
            return `
                <tr class="border-b border-neutral-800 last:border-b-0">
                    <td class="py-3">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 ${escapeHtml(task.iconBackground || 'bg-neutral-800')} rounded-lg flex items-center justify-center">
                                <i data-lucide="${escapeHtml(task.icon || 'settings')}" class="w-4 h-4 text-white"></i>
                            </div>
                            <div>
                                <div class="text-sm font-semibold text-white">${escapeHtml(task.title || 'Task')}</div>
                                ${subtitle}
                            </div>
                        </div>
                    </td>
                    <td class="py-3 align-middle">
                        <span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded ${task.statusClass || 'bg-neutral-800 text-gray-300'}">
                            ${escapeHtml(task.statusLabel || 'Unknown')}
                        </span>
                    </td>
                    <td class="py-3 text-right align-middle">
                        <div class="inline-flex items-center gap-2">
                            ${actionsToHtml(task)}
                        </div>
                    </td>
                </tr>
            `;
        })
        .join('');

    body.innerHTML = rowsHtml;

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
function handleTokenTaskAction(action, taskKey) {
    if (!taskKey) {
        notify('Select a task to manage.', 'warning');
        return;
    }

    const current = tokenRegistry.current;
    if (!current) {
        notify('Select a token before managing tasks.', 'warning');
        return;
    }

    if (current.type !== 'draft') {
        notify('Task controls are available for saved drafts. Open the draft to edit automations.', 'warning');
        return;
    }

    const draft = tokenRegistry.drafts.get(current.id);
    if (!draft) {
        notify('Draft not found in registry.', 'error');
        return;
    }

    const automations = { ...(draft.automations || {}) };
    const enabledMap = { ...(draft.automationsEnabled || {}) };

    if (!automations[taskKey]) {
        notify('Automation not configured yet.', 'warning');
        return;
    }

    if (action === 'remove') {
        delete automations[taskKey];
        delete enabledMap[taskKey];
        notify('Automation removed from draft.', 'success');
        addConsoleLog(`🗑️ Removed ${taskKey} automation from draft ${draft.name || draft.id}.`, 'info');
    } else if (action === 'pause') {
        const config = { ...automations[taskKey], enabled: false };
        automations[taskKey] = config;
        enabledMap[taskKey] = false;
        notify('Automation paused. It will be saved as disabled.', 'info');
        addConsoleLog(`⏸️ Paused ${taskKey} automation for draft ${draft.name || draft.id}.`, 'info');
    } else if (action === 'resume') {
        const config = { ...automations[taskKey], enabled: true };
        automations[taskKey] = config;
        enabledMap[taskKey] = true;
        notify('Automation re-enabled for this draft.', 'success');
        addConsoleLog(`▶️ Resumed ${taskKey} automation for draft ${draft.name || draft.id}.`, 'info');
    } else {
        notify('Unknown task action.', 'error');
        return;
    }

    const updatedDraft = {
        ...draft,
        automations,
        automationsEnabled: enabledMap,
        updatedAt: Date.now()
    };

    registerTokenDraft(updatedDraft);
    tokenRegistry.current = updatedDraft;
    renderTokenTaskList(updatedDraft);
}

function openTokenAutomationConfigurator(taskKey) {
    const current = tokenRegistry.current;
    const options = {};
    let label = 'Automation';

    switch (taskKey) {
        case 'volumeBot':
            options.volumeBot = true;
            label = 'Volume automation';
            break;
        case 'smartSell':
            options.smartSell = true;
            label = 'Smart Sell automation';
            break;
        case 'sellBuyback':
            // Open the sell buyback configuration window directly
            configureSellBuybackTask();
            return;
        case 'bump':
        default:
            label = 'Automation tools';
            break;
    }

    if (current && current.type === 'draft') {
        tokenLaunchState.pendingDraftId = current.id;
        tokenLaunchState.activeLaunchDraftId = current.id;
        tokenLaunchState.launchConfig = cloneLaunchConfig(
            current.launchConfig || {
                devWalletId: current.creatorWalletId || current.creatorWallet || '',
                devBuyAmount: current.devBuyAmount ?? current.initialBuyAmount,
                blockZero: current.blockZero || {}
            }
        );

        if (tokenLaunchState.launchConfig.devWalletId) {
            tokenLaunchState.selectedWalletId = tokenLaunchState.launchConfig.devWalletId;
        }

        navigateToPage('launch-token');
        notify(`${label} ready in launch configurator.`, 'info');
        addConsoleLog(`⚙️ Opening ${taskKey || 'automation'} configuration for draft ${current.name || current.id}.`, 'info');

        setTimeout(() => {
            const draft = tokenRegistry.drafts.get(current.id);
            if (draft) {
                hydrateLaunchConfiguratorFromDraft(draft);
            }
            configureAutomationOptions(options);
            focusAutomationSection();
        }, 280);
    } else {
        navigateToPage('create-token');
        notify(`${label} ready in create token view.`, 'info');
        addConsoleLog(`⚙️ Opening ${taskKey || 'automation'} configuration in create token view.`, 'info');
        setTimeout(() => {
            configureAutomationOptions(options);
            focusAutomationSection();
        }, 220);
    }
}

registerGlobalHandler('handleTokenTaskAction', handleTokenTaskAction);
registerGlobalHandler('openTokenAutomationConfigurator', openTokenAutomationConfigurator);
registerGlobalHandler('showAddVolumeTask', () => openTokenAutomationConfigurator('volumeBot'));
registerGlobalHandler('showBulkSellTask', configureBulkSellTask);
registerGlobalHandler('selectBulkSellMethod', selectBulkSellMethod);
registerGlobalHandler('updateBulkSellWalletSelection', updateBulkSellWalletSelection);
registerGlobalHandler('showBumpTask', configureBumpTask);
registerGlobalHandler('showSellBuybackTask', configureSellBuybackTask);
registerGlobalHandler('updateSellBuybackBuyWalletSelection', updateSellBuybackBuyWalletSelection);
registerGlobalHandler('updateSellBuybackBuyAmount', updateSellBuybackBuyAmount);
// Bump Task Configuration and Execution
let bumpTaskConfig = {
    buyAmount: 0.02,
    iterations: 15,
    minDelay: 3,
    maxDelay: 8,
    walletIds: [],
    running: false,
    tokenMint: null,
    taskId: null,
    currentIteration: 0
};

function configureBumpTask() {
    const current = tokenRegistry.current;
    if (!current || !current.mint) {
        notify('Select a token before configuring Bump task.', 'warning');
        return;
    }

    // Open configuration modal or show floating window
    const window = document.getElementById('bump-window');
    if (window) {
        window.classList.remove('hidden');
        
        // Populate with current config
        const buyAmountInput = document.getElementById('bump-amount');
        const iterationsInput = document.getElementById('bump-iterations');
        const minDelayInput = document.getElementById('bump-min-delay');
        const maxDelayInput = document.getElementById('bump-max-delay');
        
        if (buyAmountInput) buyAmountInput.value = bumpTaskConfig.buyAmount || 0.02;
        if (iterationsInput) iterationsInput.value = bumpTaskConfig.iterations || 15;
        if (minDelayInput) minDelayInput.value = bumpTaskConfig.minDelay || 3;
        if (maxDelayInput) maxDelayInput.value = bumpTaskConfig.maxDelay || 8;
        
        // Load wallets
        loadBumpWallets();
    } else {
        // Fallback: navigate to create token view
        openTokenAutomationConfigurator('bump');
    }
}

async function loadBumpWallets() {
    const walletList = document.getElementById('bump-wallets-list');
    if (!walletList) return;
    
    try {
        const wallets = collectBlueprintWallets();
        if (!wallets || wallets.length === 0) {
            walletList.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-xs text-gray-500">No wallets available. Load wallets first.</td></tr>';
            return;
        }
        
        // Get SOL balances for wallets
        const walletsWithBalances = await Promise.all(
            wallets.map(async (wallet) => {
                const address = wallet.address || wallet.publicKey || '';
                let solBalance = 0;
                try {
                    if (solanaIntegration?.getBalance) {
                        solBalance = await solanaIntegration.getBalance(address);
                    }
                } catch (error) {
                    console.warn(`Failed to get balance for ${address}:`, error);
                }
                return { ...wallet, solBalance };
            })
        );
        
        walletList.innerHTML = walletsWithBalances.map(wallet => {
            const id = wallet.id || wallet.address || wallet.publicKey || '';
            const name = wallet.name || 'Unnamed';
            const address = wallet.address || wallet.publicKey || '';
            const truncated = address.length > 20 ? `${address.substring(0, 4)}...${address.substring(address.length - 4)}` : address;
            const solBalance = wallet.solBalance || 0;
            const balanceDisplay = solBalance < 0.01 ? '<0.01 SOL' : `${solBalance.toFixed(2)} SOL`;
            
            // Check if this wallet is already selected
            const isChecked = bumpTaskConfig.walletIds.includes(id) ? 'checked' : '';
            
            return `
                <tr class="hover:bg-neutral-900/50 transition">
                    <td class="py-2 px-3">
                        <input type="checkbox" 
                            class="bump-wallet-checkbox" 
                            data-wallet-id="${escapeHtml(id)}"
                            ${isChecked}
                            onchange="updateBumpWalletSelection(this)"
                        />
                    </td>
                    <td class="py-2 px-3">
                        <div class="flex items-center gap-2">
                            <span class="text-lg">${getWalletEmoji(name)}</span>
                            <span class="text-xs font-medium text-white">${escapeHtml(name)}</span>
                        </div>
                    </td>
                    <td class="py-2 px-3">
                        <span class="text-xs text-gray-400 font-mono">${escapeHtml(truncated)}</span>
                    </td>
                    <td class="py-2 px-3">
                        <span class="text-xs text-gray-300">${balanceDisplay}</span>
                    </td>
                </tr>
            `;
        }).join('');
        
        updateBumpSelectedCount();
    } catch (error) {
        console.error('Failed to load bump wallets:', error);
        walletList.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-xs text-red-400">Failed to load wallets.</td></tr>';
    }
}

function updateBumpWalletSelection(checkbox) {
    const walletId = checkbox.dataset.walletId;
    
    if (checkbox.checked) {
        if (!bumpTaskConfig.walletIds.includes(walletId)) {
            bumpTaskConfig.walletIds.push(walletId);
        }
    } else {
        bumpTaskConfig.walletIds = bumpTaskConfig.walletIds.filter(id => id !== walletId);
    }
    
    updateBumpSelectedCount();
}

function updateBumpSelectedCount() {
    const countEl = document.getElementById('bump-selected-count');
    if (countEl) {
        const count = bumpTaskConfig.walletIds.length;
        countEl.textContent = `${count} wallet${count === 1 ? '' : 's'} selected`;
    }
}

async function executeBumpTask() {
    const current = tokenRegistry.current;
    if (!current || !current.mint) {
        notify('Select a token before starting Bump task.', 'warning');
        return;
    }

    try {
        await ensureApiClientReady();
    } catch (error) {
        notify(`Backend unavailable: ${error.message || error}`, 'error');
        return;
    }

    // Get configuration from inputs
    const buyAmountInput = document.getElementById('bump-amount');
    const iterationsInput = document.getElementById('bump-iterations');
    const minDelayInput = document.getElementById('bump-min-delay');
    const maxDelayInput = document.getElementById('bump-max-delay');
    
    bumpTaskConfig.buyAmount = Number(buyAmountInput?.value) || 0.02;
    bumpTaskConfig.iterations = Number(iterationsInput?.value) || 15;
    bumpTaskConfig.minDelay = Number(minDelayInput?.value) || 3;
    bumpTaskConfig.maxDelay = Number(maxDelayInput?.value) || 8;
    
    // Get selected wallets from checkboxes
    const selectedCheckboxes = document.querySelectorAll('.bump-wallet-checkbox:checked');
    bumpTaskConfig.walletIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.walletId);
    
    if (bumpTaskConfig.walletIds.length === 0) {
        notify('Select at least one wallet for Bump task.', 'warning');
        return;
    }

    if (bumpTaskConfig.running) {
        notify('Bump task is already running.', 'warning');
        return;
    }

    // Validate configuration
    if (bumpTaskConfig.buyAmount <= 0) {
        notify('Buy amount must be greater than 0.', 'error');
        return;
    }
    
    if (bumpTaskConfig.iterations < 1) {
        notify('Iterations must be at least 1.', 'error');
        return;
    }
    
    if (bumpTaskConfig.minDelay < 0 || bumpTaskConfig.maxDelay < 0 || bumpTaskConfig.minDelay > bumpTaskConfig.maxDelay) {
        notify('Min delay must be less than or equal to max delay.', 'error');
        return;
    }

    bumpTaskConfig.running = true;
    bumpTaskConfig.tokenMint = current.mint;
    bumpTaskConfig.taskId = `bump-${Date.now()}`;
    bumpTaskConfig.currentIteration = 0;

    notify('Bump task started! This cannot be stopped once initiated.', 'success');
    addConsoleLog(`🔄 Starting Bump: ${bumpTaskConfig.iterations} iterations, ${bumpTaskConfig.buyAmount} SOL each, ${bumpTaskConfig.walletIds.length} wallet(s)`, 'info');

    // Close the configuration window
    closeFloatingWindow('bump-window');

    // Start the task execution
    runBumpTask().catch(error => {
        console.error('Bump task failed:', error);
        notify(`Bump task failed: ${error.message}`, 'error');
        bumpTaskConfig.running = false;
        if (tokenRegistry.current) {
            loadLiveTokenDetail(tokenRegistry.current).catch(console.error);
        }
    });
}

async function runBumpTask() {
    const { tokenMint, walletIds, buyAmount, iterations, minDelay, maxDelay } = bumpTaskConfig;
    
    if (!tokenMint || !walletIds || walletIds.length === 0) {
        throw new Error('Invalid Bump configuration');
    }

    // Get wallets
    const allWallets = collectBlueprintWallets();
    const wallets = allWallets.filter(w => {
        const id = w.id || w.address || w.publicKey || '';
        return walletIds.includes(id);
    });

    if (wallets.length === 0) {
        throw new Error('No valid wallets found for Bump task');
    }

    addConsoleLog(`📊 Bump: Executing ${iterations} bumps with ${wallets.length} wallet(s)...`, 'info');

    // Execute bumps with random wallet rotation
    for (let i = 0; i < iterations; i++) {
        if (!bumpTaskConfig.running) {
            addConsoleLog('Bump task stopped.', 'warning');
            break;
        }

        bumpTaskConfig.currentIteration = i + 1;

        // Randomly select a wallet from the selected wallets
        const randomIndex = Math.floor(Math.random() * wallets.length);
        const wallet = wallets[randomIndex];
        const walletId = wallet.id || wallet.address || wallet.publicKey || '';
        const walletAddress = wallet.address || wallet.publicKey || '';
        const walletName = wallet.name || 'Unnamed';

        try {
            addConsoleLog(`⚡ Bump ${i + 1}/${iterations}: Buying ${buyAmount} SOL from ${walletName}...`, 'info');

            const buyResponse = await window.apiClient.buyToken(
                walletId,
                tokenMint,
                buyAmount,
                { executor: 'jito' } // Use Jito for faster execution
            );

            if (buyResponse?.success) {
                addConsoleLog(`✅ Bump ${i + 1}/${iterations} completed from ${walletName}`, 'success');
            } else {
                addConsoleLog(`❌ Bump ${i + 1}/${iterations} failed from ${walletName}: ${buyResponse?.error || 'Unknown error'}`, 'error');
            }
        } catch (error) {
            console.error(`Error executing bump ${i + 1} from wallet ${wallet.id || wallet.address}:`, error);
            addConsoleLog(`❌ Error in bump ${i + 1}: ${error.message}`, 'error');
        }

        // Random delay between bumps (except for the last one)
        if (i < iterations - 1) {
            const delay = minDelay + Math.random() * (maxDelay - minDelay);
            const delaySeconds = Math.round(delay * 10) / 10; // Round to 1 decimal place
            addConsoleLog(`⏳ Waiting ${delaySeconds}s before next bump...`, 'info');
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
    }

    addConsoleLog(`✅ Bump task completed! ${bumpTaskConfig.currentIteration}/${iterations} bumps executed`, 'success');
    bumpTaskConfig.running = false;

    // Refresh token details
    if (tokenRegistry.current) {
        await loadLiveTokenDetail(tokenRegistry.current);
    }
}

function stopBumpTask() {
    if (!bumpTaskConfig.running) {
        notify('Bump task is not running.', 'info');
        return;
    }

    bumpTaskConfig.running = false;
    notify('Bump task stopped.', 'success');
    addConsoleLog('🛑 Bump task stopped by user.', 'info');
    
    if (tokenRegistry.current) {
        loadLiveTokenDetail(tokenRegistry.current).catch(console.error);
    }
}

// Bulk Sell Task Configuration and Execution
let bulkSellTaskConfig = {
    method: 'jito-individual', // 'jito-individual', 'jito-bundle', 'rpc-individual'
    sellPercentage: 50,
    slippage: null, // null means use default from settings
    walletIds: [],
    enabled: false,
    running: false,
    tokenMint: null,
    taskId: null
};

function configureBulkSellTask() {
    const current = tokenRegistry.current;
    if (!current || !current.mint) {
        notify('Select a token before configuring Bulk Sell task.', 'warning');
        return;
    }

    // Open configuration modal or show floating window
    const window = document.getElementById('bulk-sell-window');
    if (window) {
        window.classList.remove('hidden');
        
        // Populate with current config
        const sellPctInput = document.getElementById('bulk-sell-percentage');
        const slippageInput = document.getElementById('bulk-sell-slippage');
        
        if (sellPctInput) sellPctInput.value = bulkSellTaskConfig.sellPercentage || 50;
        if (slippageInput) slippageInput.value = bulkSellTaskConfig.slippage || '';
        
        // Set method
        selectBulkSellMethod(bulkSellTaskConfig.method || 'jito-individual');
        
        // Load wallets
        loadBulkSellWallets();
    } else {
        // Fallback: navigate to create token view
        openTokenAutomationConfigurator('bulkSell');
    }
}

function selectBulkSellMethod(method) {
    // Remove active class from all method buttons
    const buttons = [
        document.getElementById('bulk-sell-method-jito-individual'),
        document.getElementById('bulk-sell-method-jito-bundle'),
        document.getElementById('bulk-sell-method-rpc-individual')
    ];
    
    buttons.forEach(btn => {
        if (btn) {
            btn.classList.remove('active');
        }
    });
    
    // Add active class to selected button
    let activeButton = null;
    switch (method) {
        case 'jito-individual':
            activeButton = document.getElementById('bulk-sell-method-jito-individual');
            break;
        case 'jito-bundle':
            activeButton = document.getElementById('bulk-sell-method-jito-bundle');
            break;
        case 'rpc-individual':
            activeButton = document.getElementById('bulk-sell-method-rpc-individual');
            break;
    }
    
    if (activeButton) {
        activeButton.classList.add('active');
    }
    
    bulkSellTaskConfig.method = method;
}

async function loadBulkSellWallets() {
    const walletList = document.getElementById('bulk-sell-wallets-list');
    if (!walletList) return;
    
    try {
        const wallets = collectBlueprintWallets();
        if (!wallets || wallets.length === 0) {
            walletList.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-xs text-gray-500">No wallets available. Load wallets first.</td></tr>';
            return;
        }
        
        const current = tokenRegistry.current;
        if (!current || !current.mint) {
            walletList.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-xs text-gray-500">Select a token first.</td></tr>';
            return;
        }
        
        // Get token balances for wallets
        const walletsWithBalances = await Promise.all(
            wallets.map(async (wallet) => {
                const address = wallet.address || wallet.publicKey || '';
                let tokenBalance = 0;
                try {
                    if (solanaIntegration?.getTokenBalance) {
                        tokenBalance = await solanaIntegration.getTokenBalance(address, current.mint);
                    } else {
                        // Fallback: try to get balance via connection
                        const connection = solanaIntegration?.connection || fallbackSolanaConnection;
                        if (connection) {
                            const { PublicKey } = await import('@solana/web3.js');
                            const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
                            const tokenAccount = await getAssociatedTokenAddress(
                                new PublicKey(current.mint),
                                new PublicKey(address)
                            );
                            try {
                                const accountInfo = await getAccount(connection, tokenAccount);
                                tokenBalance = Number(accountInfo.amount) / Math.pow(10, accountInfo.mint.decimals || 9);
                            } catch (e) {
                                // Account doesn't exist
                                tokenBalance = 0;
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to get token balance for ${address}:`, error);
                    tokenBalance = 0;
                }
                return { ...wallet, tokenBalance };
            })
        );
        
        walletList.innerHTML = walletsWithBalances.map(wallet => {
            const id = wallet.id || wallet.address || wallet.publicKey || '';
            const name = wallet.name || 'Unnamed';
            const address = wallet.address || wallet.publicKey || '';
            const truncated = address.length > 20 ? `${address.substring(0, 4)}...${address.substring(address.length - 4)}` : address;
            const tokenBalance = wallet.tokenBalance || 0;
            const balanceDisplay = tokenBalance < 0.01 ? '<0.01' : tokenBalance.toLocaleString('en-US', { maximumFractionDigits: 0 });
            
            // Check if this wallet is already selected
            const isChecked = bulkSellTaskConfig.walletIds.includes(id) ? 'checked' : '';
            
            return `
                <tr class="hover:bg-neutral-900/50 transition">
                    <td class="py-2 px-3">
                        <input type="checkbox" 
                            class="bulk-sell-wallet-checkbox" 
                            data-wallet-id="${escapeHtml(id)}"
                            ${isChecked}
                            onchange="updateBulkSellWalletSelection(this)"
                        />
                    </td>
                    <td class="py-2 px-3">
                        <div class="flex items-center gap-2">
                            <span class="text-lg">${getWalletEmoji(name)}</span>
                            <span class="text-xs font-medium text-white">${escapeHtml(name)}</span>
                        </div>
                    </td>
                    <td class="py-2 px-3">
                        <span class="text-xs text-gray-400 font-mono">${escapeHtml(truncated)}</span>
                    </td>
                    <td class="py-2 px-3">
                        <span class="text-xs text-gray-300">${balanceDisplay}</span>
                    </td>
                </tr>
            `;
        }).join('');
        
        updateBulkSellSelectedCount();
    } catch (error) {
        console.error('Failed to load bulk sell wallets:', error);
        walletList.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-xs text-red-400">Failed to load wallets.</td></tr>';
    }
}

function updateBulkSellWalletSelection(checkbox) {
    const walletId = checkbox.dataset.walletId;
    
    if (checkbox.checked) {
        if (!bulkSellTaskConfig.walletIds.includes(walletId)) {
            bulkSellTaskConfig.walletIds.push(walletId);
        }
    } else {
        bulkSellTaskConfig.walletIds = bulkSellTaskConfig.walletIds.filter(id => id !== walletId);
    }
    
    updateBulkSellSelectedCount();
}

function updateBulkSellSelectedCount() {
    const countEl = document.getElementById('bulk-sell-selected-count');
    if (countEl) {
        const count = bulkSellTaskConfig.walletIds.length;
        countEl.textContent = `${count} wallet${count === 1 ? '' : 's'} selected`;
    }
}

async function executeBulkSellTask() {
    const current = tokenRegistry.current;
    if (!current || !current.mint) {
        notify('Select a token before starting Bulk Sell task.', 'warning');
        return;
    }

    try {
        await ensureApiClientReady();
    } catch (error) {
        notify(`Backend unavailable: ${error.message || error}`, 'error');
        return;
    }

    // Get configuration from inputs
    const sellPctInput = document.getElementById('bulk-sell-percentage');
    const slippageInput = document.getElementById('bulk-sell-slippage');
    
    bulkSellTaskConfig.sellPercentage = Number(sellPctInput?.value) || 50;
    bulkSellTaskConfig.slippage = slippageInput?.value ? Number(slippageInput.value) : null;
    
    // Get selected wallets from checkboxes
    const selectedCheckboxes = document.querySelectorAll('.bulk-sell-wallet-checkbox:checked');
    bulkSellTaskConfig.walletIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.walletId);
    
    if (bulkSellTaskConfig.walletIds.length === 0) {
        notify('Select at least one wallet for Bulk Sell task.', 'warning');
        return;
    }

    if (bulkSellTaskConfig.running) {
        notify('Bulk Sell task is already running.', 'warning');
        return;
    }

    // Validate configuration
    if (bulkSellTaskConfig.sellPercentage < 1 || bulkSellTaskConfig.sellPercentage > 100) {
        notify('Sell percentage must be between 1 and 100.', 'error');
        return;
    }

    bulkSellTaskConfig.enabled = true;
    bulkSellTaskConfig.running = true;
    bulkSellTaskConfig.tokenMint = current.mint;
    bulkSellTaskConfig.taskId = `bulk-sell-${Date.now()}`;

    const methodLabel = bulkSellTaskConfig.method === 'jito-individual' ? 'Jito (Individual)' :
                        bulkSellTaskConfig.method === 'jito-bundle' ? 'Jito (Bundle)' :
                        'RPC (Individual)';
    
    notify('Bulk Sell task started!', 'success');
    addConsoleLog(`🔄 Starting Bulk Sell: ${methodLabel}, ${bulkSellTaskConfig.sellPercentage}% from ${bulkSellTaskConfig.walletIds.length} wallet(s)`, 'info');

    // Close the configuration window
    closeFloatingWindow('bulk-sell-window');

    // Start the task execution
    runBulkSellTask().catch(error => {
        console.error('Bulk Sell task failed:', error);
        notify(`Bulk Sell task failed: ${error.message}`, 'error');
        bulkSellTaskConfig.running = false;
        if (tokenRegistry.current) {
            loadLiveTokenDetail(tokenRegistry.current).catch(console.error);
        }
    });
}

async function runBulkSellTask() {
    const { tokenMint, walletIds, sellPercentage, slippage, method } = bulkSellTaskConfig;
    
    if (!tokenMint || !walletIds || walletIds.length === 0) {
        throw new Error('Invalid Bulk Sell configuration');
    }

    // Get wallets
    const allWallets = collectBlueprintWallets();
    const wallets = allWallets.filter(w => {
        const id = w.id || w.address || w.publicKey || '';
        return walletIds.includes(id);
    });

    if (wallets.length === 0) {
        throw new Error('No valid wallets found for Bulk Sell task');
    }

    addConsoleLog(`📊 Bulk Sell: Processing ${wallets.length} wallets...`, 'info');

    // Determine executor based on method
    let executor = 'jito';
    let useBundle = false;
    
    if (method === 'jito-bundle') {
        executor = 'jito';
        useBundle = true;
    } else if (method === 'rpc-individual') {
        executor = 'rpc';
        useBundle = false;
    } else {
        executor = 'jito';
        useBundle = false;
    }

    // Prepare sell options
    const sellOptions = {
        executor,
        slippage: slippage !== null ? slippage : undefined // undefined means use default
    };

    // Helper function to sell from a wallet
    const sellFromWallet = async (wallet) => {
        if (!bulkSellTaskConfig.running) {
            return null;
        }

        try {
            const walletId = wallet.id || wallet.address || wallet.publicKey || '';
            const walletAddress = wallet.address || wallet.publicKey || '';
            const walletName = wallet.name || 'Unnamed';
            
            // Get token balance
            let tokenBalance = 0;
            try {
                if (solanaIntegration?.getTokenBalance) {
                    tokenBalance = await solanaIntegration.getTokenBalance(walletAddress, tokenMint);
                } else {
                    // Fallback: try to get balance via connection
                    const connection = solanaIntegration?.connection || fallbackSolanaConnection;
                    if (connection) {
                        const { PublicKey } = await import('@solana/web3.js');
                        const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
                        const tokenAccount = await getAssociatedTokenAddress(
                            new PublicKey(tokenMint),
                            new PublicKey(walletAddress)
                        );
                        try {
                            const accountInfo = await getAccount(connection, tokenAccount);
                            tokenBalance = Number(accountInfo.amount) / Math.pow(10, accountInfo.mint.decimals || 9);
                        } catch (e) {
                            // Account doesn't exist
                            tokenBalance = 0;
                        }
                    }
                }
            } catch (error) {
                console.warn(`Failed to get token balance for ${walletAddress}:`, error);
                tokenBalance = 0;
            }

            if (!tokenBalance || tokenBalance <= 0) {
                addConsoleLog(`⚠️ Wallet ${walletName} has no tokens to sell`, 'warning');
                return null;
            }

            const sellAmount = tokenBalance * (sellPercentage / 100);
            addConsoleLog(`💸 Selling ${sellPercentage}% (${sellAmount.toFixed(6)} tokens) from ${walletName}...`, 'info');

            const sellResponse = await window.apiClient.sellToken(
                walletId,
                tokenMint,
                sellAmount,
                sellOptions
            );

            if (sellResponse?.success) {
                addConsoleLog(`✅ Sold ${sellAmount.toFixed(6)} tokens from ${walletName}`, 'success');
                return {
                    walletId,
                    walletAddress,
                    walletName,
                    tokensSold: sellAmount,
                    solReceived: sellResponse.solReceived || 0,
                    signature: sellResponse.signature
                };
            } else {
                addConsoleLog(`❌ Failed to sell from ${walletName}: ${sellResponse?.error || 'Unknown error'}`, 'error');
                return null;
            }
        } catch (error) {
            console.error(`Error selling from wallet ${wallet.id || wallet.address}:`, error);
            addConsoleLog(`❌ Error selling from wallet: ${error.message}`, 'error');
            return null;
        }
    };

    // Execute sells based on method
    let sellResults = [];
    if (useBundle && executor === 'jito') {
        // For bundle mode, execute all in parallel
        // Note: True bundle requires backend support for Jito bundles
        const sellPromises = wallets.map(wallet => sellFromWallet(wallet));
        sellResults = await Promise.all(sellPromises);
    } else {
        // Individual mode: execute sequentially with small delay between each
        for (let i = 0; i < wallets.length; i++) {
            if (!bulkSellTaskConfig.running) {
                break;
            }
            
            const result = await sellFromWallet(wallets[i]);
            if (result) {
                sellResults.push(result);
            }
            
            // Small delay between individual sells
            if (i < wallets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    const successfulSells = sellResults.filter(Boolean);
    
    if (successfulSells.length > 0) {
        addConsoleLog(`✅ Bulk Sell task completed! ${successfulSells.length}/${wallets.length} sells successful`, 'success');
    } else {
        addConsoleLog(`⚠️ Bulk Sell task completed but no sells were successful`, 'warning');
    }

    bulkSellTaskConfig.running = false;

    // Refresh token details
    if (tokenRegistry.current) {
        await loadLiveTokenDetail(tokenRegistry.current);
    }
}

function stopBulkSellTask() {
    if (!bulkSellTaskConfig.running) {
        notify('Bulk Sell task is not running.', 'info');
        return;
    }

    bulkSellTaskConfig.running = false;
    notify('Bulk Sell task stopped.', 'success');
    addConsoleLog('🛑 Bulk Sell task stopped by user.', 'info');
    
    if (tokenRegistry.current) {
        loadLiveTokenDetail(tokenRegistry.current).catch(console.error);
    }
}

// Sell Buyback Task Configuration and Execution
let sellBuybackTaskConfig = {
    sellWalletId: null,
    sellPercentage: 100,
    buyWallets: [], // Array of { walletId, buyAmount }
    enabled: false,
    running: false,
    tokenMint: null,
    taskId: null
};

function configureSellBuybackTask() {
    const current = tokenRegistry.current;
    if (!current || !current.mint) {
        notify('Select a token before configuring Sell Buyback task.', 'warning');
        return;
    }

    // Open configuration modal or show floating window
    const window = document.getElementById('sell-buyback-window');
    if (window) {
        window.classList.remove('hidden');
        
        // Populate with current config
        const sellPctInput = document.getElementById('sell-buyback-sell-percentage');
        if (sellPctInput) sellPctInput.value = sellBuybackTaskConfig.sellPercentage || 100;
        
        // Load wallets for sell wallet dropdown
        loadSellBuybackSellWallets();
        
        // Load wallets for buy wallets table
        loadSellBuybackBuyWallets();
    } else {
        // Fallback: navigate to create token view
        openTokenAutomationConfigurator('sellBuyback');
    }
}

function loadSellBuybackSellWallets() {
    const sellWalletSelect = document.getElementById('sell-buyback-sell-wallet');
    if (!sellWalletSelect) return;
    
    try {
        const wallets = collectBlueprintWallets();
        if (!wallets || wallets.length === 0) {
            sellWalletSelect.innerHTML = '<option value="">No wallets available. Load wallets first.</option>';
            return;
        }
        
        sellWalletSelect.innerHTML = '<option value="">Select wallet to sell from...</option>' + 
            wallets.map(wallet => {
                const id = wallet.id || wallet.address || wallet.publicKey || '';
                const name = wallet.name || 'Unnamed';
                const address = wallet.address || wallet.publicKey || '';
                const truncated = address.length > 20 ? `${address.substring(0, 10)}...${address.substring(address.length - 8)}` : address;
                const selected = sellBuybackTaskConfig.sellWalletId === id ? 'selected' : '';
                return `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(name)} (${escapeHtml(truncated)})</option>`;
            }).join('');
        
        sellWalletSelect.addEventListener('change', (e) => {
            sellBuybackTaskConfig.sellWalletId = e.target.value || null;
        });
    } catch (error) {
        console.error('Failed to load sell wallets:', error);
        sellWalletSelect.innerHTML = '<option value="">Failed to load wallets.</option>';
    }
}

async function loadSellBuybackBuyWallets() {
    const walletList = document.getElementById('sell-buyback-buy-wallets-list');
    if (!walletList) return;
    
    try {
        const wallets = collectBlueprintWallets();
        if (!wallets || wallets.length === 0) {
            walletList.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-gray-500">No wallets available. Load wallets first.</td></tr>';
            return;
        }
        
        // Get SOL balances for wallets
        const walletsWithBalances = await Promise.all(
            wallets.map(async (wallet) => {
                const address = wallet.address || wallet.publicKey || '';
                let solBalance = 0;
                try {
                    if (solanaIntegration?.getBalance) {
                        solBalance = await solanaIntegration.getBalance(address);
                    }
                } catch (error) {
                    console.warn(`Failed to get balance for ${address}:`, error);
                }
                return { ...wallet, solBalance };
            })
        );
        
        walletList.innerHTML = walletsWithBalances.map(wallet => {
            const id = wallet.id || wallet.address || wallet.publicKey || '';
            const name = wallet.name || 'Unnamed';
            const address = wallet.address || wallet.publicKey || '';
            const truncated = address.length > 20 ? `${address.substring(0, 4)}...${address.substring(address.length - 4)}` : address;
            const solBalance = wallet.solBalance || 0;
            const balanceDisplay = solBalance < 0.01 ? '<0.01 SOL' : `${solBalance.toFixed(2)} SOL`;
            
            // Check if this wallet is already in buyWallets config
            const existingBuyWallet = sellBuybackTaskConfig.buyWallets.find(bw => bw.walletId === id);
            const isChecked = existingBuyWallet ? 'checked' : '';
            const buyAmount = existingBuyWallet ? existingBuyWallet.buyAmount : '';
            
            return `
                <tr class="hover:bg-neutral-900/50 transition">
                    <td class="py-2 px-3">
                        <input type="checkbox" 
                            class="sell-buyback-buy-wallet-checkbox" 
                            data-wallet-id="${escapeHtml(id)}"
                            ${isChecked}
                            onchange="updateSellBuybackBuyWalletSelection(this)"
                            ${sellBuybackTaskConfig.buyWallets.length >= 4 && !isChecked ? 'disabled' : ''}
                        />
                    </td>
                    <td class="py-2 px-3">
                        <div class="flex items-center gap-2">
                            <span class="text-lg">${getWalletEmoji(name)}</span>
                            <span class="text-xs font-medium text-white">${escapeHtml(name)}</span>
                        </div>
                    </td>
                    <td class="py-2 px-3">
                        <span class="text-xs text-gray-400 font-mono">${escapeHtml(truncated)}</span>
                    </td>
                    <td class="py-2 px-3">
                        <span class="text-xs text-gray-300">${balanceDisplay}</span>
                    </td>
                    <td class="py-2 px-3">
                        <input type="number" 
                            class="sell-buyback-buy-amount-input w-20 bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500" 
                            data-wallet-id="${escapeHtml(id)}"
                            value="${buyAmount}"
                            step="0.01"
                            min="0.05"
                            placeholder="0.00"
                            onchange="updateSellBuybackBuyAmount(this)"
                            ${!isChecked ? 'disabled' : ''}
                        />
                    </td>
                </tr>
            `;
        }).join('');
        
        updateSellBuybackSelectedCount();
    } catch (error) {
        console.error('Failed to load buy wallets:', error);
        walletList.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-red-400">Failed to load wallets.</td></tr>';
    }
}

function getWalletEmoji(nameOrIndex) {
    // Handle both string names and numeric indices
    let name = '';
    if (typeof nameOrIndex === 'string') {
        name = nameOrIndex;
    } else if (typeof nameOrIndex === 'number') {
        // If it's a number, use the index-based emoji function
        return getWalletEmojiByIndex(nameOrIndex);
    } else if (nameOrIndex && typeof nameOrIndex === 'object' && nameOrIndex.name) {
        name = nameOrIndex.name;
    } else {
        return '👛'; // Default wallet emoji
    }
    
    // Ensure name is a string
    if (typeof name !== 'string') {
        name = String(name || '');
    }
    
    // Simple emoji mapping based on wallet name patterns
    const emojiMap = {
        'elephant': '🐘',
        'parrot': '🦜',
        'shark': '🦈',
        'cat': '🐱',
        'flamingo': '🦩',
        'giraffe': '🦒',
        'rabbit': '🐰',
        'fish': '🐟',
        'dog': '🐶',
        'turtle': '🐢'
    };
    
    const nameLower = name.toLowerCase();
    for (const [key, emoji] of Object.entries(emojiMap)) {
        if (nameLower.includes(key)) {
            return emoji;
        }
    }
    return '👛'; // Default wallet emoji
}

function updateSellBuybackBuyWalletSelection(checkbox) {
    const walletId = checkbox.dataset.walletId;
    const buyAmountInput = document.querySelector(`.sell-buyback-buy-amount-input[data-wallet-id="${walletId}"]`);
    
    if (checkbox.checked) {
        // Check if we already have 4 wallets selected
        if (sellBuybackTaskConfig.buyWallets.length >= 4) {
            checkbox.checked = false;
            notify('Maximum 4 buy wallets allowed.', 'warning');
            return;
        }
        
        // Add wallet to buyWallets
        if (!sellBuybackTaskConfig.buyWallets.find(bw => bw.walletId === walletId)) {
            sellBuybackTaskConfig.buyWallets.push({
                walletId,
                buyAmount: ''
            });
        }
        
        // Enable buy amount input
        if (buyAmountInput) {
            buyAmountInput.disabled = false;
            buyAmountInput.focus();
        }
    } else {
        // Remove wallet from buyWallets
        sellBuybackTaskConfig.buyWallets = sellBuybackTaskConfig.buyWallets.filter(bw => bw.walletId !== walletId);
        
        // Disable and clear buy amount input
        if (buyAmountInput) {
            buyAmountInput.disabled = true;
            buyAmountInput.value = '';
        }
    }
    
    // Update disabled state of other checkboxes
    updateSellBuybackCheckboxStates();
    updateSellBuybackSelectedCount();
}

function updateSellBuybackBuyAmount(input) {
    const walletId = input.dataset.walletId;
    const buyAmount = Number(input.value) || 0;
    
    const buyWallet = sellBuybackTaskConfig.buyWallets.find(bw => bw.walletId === walletId);
    if (buyWallet) {
        buyWallet.buyAmount = buyAmount;
    }
}

function updateSellBuybackCheckboxStates() {
    const checkboxes = document.querySelectorAll('.sell-buyback-buy-wallet-checkbox');
    const selectedCount = sellBuybackTaskConfig.buyWallets.length;
    
    checkboxes.forEach(checkbox => {
        const walletId = checkbox.dataset.walletId;
        const isSelected = sellBuybackTaskConfig.buyWallets.find(bw => bw.walletId === walletId);
        
        if (!isSelected && selectedCount >= 4) {
            checkbox.disabled = true;
        } else {
            checkbox.disabled = false;
        }
    });
}

function updateSellBuybackSelectedCount() {
    const countEl = document.getElementById('sell-buyback-selected-count');
    if (countEl) {
        const count = sellBuybackTaskConfig.buyWallets.length;
        countEl.textContent = `${count} wallet${count === 1 ? '' : 's'} selected`;
    }
}

async function executeSellBuybackTask() {
    const current = tokenRegistry.current;
    if (!current || !current.mint) {
        notify('Select a token before starting Sell Buyback task.', 'warning');
        return;
    }

    try {
        await ensureApiClientReady();
    } catch (error) {
        notify(`Backend unavailable: ${error.message || error}`, 'error');
        return;
    }

    // Get configuration from inputs
    const sellWalletSelect = document.getElementById('sell-buyback-sell-wallet');
    const sellPctInput = document.getElementById('sell-buyback-sell-percentage');
    
    if (!sellWalletSelect || !sellWalletSelect.value) {
        notify('Select a sell wallet.', 'warning');
        return;
    }
    
    sellBuybackTaskConfig.sellWalletId = sellWalletSelect.value;
    sellBuybackTaskConfig.sellPercentage = Number(sellPctInput?.value) || 100;
    
    // Get buy wallets from config (already updated by checkbox handlers)
    if (sellBuybackTaskConfig.buyWallets.length === 0) {
        notify('Select at least one buy wallet.', 'warning');
        return;
    }
    
    if (sellBuybackTaskConfig.buyWallets.length > 4) {
        notify('Maximum 4 buy wallets allowed.', 'error');
        return;
    }

    // Validate buy amounts
    for (const buyWallet of sellBuybackTaskConfig.buyWallets) {
        if (!buyWallet.buyAmount || buyWallet.buyAmount < 0.05) {
            notify(`Buy amount must be at least 0.05 SOL for all selected wallets.`, 'error');
            return;
        }
    }

    if (sellBuybackTaskConfig.running) {
        notify('Sell Buyback task is already running.', 'warning');
        return;
    }

    // Validate configuration
    if (sellBuybackTaskConfig.sellPercentage < 1 || sellBuybackTaskConfig.sellPercentage > 100) {
        notify('Sell percentage must be between 1 and 100.', 'error');
        return;
    }

    sellBuybackTaskConfig.enabled = true;
    sellBuybackTaskConfig.running = true;
    sellBuybackTaskConfig.tokenMint = current.mint;
    sellBuybackTaskConfig.taskId = `sell-buyback-${Date.now()}`;

    notify('Sell Buyback task started!', 'success');
    addConsoleLog(`🔄 Starting Sell Buyback: Sell ${sellBuybackTaskConfig.sellPercentage}% from 1 wallet, buy back with ${sellBuybackTaskConfig.buyWallets.length} wallet(s)`, 'info');

    // Close the configuration window
    closeFloatingWindow('sell-buyback-window');

    // Start the task execution
    runSellBuybackTask().catch(error => {
        console.error('Sell Buyback task failed:', error);
        notify(`Sell Buyback task failed: ${error.message}`, 'error');
        sellBuybackTaskConfig.running = false;
        if (tokenRegistry.current) {
            loadLiveTokenDetail(tokenRegistry.current).catch(console.error);
        }
    });
}

async function runSellBuybackTask() {
    const { tokenMint, sellWalletId, sellPercentage, buyWallets } = sellBuybackTaskConfig;
    
    if (!tokenMint || !sellWalletId || !buyWallets || buyWallets.length === 0) {
        throw new Error('Invalid Sell Buyback configuration');
    }

    // Get sell wallet
    const allWallets = collectBlueprintWallets();
    const sellWallet = allWallets.find(w => {
        const id = w.id || w.address || w.publicKey || '';
        return id === sellWalletId;
    });

    if (!sellWallet) {
        throw new Error('Sell wallet not found');
    }

    const sellWalletId_full = sellWallet.id || sellWallet.address || sellWallet.publicKey || '';
    const sellWalletAddress = sellWallet.address || sellWallet.publicKey || '';
    const sellWalletName = sellWallet.name || 'Unnamed';

    // Get buy wallets
    const buyWalletObjects = buyWallets.map(bw => {
        const wallet = allWallets.find(w => {
            const id = w.id || w.address || w.publicKey || '';
            return id === bw.walletId;
        });
        return wallet ? { ...wallet, buyAmount: bw.buyAmount } : null;
    }).filter(Boolean);

    if (buyWalletObjects.length === 0) {
        throw new Error('No valid buy wallets found');
    }

    addConsoleLog(`📊 Sell Buyback: Selling from ${sellWalletName}, buying back with ${buyWalletObjects.length} wallet(s)...`, 'info');

    // Phase 1: Sell from the sell wallet
    let sellResult = null;
    try {
        // Get token balance using solanaIntegration
        let tokenBalance = 0;
        try {
            if (solanaIntegration?.getTokenBalance) {
                tokenBalance = await solanaIntegration.getTokenBalance(sellWalletAddress, tokenMint);
            } else {
                // Fallback: try to get balance via connection
                const connection = solanaIntegration?.connection || fallbackSolanaConnection;
                if (connection) {
                    const { PublicKey } = await import('@solana/web3.js');
                    const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
                    const tokenAccount = await getAssociatedTokenAddress(
                        new PublicKey(tokenMint),
                        new PublicKey(sellWalletAddress)
                    );
                    try {
                        const accountInfo = await getAccount(connection, tokenAccount);
                        tokenBalance = Number(accountInfo.amount) / Math.pow(10, accountInfo.mint.decimals || 9);
                    } catch (e) {
                        // Account doesn't exist
                        tokenBalance = 0;
                    }
                }
            }
        } catch (error) {
            console.warn('Failed to get token balance:', error);
            tokenBalance = 0;
        }

        if (!tokenBalance || tokenBalance <= 0) {
            throw new Error(`Wallet ${sellWalletName} has no tokens to sell`);
        }

        const sellAmount = tokenBalance * (sellPercentage / 100);

        addConsoleLog(`💸 Selling ${sellPercentage}% (${sellAmount.toFixed(6)} tokens) from ${sellWalletName}...`, 'info');

        const sellResponse = await window.apiClient.sellToken(
            sellWalletId_full,
            tokenMint,
            sellAmount,
            { executor: 'jito' } // Use Jito for faster execution
        );

        if (!sellResponse?.success) {
            throw new Error(sellResponse?.error || 'Sell transaction failed');
        }

        sellResult = {
            walletId: sellWalletId_full,
            walletAddress: sellWalletAddress,
            walletName: sellWalletName,
            tokensSold: sellAmount,
            solReceived: sellResponse.solReceived || 0,
            signature: sellResponse.signature
        };

        addConsoleLog(`✅ Sold ${sellAmount.toFixed(6)} tokens from ${sellWalletName}`, 'success');
        addConsoleLog(`💰 Received ${(sellResult.solReceived || 0).toFixed(4)} SOL`, 'info');
    } catch (error) {
        console.error('Error selling from wallet:', error);
        addConsoleLog(`❌ Failed to sell from ${sellWalletName}: ${error.message}`, 'error');
        throw error;
    }

    if (!sellBuybackTaskConfig.running) {
        addConsoleLog('Sell Buyback task stopped.', 'warning');
        return;
    }

    // Phase 2: Immediate buyback with selected wallets
    addConsoleLog(`🔄 Starting immediate buyback with ${buyWalletObjects.length} wallet(s)...`, 'info');
    
    const buybackPromises = buyWalletObjects.map(async (buyWallet) => {
        if (!sellBuybackTaskConfig.running) {
            return null;
        }

        try {
            const buyWalletId = buyWallet.id || buyWallet.address || buyWallet.publicKey || '';
            const buyWalletAddress = buyWallet.address || buyWallet.publicKey || '';
            const buyWalletName = buyWallet.name || 'Unnamed';
            const buyAmount = buyWallet.buyAmount;

            if (!buyAmount || buyAmount < 0.05) {
                addConsoleLog(`⚠️ Skipping ${buyWalletName}: Invalid buy amount`, 'warning');
                return null;
            }

            addConsoleLog(`💰 Buying ${buyAmount.toFixed(4)} SOL worth of tokens to ${buyWalletName}...`, 'info');

            const buyResponse = await window.apiClient.buyToken(
                buyWalletId,
                tokenMint,
                buyAmount,
                { executor: 'jito' } // Use Jito for faster execution
            );

            if (buyResponse?.success) {
                addConsoleLog(`✅ Bought ${buyAmount.toFixed(4)} SOL worth of tokens to ${buyWalletName}`, 'success');
                return {
                    walletId: buyWalletId,
                    walletAddress: buyWalletAddress,
                    walletName: buyWalletName,
                    buyAmount,
                    signature: buyResponse.signature
                };
            } else {
                addConsoleLog(`❌ Failed to buyback to ${buyWalletName}: ${buyResponse?.error || 'Unknown error'}`, 'error');
                return null;
            }
        } catch (error) {
            console.error(`Error buying back to wallet ${buyWallet.id || buyWallet.address}:`, error);
            addConsoleLog(`❌ Error buying back: ${error.message}`, 'error');
            return null;
        }
    });

    // Execute all buybacks in parallel for immediate execution
    const buybackResults = await Promise.all(buybackPromises);
    const successfulBuybacks = buybackResults.filter(Boolean);

    if (successfulBuybacks.length > 0) {
        addConsoleLog(`✅ Sell Buyback task completed! ${successfulBuybacks.length}/${buyWalletObjects.length} buybacks successful`, 'success');
    } else {
        addConsoleLog(`⚠️ Sell Buyback task completed but no buybacks were successful`, 'warning');
    }

    sellBuybackTaskConfig.running = false;

    // Refresh token details
    if (tokenRegistry.current) {
        await loadLiveTokenDetail(tokenRegistry.current);
    }
}

function stopSellBuybackTask() {
    if (!sellBuybackTaskConfig.running) {
        notify('Sell Buyback task is not running.', 'info');
        return;
    }

    sellBuybackTaskConfig.running = false;
    notify('Sell Buyback task stopped.', 'success');
    addConsoleLog('🛑 Sell Buyback task stopped by user.', 'info');
    
    if (tokenRegistry.current) {
        loadLiveTokenDetail(tokenRegistry.current).catch(console.error);
    }
}

registerGlobalHandler('showSellBuybackTask', configureSellBuybackTask);
registerGlobalHandler('executeSellBuybackTask', executeSellBuybackTask);
registerGlobalHandler('stopSellBuybackTask', stopSellBuybackTask);
registerGlobalHandler('handleQuickBuy', handleQuickBuy);
registerGlobalHandler('resyncTokenHoldings', resyncTokenHoldings);
registerGlobalHandler('handleTokenEdit', handleTokenEdit);
registerGlobalHandler('handleTokenArchive', handleTokenArchive);
registerGlobalHandler('setTokenHoldingsSource', setTokenHoldingsSource);

async function viewTokenDetails(identifier, source = 'imported') {
    if (!identifier) return;

    let record = null;
    if (source === 'draft') {
        record = tokenRegistry.drafts.get(identifier) || null;
    } else {
        record = tokenRegistry.imported.get(identifier) || tokenRegistry.drafts.get(identifier) || null;
    }

    if (!record) {
        notify('Token not found in registry.', 'warning');
        return;
    }

    // Check if token metadata looks incomplete (generic name/symbol)
    const hasGenericName = !record.name || 
        record.name === 'Imported Token' || 
        record.name === 'Token' || 
        record.name.startsWith('Token ') ||
        record.name === identifier.slice(0, 8) ||
        record.name === identifier.slice(0, 9);
    const hasGenericSymbol = !record.symbol || 
        record.symbol === 'TOKEN' || 
        record.symbol === 'UNK' ||
        record.symbol === '';
    const hasIncompleteMetadata = hasGenericName || hasGenericSymbol || !record.image || !record.description;

    // If metadata is incomplete and it's an imported token (not a draft), refresh it
    if (hasIncompleteMetadata && record.type !== 'draft' && record.mint) {
        try {
            await ensureApiClientReady();
            const response = await window.apiClient.importToken(record.mint, { platform: 'pumpfun' });
            
            if (response?.success && response.token) {
                const info = response.token;
                
                // Update record with fresh metadata
                const updatedRecord = {
                    ...record,
                    name: info.name || record.name,
                    symbol: info.symbol || record.symbol,
                    description: info.description || record.description,
                    image: info.image || record.image,
                    website: info.website || response.source?.website || record.website,
                    twitter: info.twitter || response.source?.twitter || record.twitter,
                    telegram: info.telegram || response.source?.telegram || record.telegram,
                    metadataUri: info.metadataUri || response.source?.metadataUri || record.metadataUri,
                    updatedAt: Date.now()
                };
                
                // Update registry
                registerImportedToken(updatedRecord);
                
                // Use updated record
                record = updatedRecord;
            }
        } catch (error) {
            console.warn('Failed to refresh token metadata:', error);
            // Continue with existing record even if refresh fails
        }
    }

    populateTokenDetailView(record);

    if (record.type === 'draft') {
        tokenLaunchState.pendingDraftId = record.id;
    } else {
        tokenLaunchState.pendingDraftId = null;
        tokenLaunchState.activeLaunchDraftId = null;
        resetLaunchConfigState();
    }

    navigateToPage('token-detail');
}

window.viewTokenDetails = viewTokenDetails;

function hydrateLaunchConfiguratorFromDraft(draft) {
    if (!draft) return;

    const isNewDraft = tokenLaunchState.activeLaunchDraftId !== draft.id;
    if (isNewDraft) {
        const configSource =
            draft.launchConfig ||
            {
                devWalletId: draft.creatorWalletId || draft.creatorWallet || '',
                devBuyAmount: draft.devBuyAmount ?? draft.initialBuyAmount,
                blockZero: draft.blockZero || {}
            };
        tokenLaunchState.launchConfig = cloneLaunchConfig(configSource);
        tokenLaunchState.activeLaunchDraftId = draft.id;
    }

    const launchNameEl = getElement('launch-token-name');
    if (launchNameEl) {
        launchNameEl.textContent = draft.name || 'Token';
    }

    const launchViewTitle = getElement('launch-token-title');
    const launchViewSubtitle = getElement('launch-token-subtitle');
    if (launchViewTitle) {
        launchViewTitle.textContent = draft.name || 'Token';
        if (launchViewSubtitle) {
            launchViewSubtitle.textContent = draft.symbol ? `(${draft.symbol})` : '';
        }
    }

    populateLaunchDevWalletSelect();

    const devBuyInput = getElement('dev-buy-amount');
    if (devBuyInput) {
        const normalized = safeNumber(tokenLaunchState.launchConfig.devBuyAmount);
        devBuyInput.value = normalized !== null ? normalized : '';
    }

    const blockZeroToggle = getElement('enable-block-zero');
    if (blockZeroToggle) {
        blockZeroToggle.checked = Boolean(tokenLaunchState.launchConfig.blockZero.enabled);
    }

    updateBlockZeroModeUI();
    renderBlockZeroWalletList();
    updateBlockZeroSummary();
}

function prepareSavedTokenLaunch() {
    const current = tokenRegistry.current && tokenRegistry.current.type === 'draft'
        ? tokenRegistry.current
        : tokenRegistry.drafts.get(tokenLaunchState.pendingDraftId || '') || null;

    if (!current || current.type !== 'draft') {
        notify('Select a saved token draft before preparing launch.', 'warning');
        return;
    }

    tokenLaunchState.pendingDraftId = current.id;
    tokenLaunchState.activeLaunchDraftId = current.id;
    tokenLaunchState.launchConfig = cloneLaunchConfig(
        current.launchConfig ||
            {
                devWalletId: current.creatorWalletId || current.creatorWallet || '',
                devBuyAmount: current.devBuyAmount ?? current.initialBuyAmount,
                blockZero: current.blockZero || {}
            }
    );
    if (tokenLaunchState.launchConfig.devWalletId) {
        tokenLaunchState.selectedWalletId = tokenLaunchState.launchConfig.devWalletId;
    }

    navigateToPage('launch-token');
    notify('Draft loaded. Configure launch details below.', 'info');
}

window.prepareSavedTokenLaunch = prepareSavedTokenLaunch;

function validateMintAddress(value) {
    if (!value || typeof value !== 'string') {
        return false;
    }
    const trimmed = value.trim();
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(trimmed);
}

async function resolveCreatorWalletId() {
    if (tokenLaunchState.selectedWalletId) {
        return tokenLaunchState.selectedWalletId;
    }

    await loadCreatorWallets();

    if (tokenLaunchState.selectedWalletId) {
        return tokenLaunchState.selectedWalletId;
    }

    if (Array.isArray(tokenLaunchState.wallets) && tokenLaunchState.wallets.length > 0) {
        const fallback = tokenLaunchState.wallets[0].id || tokenLaunchState.wallets[0].publicKey;
        if (fallback) {
            tokenLaunchState.selectedWalletId = fallback;
            return fallback;
        }
    }

    throw new Error('No creator wallet available. Add or select a wallet from the Create Token view.');
}

async function ensureApiClientReady() {
    if (!window.apiClient) {
        throw new Error('API client unavailable. Refresh the page.');
    }
    if (!window.apiClient.isConnected) {
        const initialized = await window.apiClient.initialize();
        if (!initialized) {
            throw new Error('Unable to reach backend API. Check connectivity.');
        }
    }
}

const TOKEN_DRAFT_STORAGE_KEY = 'chaosbot_token_drafts_v1';
const VANITY_STORAGE_KEY = 'chaosbot_vanity_keys';
const VANITY_LAUNCH_STORAGE_KEY = 'chaosbot_vanity_launches';
const VANITY_LAUNCH_STATS_TTL_MS = 5 * 60 * 1000;
const VANITY_LAUNCH_STATS_ENDPOINT_BASE = 'https://frontend-api.pump.fun';
const LAMPORTS_PER_SOL_FALLBACK = 1_000_000_000;

function getApiBase() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    if (window.__CHAOSBOT_API_BASE__) {
        return window.__CHAOSBOT_API_BASE__;
    }
    // Use /api instead of Netlify functions (api-server.js handles /api routes)
    return '/api';
}

const blueprintTemplates = {
    custom: {
        name: '',
        type: 'custom',
        description: '',
        launch: {
            devBuyAmount: 0.2,
            initialBuyAmount: 0.5,
            useVanity: false,
            priorityFee: 0.0005
        },
        automations: {
            smartSell: {
                enabled: false,
                profitTarget: 30,
                stopLoss: -15
            },
            volumeBot: {
                enabled: false,
                buyAmount: 0.02,
                cycles: 10,
                sellDelay: 45,
                minAmount: 0.015,
                maxAmount: 0.05,
                buyIntervalSeconds: 3,
                buyIntervalMinSeconds: 1,
                buyIntervalMaxSeconds: 8,
                sellIntervalSeconds: 5,
                sellIntervalMinSeconds: 2,
                sellIntervalMaxSeconds: 12,
                sellPercentageMin: 55,
                sellPercentageMax: 90,
                randomizeAmounts: true,
                randomizeDelay: true,
                guardrails: {
                    enabled: true,
                    realizedProfitTarget: null,
                    realizedLossLimit: null
                }
            }
        },
        notes: ''
    },
    'pumpfun-sniper': {
        name: 'Pump.fun Sniper Blueprint',
        type: 'sniper',
        description: 'Instant Pump.fun entry with smart sell protection.',
        launch: {
            devBuyAmount: 0.25,
            initialBuyAmount: 0.35,
            useVanity: true,
            priorityFee: 0.001
        },
        automations: {
            smartSell: {
                enabled: true,
                profitTarget: 35,
                stopLoss: -20
            },
            volumeBot: {
                enabled: false,
                buyAmount: 0.02,
                cycles: 8,
                sellDelay: 40,
                minAmount: 0.015,
                maxAmount: 0.04,
                buyIntervalSeconds: 2.5,
                buyIntervalMinSeconds: 1,
                buyIntervalMaxSeconds: 6,
                sellIntervalSeconds: 4,
                sellIntervalMinSeconds: 1.5,
                sellIntervalMaxSeconds: 8,
                sellPercentageMin: 50,
                sellPercentageMax: 85,
                randomizeAmounts: true,
                randomizeDelay: true,
                guardrails: {
                    enabled: true,
                    realizedProfitTarget: 2,
                    realizedLossLimit: 1
                }
            }
        },
        notes: 'Use Jito bundle for guaranteed first fills.'
    },
    'volume-generator': {
        name: 'Volume Generator Blueprint',
        type: 'volume',
        description: 'Organic volume cycling across warm wallets.',
        launch: {
            devBuyAmount: 0.15,
            initialBuyAmount: 0.4,
            useVanity: false,
            priorityFee: 0.0007
        },
        automations: {
            smartSell: {
                enabled: true,
                profitTarget: 28,
                stopLoss: -18
            },
            volumeBot: {
                enabled: true,
                buyAmount: 0.03,
                cycles: 15,
                sellDelay: 55,
                minAmount: 0.02,
                maxAmount: 0.06,
                buyIntervalSeconds: 3.5,
                buyIntervalMinSeconds: 1,
                buyIntervalMaxSeconds: 9,
                sellIntervalSeconds: 6,
                sellIntervalMinSeconds: 2,
                sellIntervalMaxSeconds: 14,
                sellPercentageMin: 60,
                sellPercentageMax: 92,
                randomizeAmounts: true,
                randomizeDelay: true,
                guardrails: {
                    enabled: true,
                    realizedProfitTarget: 3,
                    realizedLossLimit: 1.5
                }
            }
        },
        notes: 'Pairs well with mixer funding mode and multiple wallets.'
    },
    'arbitrage-bot': {
        name: 'Arbitrage Launch Blueprint',
        type: 'arbitrage',
        description: 'Prepare for cross-DEX spreads right after launch.',
        launch: {
            devBuyAmount: 0.3,
            initialBuyAmount: 0.25,
            useVanity: true,
            priorityFee: 0.0012
        },
        automations: {
            smartSell: {
                enabled: true,
                profitTarget: 25,
                stopLoss: -12
            },
            volumeBot: {
                enabled: true,
                buyAmount: 0.015,
                cycles: 12,
                sellDelay: 35,
                minAmount: 0.01,
                maxAmount: 0.03,
                buyIntervalSeconds: 2,
                buyIntervalMinSeconds: 0.8,
                buyIntervalMaxSeconds: 5,
                sellIntervalSeconds: 3.5,
                sellIntervalMinSeconds: 1,
                sellIntervalMaxSeconds: 7,
                sellPercentageMin: 50,
                sellPercentageMax: 88,
                randomizeAmounts: true,
                randomizeDelay: true,
                guardrails: {
                    enabled: true,
                    realizedProfitTarget: 2.5,
                    realizedLossLimit: 1
                }
            }
        },
        notes: 'Monitor spread between Raydium and Jupiter pools.'
    }
};

const blueprintService = (() => {
    const state = {
        list: [],
        lastFetched: 0,
        promise: null
    };

    const request = async (path, options = {}) => {
        const fetchFn = typeof fetch === 'function' ? fetch : window.fetch;
        const url = `${getApiBase()}${path}`;
        const init = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            credentials: 'same-origin'
        };

        if (options.body !== undefined) {
            init.body = options.body;
        }

        const response = await fetchFn(url, init);
        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok || (payload && payload.success === false)) {
            const message =
                payload?.error ||
                payload?.message ||
                `Blueprint request failed (${response.status})`;
            throw new Error(message);
        }

        return payload || {};
    };

    const fetchList = async (force = false) => {
        const now = Date.now();
        if (
            !force &&
            state.list.length &&
            now - state.lastFetched < 5000
        ) {
            return state.list;
        }

        if (state.promise) {
            return state.promise;
        }

        state.promise = request('/blueprints')
            .then((data) => {
                state.list = Array.isArray(data.blueprints)
                    ? data.blueprints
                    : [];
                state.lastFetched = Date.now();
                return state.list;
            })
            .finally(() => {
                state.promise = null;
            });

        return state.promise;
    };

    const create = async (payload) => {
        const response = await request('/blueprints', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        await fetchList(true);
        return response.blueprint;
    };

    const remove = async (blueprintId) => {
        await request(`/blueprints/${blueprintId}`, {
            method: 'DELETE'
        });
        await fetchList(true);
        return true;
    };

    const execute = async (blueprintId) => {
        const response = await request(`/blueprints/${blueprintId}/execute`, {
            method: 'POST',
            body: JSON.stringify({
                requestedBy: 'ui'
            })
        });
        await fetchList(true);
        return response.run;
    };

    const getById = (blueprintId) =>
        state.list.find((entry) => entry.id === blueprintId) || null;

    const update = async (blueprintId, payload) => {
        const response = await request(`/blueprints/${blueprintId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        await fetchList(true);
        return response.blueprint;
    };

    return {
        state,
        fetchList,
        create,
        remove,
        execute,
        update,
        getById,
        request, // Expose request method for direct API calls
        markApplied: async (blueprintId) => {
            await request(`/blueprints/${blueprintId}/applied`, {
                method: 'POST'
            });
            await fetchList(true);
        },
        fetchRuns: async (blueprintId, limit = 25) => {
            const params = new URLSearchParams({
                limit: String(limit || 25)
            });
            const response = await request(`/blueprints/${blueprintId}/runs?${params.toString()}`);
            return Array.isArray(response.runs) ? response.runs : [];
        }
    };
})();

function buildBlueprintApiPayload(raw = {}) {
    const settingsClone = raw.settings
        ? JSON.parse(JSON.stringify(raw.settings))
        : {};

    return {
        name: raw.name || 'Unnamed Blueprint',
        type: raw.type || raw.template || 'custom',
        template: raw.template || raw.type || 'custom',
        description: raw.description || '',
        notes: raw.notes || '',
        settings: settingsClone,
        automations: settingsClone.automations
            ? JSON.parse(JSON.stringify(settingsClone.automations))
            : {},
        wallets: Array.isArray(raw.wallets) ? raw.wallets : [],
        status: raw.status || 'inactive'
    };
}

const blueprintRunsState = {
    blueprintId: null,
    runs: [],
    loading: false
};
async function openBlueprintRunsModal(blueprintId) {
    if (!ensureMultiWalletReady()) {
        return;
    }

    blueprintRunsState.blueprintId = blueprintId;
    blueprintRunsState.loading = true;
    blueprintRunsState.runs = [];

    const bodyEl = getElement('blueprint-runs-body');
    const titleEl = getElement('blueprint-runs-title');
    if (bodyEl) {
        bodyEl.innerHTML = `
            <div class="flex items-center justify-center gap-2 text-sm text-gray-400 py-6">
                <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
                <span>Loading run history...</span>
            </div>
        `;
    }

    let blueprint = blueprintService.getById(blueprintId);
    if (!blueprint) {
        try {
            await blueprintService.fetchList(true);
            blueprint = blueprintService.getById(blueprintId);
        } catch (error) {
            notify(`Unable to load blueprint: ${error.message}`, 'error');
            return;
        }
    }

    if (titleEl && blueprint) {
        titleEl.textContent = `${blueprint.name} • Run History`;
    }

    window.openModal('blueprint-runs-modal');

    try {
        const runs = await blueprintService.fetchRuns(blueprintId, 50);
        blueprintRunsState.runs = runs;
        blueprintRunsState.loading = false;
        renderBlueprintRunsModal(blueprint, runs);
    } catch (error) {
        console.error('Failed to load blueprint runs:', error);
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="text-sm text-red-400 py-6 text-center">
                    Unable to load run history: ${escapeHtml(error.message || 'Unknown error')}
                </div>
            `;
        }
    } finally {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}
function renderBlueprintRunsModal(blueprint, runs = []) {
    const bodyEl = getElement('blueprint-runs-body');
    if (!bodyEl) {
        return;
    }

    if (!Array.isArray(runs) || runs.length === 0) {
        bodyEl.innerHTML = `
            <div class="text-sm text-gray-400 py-6 text-center">
                No runs recorded yet. Execute this blueprint to populate history.
            </div>
        `;
        return;
    }

    const rows = runs
        .map((run) => {
            const started = run.startedAt ? formatTimestamp(run.startedAt) : '—';
            const completed = run.completedAt ? formatTimestamp(run.completedAt) : '—';
            const status = formatRunStatus(run.status);
            const summary = run.summary || {};
            const totalOps = summary.totalOperations ?? (summary.success || 0) + (summary.failed || 0);
            const successOps = summary.success ?? 0;
            const failedOps = summary.failed ?? 0;
            const error = run.error || summary.error || '';
            const operations = run.operations || [];
            const operationDetails = operations
                .map((op) => {
                    const label = op.action || 'operation';
                    const opStatus = op.success ? '✅' : '❌';
                    const metaParts = [];
                    if (op.walletId) {
                        metaParts.push(escapeHtml(op.walletId));
                    }
                    if (Array.isArray(op.walletIds) && op.walletIds.length > 0) {
                        metaParts.push(`${op.walletIds.length} wallet(s)`);
                    }
                    if (op.params?.tokenMint) {
                        metaParts.push(escapeHtml(op.params.tokenMint));
                    }
                    if (op.params?.solAmount) {
                        const sol = Number(op.params.solAmount);
                        if (!Number.isNaN(sol)) {
                            metaParts.push(`${sol.toFixed(4)} SOL`);
                        }
                    }
                    const meta =
                        metaParts.length > 0
                            ? `<span class="block text-[11px] text-gray-500">${metaParts.join(' • ')}</span>`
                            : '';
                    const sigLink = op.signature
                        ? `<a href="https://solscan.io/tx/${op.signature}" target="_blank" rel="noopener" class="text-purple-300 hover:text-purple-200">${op.signature.slice(0, 12)}...</a>`
                        : '';
                    return `<div class="flex flex-col gap-1 text-xs text-gray-400 border border-neutral-800/60 rounded px-3 py-2 bg-neutral-900/60">
                        <div class="flex items-center justify-between gap-3">
                            <span>${opStatus} ${label}</span>
                            <span class="text-right">${sigLink}</span>
                        </div>
                        ${meta}
                    </div>`;
                })
                .join('');

            const errorRow = error
                ? `<div class="mt-2 text-xs text-red-400 border border-red-500/40 bg-red-500/10 rounded px-3 py-2">${escapeHtml(error)}</div>`
                : '';

            return `
                <tr class="border-b border-neutral-800">
                    <td class="px-4 py-3 align-top">
                        <div class="font-medium text-sm text-white">${status}</div>
                        <div class="text-xs text-gray-500">Run ID: ${escapeHtml(run.id)}</div>
                        <div class="text-xs text-gray-500">Requested: ${formatTimestamp(run.requestedAt)}</div>
                        <div class="text-xs text-gray-500">Started: ${started}</div>
                        <div class="text-xs text-gray-500">Completed: ${completed}</div>
                    </td>
                    <td class="px-4 py-3 align-top text-sm text-gray-300">
                        <div>Total ops: ${totalOps}</div>
                        <div>Success: ${successOps}</div>
                        <div>Failed: ${failedOps}</div>
                        ${errorRow}
                    </td>
                    <td class="px-4 py-3 align-top">
                        <div class="space-y-1">
                            ${operationDetails || '<div class="text-xs text-gray-500">No operation details recorded.</div>'}
                        </div>
                    </td>
                </tr>
            `;
        })
        .join('');

    bodyEl.innerHTML = `
        <div class="max-h-96 overflow-y-auto">
            <table class="w-full text-left">
                <thead class="text-xs uppercase tracking-wide text-gray-500 border-b border-neutral-800">
                    <tr>
                        <th class="px-4 py-2">Timeline</th>
                        <th class="px-4 py-2">Summary</th>
                        <th class="px-4 py-2">Operations</th>
                    </tr>
                </thead>
                <tbody class="text-sm">
                    ${rows}
                </tbody>
            </table>
        </div>
    `;

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
function ensureMultiWalletReady() {
    initializeMultiWallet();
    if (!multiWalletManager) {
        notify('Initialize Solana integration before managing blueprints.', 'error');
        return false;
    }
    return true;
}

function registerGlobalHandler(name, handler) {
    const existing = window[name];
    if (typeof existing === 'function' && !existing.__fallback) {
        return;
    }
    window[name] = handler;
}

function notify(message, type = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        console[type === 'error' ? 'error' : 'log'](message);
    }
    if (typeof addConsoleLog === 'function') {
        addConsoleLog(message, type);
    }
}

function getElement(id) {
    return document.getElementById(id);
}

function loadStoredCreatorWalletState() {
    try {
        const raw = localStorage.getItem(CREATOR_WALLET_STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return;
        }
        creatorWalletState = {
            ...creatorWalletState,
            id: parsed.id || parsed.address || creatorWalletState.id,
            address: parsed.address || creatorWalletState.address,
            name: parsed.name || creatorWalletState.name,
            balance: typeof parsed.balance === 'number' ? parsed.balance : creatorWalletState.balance,
            tags: Array.isArray(parsed.tags) ? parsed.tags : creatorWalletState.tags,
            lastSynced: parsed.lastSynced || parsed.timestamp || creatorWalletState.lastSynced
        };
    } catch (error) {
        console.warn('Unable to load creator wallet from storage:', error);
    }
}

function persistCreatorWalletState(state = creatorWalletState) {
    try {
        const payload = {
            id: state.id || null,
            address: state.address || '',
            name: state.name || '',
            balance: typeof state.balance === 'number' ? state.balance : null,
            tags: Array.isArray(state.tags) ? state.tags : [],
            lastSynced: state.lastSynced || Date.now()
        };
        localStorage.setItem(CREATOR_WALLET_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Unable to persist creator wallet:', error);
    }
}

function applyCreatorWalletState(update = {}, options = {}) {
    creatorWalletState = {
        ...creatorWalletState,
        ...update
    };

    if (!options.skipPersist) {
        persistCreatorWalletState(creatorWalletState);
    }

    if (!options.skipUI) {
        updateCreatorWalletUI();
        updateCreatorWalletSummary();
    }
}

function updateCreatorWalletUI() {
    const addressEl = getElement('fee-wallet-address');
    const balanceEl = getElement('fee-wallet-balance');
    const percentEl = getElement('fee-wallet-percent');
    const levelEl = getElement('fee-wallet-level');

    const hasAddress = Boolean(creatorWalletState.address);
    const formattedAddress = hasAddress ? truncateAddress(creatorWalletState.address) : 'No creator wallet';

    if (addressEl) {
        addressEl.textContent = formattedAddress;
        if (addressEl.dataset) {
            addressEl.dataset.address = creatorWalletState.address || '';
        }
        addressEl.classList.toggle('text-gray-400', !hasAddress);
    }

    const balance =
        typeof creatorWalletState.balance === 'number'
            ? creatorWalletState.balance
            : null;
    const balanceText = balance !== null ? `${balance.toFixed(4)} SOL` : '0.0000 SOL';

    if (balanceEl) {
        balanceEl.textContent = balanceText;
        balanceEl.classList.toggle('text-purple-300', hasAddress);
        balanceEl.classList.toggle('text-gray-500', !hasAddress);
    }

    const percentValue =
        balance !== null
            ? Math.max(0, Math.min(100, Math.round((balance / CREATOR_WALLET_TARGET_SOL) * 100)))
            : 0;

    if (percentEl) {
        percentEl.textContent = hasAddress && balance !== null ? `${percentValue}%` : '--';
    }

    if (levelEl) {
        levelEl.style.width = `${hasAddress ? percentValue : 0}%`;
        levelEl.classList.toggle('bg-purple-500', true);
    }
}

function updateCreatorWalletSummary() {
    const summary = getElement('creator-wallet-summary');
    if (!summary) {
        return;
    }

    const nameEl = summary.querySelector('[data-summary-name]');
    const addressEl = summary.querySelector('[data-summary-address]');
    const balanceEl = summary.querySelector('[data-summary-balance]');

    const hasAddress = Boolean(creatorWalletState.address);
    const displayName = creatorWalletState.name || (hasAddress ? 'Creator Wallet' : 'No creator wallet linked');
    const displayAddress = hasAddress ? creatorWalletState.address : '—';
    const displayBalance =
        typeof creatorWalletState.balance === 'number'
            ? `${creatorWalletState.balance.toFixed(4)} SOL`
            : '0.0000 SOL';

    if (nameEl) nameEl.textContent = displayName;
    if (addressEl) addressEl.textContent = displayAddress;
    if (balanceEl) balanceEl.textContent = displayBalance;
}

function setCreatorWalletStatus(message, type = 'info') {
    const statusEl = getElement('creator-wallet-status');
    if (!statusEl) {
        return;
    }
    const baseClass = 'text-xs';
    const colorClass =
        type === 'error' ? 'text-red-400' : type === 'success' ? 'text-green-400' : 'text-gray-500';
    statusEl.className = `${baseClass} ${colorClass}`;
    statusEl.textContent = message || '';
}

function setCreatorImportButtonLoading(isLoading) {
    const button = getElement('creator-wallet-import-btn');
    if (!button) return;
    const label = button.querySelector('.import-label');
    const spinner = button.querySelector('.spinner');

    button.disabled = isLoading;
    button.classList.toggle('opacity-70', isLoading);
    button.classList.toggle('cursor-wait', isLoading);

    if (label) {
        label.textContent = isLoading ? 'Importing…' : 'Import Creator Key';
    }
    if (spinner) {
        spinner.classList.toggle('hidden', !isLoading);
    }
}

function resetCreatorWalletForm() {
    const keyInput = getElement('creator-wallet-private-key');
    const nameInput = getElement('creator-wallet-name');
    if (keyInput) keyInput.value = '';
    if (nameInput) nameInput.value = '';
}

async function refreshCreatorWalletBalance(options = {}) {
    const address = options.address || creatorWalletState.address;
    if (!address || !solanaIntegration || typeof solanaIntegration.getBalance !== 'function') {
        return null;
    }
    try {
        const balance = await solanaIntegration.getBalance(address);
        applyCreatorWalletState({ balance }, { skipPersist: options.skipPersist, skipUI: options.skipUI });
        return balance;
    } catch (error) {
        console.warn('Unable to refresh creator wallet balance:', error);
        return null;
    }
}

function normalizeValueForMatch(value) {
    return value ? String(value).toLowerCase() : '';
}

function ensureCreatorWalletIncluded(wallets = [], { prepend = true } = {}) {
    const list = Array.isArray(wallets) ? [...wallets] : [];
    const creatorAddress = creatorWalletState.address;

    if (!creatorAddress) {
        return list;
    }

    const normalizedCreator = normalizeValueForMatch(creatorAddress);
    if (!normalizedCreator) {
        return list;
    }

    const alreadyPresent = list.find((wallet) =>
        [wallet?.id, wallet?.publicKey, wallet?.address, wallet?.pubkey]
            .map(normalizeValueForMatch)
            .includes(normalizedCreator)
    );

    if (alreadyPresent) {
        if (Array.isArray(alreadyPresent.tags)) {
            if (!alreadyPresent.tags.map(normalizeValueForMatch).includes('creator')) {
                alreadyPresent.tags = [...alreadyPresent.tags, 'creator'];
            }
        } else {
            alreadyPresent.tags = ['creator'];
        }
        if (typeof alreadyPresent.balance !== 'number' && typeof creatorWalletState.balance === 'number') {
            alreadyPresent.balance = creatorWalletState.balance;
        }
        if (!alreadyPresent.name) {
            alreadyPresent.name = creatorWalletState.name || 'Creator Wallet';
        }
        return list;
    }

    const creatorEntry = {
        id: creatorWalletState.id || creatorAddress,
        publicKey: creatorAddress,
        address: creatorAddress,
        name: creatorWalletState.name || 'Creator Wallet',
        balance:
            typeof creatorWalletState.balance === 'number' ? creatorWalletState.balance : null,
        tags: Array.isArray(creatorWalletState.tags)
            ? Array.from(new Set([...creatorWalletState.tags, 'creator']))
            : ['creator'],
        source: 'creator-storage'
    };

    if (prepend) {
        list.unshift(creatorEntry);
    } else {
        list.push(creatorEntry);
    }

    return list;
}

function findCreatorWalletInList(wallets, preferences = {}) {
    if (!Array.isArray(wallets) || wallets.length === 0) {
        return null;
    }

    const preferredId = normalizeValueForMatch(preferences.preferredId);
    const fallbackAddress = normalizeValueForMatch(preferences.fallbackAddress);
    const storedAddress = normalizeValueForMatch(creatorWalletState.address);

    if (preferredId) {
        const match = wallets.find((wallet) => {
            const candidates = [
                wallet?.id,
                wallet?.publicKey,
                wallet?.address,
                wallet?.pubkey
            ].map(normalizeValueForMatch);
            return candidates.includes(preferredId);
        });
        if (match) {
            return match;
        }
    }

    const tagged = wallets.find(
        (wallet) =>
            Array.isArray(wallet?.tags) &&
            wallet.tags.some((tag) => normalizeValueForMatch(tag) === 'creator')
    );
    if (tagged) {
        return tagged;
    }

    if (fallbackAddress) {
        const match = wallets.find((wallet) => {
            const candidates = [
                wallet?.publicKey,
                wallet?.address,
                wallet?.pubkey
            ].map(normalizeValueForMatch);
            return candidates.includes(fallbackAddress);
        });
        if (match) {
            return match;
        }
    }

    if (storedAddress) {
        const match = wallets.find((wallet) =>
            [wallet?.publicKey, wallet?.address, wallet?.pubkey]
                .map(normalizeValueForMatch)
                .includes(storedAddress)
        );
        if (match) {
            return match;
        }
    }

    return null;
}

function syncCreatorWalletFromWallets(wallets, preferences = {}) {
    const match = findCreatorWalletInList(wallets, preferences);
    if (!match) {
        return false;
    }

    const address = match.publicKey || match.address || match.pubkey || '';
    const balance = typeof match.balance === 'number' ? match.balance : null;
    const name = match.name || match.label || creatorWalletState.name || 'Creator Wallet';
    const tags = Array.isArray(match.tags) ? match.tags : creatorWalletState.tags;

    applyCreatorWalletState(
        {
            id: match.id || address,
            address,
            name,
            balance,
            tags,
            lastSynced: Date.now()
        },
        { skipPersist: false }
    );

    if (balance === null) {
        refreshCreatorWalletBalance({ address });
    }

    return true;
}

async function syncCreatorWalletFromBackend(options = {}) {
    if (!window.apiClient) {
        return null;
    }

    const { silent = false, preferredId = null, fallbackAddress = null, privateKey = null } = options || {};

    try {
        await ensureApiClientReady();
        const response = await window.apiClient.getAllWallets();
        const wallets = Array.isArray(response?.wallets)
            ? response.wallets
            : Array.isArray(response)
            ? response
            : [];

        const synced = syncCreatorWalletFromWallets(wallets, { preferredId, fallbackAddress });
        if (!synced) {
            if (!silent && creatorWalletState.address) {
                notify('Creator wallet not found in backend wallet list. Import or tag a wallet as creator.', 'warning');
            }
            return null;
        }

        const address = creatorWalletState.address;
        if (address && (privateKey || typeof creatorWalletState.balance === 'number')) {
            ensureVanityHasCreatorKey(address, privateKey, creatorWalletState.name);
        }

        return creatorWalletState;
    } catch (error) {
        if (!silent) {
            notify(`Unable to sync creator wallet: ${error.message}`, 'error');
        }
        throw error;
    }
}

registerGlobalHandler('setCreatorWalletFromSelection', async (payload = {}) => {
    const wallet = payload.wallet || null;
    if (!wallet) {
        notify('No wallet provided for creator assignment.', 'error');
        throw new Error('Missing wallet payload');
    }

    const address = wallet.publicKey || wallet.address || wallet.pubkey || '';
    if (!address) {
        notify('Selected wallet does not have a public key.', 'error');
        throw new Error('Wallet missing public key');
    }

    const walletId = wallet.id || address;
    const name = wallet.name || 'Creator Wallet';
    const balance = typeof wallet.balance === 'number' ? wallet.balance : creatorWalletState.balance;
    const existingTags = Array.isArray(wallet.tags) ? wallet.tags : [];
    const mergedTags = Array.from(new Set([...existingTags, 'creator']));

    try {
        applyCreatorWalletState(
            {
                id: walletId,
                address,
                name,
                balance,
                tags: mergedTags,
                lastSynced: Date.now()
            },
            { skipPersist: false }
        );

        tokenLaunchState.selectedWalletId = walletId;
        tokenLaunchState.launchConfig = tokenLaunchState.launchConfig || {};
        tokenLaunchState.launchConfig.devWalletId = walletId;

        const privateKeyPayload =
            payload.privateKeyBase58 ||
            payload.privateKeyArray ||
            payload.privateKey ||
            null;
        if (privateKeyPayload) {
            ensureVanityHasCreatorKey(address, privateKeyPayload, name);
        }

        if (window.apiClient?.updateWalletTags) {
            try {
                await window.apiClient.updateWalletTags(walletId, mergedTags);
            } catch (tagError) {
                console.warn('Unable to persist creator tag on wallet:', tagError);
            }
        }

        await refreshCreatorWalletBalance({ address, skipPersist: false });
        await loadCreatorWallets();
        await syncCreatorWalletFromBackend({ silent: true, preferredId: walletId, fallbackAddress: address });

        notify(`Creator wallet set to ${name}`, 'success');
        return { id: walletId, tags: mergedTags };
    } catch (error) {
        console.error('setCreatorWalletFromSelection error:', error);
        notify(error.message || 'Failed to assign creator wallet.', 'error');
        throw error;
    }
});

function ensureVanityHasCreatorKey(address, privateKey, label) {
    if (!address || !privateKey) {
        return;
    }

    if (!Array.isArray(vanityKeyStore)) {
        vanityKeyStore = [];
    }

    const existing = vanityKeyStore.find((entry) => entry.address === address);
    const timestamp = Date.now();

    if (existing) {
        let updated = false;
        if (!existing.privateKey) {
            existing.privateKey = privateKey;
            updated = true;
        }
        if (existing.status === 'used') {
            existing.status = 'available';
            updated = true;
        }
        if (existing.source !== 'creator') {
            existing.source = 'creator';
            updated = true;
        }
        if (label && !existing.label) {
            existing.label = label;
            updated = true;
        }
        if (updated) {
            existing.updatedAt = timestamp;
            persistVanityStore();
            renderVanityList();
        }
        return;
    }

    vanityKeyStore.push({
        id: `vanity-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        launchpad: detectLaunchpad(address),
        address,
        privateKey,
        status: 'available',
        createdAt: timestamp,
        updatedAt: timestamp,
        source: 'creator',
        label: label || 'Creator Wallet'
    });

    persistVanityStore();
    renderVanityList();
}

function openCreatorWalletModal() {
    updateCreatorWalletSummary();
    setCreatorWalletStatus('');

    window.openModal('creator-wallet-modal');

    setTimeout(() => {
        getElement('creator-wallet-private-key')?.focus();
    }, 150);
}

async function submitCreatorWalletImport() {
    if (creatorWalletImportLock) {
        return;
    }

    const keyInput = getElement('creator-wallet-private-key');
    const nameInput = getElement('creator-wallet-name');

    const privateKeyRaw = keyInput?.value?.trim();
    if (!privateKeyRaw) {
        notify('Paste the creator private key before importing.', 'warning');
        keyInput?.focus();
        return;
    }

    creatorWalletImportLock = true;
    setCreatorImportButtonLoading(true);
    setCreatorWalletStatus('Importing creator wallet…', 'info');

    try {
        await ensureApiClientReady();
        const requestedName = nameInput?.value?.trim();
        const desiredName = requestedName || 'Creator Wallet';

        const result = await window.apiClient.importWallet(privateKeyRaw, desiredName, ['creator']);
        if (!result?.success) {
            throw new Error(result?.error || 'Import failed');
        }

        const wallet = result.wallet || {};
        const address = wallet.publicKey || wallet.address;
        if (!address) {
            throw new Error('Backend did not return a wallet address');
        }
        const walletId = wallet.id || address;
        const privateKey = wallet.privateKey || privateKeyRaw;

        applyCreatorWalletState({
            id: walletId,
            address,
            name: wallet.name || desiredName,
            tags: Array.isArray(wallet.tags) ? wallet.tags : ['creator'],
            balance: typeof wallet.balance === 'number' ? wallet.balance : creatorWalletState.balance,
            lastSynced: Date.now()
        });

        tokenLaunchState.selectedWalletId = walletId;

        await syncCreatorWalletFromBackend({
            silent: true,
            preferredId: walletId,
            fallbackAddress: address,
            privateKey
        });

        await loadCreatorWallets();

        if (typeof window.walletOperations?.loadWallets === 'function') {
            try {
                await window.walletOperations.loadWallets();
            } catch (walletError) {
                console.warn('Unable to reload wallet operations after creator import:', walletError);
            }
        }

        await refreshCreatorWalletBalance({ address });

        setCreatorWalletStatus('Creator wallet imported successfully.', 'success');
        notify('Creator wallet imported and linked.', 'success');
        resetCreatorWalletForm();
        updateCreatorWalletSummary();
        closeModal('creator-wallet-modal');
    } catch (error) {
        console.error('Creator wallet import failed:', error);
        setCreatorWalletStatus(error.message || 'Import failed', 'error');
        notify(`Creator wallet import failed: ${error.message}`, 'error');
    } finally {
        creatorWalletImportLock = false;
        setCreatorImportButtonLoading(false);
    }
}

function getSelectValues(selectEl) {
    if (!selectEl) {
        return [];
    }
    return Array.from(selectEl.selectedOptions || []).map((option) => option.value).filter(Boolean);
}
registerGlobalHandler('navigateToPage', (page) => {
    if (!page) return;

    let targetPage = page === 'automations' ? 'create-token' : page;

    const modalId = `${targetPage}-modal`;
    if (getElement(modalId)) {
        window.openModal(modalId);
        return;
    }

    const targetView = getElement(`${targetPage}-view`) || getElement(`${targetPage}-page`);
    if (targetView && typeof switchView === 'function') {
        const parentView = targetView.id.endsWith('-page') ? targetView.id.replace('-page', '') : targetPage;
        switchView(parentView);
        setTimeout(() => targetView.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
        return;
    }

    notify(`Unknown page: ${targetPage}`, 'warning');
});

registerGlobalHandler('openModal', (modalId) => {
    const modal = getElement(modalId);
    if (!modal) {
        notify(`Unable to open modal: ${modalId}`, 'error');
        return;
    }
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== modal && !modal.contains(activeElement)) {
        modal.__previouslyFocusedElement = activeElement;
    }
    modal.classList.remove('hidden');
    modal.removeAttribute('inert');
    modal.setAttribute('aria-hidden', 'false');
    modal.focus?.();
});

registerGlobalHandler('closeModal', (modalId) => {
    const modal = getElement(modalId);
    if (!modal) return;
    if (modal.contains(document.activeElement)) {
        document.activeElement.blur?.();
    }
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    const previouslyFocused = modal.__previouslyFocusedElement;
    modal.__previouslyFocusedElement = null;
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        requestAnimationFrame(() => {
            try {
                previouslyFocused.focus();
            } catch (focusError) {
                console.debug('Unable to restore focus after closing modal:', focusError);
            }
        });
    }
});
registerGlobalHandler('executeGenerate', async () => {
    const modal = getElement('generate-modal');
    if (!modal) {
        notify('Generate modal unavailable right now.', 'error');
        return;
    }

    const isHidden = modal.classList.contains('hidden') || modal.getAttribute('aria-hidden') === 'true';

    if (isHidden) {
        window.openModal('generate-modal');
        const input = getElement('generate-count');
        input?.focus();
        return;
    }

    if (typeof window.executeGenerateWallets === 'function') {
        await window.executeGenerateWallets({ source: 'modal' });
    } else {
        notify('Wallet generator is not ready yet.', 'error');
    }
});

registerGlobalHandler('executeTokenLaunch', () => executeLaunchToken());

function applyToggleClasses(primaryId, secondaryId, isPrimaryActive) {
    const primary = getElement(primaryId);
    const secondary = getElement(secondaryId);
    if (!primary || !secondary) return;

    primary.classList.add('border-white', 'bg-neutral-800');
    secondary.classList.remove('border-white');
    secondary.classList.add('border-neutral-700');

    if (!isPrimaryActive) {
        primary.classList.remove('border-white');
        primary.classList.add('border-neutral-700');
        secondary.classList.add('border-white', 'bg-neutral-800');
    }
}

registerGlobalHandler('selectFundMode', (mode) => {
    uiHelperState.fundMode = mode;
    applyToggleClasses('fund-standard-mode', 'fund-mixer-mode', mode === 'standard');
    notify(`Funding mode set to ${mode.toUpperCase()}`, 'info');
});

// Setup fund source type toggle
function setupFundSourceToggle() {
    const radios = document.querySelectorAll('input[name="fund-source-type"]');
    const addressWrapper = document.getElementById('fund-address-wrapper');
    const privateKeyWrapper = document.getElementById('fund-private-key-wrapper');

    const toggle = () => {
        const selected = document.querySelector('input[name="fund-source-type"]:checked');
        if (selected && selected.value === 'private-key') {
            if (addressWrapper) addressWrapper.classList.add('hidden');
            if (privateKeyWrapper) privateKeyWrapper.classList.remove('hidden');
        } else {
            if (addressWrapper) addressWrapper.classList.remove('hidden');
            if (privateKeyWrapper) privateKeyWrapper.classList.add('hidden');
        }
    };

    radios.forEach(radio => {
        radio.addEventListener('change', toggle);
    });

    toggle();
}

// Update fund selected wallets list
function updateFundSelectedWallets() {
    const container = document.getElementById('fund-selected-wallets-list');
    if (!container) return;

    const walletIds = getSelectedWalletIds();
    if (walletIds.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400">Select wallets from the table to fund them.</p>';
        return;
    }

    const wallets = typeof window.walletOperations?.getWallets === 'function' 
        ? window.walletOperations.getWallets()
        : [];

    const selectedWallets = walletIds.map(walletId => {
        return wallets.find(w => {
            const id = w.id || w.address || w.publicKey || w.pubkey;
            return id === walletId;
        });
    }).filter(Boolean);

    if (selectedWallets.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400">Selected wallets not found. Please refresh.</p>';
        return;
    }

    container.innerHTML = selectedWallets.map((wallet, index) => {
        const address = wallet.address || wallet.publicKey || wallet.pubkey || 'Unknown';
        const name = wallet.name || 'Unnamed';
        const balance = typeof wallet.balance === 'number' ? wallet.balance.toFixed(4) : '0.0000';
        const truncated = address.length > 20 ? `${address.substring(0, 10)}...${address.substring(address.length - 8)}` : address;
        const walletId = wallet.id || wallet.address || wallet.publicKey || wallet.pubkey;
        return `
            <div class="flex items-center justify-between p-3 bg-neutral-900 rounded border border-neutral-800 hover:border-purple-500/50 transition">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600/20 flex items-center justify-center text-xs font-semibold text-purple-300">
                        ${index + 1}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium text-white truncate">${escapeHtml(name)}</div>
                        <div class="text-xs text-gray-400 font-mono truncate" title="${address}">${truncated}</div>
                    </div>
                </div>
                <div class="text-xs text-gray-300 ml-2 flex-shrink-0">${balance} SOL</div>
            </div>
        `;
    }).join('');
}

// Call setup on page load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setupFundSourceToggle();
    });
}

registerGlobalHandler('executeFundWallets', async () => {
    const button = document.querySelector('#fund-page button[onclick="executeFundWallets()"]');
    try {
        const walletIds = getSelectedWalletIds();
        if (!walletIds.length) {
            notify('Select at least one wallet from the table before funding.', 'warning');
            return;
        }

        const amountInput = document.getElementById('fund-amount-input');
        if (!amountInput || !amountInput.value) {
            notify('Enter a funding amount.', 'error');
            return;
        }

        const amount = parseFloat(amountInput.value);
        if (!Number.isFinite(amount) || amount <= 0) {
            notify('Enter a valid funding amount greater than zero.', 'error');
            return;
        }

        const method = document.querySelector('input[name="fund-method"]:checked')?.value || 'uniform';
        const mode = uiHelperState.fundMode || 'standard';

        notify(`Funding ${walletIds.length} wallet(s) with ${amount} SOL each...`, 'info');
        addConsoleLog(`Starting fund: ${walletIds.length} wallet(s) | ${amount} SOL each | Mode: ${mode}`, 'info');

        if (button) {
            setButtonLoading(button, true, 'Funding...');
        }

        // Get funding source (address or private key)
        const sourceType = document.querySelector('input[name="fund-source-type"]:checked')?.value || 'address';
        let fundingWallet = null;
        let fundingPrivateKey = null;

        if (sourceType === 'private-key') {
            // Use private key input
            const privateKeyInput = document.getElementById('fund-private-key');
            if (!privateKeyInput || !privateKeyInput.value.trim()) {
                throw new Error('Enter a funding wallet private key.');
            }
            fundingPrivateKey = privateKeyInput.value.trim();
        } else {
            // Use wallet address - find wallet in list
            const addressInput = document.getElementById('fund-wallet-address');
            if (!addressInput || !addressInput.value.trim()) {
                throw new Error('Enter a funding wallet address.');
            }
            const fundingAddress = addressInput.value.trim();

            // Validate address format
            try {
                if (window.solanaWeb3 && window.solanaWeb3.PublicKey) {
                    new window.solanaWeb3.PublicKey(fundingAddress);
                }
            } catch (error) {
                throw new Error('Invalid wallet address format. Please check and try again.');
            }

            // Find wallet in wallet list
            const wallets = typeof window.walletOperations?.getWallets === 'function' 
                ? window.walletOperations.getWallets()
                : [];

            fundingWallet = wallets.find(w => {
                const id = w.id || w.address || w.publicKey || w.pubkey;
                return id === fundingAddress;
            });

            if (!fundingWallet) {
                throw new Error('Funding wallet not found in your wallet list. Please import it first or use private key option.');
            }

            // Get private key from wallet
            fundingPrivateKey = fundingWallet.privateKey || fundingWallet.privateKeyArray;
            
            if (!fundingPrivateKey && window.apiClient) {
                try {
                    const exportResult = await window.apiClient.request('/wallets/export', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            walletIds: [fundingAddress],
                            includePrivateKey: true
                        })
                    });
                    
                    if (exportResult.success && exportResult.wallets && exportResult.wallets[0]) {
                        fundingPrivateKey = exportResult.wallets[0].privateKeyArray || exportResult.wallets[0].privateKey;
                    }
                } catch (exportError) {
                    console.warn('Failed to fetch funding wallet private key:', exportError);
                }
            }

            if (!fundingPrivateKey) {
                throw new Error('Funding wallet private key not available. Please re-import the wallet or use private key option.');
            }
        }

        // Convert private key to format needed
        let privateKeyString;
        if (Array.isArray(fundingPrivateKey)) {
            privateKeyString = JSON.stringify(fundingPrivateKey);
        } else if (typeof fundingPrivateKey === 'string') {
            try {
                JSON.parse(fundingPrivateKey);
                privateKeyString = fundingPrivateKey;
            } catch {
                if (window.bs58) {
                    const decoded = window.bs58.decode(fundingPrivateKey);
                    privateKeyString = JSON.stringify(Array.from(decoded));
                } else {
                    privateKeyString = fundingPrivateKey;
                }
            }
        } else {
            throw new Error('Invalid funding wallet private key format');
        }

        // Get wallet details
        const wallets = typeof window.walletOperations?.getWallets === 'function' 
            ? window.walletOperations.getWallets()
            : [];

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const walletId of walletIds) {
            const wallet = wallets.find(w => {
                const id = w.id || w.address || w.publicKey || w.pubkey;
                return id === walletId;
            });

            if (!wallet) {
                results.push({ walletId, success: false, error: 'Wallet not found' });
                failCount++;
                continue;
            }

            try {
                const walletAddress = wallet.address || wallet.publicKey || wallet.pubkey;
                if (!walletAddress) {
                    results.push({ walletId, success: false, error: 'Wallet address not found' });
                    failCount++;
                    continue;
                }

                // Calculate funding amount based on mode
                let fundingAmount = amount;
                if (mode === 'mixer') {
                    // Add small random variation for mixer mode
                    const variation = (Math.random() * 0.1 - 0.05) * amount; // ±5% variation
                    fundingAmount = Math.max(0.001, amount + variation);
                }

                // Execute transfer using Solana integration
                if (solanaIntegration && typeof solanaIntegration.transferSOL === 'function') {
                    const transferResult = await solanaIntegration.transferSOL(
                        privateKeyString,
                        walletAddress,
                        fundingAmount
                    );

                    if (transferResult.success) {
                        results.push({
                            walletId,
                            success: true,
                            amount: fundingAmount,
                            signature: transferResult.signature
                        });
                        successCount++;
                        addConsoleLog(
                            `✅ Funded ${wallet.name || walletId} with ${fundingAmount.toFixed(4)} SOL | tx: ${transferResult.signature.substring(0, 10)}...`,
                            'success'
                        );
                    } else {
                        results.push({ walletId, success: false, error: transferResult.error || 'Transfer failed' });
                        failCount++;
                        addConsoleLog(`❌ Funding failed for ${wallet.name || walletId}: ${transferResult.error}`, 'error');
                    }
                } else {
                    throw new Error('Solana integration not available');
                }

                // Small delay between transfers
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                results.push({ walletId, success: false, error: error.message });
                failCount++;
                addConsoleLog(`❌ Funding error for ${wallet.name || walletId}: ${error.message}`, 'error');
            }
        }

        notify(
            `Funding complete: ${successCount} successful, ${failCount} failed.`,
            failCount ? 'warning' : 'success'
        );

        // Reload wallets to update balances
        if (typeof window.loadWallets === 'function') {
            await window.loadWallets();
        }
    } catch (error) {
        console.error('executeFundWallets error:', error);
        notify(error.message || 'Funding failed. Check console for details.', 'error');
        addConsoleLog(`❌ Funding failed: ${error.message || error}`, 'error');
    } finally {
        if (button) {
            setButtonLoading(button, false);
        }
    }
});

registerGlobalHandler('selectTagExecutor', (executor) => {
    uiHelperState.tagExecutor = executor;
    const jitoBtn = getElement('tag-jito-btn');
    const rpcBtn = getElement('tag-rpc-btn');
    if (!jitoBtn || !rpcBtn) return;
    jitoBtn.classList.toggle('executor-pill--active', executor === 'jito');
    jitoBtn.classList.toggle('executor-pill--muted', executor !== 'jito');
    rpcBtn.classList.toggle('executor-pill--active', executor === 'rpc');
    rpcBtn.classList.toggle('executor-pill--muted', executor !== 'rpc');
    notify(`Tag executor switched to ${executor.toUpperCase()}`, 'info');
});

registerGlobalHandler('toggleTag', (tag) => {
    const button = document.querySelector(`[data-tag-button="${tag}"]`);
    if (!button) return;
    if (uiHelperState.tagFilters.has(tag)) {
        uiHelperState.tagFilters.delete(tag);
        button.classList.remove('tag-option--active');
    } else {
        uiHelperState.tagFilters.add(tag);
        button.classList.add('tag-option--active');
    }
    notify(`Tag filter updated: ${Array.from(uiHelperState.tagFilters).join(', ') || 'none'}`, 'info');
});
registerGlobalHandler('executeTagWallets', async () => {
    try {
        const walletIds = getSelectedWalletIds();
        if (walletIds.length === 0) {
            notify('Select at least one wallet from the table before tagging.', 'warning');
            return;
        }

        const selectedTags = Array.from(uiHelperState.tagFilters);
        if (selectedTags.length === 0) {
            notify('Choose at least one trading platform to tag before starting.', 'warning');
            return;
        }

        const minAmountInput = document.getElementById('tag-min-amount');
        const maxAmountInput = document.getElementById('tag-max-amount');
        const minAmount = parseFloat(minAmountInput?.value || '0');
        const maxAmount = parseFloat(maxAmountInput?.value || '0');

        if (!Number.isFinite(minAmount) || minAmount <= 0) {
            notify('Enter a valid minimum buy amount greater than zero.', 'error');
            return;
        }

        if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
            notify('Enter a valid maximum buy amount greater than zero.', 'error');
            return;
        }

        if (maxAmount < minAmount) {
            notify('Max buy amount must be greater than or equal to the minimum amount.', 'error');
            return;
        }

        const mintMode = document.querySelector('input[name="mint-selection"]:checked')?.value || 'auto';
        const method = document.querySelector('input[name="tag-method"]:checked')?.value || 'uniform';

        let mintCandidates = [];
        if (mintMode === 'custom') {
            mintCandidates = parseCustomMintList();
            if (mintCandidates.length === 0) {
                notify('Enter at least one mint address when using custom mint selection.', 'warning');
                return;
            }
        } else {
            notify('Fetching trending mints for tagging...', 'info');
            mintCandidates = await resolveAutoMintCandidates();
            if (mintCandidates.length === 0) {
                notify('Unable to load auto mint list. Please provide custom mints.', 'error');
                return;
            }
        }

        const payload = {
            walletIds,
            tags: selectedTags,
            minAmount,
            maxAmount,
            executor: uiHelperState.tagExecutor,
            method,
            mintMode,
            mintCandidates,
            sellDelaySeconds: 6
        };

        notify(`Tagging ${walletIds.length} wallet(s) via ${uiHelperState.tagExecutor.toUpperCase()} executor...`, 'info');
        addConsoleLog(`Tagging started for ${walletIds.length} wallet(s) with tags: ${selectedTags.join(', ')}`, 'info');

        const button = document.querySelector('#tag-page button[onclick="executeTagWallets()"]');
        if (button) {
            button.disabled = true;
            button.classList.add('opacity-60', 'cursor-not-allowed');
        }

        const response = await window.apiClient?.tagWallets(payload);

        if (!response) {
            throw new Error('No response from tagging endpoint');
        }

        if (response.success === false) {
            throw new Error(response.error || 'Tagging workflow reported failure');
        }

        const successes = (response.results || []).filter(result => result.success);
        const failures = (response.results || []).filter(result => !result.success);

        successes.forEach(result => {
            addConsoleLog(`✅ Tagged wallet ${result.walletId} via ${result.mint} (${result.solAmount} SOL)`, 'success');
        });

        failures.forEach(result => {
            addConsoleLog(`❌ Wallet ${result.walletId} tagging failed at ${result.stage || 'workflow'}: ${result.error}`, 'error');
        });

        notify(`Tagging complete: ${successes.length} success, ${failures.length} failed. Updating wallet metadata...`, failures.length ? 'warning' : 'success');

        if (typeof window.loadWallets === 'function') {
            await window.loadWallets();
        }
        if (typeof window.walletOperationsUpdateTagInfo === 'function') {
            window.walletOperationsUpdateTagInfo();
        }
        if (typeof window.walletOperationsUpdateBulkActions === 'function') {
            window.walletOperationsUpdateBulkActions();
        }

        notify('Wallet tags refreshed. Check GMGN/Photon dashboards to confirm.', failures.length ? 'warning' : 'success');
    } catch (error) {
        console.error('executeTagWallets error:', error);
        notify(error.message || 'Tagging workflow failed. Check console for details.', 'error');
        addConsoleLog(`❌ Tagging failed: ${error.message || error}`, 'error');
    } finally {
        const button = document.querySelector('#tag-page button[onclick="executeTagWallets()"]');
        if (button) {
            button.disabled = false;
            button.classList.remove('opacity-60', 'cursor-not-allowed');
        }
    }
});

registerGlobalHandler('executeWarmWallets', async () => {
    const button = document.querySelector('#warm-page button[onclick="executeWarmWallets()"]');
    try {
        const walletIds = getSelectedWalletIds();
        if (!walletIds.length) {
            notify('Select at least one wallet from the table before warming.', 'warning');
            return;
        }

        const minSwapsInput = document.getElementById('warm-min-swaps');
        const maxSwapsInput = document.getElementById('warm-max-swaps');
        const minAmountInput = document.getElementById('warm-min-amount');
        const maxAmountInput = document.getElementById('warm-max-amount');
        const minDelayInput = document.getElementById('warm-min-delay');
        const maxDelayInput = document.getElementById('warm-max-delay');

        const minSwaps = parseInt(minSwapsInput?.value, 10);
        const maxSwaps = parseInt(maxSwapsInput?.value, 10);
        const minAmount = parseFloat(minAmountInput?.value);
        const maxAmount = parseFloat(maxAmountInput?.value);
        const minDelay = parseInt(minDelayInput?.value, 10);
        const maxDelay = parseInt(maxDelayInput?.value, 10);

        if (!Number.isFinite(minSwaps) || minSwaps <= 0) {
            notify('Enter a valid minimum swap count greater than zero.', 'error');
            return;
        }
        if (!Number.isFinite(maxSwaps) || maxSwaps <= 0) {
            notify('Enter a valid maximum swap count greater than zero.', 'error');
            return;
        }
        if (maxSwaps < minSwaps) {
            notify('Max swaps must be greater than or equal to min swaps.', 'error');
            return;
        }

        if (!Number.isFinite(minAmount) || minAmount <= 0) {
            notify('Enter a valid minimum buy amount greater than zero.', 'error');
            return;
        }
        if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
            notify('Enter a valid maximum buy amount greater than zero.', 'error');
            return;
        }
        if (maxAmount < minAmount) {
            notify('Max buy amount must be greater than or equal to the minimum amount.', 'error');
            return;
        }

        if (!Number.isFinite(minDelay) || minDelay < 0) {
            notify('Enter a valid minimum delay (seconds).', 'error');
            return;
        }
        if (!Number.isFinite(maxDelay) || maxDelay < 0) {
            notify('Enter a valid maximum delay (seconds).', 'error');
            return;
        }
        if (maxDelay < minDelay) {
            notify('Max delay must be greater than or equal to min delay.', 'error');
            return;
        }

        const mintMode = document.querySelector('input[name="mint-warm"]:checked')?.value || 'auto';
        let mintCandidates = [];

        if (mintMode === 'custom') {
            mintCandidates = parseWarmCustomMintList();
            if (mintCandidates.length === 0) {
                notify('Enter at least one mint address when using custom mint selection.', 'warning');
                return;
            }
        } else {
            notify('Fetching trending mints for warming...', 'info');
            mintCandidates = await resolveAutoMintCandidates();
            if (mintCandidates.length === 0) {
                notify('Unable to load auto mint list. Please provide custom mints.', 'error');
                return;
            }
        }

        const payload = {
            walletIds,
            executor: uiHelperState.warmExecutor,
            minSwaps,
            maxSwaps,
            minAmount,
            maxAmount,
            minDelay,
            maxDelay,
            mintMode,
            mintCandidates,
            priorityFee: 7500,
            slippage: 2.5
        };

        notify(`Warming ${walletIds.length} wallet(s) via ${uiHelperState.warmExecutor.toUpperCase()} executor...`, 'info');
        addConsoleLog(
            `Warming initiated for ${walletIds.length} wallet(s) | Swaps: ${minSwaps}-${maxSwaps} | Amount: ${minAmount}-${maxAmount} SOL`,
            'info'
        );

        if (button) {
            setButtonLoading(button, true, 'Warming...');
        }

        const response = await window.apiClient?.warmWallets(payload);

        if (!response) {
            throw new Error('No response from warming endpoint');
        }

        if (response.success === false) {
            throw new Error(response.error || 'Warming workflow reported failure');
        }

        const results = Array.isArray(response.results) ? response.results : [];
        const successes = results.filter(result => result.success);
        const failures = results.filter(result => !result.success);

        successes.forEach(result => {
            const swapInfo = `wallet ${result.walletId} | swap #${result.swapIndex + 1} | ${result.solAmount} SOL -> ${result.mint}`;
            const signatureInfo = result.buy?.signature || result.sell?.signature
                ? ` | tx: ${(result.sell?.signature || result.buy?.signature).slice(0, 10)}…`
                : '';
            addConsoleLog(`✅ Warmed ${swapInfo}${signatureInfo}`, 'success');
        });

        failures.forEach(result => {
            const stage = result.stage || 'workflow';
            addConsoleLog(`❌ Warm swap failed for wallet ${result.walletId} at ${stage}: ${result.error}`, 'error');
        });

        notify(
            `Warming complete: ${successes.length} successful swap${successes.length === 1 ? '' : 's'}, ${failures.length} failed.`,
            failures.length ? 'warning' : 'success'
        );

        if (typeof window.loadWallets === 'function') {
            await window.loadWallets();
        }
    } catch (error) {
        console.error('executeWarmWallets error:', error);
        notify(error.message || 'Warming workflow failed. Check console for details.', 'error');
        addConsoleLog(`❌ Warming failed: ${error.message || error}`, 'error');
    } finally {
        if (button) {
            setButtonLoading(button, false);
        }
    }
});

function getSelectedWalletIds() {
    if (typeof window.walletOperationsGetSelectedWalletIds === 'function') {
        return window.walletOperationsGetSelectedWalletIds();
    }
    if (window.walletOperations && typeof window.walletOperations.getSelectedWalletIds === 'function') {
        return window.walletOperations.getSelectedWalletIds();
    }
    return [];
}

// Withdraw Wallets Implementation
registerGlobalHandler('executeWithdrawWallets', async () => {
    const button = document.querySelector('#withdraw-page button[onclick="executeWithdrawWallets()"]');
    try {
        const walletIds = getSelectedWalletIds();
        if (!walletIds.length) {
            notify('Select at least one wallet from the table before withdrawing.', 'warning');
            return;
        }

        const destinationInput = document.getElementById('withdraw-destination');
        if (!destinationInput || !destinationInput.value.trim()) {
            notify('Enter a destination wallet address.', 'error');
            return;
        }

        const destinationAddress = destinationInput.value.trim();
        
        // Validate Solana address format
        try {
            if (window.solanaWeb3 && window.solanaWeb3.PublicKey) {
                new window.solanaWeb3.PublicKey(destinationAddress);
            }
        } catch (error) {
            notify('Invalid destination wallet address. Please check and try again.', 'error');
            return;
        }

        const method = document.querySelector('input[name="withdraw-method"]:checked')?.value || 'uniform-percentage';
        const percentageInput = document.getElementById('withdraw-percentage');
        const percentage = percentageInput ? parseFloat(percentageInput.value) : 100;

        if (method.includes('percentage') && (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100)) {
            notify('Enter a valid percentage between 1 and 100.', 'error');
            return;
        }

        notify(`Withdrawing from ${walletIds.length} wallet(s) to ${destinationAddress.substring(0, 8)}...`, 'info');
        addConsoleLog(`Starting withdraw: ${walletIds.length} wallet(s) -> ${destinationAddress}`, 'info');

        if (button) {
            setButtonLoading(button, true, 'Withdrawing...');
        }

        // Get wallet details
        const wallets = typeof window.walletOperations?.getWallets === 'function' 
            ? window.walletOperations.getWallets()
            : [];

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const walletId of walletIds) {
            const wallet = wallets.find(w => {
                const id = w.id || w.address || w.publicKey || w.pubkey;
                return id === walletId;
            });

            if (!wallet) {
                results.push({ walletId, success: false, error: 'Wallet not found' });
                failCount++;
                continue;
            }

            try {
                // Get current balance
                const balance = wallet.balance || 0;
                if (balance <= 0.001) {
                    results.push({ walletId, success: false, error: 'Insufficient balance (minimum 0.001 SOL required)' });
                    failCount++;
                    continue;
                }

                // Calculate withdraw amount
                let withdrawAmount;
                if (method.includes('percentage')) {
                    withdrawAmount = (balance * percentage) / 100;
                } else {
                    // For uniform-amount or specific-amount, use percentage input as fixed amount
                    withdrawAmount = percentage;
                }

                // Reserve 0.001 SOL for rent
                const availableAmount = balance - 0.001;
                if (withdrawAmount > availableAmount) {
                    withdrawAmount = availableAmount;
                }

                if (withdrawAmount <= 0) {
                    results.push({ walletId, success: false, error: 'No withdrawable balance after rent reserve' });
                    failCount++;
                    continue;
                }

                // Get wallet private key for transfer
                let privateKey = wallet.privateKey || wallet.privateKeyArray;
                
                // If private key not available, fetch from API
                if (!privateKey && window.apiClient) {
                    try {
                        const exportResult = await window.apiClient.request('/wallets/export', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                walletIds: [walletId],
                                includePrivateKey: true
                            })
                        });
                        
                        if (exportResult.success && exportResult.wallets && exportResult.wallets[0]) {
                            privateKey = exportResult.wallets[0].privateKeyArray || exportResult.wallets[0].privateKey;
                        }
                    } catch (exportError) {
                        console.warn('Failed to fetch private key from API:', exportError);
                    }
                }
                
                if (!privateKey) {
                    results.push({ walletId, success: false, error: 'Private key not available. Wallet may need to be re-imported.' });
                    failCount++;
                    continue;
                }

                // Convert private key to format needed
                let privateKeyString;
                if (Array.isArray(privateKey)) {
                    privateKeyString = JSON.stringify(privateKey);
                } else if (typeof privateKey === 'string') {
                    // Check if it's base58 or JSON string
                    try {
                        JSON.parse(privateKey);
                        privateKeyString = privateKey; // Already JSON string
                    } catch {
                        // Assume base58, convert to array format for solana integration
                        if (window.bs58) {
                            const decoded = window.bs58.decode(privateKey);
                            privateKeyString = JSON.stringify(Array.from(decoded));
                        } else {
                            privateKeyString = privateKey; // Try as-is
                        }
                    }
                } else {
                    results.push({ walletId, success: false, error: 'Invalid private key format' });
                    failCount++;
                    continue;
                }

                // Execute transfer using Solana integration
                if (solanaIntegration && typeof solanaIntegration.transferSOL === 'function') {
                    const transferResult = await solanaIntegration.transferSOL(
                        privateKeyString,
                        destinationAddress,
                        withdrawAmount
                    );

                    if (transferResult.success) {
                        results.push({
                            walletId,
                            success: true,
                            amount: withdrawAmount,
                            signature: transferResult.signature
                        });
                        successCount++;
                        addConsoleLog(
                            `✅ Withdrew ${withdrawAmount.toFixed(4)} SOL from ${wallet.name || walletId} | tx: ${transferResult.signature.substring(0, 10)}...`,
                            'success'
                        );
                    } else {
                        results.push({ walletId, success: false, error: transferResult.error || 'Transfer failed' });
                        failCount++;
                        addConsoleLog(`❌ Withdraw failed for ${wallet.name || walletId}: ${transferResult.error}`, 'error');
                    }
                } else {
                    throw new Error('Solana integration not available');
                }

                // Small delay between transfers
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                results.push({ walletId, success: false, error: error.message });
                failCount++;
                addConsoleLog(`❌ Withdraw error for ${wallet.name || walletId}: ${error.message}`, 'error');
            }
        }

        notify(
            `Withdraw complete: ${successCount} successful, ${failCount} failed.`,
            failCount ? 'warning' : 'success'
        );

        // Reload wallets to update balances
        if (typeof window.loadWallets === 'function') {
            await window.loadWallets();
        }
    } catch (error) {
        console.error('executeWithdrawWallets error:', error);
        notify(error.message || 'Withdraw failed. Check console for details.', 'error');
        addConsoleLog(`❌ Withdraw failed: ${error.message || error}`, 'error');
    } finally {
        if (button) {
            setButtonLoading(button, false);
        }
    }
});

// Redistribute Wallets Implementation
registerGlobalHandler('executeRedistributeWallets', async () => {
    const button = document.querySelector('#redistribute-page button[onclick="executeRedistributeWallets()"]');
    try {
        const walletIds = getSelectedWalletIds();
        if (walletIds.length < 2) {
            notify('Select at least 2 wallets to redistribute balances.', 'warning');
            return;
        }

        const mode = document.getElementById('redistribute-standard-mode')?.classList.contains('border-white')
            ? 'standard'
            : 'mixer';

        notify(`Redistributing balances across ${walletIds.length} wallet(s) (${mode} mode)...`, 'info');
        addConsoleLog(`Starting redistribution: ${walletIds.length} wallet(s) | Mode: ${mode}`, 'info');

        if (button) {
            setButtonLoading(button, true, 'Redistributing...');
        }

        // Get wallet details
        const wallets = typeof window.walletOperations?.getWallets === 'function' 
            ? window.walletOperations.getWallets()
            : [];

        const selectedWallets = walletIds.map(walletId => {
            return wallets.find(w => {
                const id = w.id || w.address || w.publicKey || w.pubkey;
                return id === walletId;
            });
        }).filter(Boolean);

        if (selectedWallets.length < 2) {
            throw new Error('Could not find at least 2 wallets');
        }

        // Calculate total balance and target per wallet
        const totalBalance = selectedWallets.reduce((sum, w) => sum + (w.balance || 0), 0);
        const targetBalance = totalBalance / selectedWallets.length;
        const minBalance = 0.001; // Reserve for rent

        // Calculate transfers needed
        const transfers = [];
        const receivers = [];
        const senders = [];

        selectedWallets.forEach(wallet => {
            const balance = wallet.balance || 0;
            const difference = balance - targetBalance;

            if (difference > minBalance) {
                // This wallet has excess, needs to send
                senders.push({
                    wallet,
                    excess: difference,
                    amount: difference - minBalance // Leave some for fees
                });
            } else if (difference < -minBalance) {
                // This wallet needs funds
                receivers.push({
                    wallet,
                    needed: Math.abs(difference)
                });
            }
        });

        // Match senders to receivers
        let senderIndex = 0;
        let receiverIndex = 0;
        const results = [];
        let successCount = 0;
        let failCount = 0;

        while (senderIndex < senders.length && receiverIndex < receivers.length) {
            const sender = senders[senderIndex];
            const receiver = receivers[receiverIndex];

            const transferAmount = Math.min(sender.amount, receiver.needed);

            if (transferAmount < 0.001) {
                // Too small to transfer
                if (sender.amount <= receiver.needed) {
                    senderIndex++;
                } else {
                    receiverIndex++;
                }
                continue;
            }

            try {
                let privateKey = sender.wallet.privateKey || sender.wallet.privateKeyArray;
                
                // If private key not available, fetch from API
                if (!privateKey && window.apiClient) {
                    try {
                        const senderWalletId = sender.wallet.id || sender.wallet.address || sender.wallet.publicKey;
                        const exportResult = await window.apiClient.request('/wallets/export', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                walletIds: [senderWalletId],
                                includePrivateKey: true
                            })
                        });
                        
                        if (exportResult.success && exportResult.wallets && exportResult.wallets[0]) {
                            privateKey = exportResult.wallets[0].privateKeyArray || exportResult.wallets[0].privateKey;
                        }
                    } catch (exportError) {
                        console.warn('Failed to fetch private key from API:', exportError);
                    }
                }
                
                if (!privateKey) {
                    results.push({
                        from: sender.wallet.id || sender.wallet.publicKey,
                        to: receiver.wallet.id || receiver.wallet.publicKey,
                        success: false,
                        error: 'Private key not available. Wallet may need to be re-imported.'
                    });
                    failCount++;
                    senderIndex++;
                    continue;
                }

                let privateKeyString;
                if (Array.isArray(privateKey)) {
                    privateKeyString = JSON.stringify(privateKey);
                } else if (typeof privateKey === 'string') {
                    // Check if it's base58 or JSON string
                    try {
                        JSON.parse(privateKey);
                        privateKeyString = privateKey; // Already JSON string
                    } catch {
                        // Assume base58, convert to array format for solana integration
                        if (window.bs58) {
                            const decoded = window.bs58.decode(privateKey);
                            privateKeyString = JSON.stringify(Array.from(decoded));
                        } else {
                            privateKeyString = privateKey; // Try as-is
                        }
                    }
                } else {
                    results.push({
                        from: sender.wallet.id || sender.wallet.publicKey,
                        to: receiver.wallet.id || receiver.wallet.publicKey,
                        success: false,
                        error: 'Invalid private key format'
                    });
                    failCount++;
                    senderIndex++;
                    continue;
                }

                const receiverAddress = receiver.wallet.address || receiver.wallet.publicKey || receiver.wallet.pubkey;

                if (solanaIntegration && typeof solanaIntegration.transferSOL === 'function') {
                    const transferResult = await solanaIntegration.transferSOL(
                        privateKeyString,
                        receiverAddress,
                        transferAmount
                    );

                    if (transferResult.success) {
                        results.push({
                            from: sender.wallet.id || sender.wallet.publicKey,
                            to: receiver.wallet.id || receiver.wallet.publicKey,
                            success: true,
                            amount: transferAmount,
                            signature: transferResult.signature
                        });
                        successCount++;
                        addConsoleLog(
                            `✅ Redistributed ${transferAmount.toFixed(4)} SOL | ${sender.wallet.name || 'Wallet'} -> ${receiver.wallet.name || 'Wallet'} | tx: ${transferResult.signature.substring(0, 10)}...`,
                            'success'
                        );

                        // Update amounts
                        sender.amount -= transferAmount;
                        receiver.needed -= transferAmount;

                        if (sender.amount < 0.001) {
                            senderIndex++;
                        }
                        if (receiver.needed < 0.001) {
                            receiverIndex++;
                        }
                    } else {
                        results.push({
                            from: sender.wallet.id || sender.wallet.publicKey,
                            to: receiver.wallet.id || receiver.wallet.publicKey,
                            success: false,
                            error: transferResult.error || 'Transfer failed'
                        });
                        failCount++;
                        senderIndex++;
                    }
                } else {
                    throw new Error('Solana integration not available');
                }

                // Delay between transfers (longer for mixer mode)
                const delay = mode === 'mixer' ? 2000 + Math.random() * 3000 : 500;
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (error) {
                results.push({
                    from: sender.wallet.id || sender.wallet.publicKey,
                    to: receiver.wallet.id || receiver.wallet.publicKey,
                    success: false,
                    error: error.message
                });
                failCount++;
                senderIndex++;
                addConsoleLog(`❌ Redistribution error: ${error.message}`, 'error');
            }
        }

        notify(
            `Redistribution complete: ${successCount} successful transfer${successCount === 1 ? '' : 's'}, ${failCount} failed.`,
            failCount ? 'warning' : 'success'
        );

        // Reload wallets to update balances
        if (typeof window.loadWallets === 'function') {
            await window.loadWallets();
        }
    } catch (error) {
        console.error('executeRedistributeWallets error:', error);
        notify(error.message || 'Redistribution failed. Check console for details.', 'error');
        addConsoleLog(`❌ Redistribution failed: ${error.message || error}`, 'error');
    } finally {
        if (button) {
            setButtonLoading(button, false);
        }
    }
});

function parseCustomMintList() {
    const textarea = document.getElementById('tag-custom-mints');
    if (!textarea) return [];

    const entries = textarea.value
        .split(/\r?\n|,/)
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);

    const unique = Array.from(new Set(entries));
    return unique.map(mint => ({ mint, source: 'custom' }));
}

function parseWarmCustomMintList() {
    const textarea = document.getElementById('warm-custom-mints');
    if (textarea) {
        const entries = textarea.value
            .split(/\r?\n|,/)
            .map(entry => entry.trim())
            .filter(Boolean);
        const unique = Array.from(new Set(entries));
        return unique.map(mint => ({ mint, source: 'custom' }));
    }

    // Fallback to tagging custom mint parser if warm-specific textarea not present
    return parseCustomMintList();
}

async function resolveAutoMintCandidates(limit = 40) {
    const candidates = new Map();

    if (window.apiClient && typeof window.apiClient.getTrendingTokens === 'function') {
        try {
            const trending = await window.apiClient.getTrendingTokens(limit);
            const tokens = trending?.tokens || [];
            tokens.forEach(token => {
                if (token?.mint) {
                    candidates.set(token.mint, {
                        mint: token.mint,
                        symbol: token.symbol || null,
                        source: 'pumpfun'
                    });
                }
            });
        } catch (error) {
            console.warn('Trending mint fetch failed:', error);
            addConsoleLog(`⚠️ Unable to fetch PumpFun trending tokens: ${error.message}`, 'warning');
        }
    }

    if (candidates.size < limit && window.apiClient && typeof window.apiClient.getJupiterTokens === 'function') {
        try {
            const tokenList = await window.apiClient.getJupiterTokens();
            const tokens = tokenList?.tokens || [];
            for (const token of tokens) {
                if (!token?.address) continue;
                if (token.verified !== undefined && token.verified === false) continue;
                if (!candidates.has(token.address)) {
                    candidates.set(token.address, {
                        mint: token.address,
                        symbol: token.symbol || null,
                        decimals: token.decimals,
                        source: 'jupiter'
                    });
                }
                if (candidates.size >= limit) break;
            }
        } catch (error) {
            console.warn('Jupiter token fetch failed:', error);
            addConsoleLog(`⚠️ Unable to fetch Jupiter token list: ${error.message}`, 'warning');
        }
    }

    return Array.from(candidates.values());
}

registerGlobalHandler('selectWarmExecutor', (executor) => {
    uiHelperState.warmExecutor = executor;
    const jitoBtn = getElement('warm-jito-btn');
    const rpcBtn = getElement('warm-rpc-btn');
    if (!jitoBtn || !rpcBtn) return;
    jitoBtn.classList.toggle('bg-purple-600', executor === 'jito');
    jitoBtn.classList.toggle('bg-neutral-800', executor !== 'jito');
    rpcBtn.classList.toggle('bg-purple-600', executor === 'rpc');
    rpcBtn.classList.toggle('bg-neutral-800', executor !== 'rpc');
    notify(`Warm executor set to ${executor.toUpperCase()}`, 'info');
});

registerGlobalHandler('selectRedistributeMode', (mode) => {
    uiHelperState.redistributeMode = mode;
    applyToggleClasses('redistribute-standard-mode', 'redistribute-mixer-mode', mode === 'standard');
    notify(`Redistribution mode set to ${mode.toUpperCase()}`, 'info');
});

registerGlobalHandler('switchTokenTab', (tab) => {
    const activeBtn = getElement('token-active-tab');
    const archivedBtn = getElement('token-archived-tab');
    const deleteBtn = getElement('delete-tokens-btn');
    const showActive = tab === 'Active';
    activeBtn?.classList.toggle('bg-neutral-700', showActive);
    activeBtn?.classList.toggle('text-white', showActive);
    archivedBtn?.classList.toggle('bg-neutral-700', !showActive);
    archivedBtn?.classList.toggle('text-white', !showActive);
    uiHelperState.tokenFilter = showActive ? 'active' : 'archived';
    
    // Show/hide Delete Token button only in Archived tab
    if (deleteBtn) {
        if (showActive) {
            deleteBtn.classList.add('hidden');
            // Exit delete mode when switching to Active
            exitDeleteTokenMode();
        } else {
            deleteBtn.classList.remove('hidden');
        }
    }
    
    renderTokensTable();
    notify(`Switched to ${tab} tokens`, 'info');
});

registerGlobalHandler('selectTokenPlatform', (platform, options = {}) => {
    const silent = typeof options === 'object' && options !== null && options.silent;
    uiHelperState.tokenPlatform = platform;
    const pumpBtn = getElement('create-pumpfun-btn');
    const raydiumBtn = getElement('create-raydium-btn');
    if (!pumpBtn || !raydiumBtn) return;
    pumpBtn.classList.toggle('border-white', platform === 'pumpfun');
    pumpBtn.classList.toggle('bg-white', platform === 'pumpfun');
    pumpBtn.classList.toggle('text-black', platform === 'pumpfun');
    raydiumBtn.classList.toggle('border-white', platform === 'raydium');
    raydiumBtn.classList.toggle('bg-white', platform === 'raydium');
    raydiumBtn.classList.toggle('text-black', platform === 'raydium');
    if (!silent) {
        notify(`Token platform set to ${platform}`, 'info');
    }
});

registerGlobalHandler('selectCopyPlatform', (platform) => {
    uiHelperState.copyPlatform = platform;
    const pumpBtn = getElement('copy-pumpfun-btn');
    const raydiumBtn = getElement('copy-raydium-btn');
    pumpBtn?.classList.toggle('border-white', platform === 'pumpfun');
    pumpBtn?.classList.toggle('bg-white', platform === 'pumpfun');
    pumpBtn?.classList.toggle('text-black', platform === 'pumpfun');
    raydiumBtn?.classList.toggle('border-white', platform === 'raydium');
    raydiumBtn?.classList.toggle('bg-white', platform === 'raydium');
    raydiumBtn?.classList.toggle('text-black', platform === 'raydium');
    notify(`Copy platform set to ${platform}`, 'info');
});

registerGlobalHandler('selectBlockZeroMode', (mode) => {
    const normalized = mode || 'quick';
    tokenLaunchState.launchConfig.blockZero.mode = normalized;
    uiHelperState.blockZeroMode = normalized;
    updateBlockZeroModeUI();
    renderBlockZeroWalletList();
    notify(`Block zero mode set to ${normalized}`, 'info');
});

registerGlobalHandler('openCreateBlueprintModal', openCreateBlueprintModal);
registerGlobalHandler('submitBlueprintForm', submitBlueprintForm);
registerGlobalHandler('applyBlueprint', applyBlueprint);
registerGlobalHandler('deleteBlueprint', deleteBlueprint);
registerGlobalHandler('openAutomationBlueprintModal', openAutomationBlueprintModal);
registerGlobalHandler('runAutomationBlueprint', runAutomationBlueprint);
registerGlobalHandler('runAutomationBlueprintFromButton', runAutomationBlueprintFromButton);
registerGlobalHandler('saveVanityKeys', saveVanityKeys);
registerGlobalHandler('clearVanityInput', clearVanityInput);
registerGlobalHandler('scrollToVanityForm', scrollToVanityForm);
registerGlobalHandler('renderVanityList', renderVanityList);
registerGlobalHandler('setVanityFilter', setVanityFilter);
registerGlobalHandler('archiveUsedVanities', archiveUsedVanities);
registerGlobalHandler('requestMoreVanities', requestMoreVanities);
registerGlobalHandler('toggleVanityKeyVisibility', toggleVanityKeyVisibility);
registerGlobalHandler('copyVanityAddress', copyVanityAddress);
registerGlobalHandler('copyVanityPrivateKey', copyVanityPrivateKey);
registerGlobalHandler('markVanityStatus', markVanityStatus);
registerGlobalHandler('uploadTokenImage', uploadTokenImage);

registerGlobalHandler('uploadTokenImage', () => {
    notify('Image upload coming soon. Email chaosbot support to whitelist.', 'warning');
});

function focusAutomationSection() {
    const section = getElement('launch-automations-section');
    if (!section) return;

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const originalShadow = section.style.boxShadow;
    section.style.transition = section.style.transition || 'box-shadow 0.3s ease';
    section.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.6)';
    setTimeout(() => {
        section.style.boxShadow = originalShadow || 'none';
    }, 1600);
}

function configureAutomationOptions(options = {}) {
    if (typeof options.smartSell === 'boolean') {
        const smartSellToggle = getElement('enable-smart-sell');
        if (smartSellToggle) {
            smartSellToggle.checked = options.smartSell;
            if (typeof toggleSmartSellConfig === 'function') {
                toggleSmartSellConfig();
            }
        }
    }

    if (typeof options.volumeBot === 'boolean') {
        const volumeToggle = getElement('enable-volume-bot');
        if (volumeToggle) {
            volumeToggle.checked = options.volumeBot;
            if (typeof toggleVolumeBotConfig === 'function') {
                toggleVolumeBotConfig();
            }
        }
    }
}

let vanityLaunchStatsRefreshPromise = null;

function persistTokenDrafts() {
    try {
        const drafts = Array.from(tokenRegistry.drafts.values()).map((draft) => ({
            id: draft.id,
            name: draft.name || '',
            symbol: draft.symbol || '',
            description: draft.description || '',
            website: draft.website || '',
            twitter: draft.twitter || '',
            telegram: draft.telegram || '',
            image: draft.image || null,
            imageUri: draft.imageUri || null,
            platform: draft.platform || 'pumpfun',
            status: draft.status || 'PRE-LAUNCH',
            type: 'draft',
            useVanity: Boolean(draft.useVanity),
            automations: draft.automations || {},
            automationsEnabled: draft.automationsEnabled || {},
            launchConfig: serializeLaunchConfig(draft.launchConfig),
            creatorWalletId: draft.creatorWalletId || '',
            creatorWallet: draft.creatorWallet || '',
            creatorWalletLabel: draft.creatorWalletLabel || '',
            createdAt: draft.createdAt || Date.now(),
            updatedAt: draft.updatedAt || Date.now(),
            initialBuyAmount: draft.initialBuyAmount ?? null,
            metadata: draft.metadata || null,
            metadataUri: draft.metadataUri || null,
            notes: draft.notes || '',
            archived: Boolean(draft.archived)
        }));

        localStorage.setItem(TOKEN_DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    } catch (error) {
        console.error('Error persisting token drafts:', error);
    }
}

function loadTokenDraftsFromStorage() {
    tokenRegistry.drafts.clear();

    try {
        const raw = localStorage.getItem(TOKEN_DRAFT_STORAGE_KEY);
        if (!raw) {
            renderTokensTable();
            return;
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            renderTokensTable();
            return;
        }

        parsed.forEach((entry) => {
            if (!entry) return;
            const id = entry.id || entry.draftId;
            if (!id) return;

            const record = {
                id,
                type: 'draft',
                status: entry.status || 'PRE-LAUNCH',
                name: entry.name || '',
                symbol: entry.symbol || '',
                description: entry.description || '',
                website: entry.website || '',
                twitter: entry.twitter || '',
                telegram: entry.telegram || '',
                image: resolveImageUrl(entry.image) || resolveImageUrl(entry.imageUri) || null,
                imageUri: entry.imageUri || null,
                platform: entry.platform || 'pumpfun',
                useVanity: Boolean(entry.useVanity),
                automations: entry.automations || {},
                automationsEnabled: entry.automationsEnabled || {},
                launchConfig: cloneLaunchConfig(entry.launchConfig || entry.launchOptions || null),
                creatorWalletId: entry.creatorWalletId || '',
                creatorWallet: entry.creatorWallet || '',
                creatorWalletLabel: entry.creatorWalletLabel || '',
                createdAt: entry.createdAt || Date.now(),
                updatedAt: entry.updatedAt || entry.createdAt || Date.now(),
                initialBuyAmount: safeNumber(entry.initialBuyAmount),
                metadata: entry.metadata || null,
                metadataUri: entry.metadataUri || null,
            notes: entry.notes || '',
            archived: Boolean(entry.archived)
            };

            tokenRegistry.drafts.set(record.id, record);
        });
    } catch (error) {
        console.error('Error loading token drafts:', error);
        tokenRegistry.drafts.clear();
    }

    renderTokensTable();
}

function registerTokenDraft(record = {}) {
    if (!record || !record.id) {
        return;
    }

    const existing = tokenRegistry.drafts.get(record.id) || {};
    const merged = {
        ...existing,
        ...record,
        id: record.id,
        type: 'draft',
        status: record.status || 'PRE-LAUNCH',
        updatedAt: Date.now(),
        launchConfig: cloneLaunchConfig(record.launchConfig || existing.launchConfig),
        createdAt: existing.createdAt || record.createdAt || Date.now(),
        archived: Boolean(record.archived ?? existing.archived)
    };

    if (merged.imageUri && !merged.image) {
        merged.image = resolveImageUrl(merged.imageUri);
    }

    tokenRegistry.drafts.set(merged.id, merged);
    persistTokenDrafts();
    renderTokensTable();
}

function removeTokenDraft(draftId) {
    if (!draftId) {
        return;
    }

    if (tokenRegistry.drafts.delete(draftId)) {
        persistTokenDrafts();
        renderTokensTable();
    }
}

function persistVanityLaunchStore() {
    try {
        localStorage.setItem(VANITY_LAUNCH_STORAGE_KEY, JSON.stringify(vanityLaunchStore));
    } catch (error) {
        console.error('Error persisting vanity launches:', error);
    }
}

function loadVanityLaunchesFromStorage() {
    try {
        const saved = localStorage.getItem(VANITY_LAUNCH_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            vanityLaunchStore = Array.isArray(parsed)
                ? parsed
                      .map((entry) => ({
                          id: entry.id || `launch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                          tokenMint: entry.tokenMint,
                          name: entry.name || '',
                          symbol: entry.symbol || '',
                          platform: entry.platform || 'pumpfun',
                          logo: resolveImageUrl(entry.logo) || null,
                          metadataUri: entry.metadataUri || null,
                          creatorWallet: entry.creatorWallet || entry.creatorWalletAddress || '',
                          creatorWalletLabel: entry.creatorWalletLabel || entry.creatorWalletName || '',
                          creatorWalletId: entry.creatorWalletId || '',
                          launchedAt: normalizeTimestamp(entry.launchedAt) || null,
                          initialBuyAmount: safeNumber(entry.initialBuyAmount),
                          stats: entry.stats || null,
                          lastStatsUpdated: normalizeTimestamp(entry.lastStatsUpdated) || null
                      }))
                      .filter((entry) => Boolean(entry.tokenMint))
                : [];
        } else {
            vanityLaunchStore = [];
        }
    } catch (error) {
        console.error('Error loading vanity launches:', error);
        vanityLaunchStore = [];
    }

    renderVanityLaunchList();
}
function renderVanityLaunchList() {
    const container = getElement('vanity-launches-container');
    const countEl = getElement('vanity-launches-count');

    if (countEl) {
        const count = Array.isArray(vanityLaunchStore) ? vanityLaunchStore.length : 0;
        countEl.textContent = `${count} launch${count === 1 ? '' : 'es'}`;
    }

    if (!container) {
        return;
    }

    if (!Array.isArray(vanityLaunchStore) || vanityLaunchStore.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-sm text-gray-500">No token launches recorded yet</div>';
        return;
    }

    const entries = [...vanityLaunchStore].sort((a, b) => (b.launchedAt || 0) - (a.launchedAt || 0));

    const rows = entries
        .map((entry) => {
            const stats = entry.stats || {};
            const logoUrl = resolveImageUrl(entry.logo || stats.image);
            const symbol = entry.symbol || '';
            const name = entry.name || symbol || 'Unnamed Token';
            const creatorAddress = entry.creatorWallet || '';
            const creatorLabel = entry.creatorWalletLabel || '';
            const mintedAt = entry.launchedAt ? formatTimestamp(entry.launchedAt) : '—';
            const lastUpdatedRelative = entry.lastStatsUpdated ? formatRelativeTime(entry.lastStatsUpdated) : null;

            const performanceLines = [];
            if (safeNumber(stats.priceUsd) !== null) {
                performanceLines.push(`<span class="text-gray-400">Price</span> ${formatUSD(stats.priceUsd)}`);
            }
            if (safeNumber(stats.marketCapUsd) !== null) {
                performanceLines.push(`<span class="text-gray-400">MC</span> ${formatUSD(stats.marketCapUsd)}`);
            }
            if (safeNumber(stats.volume24hUsd) !== null) {
                performanceLines.push(`<span class="text-gray-400">24h Vol</span> ${formatUSD(stats.volume24hUsd)}`);
            }
            if (safeNumber(stats.virtualSolReserves) !== null) {
                performanceLines.push(`<span class="text-gray-400">Virtual SOL</span> ${formatSol(stats.virtualSolReserves)}`);
            }
            if (!performanceLines.length) {
                performanceLines.push('<span class="text-gray-500">Performance data unavailable</span>');
            }

            const performanceHtml = performanceLines.map((line) => `<div>${line}</div>`).join('');

            const updatedHtml = lastUpdatedRelative
                ? `<div class="text-xs text-gray-500 mt-2">Updated ${escapeHtml(lastUpdatedRelative)}</div>`
                : '';

            const statusBadge =
                typeof stats.isComplete === 'boolean'
                    ? `<span class="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded ${
                          stats.isComplete ? 'bg-emerald-900/60 text-emerald-200' : 'bg-blue-900/60 text-blue-200'
                      }">${stats.isComplete ? 'Complete' : 'Bonding'}</span>`
                    : '';

            const initialBuyBadge =
                safeNumber(entry.initialBuyAmount) !== null
                    ? `<span class="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-900/60 text-purple-200">Dev Buy ${formatSol(
                          entry.initialBuyAmount
                      )}</span>`
                    : '';

            const badges = [statusBadge, initialBuyBadge].filter(Boolean);
            const badgesHtml = badges.length
                ? `<div class="mt-1 flex flex-wrap gap-1">${badges.join('<span class="mx-1 text-neutral-700">•</span>')}</div>`
                : '';

            const relativeLaunch = entry.launchedAt ? formatRelativeTime(entry.launchedAt) : null;

            return `
                <tr class="border-b border-neutral-800 last:border-b-0 align-top">
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-3">
                            ${
                                logoUrl
                                    ? `<img src="${logoUrl}" alt="${escapeHtml(symbol || name)}" class="w-10 h-10 rounded border border-neutral-700 object-cover" onerror="this.remove()" />`
                                    : `<div class="w-10 h-10 rounded border border-neutral-700 bg-neutral-900 flex items-center justify-center text-xs text-gray-500">${escapeHtml(
                                          (symbol || name).slice(0, 3).toUpperCase()
                                      )}</div>`
                            }
                            <div>
                                <div class="text-sm font-semibold text-white">${escapeHtml(name)}</div>
                                <div class="text-xs text-gray-400">${escapeHtml(symbol)}</div>
                                ${badgesHtml}
                            </div>
                        </div>
                    </td>
                    <td class="px-4 py-3">
                        <div class="flex items-center gap-2">
                            <code class="font-mono text-xs text-purple-200 break-all">${entry.tokenMint}</code>
                            <button class="bg-neutral-900 hover:bg-neutral-800 text-xs text-gray-300 px-2 py-1 rounded transition" onclick="copyLaunchMintAddress('${entry.tokenMint}')">Copy</button>
                        </div>
                    </td>
                    <td class="px-4 py-3">
                        ${
                            creatorAddress
                                ? `<div class="flex items-center gap-2">
                                        <div>
                                            <div class="text-sm text-white">${truncateAddress(creatorAddress)}</div>
                                            ${creatorLabel ? `<div class="text-xs text-gray-400">${escapeHtml(creatorLabel)}</div>` : ''}
                                        </div>
                                        <button class="bg-neutral-900 hover:bg-neutral-800 text-xs text-gray-300 px-2 py-1 rounded transition" onclick="copyLaunchCreatorWallet('${creatorAddress}')">Copy</button>
                                   </div>`
                                : '<span class="text-xs text-gray-500">Not captured</span>'
                        }
                    </td>
                    <td class="px-4 py-3">
                        <div class="text-sm text-gray-200">${mintedAt}</div>
                        ${relativeLaunch ? `<div class="text-xs text-gray-500">${escapeHtml(relativeLaunch)}</div>` : ''}
                    </td>
                    <td class="px-4 py-3">
                        <div class="text-sm text-gray-200 space-y-1">
                            ${performanceHtml}
                        </div>
                        ${updatedHtml}
                    </td>
                </tr>
            `;
        })
        .join('');

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full text-sm text-gray-200">
                <thead class="bg-neutral-900 text-xs uppercase text-gray-400">
                    <tr>
                        <th class="px-4 py-2 text-left">Token</th>
                        <th class="px-4 py-2 text-left">Mint</th>
                        <th class="px-4 py-2 text-left">Creator Wallet</th>
                        <th class="px-4 py-2 text-left">Launched</th>
                        <th class="px-4 py-2 text-left">Performance</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function resolveImageUrl(value) {
    if (!value || typeof value !== 'string') {
        return null;
    }
    
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    
    // Handle IPFS URLs
    if (trimmed.startsWith('ipfs://')) {
        const ipfsHash = trimmed.replace(/^ipfs:\/\//, '').replace(/^\/+/, '');
        return `https://ipfs.io/ipfs/${ipfsHash}`;
    }
    
    // Handle IPFS hash without protocol (Qm... or bafy...)
    if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]+)$/.test(trimmed)) {
        return `https://ipfs.io/ipfs/${trimmed}`;
    }
    
    // Handle Arweave URLs
    if (trimmed.startsWith('ar://')) {
        const arweaveId = trimmed.replace(/^ar:\/\//, '');
        return `https://arweave.net/${arweaveId}`;
    }
    
    // Handle Arweave ID directly (43 characters, base64url)
    if (/^[A-Za-z0-9_-]{43}$/.test(trimmed) && trimmed.length === 43) {
        return `https://arweave.net/${trimmed}`;
    }
    
    // Handle HTTP/HTTPS URLs - validate and return as-is
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            // Validate URL format
            new URL(trimmed);
            return trimmed;
        } catch (e) {
            // Invalid URL, return null
            return null;
        }
    }
    
    // Handle data URIs (base64 images)
    if (trimmed.startsWith('data:image/')) {
        return trimmed;
    }
    
    // If it looks like a valid URL but missing protocol, try adding https://
    if (/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}/.test(trimmed)) {
        return `https://${trimmed}`;
    }
    
    // Return as-is for any other format (might be a relative path or other format)
    return trimmed;
}

function formatUSD(value) {
    const number = safeNumber(value);
    if (number === null) {
        return '—';
    }
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: number >= 1 ? 2 : 6
        }).format(number);
    } catch (error) {
        return `$${number.toFixed(number >= 1 ? 2 : 6)}`;
    }
}

function formatSol(value) {
    const number = safeNumber(value);
    if (number === null) {
        return '—';
    }
    const digits = number >= 1 ? 3 : 6;
    return `${number.toLocaleString(undefined, { maximumFractionDigits: digits })} SOL`;
}

function formatRelativeTime(timestamp) {
    const value = normalizeTimestamp(timestamp);
    if (!value) {
        return '—';
    }
    const diff = Date.now() - value;
    const second = 1000;
    const minute = 60 * second;
    const hour = 60 * minute;
    const day = 24 * hour;

    // Show "just now" only for entries less than 1 second old
    if (Math.abs(diff) < second) {
        return 'just now';
    }
    
    // Show seconds for entries less than 1 minute old
    if (Math.abs(diff) < minute) {
        const seconds = Math.floor(diff / second);
        if (seconds === 1) {
            return '1 second ago';
        }
        return `${seconds} seconds ago`;
    }
    
    if (Math.abs(diff) < hour) {
        const mins = Math.round(diff / minute);
        return `${Math.abs(mins)} min${Math.abs(mins) === 1 ? '' : 's'} ${mins >= 0 ? 'ago' : 'from now'}`;
    }
    if (Math.abs(diff) < day) {
        const hours = Math.round(diff / hour);
        return `${Math.abs(hours)} hour${Math.abs(hours) === 1 ? '' : 's'} ${hours >= 0 ? 'ago' : 'from now'}`;
    }
    const days = Math.round(diff / day);
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days >= 0 ? 'ago' : 'from now'}`;
}

function safeNumber(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

/**
 * Calculate bonding curve percentage from on-chain data
 * Pump.fun bonding curve: starts with 1M SOL virtual reserves and 1B tokens
 * Completion is when virtual SOL reserves reach 80K SOL (8% of 1M)
 * Formula: (1M - currentVirtualSol) / (1M - 80K) * 100
 */
async function calculateBondingCurvePercent(mintAddress) {
    try {
        console.log('🔧 Starting on-chain bonding curve calculation for:', mintAddress);
        
        const connection = window.enhancedTokenFetchers?.getSolanaConnection?.('price') || 
                          window.solanaIntegration?.connection;
        
        if (!connection) {
            console.warn('⚠️ No Solana connection available for bonding curve calculation');
            return null;
        }
        console.log('✅ Connection available');
        
        const PublicKey = window.solanaWeb3?.PublicKey;
        if (!PublicKey) {
            console.warn('⚠️ Solana Web3.js PublicKey not available');
            return null;
        }
        console.log('✅ PublicKey available');
        
        const mintPubkey = new PublicKey(mintAddress);
        const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
        
        console.log('🔍 Finding bonding curve account...');
        // Find bonding curve account
        // Convert string to Uint8Array (browser-compatible)
        const bondingCurveSeed = new TextEncoder().encode('bonding-curve');
        const mintBuffer = mintPubkey.toBuffer();
        const seeds = [bondingCurveSeed, mintBuffer];
        const [bondingCurve] = PublicKey.findProgramAddressSync(
            seeds,
            PUMP_FUN_PROGRAM
        );
        
        console.log('🔍 Bonding curve address:', bondingCurve.toString());
        console.log('🔍 Fetching account info...');
        
        const curveAccount = await connection.getAccountInfo(bondingCurve);
        
        if (!curveAccount) {
            console.log('✅ Bonding curve account not found - token has graduated to Raydium (100%)');
            // Bonding curve account doesn't exist - token may have graduated
            return 100;
        }
        
        if (!curveAccount.data) {
            console.warn('⚠️ Bonding curve account exists but has no data');
            return 100;
        }
        
        console.log('✅ Bonding curve account found, parsing data...');
        const data = curveAccount.data;
        
        // Virtual SOL reserves at offset 8 (in lamports)
        // Browser-compatible BigUInt64LE read (little-endian)
        function readBigUInt64LE(buffer, offset) {
            let result = 0n;
            for (let i = 0; i < 8; i++) {
                result |= BigInt(buffer[offset + i]) << BigInt(i * 8);
            }
            return result;
        }
        
        const virtualSolReserves = readBigUInt64LE(data, 8);
        const virtualSolReservesNumber = Number(virtualSolReserves);
        const virtualSolReservesSol = virtualSolReservesNumber / 1_000_000_000; // Convert lamports to SOL
        
        console.log('📊 Virtual SOL reserves:', virtualSolReservesSol.toFixed(2), 'SOL');
        
        // Pump.fun bonding curve parameters:
        // Initial: 1,000,000 SOL (1,000,000,000,000,000 lamports)
        // Complete: 80,000 SOL (80,000,000,000,000 lamports)
        const INITIAL_VIRTUAL_SOL = 1_000_000_000_000_000; // 1M SOL in lamports
        const COMPLETE_VIRTUAL_SOL = 80_000_000_000_000; // 80K SOL in lamports
        
        // Calculate percentage: (initial - current) / (initial - complete) * 100
        const progress = (INITIAL_VIRTUAL_SOL - virtualSolReservesNumber) / 
                        (INITIAL_VIRTUAL_SOL - COMPLETE_VIRTUAL_SOL) * 100;
        
        // Clamp between 0 and 100
        const percent = Math.max(0, Math.min(100, progress));
        
        console.log('✅ Calculated bonding curve:', percent.toFixed(2) + '%');
        return percent;
    } catch (error) {
        console.error('❌ Bonding curve calculation error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        return null;
    }
}

function normalizeTimestamp(value) {
    const number = safeNumber(value);
    if (number === null) {
        return null;
    }
    return number < 1e12 ? number * 1000 : number;
}

function resolveCreatorWalletDetails(identifier) {
    if (!identifier) {
        return null;
    }

    const sources = [];
    if (Array.isArray(tokenLaunchState.wallets)) {
        sources.push(...tokenLaunchState.wallets);
    }
    if (Array.isArray(window.solana?.wallets)) {
        sources.push(...window.solana.wallets);
    }
    if (typeof window.walletOperations?.getWallets === 'function') {
        try {
            const operationsWallets = window.walletOperations.getWallets();
            if (Array.isArray(operationsWallets)) {
                sources.push(...operationsWallets);
            }
        } catch (error) {
            console.warn('Unable to resolve wallet operations wallets:', error);
        }
    }

    const target = String(identifier);
    const match = sources.find((wallet) => {
        if (!wallet) return false;
        const candidates = [
            wallet.id,
            wallet.publicKey,
            wallet.address,
            wallet.pubkey,
            wallet.walletAddress
        ]
            .filter(Boolean)
            .map((value) => String(value));
        return candidates.includes(target);
    });

    if (!match) {
        return null;
    }

    return {
        id: match.id || match.publicKey || match.address || match.pubkey || identifier,
        address: match.publicKey || match.address || match.pubkey || match.walletAddress || identifier,
        name: match.name || match.label || ''
    };
}

function copyLaunchMintAddress(mint) {
    if (!mint) return;
    navigator.clipboard
        .writeText(mint)
        .then(() => notify('Mint address copied to clipboard.', 'success'))
        .catch(() => notify('Unable to copy mint address.', 'error'));
}

function copyLaunchCreatorWallet(address) {
    if (!address) return;
    navigator.clipboard
        .writeText(address)
        .then(() => notify('Creator wallet copied to clipboard.', 'success'))
        .catch(() => notify('Unable to copy creator wallet.', 'error'));
}

async function recordTokenLaunch(payload = {}) {
    if (!payload || !payload.tokenMint) {
        return;
    }

    const mint = payload.tokenMint.trim();
    if (!mint) {
        return;
    }

    const now = Date.now();
    const existingIndex = vanityLaunchStore.findIndex((entry) => entry.tokenMint === mint);
    const existingEntry = existingIndex >= 0 ? { ...vanityLaunchStore[existingIndex] } : null;

    const walletDetails =
        resolveCreatorWalletDetails(payload.creatorWalletId || payload.creatorWallet) || null;

    const entry = {
        id: existingEntry?.id || payload.id || `launch-${now}-${Math.random().toString(36).slice(2, 8)}`,
        tokenMint: mint,
        name: payload.name || existingEntry?.name || '',
        symbol: payload.symbol || existingEntry?.symbol || '',
        platform: payload.platform || existingEntry?.platform || 'pumpfun',
        logo: resolveImageUrl(payload.logo) || existingEntry?.logo || null,
        metadataUri: payload.metadataUri || existingEntry?.metadataUri || null,
        creatorWalletId: payload.creatorWalletId || existingEntry?.creatorWalletId || walletDetails?.id || '',
        creatorWallet: payload.creatorWallet || existingEntry?.creatorWallet || walletDetails?.address || '',
        creatorWalletLabel: payload.creatorWalletLabel || existingEntry?.creatorWalletLabel || walletDetails?.name || '',
        launchedAt: normalizeTimestamp(payload.launchedAt) || existingEntry?.launchedAt || now,
        initialBuyAmount: safeNumber(payload.initialBuyAmount) ?? existingEntry?.initialBuyAmount ?? null,
        stats: payload.stats || existingEntry?.stats || null,
        lastStatsUpdated: payload.stats ? now : existingEntry?.lastStatsUpdated || null
    };

    if (!entry.logo && entry.stats && entry.stats.image) {
        entry.logo = resolveImageUrl(entry.stats.image);
    }

    if (existingIndex >= 0) {
        vanityLaunchStore[existingIndex] = entry;
    } else {
        vanityLaunchStore.push(entry);
    }

    persistVanityLaunchStore();
    renderVanityLaunchList();

    if (!payload.stats) {
        await refreshVanityLaunchPerformance(true, [mint]);
    }
}

async function refreshVanityLaunchPerformance(force = false, tokenMints = null) {
    if (!Array.isArray(vanityLaunchStore) || vanityLaunchStore.length === 0) {
        return;
    }

    if (vanityLaunchStatsRefreshPromise && !force && !tokenMints) {
        return vanityLaunchStatsRefreshPromise;
    }

    const refreshButton = getElement('vanity-launches-refresh');

    const now = Date.now();
    const targets = vanityLaunchStore.filter((entry) => {
        if (!entry?.tokenMint) return false;
        if (tokenMints && !tokenMints.includes(entry.tokenMint)) {
            return false;
        }
        if (force) {
            return true;
        }
        if (!entry.lastStatsUpdated) {
            return true;
        }
        return now - entry.lastStatsUpdated > VANITY_LAUNCH_STATS_TTL_MS;
    });

    if (!targets.length) {
        return;
    }

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add('opacity-70', 'cursor-not-allowed');
        refreshButton.textContent = 'Refreshing...';
    }

    const promise = (async () => {
        for (const entry of targets) {
            try {
                const stats = await fetchTokenPerformance(entry.tokenMint);
                entry.stats = stats;
                entry.lastStatsUpdated = Date.now();
                if (!entry.logo && stats.image) {
                    entry.logo = resolveImageUrl(stats.image);
                }
                if ((!entry.launchedAt || entry.launchedAt <= 0) && stats.createdTimestamp) {
                    entry.launchedAt = normalizeTimestamp(stats.createdTimestamp);
                }
            } catch (error) {
                // Only log non-5xx errors as warnings (API down is expected)
                if (!error.message || (!error.message.includes('530') && !error.message.includes('503') && !error.message.includes('502'))) {
                console.warn(`Failed to refresh performance for ${entry.tokenMint}:`, error.message || error);
                } else {
                    // Silently handle API downtime
                    console.debug(`Pump.fun API unavailable for ${entry.tokenMint}`);
                }
            }
        }
        persistVanityLaunchStore();
        renderVanityLaunchList();
    })();

    vanityLaunchStatsRefreshPromise = promise;

    try {
        await promise;
    } finally {
        vanityLaunchStatsRefreshPromise = null;
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove('opacity-70', 'cursor-not-allowed');
            refreshButton.textContent = 'Refresh Performance';
        }
    }
}

async function fetchTokenPerformance(tokenMint) {
    if (!tokenMint) {
        throw new Error('Missing token mint for performance fetch');
    }

    const stats = {
        priceUsd: null,
        marketCapUsd: null,
        volume24hUsd: null,
        liquidityUsd: null,
        priceChange1hPct: null,
        priceChange24hPct: null,
        holders: null,
        virtualSolReserves: null,
        realSolReserves: null,
        image: null,
        createdTimestamp: null,
        isComplete: null,
        source: 'pumpfun'
    };

    try {
        const response = await fetch(`${VANITY_LAUNCH_STATS_ENDPOINT_BASE}/coins/${tokenMint}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            // 530 is "Service Temporarily Unavailable" - Pump.fun API is down
            // Don't throw for 5xx errors, just return empty stats
            if (response.status >= 500 && response.status < 600) {
                console.debug(`Pump.fun API temporarily unavailable (${response.status}) for ${tokenMint}`);
                return stats; // Return empty stats object
            }
            throw new Error(`Pump.fun coin API responded with status ${response.status}`);
        }

        const data = await response.json();

        stats.image = resolveImageUrl(data.image_uri || data.imageUri || (data.metadata && data.metadata.image));
        stats.marketCapUsd = safeNumber(data.usd_market_cap);
        stats.volume24hUsd = safeNumber(data.usd_volume_24h || data.volume_24h);
        stats.liquidityUsd = safeNumber(data.usd_liquidity || data.liquidity_usd || data.liquidity);
        stats.priceChange1hPct = safeNumber(data.price_change_1h_pct || data.price_change_1h);
        stats.priceChange24hPct = safeNumber(data.price_change_24h_pct || data.price_change_24h);
        stats.holders = safeNumber(data.holder_count);
        stats.createdTimestamp = normalizeTimestamp(data.created_timestamp);
        stats.isComplete = Boolean(data.complete);

        const totalSupply = safeNumber(data.total_supply);
        const decimals = safeNumber(data.decimals) ?? 9;
        if (stats.marketCapUsd !== null && totalSupply) {
            stats.priceUsd = stats.marketCapUsd / (totalSupply / Math.pow(10, decimals));
        } else {
            const fallbackPrice = safeNumber(data.usd_price || data.price_usd);
            stats.priceUsd = fallbackPrice;
        }
    } catch (error) {
        // Network errors or API down - return empty stats instead of throwing
        if (error.message && (error.message.includes('530') || error.message.includes('503') || error.message.includes('502'))) {
            console.debug(`Pump.fun API unavailable for ${tokenMint}: ${error.message}`);
            return stats; // Return empty stats object
        }
        // Only throw for non-5xx errors (like network failures, 404, etc.)
        throw new Error(`Unable to fetch Pump.fun performance: ${error.message || error}`);
    }

    try {
        const curveResponse = await fetch(`${VANITY_LAUNCH_STATS_ENDPOINT_BASE}/coins/${tokenMint}/bonding-curve`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (curveResponse.ok) {
            const curve = await curveResponse.json();
            const denominator = window.solanaWeb3?.LAMPORTS_PER_SOL || LAMPORTS_PER_SOL_FALLBACK;
            const convert = (value) => {
                const lamports = safeNumber(value);
                return lamports === null ? null : lamports / denominator;
            };
            stats.virtualSolReserves = convert(curve.virtual_sol_reserves);
            stats.realSolReserves = convert(curve.real_sol_reserves);
        }
    } catch (error) {
        console.warn(`Unable to fetch bonding curve data for ${tokenMint}:`, error.message || error);
    }

    return stats;
}

window.refreshVanityLaunchPerformance = refreshVanityLaunchPerformance;
window.copyLaunchMintAddress = copyLaunchMintAddress;
window.copyLaunchCreatorWallet = copyLaunchCreatorWallet;

function persistVanityStore() {
    try {
        localStorage.setItem(VANITY_STORAGE_KEY, JSON.stringify(vanityKeyStore));
    } catch (error) {
        console.error('Error persisting vanities:', error);
    }
}

function loadVanityKeysFromStorage() {
    try {
        const saved = localStorage.getItem(VANITY_STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            vanityKeyStore = Array.isArray(parsed)
                ? parsed.map(entry => ({
                    id: entry.id || `vanity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    launchpad: entry.launchpad || detectLaunchpad(entry.address || ''),
                    address: entry.address || '',
                    privateKey: entry.privateKey || '',
                    status: entry.status || 'available',
                    createdAt: entry.createdAt || Date.now(),
                    updatedAt: entry.updatedAt || entry.createdAt || Date.now(),
                    source: entry.source || 'manual',
                    label: entry.label || ''
                }))
                : [];
            persistVanityStore();
        } else {
            vanityKeyStore = [];
        }
    } catch (error) {
        console.error('Error loading vanities:', error);
        vanityKeyStore = [];
    }

    renderVanityList();
}

function detectLaunchpad(address) {
    if (!address) return 'other';
    const lower = address.toLowerCase();
    if (lower.endsWith('pump')) return 'pumpfun';
    if (lower.endsWith('bonk')) return 'bonk';
    return 'other';
}

function formatLaunchpadBadge(launchpad) {
    const map = {
        pumpfun: { label: 'Pump.fun', classes: 'bg-purple-900/60 text-purple-200' },
        bonk: { label: 'Bonk', classes: 'bg-orange-900/60 text-orange-200' },
        other: { label: 'Other', classes: 'bg-neutral-900 text-gray-300' }
    };
    const info = map[launchpad] || map.other;
    return `<span class="px-2 py-1 text-xs font-semibold rounded ${info.classes}">${info.label}</span>`;
}

function parsePrivateKeyInput(line) {
    const trimmed = line.trim();
    if (!trimmed) {
        throw new Error('Empty private key');
    }

    let secret;
    if (trimmed.startsWith('[')) {
        secret = Uint8Array.from(JSON.parse(trimmed));
    } else {
        if (!window.bs58) {
            throw new Error('Base58 support not loaded');
        }
        secret = window.bs58.decode(trimmed);
    }

    if (!(secret instanceof Uint8Array)) {
        secret = new Uint8Array(secret);
    }

    if (secret.length !== 64) {
        throw new Error('Invalid private key length');
    }

    if (!window.solanaWeb3 || !window.solanaWeb3.Keypair) {
        throw new Error('solanaWeb3 not available');
    }

    const keypair = window.solanaWeb3.Keypair.fromSecretKey(secret);
    const base58 = window.bs58 ? window.bs58.encode(secret) : trimmed;
    return { keypair, privateKey: base58 };
}

function saveVanityKeys() {
    const textarea = getElement('vanity-keys-input');
    if (!textarea) {
        notify('Vanity input form not available.', 'error');
        return;
    }

    const lines = textarea.value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
        notify('Please paste at least one private key.', 'warning');
        return;
    }

    let added = 0;
    let duplicates = 0;
    const failures = [];
    const timestamp = Date.now();

    lines.forEach(line => {
        try {
            const { keypair, privateKey } = parsePrivateKeyInput(line);
            const address = keypair.publicKey.toString();

            if (vanityKeyStore.some(entry => entry.address === address)) {
                duplicates++;
                return;
            }

            vanityKeyStore.push({
                id: `vanity-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
                launchpad: detectLaunchpad(address),
                address,
                privateKey,
                status: 'available',
                createdAt: timestamp,
                updatedAt: timestamp,
                source: 'manual',
                label: ''
            });

            added++;
        } catch (error) {
            console.error('Failed to parse vanity key:', error);
            failures.push({ line, error: error.message });
        }
    });

    if (added > 0) {
        persistVanityStore();
        textarea.value = '';
        notify(`Saved ${added} vanity key${added === 1 ? '' : 's'}.`, 'success');
        addConsoleLog(`📬 Saved ${added} vanity key(s)`, 'info');
    }

    if (duplicates > 0) {
        notify(`${duplicates} duplicate key${duplicates === 1 ? '' : 's'} skipped.`, 'warning');
    }

    if (failures.length > 0) {
        notify('Some keys could not be parsed. Check the console for details.', 'error');
    }

    renderVanityList();
}

function clearVanityInput() {
    const textarea = getElement('vanity-keys-input');
    if (textarea) {
        textarea.value = '';
        textarea.focus();
    }
}

function scrollToVanityForm() {
    const card = getElement('vanity-form-card');
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => getElement('vanity-keys-input')?.focus(), 200);
    }
}

function copyVanityAddress(id) {
    const entry = vanityKeyStore.find(item => item.id === id);
    if (!entry) return;
    navigator.clipboard.writeText(entry.address)
        .then(() => notify('Address copied to clipboard.', 'success'))
        .catch(() => notify('Unable to copy address.', 'error'));
}

function copyVanityPrivateKey(id) {
    const entry = vanityKeyStore.find(item => item.id === id);
    if (!entry) return;
    navigator.clipboard.writeText(entry.privateKey)
        .then(() => notify('Private key copied to clipboard.', 'success'))
        .catch(() => notify('Unable to copy private key.', 'error'));
}

function toggleVanityKeyVisibility(id) {
    if (vanityVisibility.has(id)) {
        vanityVisibility.delete(id);
    } else {
        vanityVisibility.add(id);
    }
    renderVanityList();
}

function markVanityStatus(id, status) {
    const entry = vanityKeyStore.find(item => item.id === id);
    if (!entry) return;

    entry.status = status;
    entry.updatedAt = Date.now();
    persistVanityStore();
    renderVanityList();

    const message = status === 'used' ? 'marked as used' : 'returned to available';
    notify(`Vanity ${message}.`, 'success');
}

function archiveUsedVanities() {
    const before = vanityKeyStore.length;
    vanityKeyStore = vanityKeyStore.filter(entry => entry.status !== 'used');
    const removed = before - vanityKeyStore.length;

    if (removed === 0) {
        notify('No used vanities to archive.', 'info');
        return;
    }

    persistVanityStore();
    renderVanityList();
    notify(`Archived ${removed} used vanity${removed === 1 ? '' : 'ies'}.`, 'success');
}

function requestMoreVanities() {
    notify('Vanity request sent. Operations will replenish keys soon.', 'info');
    addConsoleLog('📮 Vanity request submitted', 'info');
}

function setVanityFilter(filter) {
    uiHelperState.vanityFilter = filter;
    const availableBtn = getElement('vanity-tab-available');
    const usedBtn = getElement('vanity-tab-used');

    const activeClasses = 'bg-purple-700 text-white';
    const inactiveClasses = 'bg-neutral-800 hover:bg-neutral-700 text-sm text-gray-300';

    if (availableBtn) {
        availableBtn.className = `${inactiveClasses} px-3 py-2 rounded transition${filter === 'available' ? ' ' + activeClasses : ''}`;
    }
    if (usedBtn) {
        usedBtn.className = `${inactiveClasses} px-3 py-2 rounded transition${filter === 'used' ? ' ' + activeClasses : ''}`;
    }

    renderVanityList();
}
function renderVanityList() {
    const container = getElement('vanity-table-container');
    const titleEl = getElement('vanity-list-title');
    const countEl = getElement('vanity-count-label');

    if (!container) {
        return;
    }

    const filter = uiHelperState.vanityFilter || 'available';
    const filtered = vanityKeyStore.filter(entry => (
        filter === 'used' ? entry.status === 'used' : entry.status !== 'used'
    ));

    if (titleEl) {
        titleEl.textContent = filter === 'used' ? 'Used Vanities' : 'Available Vanities';
    }
    if (countEl) {
        countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`;
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-sm text-gray-500">No vanities in this list yet</div>';
        return;
    }

    const rows = filtered.map(entry => {
        const isRevealed = vanityVisibility.has(entry.id);
        const privateDisplay = isRevealed ? entry.privateKey : '••••••••••••••••••••••••••••';
        const toggleLabel = isRevealed ? 'Hide' : 'View';
        const statusAction = entry.status === 'used' ? 'available' : 'used';
        const statusLabel = entry.status === 'used' ? 'Mark Available' : 'Mark Used';
        const sourceBadge =
            entry.source === 'creator'
                ? '<span class="px-2 py-0.5 text-[10px] font-semibold rounded bg-purple-900/60 text-purple-200 uppercase tracking-wide">Creator</span>'
                : entry.source && entry.source !== 'manual'
                ? `<span class="px-2 py-0.5 text-[10px] font-semibold rounded bg-neutral-800 text-gray-300 uppercase tracking-wide">${entry.source}</span>`
                : '';
        const labelLine = entry.label
            ? `<div class="text-xs text-gray-500 mt-1">${entry.label}</div>`
            : '';

        return `
            <tr class="border-b border-neutral-800 last:border-b-0">
                <td class="px-4 py-3 align-middle">
                    ${formatLaunchpadBadge(entry.launchpad)}
                </td>
                <td class="px-4 py-3">
                    <div class="flex flex-wrap items-center gap-2">
                        <code class="font-mono text-sm text-gray-200">${entry.address}</code>
                        ${sourceBadge}
                        <button class="bg-neutral-800 hover:bg-neutral-700 text-xs text-gray-300 px-2 py-1 rounded transition" onclick="copyVanityAddress('${entry.id}')">Copy</button>
                    </div>
                    ${labelLine}
                </td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-sm text-gray-200">${privateDisplay}</span>
                        <button class="bg-neutral-800 hover:bg-neutral-700 text-xs text-gray-300 px-2 py-1 rounded transition" onclick="toggleVanityKeyVisibility('${entry.id}')">${toggleLabel}</button>
                        <button class="bg-neutral-800 hover:bg-neutral-700 text-xs text-gray-300 px-2 py-1 rounded transition" onclick="copyVanityPrivateKey('${entry.id}')">Copy</button>
                    </div>
                </td>
                <td class="px-4 py-3 text-right">
                    <button class="bg-purple-700 hover:bg-purple-600 text-white text-xs px-3 py-1.5 rounded transition" onclick="markVanityStatus('${entry.id}', '${statusAction}')">${statusLabel}</button>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full text-sm text-gray-200">
                <thead class="bg-neutral-900 text-xs uppercase text-gray-400">
                    <tr>
                        <th class="px-4 py-2 text-left">Launchpad</th>
                        <th class="px-4 py-2 text-left">Address</th>
                        <th class="px-4 py-2 text-left">Private Key</th>
                        <th class="px-4 py-2 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function setBlueprintFormValue(id, value) {
    const element = getElement(id);
    if (!element) return;
    if (element.type === 'checkbox') {
        element.checked = Boolean(value);
    } else if (value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))) {
        element.value = '';
    } else {
        element.value = value;
    }
}

function getNumericValue(id) {
    const element = getElement(id);
    if (!element) return null;
    const raw = element.value;
    if (raw === undefined || raw === null || raw === '') {
        return null;
    }
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
}

function getBlueprintFormValues() {
    const template = getElement('blueprint-template')?.value || 'custom';
    const name = getElement('blueprint-name')?.value.trim();
    const type = getElement('blueprint-type')?.value || 'custom';
    const description = getElement('blueprint-description')?.value.trim();
    const notes = getElement('blueprint-notes')?.value.trim();

    if (!name) {
        throw new Error('Blueprint name is required');
    }

    const smartSellEnabled = Boolean(getElement('blueprint-smart-sell-enabled')?.checked);
    const volumeEnabled = Boolean(getElement('blueprint-volume-enabled')?.checked);

    const smartSellSelector = readBlueprintAutomationSelector('blueprint-smart-sell');
    const volumeSelector = readBlueprintAutomationSelector('blueprint-volume');

    const smartSellValidation = validateBlueprintAutomationSelection('Smart Sell', smartSellEnabled, smartSellSelector);
    if (!smartSellValidation.valid) {
        throw new Error(smartSellValidation.message);
    }

    const volumeValidation = validateBlueprintAutomationSelection('Volume Bot', volumeEnabled, volumeSelector);
    if (!volumeValidation.valid) {
        throw new Error(volumeValidation.message);
    }

    const readNumber = (id) => getNumericValue(id);

    const smartSellGroup = getWalletGroupById(smartSellSelector.groupId);
    const volumeGroup = getWalletGroupById(volumeSelector.groupId);
    const volumeRandomizeAmounts = Boolean(getElement('blueprint-volume-randomize-amounts')?.checked);
    const volumeRandomizeDelay = Boolean(getElement('blueprint-volume-randomize-delay')?.checked);
    const volumeGuardrailsEnabled = Boolean(getElement('blueprint-volume-guardrails-enabled')?.checked);

    return {
        template,
        name,
        type,
        description,
        notes,
        settings: {
            launch: {
                devBuyAmount: parseFloat(getElement('blueprint-dev-buy')?.value || '0') || 0,
                initialBuyAmount: parseFloat(getElement('blueprint-initial-buy')?.value || '0') || 0,
                useVanity: Boolean(getElement('blueprint-use-vanity')?.checked),
                priorityFee: parseFloat(getElement('blueprint-priority-fee')?.value || '0') || 0
            },
            automations: {
                smartSell: {
                    enabled: smartSellEnabled,
                    profitTarget: parseFloat(getElement('blueprint-smart-sell-profit')?.value || '0') || 0,
                    stopLoss: parseFloat(getElement('blueprint-smart-sell-stoploss')?.value || '0') || 0,
                    walletSelector: smartSellSelector,
                    walletMode: smartSellSelector.mode,
                    walletIds: smartSellSelector.walletIds,
                    walletGroupId: smartSellSelector.groupId || null,
                    walletGroupName: smartSellGroup?.name || null
                },
                volumeBot: (() => {
                    const volumeGuardrails = {
                        enabled: volumeGuardrailsEnabled,
                        realizedProfitTarget: readNumber('blueprint-volume-profit-target'),
                        realizedLossLimit: readNumber('blueprint-volume-loss-limit')
                    };

                    if (volumeGuardrails.realizedProfitTarget === null) {
                        delete volumeGuardrails.realizedProfitTarget;
                    }
                    if (volumeGuardrails.realizedLossLimit === null) {
                        delete volumeGuardrails.realizedLossLimit;
                    }

                    return {
                    enabled: volumeEnabled,
                    buyAmount: parseFloat(getElement('blueprint-volume-amount')?.value || '0') || 0,
                    cycles: parseInt(getElement('blueprint-volume-cycles')?.value || '0', 10) || 0,
                    sellDelay: parseInt(getElement('blueprint-volume-delay')?.value || '0', 10) || 0,
                    minAmount: readNumber('blueprint-volume-min-amount'),
                    maxAmount: readNumber('blueprint-volume-max-amount'),
                    buyIntervalSeconds: readNumber('blueprint-volume-buy-interval'),
                    buyIntervalMinSeconds: readNumber('blueprint-volume-buy-interval-min'),
                    buyIntervalMaxSeconds: readNumber('blueprint-volume-buy-interval-max'),
                    sellIntervalSeconds: readNumber('blueprint-volume-sell-interval'),
                    sellIntervalMinSeconds: readNumber('blueprint-volume-sell-interval-min'),
                    sellIntervalMaxSeconds: readNumber('blueprint-volume-sell-interval-max'),
                    sellPercentageMin: readNumber('blueprint-volume-sell-percent-min'),
                    sellPercentageMax: readNumber('blueprint-volume-sell-percent-max'),
                    randomizeAmounts: volumeRandomizeAmounts,
                    randomizeDelay: volumeRandomizeDelay,
                    walletSelector: volumeSelector,
                    walletMode: volumeSelector.mode,
                    walletIds: volumeSelector.walletIds,
                    walletGroupId: volumeSelector.groupId || null,
                    walletGroupName: volumeGroup?.name || null,
                    guardrails: volumeGuardrails
                    };
                })()
            }
        }
    };
}

function applyBlueprintPreset(templateKey) {
    const preset = blueprintTemplates[templateKey] || blueprintTemplates.custom;

    setBlueprintFormValue('blueprint-type', preset.type || 'custom');
    setBlueprintFormValue('blueprint-description', preset.description || '');
    setBlueprintFormValue('blueprint-notes', preset.notes || '');
    const nameField = getElement('blueprint-name');
    if (nameField) {
        nameField.value = preset.name || '';
    }

    // Launch defaults
    setBlueprintFormValue('blueprint-dev-buy', preset.launch.devBuyAmount);
    setBlueprintFormValue('blueprint-initial-buy', preset.launch.initialBuyAmount);
    setBlueprintFormValue('blueprint-use-vanity', preset.launch.useVanity);
    setBlueprintFormValue('blueprint-priority-fee', preset.launch.priorityFee);

    // Automations
    setBlueprintFormValue('blueprint-smart-sell-enabled', preset.automations.smartSell.enabled);
    setBlueprintFormValue('blueprint-smart-sell-profit', preset.automations.smartSell.profitTarget);
    setBlueprintFormValue('blueprint-smart-sell-stoploss', preset.automations.smartSell.stopLoss);

    const volumePreset = preset.automations.volumeBot || {};
    setBlueprintFormValue('blueprint-volume-enabled', volumePreset.enabled);
    setBlueprintFormValue('blueprint-volume-amount', volumePreset.buyAmount ?? '');
    setBlueprintFormValue('blueprint-volume-cycles', volumePreset.cycles ?? '');
    setBlueprintFormValue('blueprint-volume-delay', volumePreset.sellDelay ?? '');
    setBlueprintFormValue('blueprint-volume-min-amount', volumePreset.minAmount ?? '');
    setBlueprintFormValue('blueprint-volume-max-amount', volumePreset.maxAmount ?? '');
    setBlueprintFormValue('blueprint-volume-buy-interval', volumePreset.buyIntervalSeconds ?? '');
    setBlueprintFormValue('blueprint-volume-buy-interval-min', volumePreset.buyIntervalMinSeconds ?? '');
    setBlueprintFormValue('blueprint-volume-buy-interval-max', volumePreset.buyIntervalMaxSeconds ?? '');
    setBlueprintFormValue('blueprint-volume-sell-interval', volumePreset.sellIntervalSeconds ?? '');
    setBlueprintFormValue('blueprint-volume-sell-interval-min', volumePreset.sellIntervalMinSeconds ?? '');
    setBlueprintFormValue('blueprint-volume-sell-interval-max', volumePreset.sellIntervalMaxSeconds ?? '');
    setBlueprintFormValue('blueprint-volume-sell-percent-min', volumePreset.sellPercentageMin ?? '');
    setBlueprintFormValue('blueprint-volume-sell-percent-max', volumePreset.sellPercentageMax ?? '');
    setBlueprintFormValue('blueprint-volume-randomize-amounts', volumePreset.randomizeAmounts !== false);
    setBlueprintFormValue('blueprint-volume-randomize-delay', volumePreset.randomizeDelay !== false);

    const guardrailsPreset = volumePreset.guardrails || {};
    setBlueprintFormValue('blueprint-volume-guardrails-enabled', guardrailsPreset.enabled !== false);
    setBlueprintFormValue('blueprint-volume-profit-target', guardrailsPreset.realizedProfitTarget ?? '');
    setBlueprintFormValue('blueprint-volume-loss-limit', guardrailsPreset.realizedLossLimit ?? '');

    toggleBlueprintVolumeGuardrails();
}

function openCreateBlueprintModal(template = 'custom') {
    if (!ensureMultiWalletReady()) {
        return;
    }

    setBlueprintFormValue('blueprint-template', template);
    applyBlueprintPreset(template);

    ensureWalletGroupsLoaded()
        .catch((error) => console.warn('Wallet groups unavailable for blueprint modal:', error))
        .finally(() => {
            setupBlueprintAutomationControls();
            resetBlueprintAutomationSelectors();
        });

    window.openModal('create-blueprint-modal');
    setTimeout(() => {
        getElement('blueprint-name')?.focus();
    }, 120);
}

function resetBlueprintForm() {
    const form = getElement('create-blueprint-form');
    form?.reset();
    setBlueprintFormValue('blueprint-template', 'custom');
    applyBlueprintPreset('custom');
    resetBlueprintAutomationSelectors();
}

async function submitBlueprintForm() {
    if (!ensureMultiWalletReady()) {
        return;
    }

    let formData;
    try {
        formData = getBlueprintFormValues();
    } catch (error) {
        notify(error.message, 'error');
        return;
    }

    const payload = buildBlueprintApiPayload({
        name: formData.name,
        type: formData.type,
        template: formData.template,
        description: formData.description,
        notes: formData.notes,
        wallets: getBlueprintWalletPayload(),
        settings: formData.settings
    });

    try {
        const blueprint = await blueprintService.create(payload);
        addConsoleLog(`✅ Blueprint created: ${blueprint?.name || formData.name}`, 'success');
        notify(`Blueprint "${blueprint?.name || formData.name}" saved.`, 'success');
        closeModal('create-blueprint-modal');
        resetBlueprintForm();
        await renderBlueprintList(true);
    } catch (error) {
        console.error('Blueprint creation failed:', error);
        notify(`Failed to save blueprint: ${error.message}`, 'error');
    }
}

function formatTimestamp(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString();
    } catch (error) {
        return '—';
    }
}

function formatRunStatus(value) {
    if (!value) return '—';
    const normalized = String(value).toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildBlueprintCard(blueprint) {
    const card = document.createElement('div');
    card.className = 'bg-neutral-900 border border-neutral-800 rounded-lg p-4';

    const isApplied =
        tokenLaunchState.launchConfig?.appliedBlueprint?.id === blueprint.id;

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-3';

    const title = document.createElement('div');
    title.innerHTML = `<h4 class="text-lg font-semibold text-white">${blueprint.name}</h4>
        <p class="text-xs text-gray-400">${(blueprint.template || blueprint.type || 'custom').replace(/-/g, ' ')}</p>`;

    const meta = document.createElement('div');
    meta.className = 'text-right text-xs text-gray-500 space-y-1';
    meta.innerHTML = `
        <div>Created: ${formatTimestamp(blueprint.createdAt)}</div>
        <div>Last run: ${formatTimestamp(blueprint.lastRun)}</div>
        <div>Runs: ${blueprint.stats?.totalRuns || 0}</div>
        <div>Applied: ${blueprint.stats?.appliedCount || 0}</div>
    `;

    header.appendChild(title);
    header.appendChild(meta);

    if (isApplied) {
        card.classList.add('ring-2', 'ring-purple-500/60');
        const badge = document.createElement('span');
        badge.className =
            'ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-purple-700/20 text-purple-200';
        badge.innerHTML = `<i data-lucide="stars" class="w-3 h-3"></i><span>Applied</span>`;
        title.querySelector('h4')?.appendChild(badge);
    }

    const body = document.createElement('div');
    body.className = 'mt-4 space-y-3 text-sm text-gray-300';

    if (blueprint.description) {
        const desc = document.createElement('p');
        desc.textContent = blueprint.description;
        body.appendChild(desc);
    }

    const launch = document.createElement('div');
    const launchSettings = blueprint.settings?.launch || {};
    launch.innerHTML = `
        <div class="text-xs text-gray-400">Launch defaults</div>
        <div class="text-xs text-gray-300">Dev Buy: ${launchSettings.devBuyAmount ?? '—'} SOL • Initial Buy: ${launchSettings.initialBuyAmount ?? '—'} SOL • Vanity: ${launchSettings.useVanity ? 'On' : 'Off'}</div>
    `;
    body.appendChild(launch);

    const automationSettings = blueprint.settings?.automations || {};
    const automationSummary = document.createElement('div');
    automationSummary.className = 'text-xs text-gray-300';
    automationSummary.innerHTML = `
        <span class="text-gray-400">Automations:</span>
        Smart Sell ${automationSettings.smartSell?.enabled ? '✅' : '❌'} • Volume Bot ${automationSettings.volumeBot?.enabled ? '✅' : '❌'}
    `;
    body.appendChild(automationSummary);

    const lastRunSummary = blueprint.lastRunSummary || {};
    const runSummary = document.createElement('div');
    runSummary.className = 'text-xs text-gray-400';
    const totalOps = lastRunSummary.totalOperations ?? 0;
    const successOps = lastRunSummary.success ?? 0;
    const failedOps = lastRunSummary.failed ?? 0;
    runSummary.textContent = `Last run status: ${formatRunStatus(blueprint.lastRunStatus)} • Operations: ${totalOps} (✅ ${successOps} / ❌ ${failedOps})`;
    body.appendChild(runSummary);

    if (blueprint.lastRunError) {
        const errorLine = document.createElement('div');
        errorLine.className = 'text-xs text-red-400';
        errorLine.textContent = `Last run error: ${blueprint.lastRunError}`;
        body.appendChild(errorLine);
    }

    const walletSummary = document.createElement('div');
    walletSummary.className = 'text-xs text-gray-400 space-y-1';
    walletSummary.innerHTML = `
        <div>Smart Sell wallets: ${describeAutomationSelector(automationSettings.smartSell)}</div>
        <div>Volume Bot wallets: ${describeAutomationSelector(automationSettings.volumeBot)}</div>
    `;
    body.appendChild(walletSummary);

    const guardrails = automationSettings.volumeBot?.guardrails;
    const guardrailSummary = document.createElement('div');
    guardrailSummary.className = 'text-xs text-gray-400';
    if (guardrails && guardrails.enabled !== false) {
        const formatOrDash = (value) => (value === null || value === undefined ? '—' : value);
        guardrailSummary.textContent = `Safety stops → take profit ${formatOrDash(guardrails.realizedProfitTarget)} SOL • stop loss ${formatOrDash(guardrails.realizedLossLimit)} SOL`;
    } else {
        guardrailSummary.textContent = 'Safety stops → disabled';
    }
    body.appendChild(guardrailSummary);

    if (blueprint.notes) {
        const notes = document.createElement('div');
        notes.className = 'text-xs text-gray-400 italic';
        notes.textContent = blueprint.notes;
        body.appendChild(notes);
    }

    const actions = document.createElement('div');
    actions.className = 'mt-4 flex items-center gap-3 justify-end';

    const runBtn = document.createElement('button');
    runBtn.className = 'bg-green-600 hover:bg-green-500 text-white text-xs px-3 py-2 rounded transition';
    runBtn.textContent = 'Run Now';
    runBtn.onclick = () => executeBlueprint(blueprint.id);

    const runsBtn = document.createElement('button');
    runsBtn.className = 'bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-xs px-3 py-2 rounded transition';
    runsBtn.textContent = 'Runs';
    runsBtn.onclick = () => openBlueprintRunsModal(blueprint.id);

    const applyBtn = document.createElement('button');
    applyBtn.className = 'bg-purple-700 hover:bg-purple-600 text-white text-xs px-3 py-2 rounded transition';
    applyBtn.textContent = isApplied ? 'Reapply' : 'Apply to Launch';
    applyBtn.onclick = () => applyBlueprint(blueprint.id);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-xs px-3 py-2 rounded transition';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => deleteBlueprint(blueprint.id);

    actions.appendChild(runBtn);
    actions.appendChild(runsBtn);
    actions.appendChild(applyBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);

    return card;
}

function renderLaunchBlueprintSummary() {
    const container = getElement('launch-blueprint-summary');
    if (!container) {
        return;
    }

    const applied = tokenLaunchState.launchConfig?.appliedBlueprint;
    if (!applied || !applied.id) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    const blueprint = blueprintService.getById(applied.id);
    const name = applied.name || blueprint?.name || 'Launch Blueprint';
    const typeLabel = (applied.type || blueprint?.type || blueprint?.template || 'custom')
        .toString()
        .replace(/-/g, ' ');
    const appliedRelative = formatRelativeTime(applied.appliedAt);
    const description = blueprint?.description || '';

    const automations = blueprint?.settings?.automations || {};
    const smartSellSettings = automations.smartSell || {};
    const volumeSettings = automations.volumeBot || {};

    const smartSellSummary = smartSellSettings.enabled
        ? `Enabled (TP ${smartSellSettings.profitTarget ?? '—'}% • SL ${smartSellSettings.stopLoss ?? '—'}%)`
        : 'Disabled';

    const volumeSummary = volumeSettings.enabled
        ? `Enabled (${volumeSettings.cycles ?? '—'} cycles • Buy ${volumeSettings.buyAmount ?? '—'} SOL)`
        : 'Disabled';

    const devBuyDisplay = formatSol(tokenLaunchState.launchConfig?.devBuyAmount);

    const blockZeroState = tokenLaunchState.launchConfig?.blockZero || {};
    const blockZeroSummary = blockZeroState.enabled
        ? `${Object.keys(blockZeroState.selections || {}).length}/${BLOCK_ZERO_MAX_SELECTIONS} wallets`
        : 'Off';

    container.innerHTML = `
        <div class="bg-purple-900/20 border border-purple-700/40 text-purple-100 rounded-lg p-4 space-y-4">
            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div>
                    <div class="text-sm font-semibold text-white">${escapeHtml(name)}</div>
                    <div class="text-xs uppercase tracking-wide text-purple-200/80">${escapeHtml(typeLabel)}</div>
                </div>
                <div class="text-xs text-purple-200/60">Applied ${escapeHtml(appliedRelative)}</div>
            </div>
            ${description ? `<div class="text-xs text-purple-100/80 leading-relaxed">${escapeHtml(description)}</div>` : ''}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-purple-100/80">
                <div class="bg-neutral-900/40 border border-purple-700/20 rounded-lg px-3 py-2">
                    <div class="text-[11px] uppercase text-purple-300/80">Dev Buy</div>
                    <div class="mt-1 font-medium">${escapeHtml(devBuyDisplay)}</div>
                </div>
                <div class="bg-neutral-900/40 border border-purple-700/20 rounded-lg px-3 py-2">
                    <div class="text-[11px] uppercase text-purple-300/80">Smart Sell</div>
                    <div class="mt-1 font-medium">${escapeHtml(smartSellSummary)}</div>
                </div>
                <div class="bg-neutral-900/40 border border-purple-700/20 rounded-lg px-3 py-2">
                    <div class="text-[11px] uppercase text-purple-300/80">Volume Bot</div>
                    <div class="mt-1 font-medium">${escapeHtml(volumeSummary)}</div>
                </div>
                <div class="bg-neutral-900/40 border border-purple-700/20 rounded-lg px-3 py-2">
                    <div class="text-[11px] uppercase text-purple-300/80">Block Zero</div>
                    <div class="mt-1 font-medium">${escapeHtml(blockZeroSummary)}</div>
                </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="px-3 py-2 bg-purple-700/70 hover:bg-purple-600 text-white text-xs rounded transition" data-blueprint-action="runs">
                    View run history
                </button>
                <button type="button" class="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-purple-100 text-xs rounded transition" data-blueprint-action="view">
                    Open blueprint
                </button>
                <button type="button" class="px-3 py-2 bg-transparent border border-purple-500/60 hover:border-purple-400 text-purple-200 text-xs rounded transition" data-blueprint-action="remove">
                    Remove
                </button>
            </div>
        </div>
    `;

    const runsButton = container.querySelector('[data-blueprint-action="runs"]');
    runsButton?.addEventListener('click', () => openBlueprintRunsModal(applied.id));

    const viewButton = container.querySelector('[data-blueprint-action="view"]');
    viewButton?.addEventListener('click', () => navigateToPage('blueprint'));

    const removeButton = container.querySelector('[data-blueprint-action="remove"]');
    removeButton?.addEventListener('click', clearAppliedLaunchBlueprint);

    container.classList.remove('hidden');
}

function clearAppliedLaunchBlueprint() {
    if (!tokenLaunchState.launchConfig?.appliedBlueprint) {
        return;
    }

    tokenLaunchState.launchConfig.appliedBlueprint = null;
    renderLaunchBlueprintSummary();

    renderBlueprintList(true).catch((error) => {
        console.warn('Unable to refresh blueprints after clearing:', error);
    });

    notify('Launch blueprint removed from configuration.', 'info');
}

async function renderBlueprintList(force = false) {
    if (!ensureMultiWalletReady()) {
        return;
    }

    const listEl = getElement('blueprints-list');
    const emptyEl = getElement('blueprints-empty-state');
    if (!listEl || !emptyEl) {
        return;
    }

    let blueprints = [];
    try {
        blueprints = await blueprintService.fetchList(force);
    } catch (error) {
        console.error('Failed to load blueprints:', error);
        notify(`Unable to load blueprints: ${error.message}`, 'error');
        blueprints = [];
    }
    listEl.innerHTML = '';

    if (blueprints.length === 0) {
        emptyEl.classList.remove('hidden');
        listEl.classList.add('hidden');
        return;
    }

    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');

    const appliedId = tokenLaunchState.launchConfig?.appliedBlueprint?.id || null;

    blueprints
        .slice()
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        .forEach((blueprint) => {
            const card = buildBlueprintCard(blueprint);
            if (appliedId && blueprint.id === appliedId) {
                card.classList.add('ring-2', 'ring-purple-500/60');
            }
            listEl.appendChild(card);
        });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    renderLaunchBlueprintSummary();

    renderLaunchBlueprintList().catch(() => {
        // Non-critical: launch blueprint modal can refresh later.
    });

    if (document.getElementById('automation-blueprint-modal')?.classList.contains('hidden') === false) {
        renderAutomationBlueprintList().catch(() => {
            // Non-critical: automation modal can refresh later.
        });
    }
}

function openAutomationBlueprintModal() {
    if (!ensureMultiWalletReady()) {
        return;
    }

    const listEl = getElement('automation-blueprint-list');
    const emptyEl = getElement('automation-blueprint-empty');

    if (listEl) {
        listEl.innerHTML = `
            <div class="flex items-center justify-center gap-2 text-sm text-gray-400 py-6">
                <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
                <span>Loading blueprints...</span>
            </div>
        `;
        listEl.classList.remove('hidden');
    }
    if (emptyEl) {
        emptyEl.classList.add('hidden');
    }

    window.openModal('automation-blueprint-modal');

    renderAutomationBlueprintList()
        .catch((error) => {
            console.error('Unable to load automation blueprints:', error);
            notify(`Unable to load blueprints: ${error.message}`, 'error');
            if (listEl) {
                listEl.classList.add('hidden');
            }
            if (emptyEl) {
                emptyEl.classList.remove('hidden');
            }
        })
        .finally(() => {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
}

async function renderAutomationBlueprintList(force = false) {
    const listEl = getElement('automation-blueprint-list');
    const emptyEl = getElement('automation-blueprint-empty');
    if (!listEl || !emptyEl) {
        return;
    }

    let blueprints = [];
    try {
        blueprints = await blueprintService.fetchList(force);
    } catch (error) {
        listEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        throw error;
    }

    if (!Array.isArray(blueprints) || blueprints.length === 0) {
        listEl.innerHTML = '';
        listEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        return;
    }

    const cards = blueprints
        .slice()
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        .map((blueprint) => {
            const launch = blueprint.settings?.launch || {};
            const automations = blueprint.settings?.automations || {};
            const detailParts = [];

            if (launch.devBuyAmount !== undefined) {
                detailParts.push(`Dev buy ${formatSol(launch.devBuyAmount)}`);
            }
            if (automations.smartSell?.enabled) {
                detailParts.push('Smart Sell enabled');
            }
            if (automations.volumeBot?.enabled) {
                detailParts.push('Volume Bot enabled');
            }

            const summary =
                detailParts.length > 0
                    ? detailParts.join(' • ')
                    : 'No automation notes provided';

            const lastRunDisplay = blueprint.lastRun
                ? `Last run ${formatRelativeTime(blueprint.lastRun)}`
                : 'Never run';

            return `
                <div class="bg-neutral-900/70 border border-neutral-800 rounded-lg p-4 space-y-3">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <div class="text-sm font-semibold text-white">${escapeHtml(blueprint.name || 'Blueprint')}</div>
                            <div class="text-xs text-gray-500">${escapeHtml((blueprint.template || blueprint.type || 'custom').replace(/-/g, ' '))}</div>
                        </div>
                        <span class="text-[11px] text-gray-500">${escapeHtml(lastRunDisplay)}</span>
                    </div>
                    <div class="text-xs text-gray-400">${escapeHtml(summary)}</div>
                    <div class="flex items-center justify-end gap-2">
                        <button class="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs rounded transition" data-run-blueprint="${escapeHtml(blueprint.id)}" onclick="runAutomationBlueprintFromButton(this)">
                            Run Blueprint
                        </button>
                        <button class="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-xs rounded transition" onclick="navigateToPage('blueprint'); closeModal('automation-blueprint-modal')">
                            Manage
                        </button>
                    </div>
                </div>
            `;
        })
        .join('');

    listEl.innerHTML = cards;
    listEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
async function runAutomationBlueprint(blueprintId, triggerButton = null) {
    if (!blueprintId) {
        return;
    }

    const blueprint = blueprintService.getById(blueprintId);
    const label = blueprint?.name || 'Blueprint';
    const selector = triggerButton ? null : `[data-run-blueprint="${CSS?.escape ? CSS.escape(blueprintId) : blueprintId}"]`;
    const button = triggerButton || (selector ? document.querySelector(selector) : null);

    try {
        if (button) {
            setButtonLoading(button, true, 'Running…');
        }

        await blueprintService.execute(blueprintId);

        notify(`Blueprint "${label}" queued for execution.`, 'success');
        addConsoleLog(`⚙️ Blueprint queued: ${label}`, 'info');

        closeModal('automation-blueprint-modal');

        await renderBlueprintList(true);

        if (tokenRegistry.current && tokenRegistry.current.type !== 'draft') {
            setTimeout(() => {
                loadLiveTokenDetail(tokenRegistry.current);
            }, 1500);
        }
    } catch (error) {
        console.error('Blueprint execution failed:', error);
        notify(`Failed to run blueprint: ${error.message}`, 'error');
    } finally {
        if (button) {
            setButtonLoading(button, false);
        }
    }
}

function runAutomationBlueprintFromButton(button) {
    if (!button) {
        return;
    }
    const blueprintId = button.dataset.runBlueprint;
    runAutomationBlueprint(blueprintId, button);
}

async function deleteBlueprint(blueprintId) {
    if (!ensureMultiWalletReady()) {
        return;
    }

    await blueprintService.fetchList();
    const blueprint = blueprintService.getById(blueprintId);
    if (!blueprint) {
        notify('Blueprint not found.', 'error');
        return;
    }

    if (!window.confirm(`Delete blueprint "${blueprint.name}"?`)) {
        return;
    }

    try {
        await blueprintService.remove(blueprintId);
        notify(`Blueprint "${blueprint.name}" deleted.`, 'success');
        addConsoleLog(`🗑️ Blueprint deleted: ${blueprint.name}`, 'info');
        await renderBlueprintList(true);
    } catch (error) {
        console.error('Failed to delete blueprint:', error);
        notify(`Failed to delete blueprint: ${error.message}`, 'error');
    }
}

async function applyBlueprint(blueprintId) {
    if (!ensureMultiWalletReady()) {
        return;
    }

    await blueprintService.fetchList();
    const blueprint = blueprintService.getById(blueprintId);
    if (!blueprint) {
        notify('Blueprint not found.', 'error');
        return;
    }

    navigateToPage('create-token');

    setTimeout(() => {
        applyBlueprintToLaunch(blueprint);
    }, 200);

    blueprintService
        .markApplied(blueprintId)
        .then(() => renderBlueprintList(true))
        .catch((error) => {
            console.warn('Unable to record blueprint usage:', error);
        });
}

function applyBlueprintToLaunch(blueprint) {
    const launch = blueprint.settings?.launch || {};
    const automations = blueprint.settings?.automations || {};

    tokenLaunchState.launchConfig.appliedBlueprint = {
        id: blueprint.id,
        name: blueprint.name || '',
        type: blueprint.type || blueprint.template || 'custom',
        appliedAt: Date.now()
    };

    if (launch.devWalletId) {
        tokenLaunchState.launchConfig.devWalletId = String(launch.devWalletId);
        tokenLaunchState.selectedWalletId = tokenLaunchState.launchConfig.devWalletId;
    }

    if (launch.devBuyAmount !== undefined) {
        const devBuyValue = safeNumber(launch.devBuyAmount);
        tokenLaunchState.launchConfig.devBuyAmount = devBuyValue !== null ? devBuyValue : null;
    } else {
        tokenLaunchState.launchConfig.devBuyAmount = null;
    }

    if (launch.blockZero && typeof launch.blockZero === 'object') {
        const clonedBlockZero = cloneLaunchConfig({ blockZero: launch.blockZero });
        tokenLaunchState.launchConfig.blockZero = clonedBlockZero.blockZero;
    } else {
        tokenLaunchState.launchConfig.blockZero = {
            enabled: false,
            mode: 'quick',
            selections: {}
        };
    }

    const devBuyInput = getElement('dev-buy-amount');
    if (devBuyInput && launch.devBuyAmount !== undefined) {
        devBuyInput.value = launch.devBuyAmount;
    }

    const initialBuyInput = getElement('initial-buy-amount');
    if (initialBuyInput && launch.initialBuyAmount !== undefined) {
        initialBuyInput.value = launch.initialBuyAmount;
    }

    const vanityToggle = getElement('use-vanity');
    if (vanityToggle) {
        vanityToggle.checked = Boolean(launch.useVanity);
    }

    const smartSellToggle = getElement('enable-smart-sell');
    if (smartSellToggle) {
        smartSellToggle.checked = Boolean(automations.smartSell?.enabled);
        toggleSmartSellConfig();
        const profit = getElement('smart-sell-profit');
        const stopLoss = getElement('smart-sell-stoploss');
        if (profit && automations.smartSell?.profitTarget !== undefined) {
            profit.value = automations.smartSell.profitTarget;
        }
        if (stopLoss && automations.smartSell?.stopLoss !== undefined) {
            stopLoss.value = automations.smartSell.stopLoss;
        }
    }

    const volumeToggle = getElement('enable-volume-bot');
    if (volumeToggle) {
        volumeToggle.checked = Boolean(automations.volumeBot?.enabled);
        toggleVolumeBotConfig();
        const volumeAmount = getElement('volume-bot-amount');
        const volumeCycles = getElement('volume-bot-cycles');
        const volumeDelay = getElement('volume-bot-delay');
        const volumeMinAmount = getElement('volume-bot-min-amount');
        const volumeMaxAmount = getElement('volume-bot-max-amount');
        const volumeBuyInterval = getElement('volume-bot-buy-interval');
        const volumeBuyIntervalMin = getElement('volume-bot-buy-interval-min');
        const volumeBuyIntervalMax = getElement('volume-bot-buy-interval-max');
        const volumeSellInterval = getElement('volume-bot-sell-interval');
        const volumeSellIntervalMin = getElement('volume-bot-sell-interval-min');
        const volumeSellIntervalMax = getElement('volume-bot-sell-interval-max');
        const volumeSellPercentMin = getElement('volume-bot-sell-percent-min');
        const volumeSellPercentMax = getElement('volume-bot-sell-percent-max');
        const volumeRandomizeAmounts = getElement('volume-bot-randomize');
        const volumeRandomizeDelay = getElement('volume-bot-randomize-delay');
        const guardrailToggle = getElement('volume-bot-guardrails-enabled');
        const guardrailProfit = getElement('volume-bot-profit-target');
        const guardrailLoss = getElement('volume-bot-loss-limit');
        if (volumeAmount && automations.volumeBot?.buyAmount !== undefined) {
            volumeAmount.value = automations.volumeBot.buyAmount;
        }
        if (volumeCycles && automations.volumeBot?.cycles !== undefined) {
            volumeCycles.value = automations.volumeBot.cycles;
        }
        if (volumeDelay && automations.volumeBot?.sellDelay !== undefined) {
            volumeDelay.value = automations.volumeBot.sellDelay;
        }
        if (volumeMinAmount) {
            volumeMinAmount.value =
                automations.volumeBot?.minAmount !== undefined ? automations.volumeBot.minAmount : '';
        }
        if (volumeMaxAmount) {
            volumeMaxAmount.value =
                automations.volumeBot?.maxAmount !== undefined ? automations.volumeBot.maxAmount : '';
        }
        if (volumeBuyInterval) {
            volumeBuyInterval.value =
                automations.volumeBot?.buyIntervalSeconds !== undefined
                    ? automations.volumeBot.buyIntervalSeconds
                    : '';
        }
        if (volumeBuyIntervalMin) {
            volumeBuyIntervalMin.value =
                automations.volumeBot?.buyIntervalMinSeconds !== undefined
                    ? automations.volumeBot.buyIntervalMinSeconds
                    : '';
        }
        if (volumeBuyIntervalMax) {
            volumeBuyIntervalMax.value =
                automations.volumeBot?.buyIntervalMaxSeconds !== undefined
                    ? automations.volumeBot.buyIntervalMaxSeconds
                    : '';
        }
        if (volumeSellInterval) {
            volumeSellInterval.value =
                automations.volumeBot?.sellIntervalSeconds !== undefined
                    ? automations.volumeBot.sellIntervalSeconds
                    : '';
        }
        if (volumeSellIntervalMin) {
            volumeSellIntervalMin.value =
                automations.volumeBot?.sellIntervalMinSeconds !== undefined
                    ? automations.volumeBot.sellIntervalMinSeconds
                    : '';
        }
        if (volumeSellIntervalMax) {
            volumeSellIntervalMax.value =
                automations.volumeBot?.sellIntervalMaxSeconds !== undefined
                    ? automations.volumeBot.sellIntervalMaxSeconds
                    : '';
        }
        if (volumeSellPercentMin) {
            volumeSellPercentMin.value =
                automations.volumeBot?.sellPercentageMin !== undefined
                    ? automations.volumeBot.sellPercentageMin
                    : '';
        }
        if (volumeSellPercentMax) {
            volumeSellPercentMax.value =
                automations.volumeBot?.sellPercentageMax !== undefined
                    ? automations.volumeBot.sellPercentageMax
                    : '';
        }
        if (volumeRandomizeAmounts) {
            volumeRandomizeAmounts.checked = automations.volumeBot?.randomizeAmounts !== false;
        }
        if (volumeRandomizeDelay) {
            volumeRandomizeDelay.checked = automations.volumeBot?.randomizeDelay !== false;
        }
        if (guardrailToggle) {
            guardrailToggle.checked = automations.volumeBot?.guardrails?.enabled !== false;
        }
        if (guardrailProfit) {
            guardrailProfit.value =
                automations.volumeBot?.guardrails?.realizedProfitTarget !== undefined
                    ? automations.volumeBot.guardrails.realizedProfitTarget
                    : '';
        }
        if (guardrailLoss) {
            guardrailLoss.value =
                automations.volumeBot?.guardrails?.realizedLossLimit !== undefined
                    ? automations.volumeBot.guardrails.realizedLossLimit
                    : '';
        }
        toggleVolumeGuardrails();
    }

    const normalizeSelectorForLaunch = (automationConfig = {}) => {
        const selector = automationConfig.walletSelector || {};
        let mode = selector.mode || automationConfig.walletMode || 'creator';
        let walletIds = Array.isArray(selector.walletIds) ? [...selector.walletIds] : [];
        let groupId = selector.groupId || automationConfig.walletGroupId || automationConfig.walletGroup || '';

        if (mode === 'all') {
            mode = 'custom';
            walletIds = (tokenLaunchState.wallets || [])
                .map((wallet) => getWalletIdentifier(wallet))
                .filter(Boolean);
        }

        if (mode === 'creator' && walletIds.length === 0 && tokenLaunchState.selectedWalletId) {
            walletIds = [tokenLaunchState.selectedWalletId];
        }

        return {
            mode,
            walletIds,
            groupId
        };
    };

    tokenLaunchState.automations.smartSell = normalizeSelectorForLaunch(automations.smartSell);
    tokenLaunchState.automations.volumeBot = normalizeSelectorForLaunch(automations.volumeBot);

    populateLaunchAutomationWalletOptions();
    populateLaunchAutomationGroupOptions();
    reflectLaunchAutomationState('smartSell');
    reflectLaunchAutomationState('volumeBot');

    renderLaunchBlueprintSummary();
    refreshLaunchWalletDependencies();

    if (blueprint.notes) {
        notify(blueprint.notes, 'info');
    }

    focusAutomationSection();
    notify(`Blueprint "${blueprint.name}" applied to launch form.`, 'success');
    addConsoleLog(`📋 Applied blueprint: ${blueprint.name}`, 'info');
}

function handleAutomationTask(taskName, automationOptions) {
    navigateToPage('create-token');

    setTimeout(() => {
        configureAutomationOptions(automationOptions);
        focusAutomationSection();
    }, 200);

    notify(`${taskName} automation ready. Review settings in Launch Automations.`, 'info');
}

registerGlobalHandler('executeAddVolumeTask', () => handleAutomationTask('Volume generation', { volumeBot: true }));
registerGlobalHandler('executeBulkSellTask', executeBulkSellTask);
registerGlobalHandler('stopBulkSellTask', stopBulkSellTask);
registerGlobalHandler('executeBumpTask', executeBumpTask);
registerGlobalHandler('updateBumpWalletSelection', updateBumpWalletSelection);
registerGlobalHandler('stopBumpTask', stopBumpTask);
registerGlobalHandler('executeSellBuybackTask', () => handleAutomationTask('Sell/Buyback', { smartSell: true, volumeBot: true }));

registerGlobalHandler('refreshFeeWallet', async () => {
    notify('Refreshing fee wallet...', 'info');
    try {
        await loadRealData();
        await refreshCreatorWalletBalance({ address: creatorWalletState.address });
        notify('Fee wallet refreshed from on-chain data', 'success');
    } catch (error) {
        notify(`Unable to refresh fee wallet: ${error.message}`, 'error');
    }
});

function copyInnerText(elementId, label) {
    const element = getElement(elementId);
    if (!element) {
        notify(`${label} not available`, 'error');
        return;
    }
    const value = element.textContent.trim();
    navigator.clipboard.writeText(value).then(() => {
        notify(`${label} copied to clipboard`, 'success');
    }).catch(() => {
        notify(`Unable to copy ${label.toLowerCase()}`, 'error');
    });
}

registerGlobalHandler('copyFeeWalletAddress', () => {
    if (!creatorWalletState.address) {
        notify('No creator wallet configured yet. Import one first.', 'warning');
        return;
    }
    navigator.clipboard
        .writeText(creatorWalletState.address)
        .then(() => notify('Creator wallet address copied.', 'success'))
        .catch(() => notify('Unable to copy creator wallet address.', 'error'));
});
registerGlobalHandler('copyFeeWalletKey', () => openCreatorWalletModal());
registerGlobalHandler('openCreatorWalletModal', () => openCreatorWalletModal());
registerGlobalHandler('submitCreatorWalletImport', () => submitCreatorWalletImport());

registerGlobalHandler('openDocumentation', () => {
    window.open('https://docs.chaosbotonsol.xyz', '_blank', 'noopener');
});

// Floating window functions (for legacy floating task windows)
function selectMethod(taskType, method) {
    const jitoBtn = document.getElementById(`${taskType}-method-jito`);
    const rpcBtn = document.getElementById(`${taskType}-method-rpc`);
    
    if (jitoBtn && rpcBtn) {
        if (method === 'jito') {
            jitoBtn.classList.add('active');
            jitoBtn.classList.remove('bg-neutral-800', 'text-gray-400');
            jitoBtn.classList.add('bg-purple-600', 'text-white');
            rpcBtn.classList.remove('active', 'bg-purple-600', 'text-white');
            rpcBtn.classList.add('bg-neutral-800', 'text-gray-400');
        } else {
            rpcBtn.classList.add('active');
            rpcBtn.classList.remove('bg-neutral-800', 'text-gray-400');
            rpcBtn.classList.add('bg-purple-600', 'text-white');
            jitoBtn.classList.remove('active', 'bg-purple-600', 'text-white');
            jitoBtn.classList.add('bg-neutral-800', 'text-gray-400');
        }
    }
}

function startDrag(event, windowId) {
    event.preventDefault();
    const window = document.getElementById(windowId);
    if (!window) return;
    
    const header = event.currentTarget;
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX = event.clientX;
    let initialY = event.clientY;
    
    const drag = (e) => {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            const rect = window.getBoundingClientRect();
            const newX = rect.left + currentX;
            const newY = rect.top + currentY;
            
            window.style.left = `${newX}px`;
            window.style.top = `${newY}px`;
            
            initialX = e.clientX;
            initialY = e.clientY;
        }
    };
    
    const dragEnd = () => {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', dragEnd);
    };
    
    isDragging = true;
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
}

function minimizeWindow(windowId) {
    const window = document.getElementById(windowId);
    if (window) {
        window.classList.toggle('minimized');
    }
}

function closeFloatingWindow(windowId) {
    const window = document.getElementById(windowId);
    if (window) {
        window.classList.add('hidden');
    }
}

window.selectMethod = selectMethod;
window.startDrag = startDrag;
window.minimizeWindow = minimizeWindow;
window.closeFloatingWindow = closeFloatingWindow;

registerGlobalHandler('sharePlatform', async () => {
    const url = window.location.href;
    const title = 'ChaosOnSolana Trading Platform';
    if (navigator.share) {
        try {
            await navigator.share({ title, url });
            notify('Share dialog opened.', 'success');
        } catch (err) {
            notify(`Share cancelled: ${err.message}`, 'warning');
        }
        return;
    }

    navigator.clipboard.writeText(url).then(() => {
        notify('Share link copied to clipboard', 'success');
    }).catch(() => notify('Unable to copy link', 'error'));
});

// Ensure defaults are applied on load
document.addEventListener('DOMContentLoaded', () => {
    window.selectFundMode?.(uiHelperState.fundMode);
    window.selectTagExecutor?.(uiHelperState.tagExecutor);
    window.selectWarmExecutor?.(uiHelperState.warmExecutor);
    window.selectRedistributeMode?.(uiHelperState.redistributeMode);
    window.selectTokenPlatform?.(uiHelperState.tokenPlatform);
    window.selectCopyPlatform?.(uiHelperState.copyPlatform);
    window.selectBlockZeroMode?.(uiHelperState.blockZeroMode);
});