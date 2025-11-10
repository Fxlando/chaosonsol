// Real On-Chain Trading UI - No Fake Data
// 100% Solana Blockchain Integration

let solana;
let rtSelectedWallets = new Set();
let rtCurrentView = 'wallets';
let vanityKeyStore = [];
let vanityLaunchStore = [];
let vanityVisibility = new Set();
let rtAutoScroll = true;
let closeMobileSidebar = () => {};
const MIN_RENT_BUFFER_SOL = 0.001;

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
            solana = new SolanaIntegration();
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
    loadTokenDraftsFromStorage();
    loadVanityLaunchesFromStorage();
    loadVanityKeysFromStorage();
    refreshVanityLaunchPerformance().catch(error => {
        console.warn('Unable to refresh vanity launch performance:', error);
    });
    console.log('✅ Real Trading Platform Ready');
});

// Load real blockchain data
async function loadRealData() {
    try {
        // Load real SOL price
        const solPrice = await solana.getSolPrice();
        updateSOLPrice(solPrice);
        
        // Load saved wallets with real balances
        const wallets = await solana.getAllWalletsWithBalances();
        renderWallets(wallets);
        updateTotalBalance(wallets);
        syncCreatorWalletFromWallets(wallets, {
            preferredId: creatorWalletState.id,
            fallbackAddress: creatorWalletState.address
        });
        
        // Check RPC health
        const rpcHealth = await solana.checkRPCHealth();
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
    
    const result = await solana.connectWallet();
    
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
        
        const wallet = solana.createWallet();
        
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
        
        const result = solana.importWallet(privateKey);
        
        if (result.success) {
            // Get real balance
            const balance = await solana.getBalance(result.publicKey);
            
            const wallet = {
                name: name || `Wallet-${Date.now()}`,
                publicKey: result.publicKey,
                balance: balance,
                tags: [],
                timestamp: Date.now()
            };
            
            solana.saveWallet(wallet);
            
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
        
        const result = await solana.transferSOL(fromPrivateKey, toPublicKey, amount);
        
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
        
        const balance = await solana.getBalance(publicKey);
        
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
            const price = await solana.getSolPrice();
            updateSOLPrice(price);
            updateTopbarSyncTimestamp(Date.now());
        } catch (error) {
            console.error('Error updating price:', error);
        }
    }, 30000);
    
    // Check RPC health every 60 seconds
    setInterval(async () => {
        try {
            const health = await solana.checkRPCHealth();
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

function getWalletEmoji(index) {
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
    const radios = document.querySelectorAll('input[name="mint-selection"]');
    const customWrapper = document.getElementById('tag-custom-mints-wrapper');

    const toggle = () => {
        if (!customWrapper) return;
        const selected = document.querySelector('input[name="mint-selection"]:checked');
        if (selected && selected.value === 'custom') {
            customWrapper.classList.remove('hidden');
        } else {
            customWrapper.classList.add('hidden');
        }
    };

    radios.forEach(radio => {
        radio.addEventListener('change', toggle);
    });

    toggle();
}

const missingGlobalHandlers = [
    'executeFundWallets',
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

    const placeholder = (...args) => {
        const message = `${name} is not available in this build yet.`;
        if (typeof notify === 'function') {
            notify(message, 'warning');
        } else {
            console.warn(message, { args });
        }
        return null;
    };

    placeholder.__placeholder = true;
    window[name] = placeholder;
}

missingGlobalHandlers.forEach(ensureGlobalFunction);

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

function switchView(viewName) {
    console.log(`switchView called with: ${viewName}`);
    
    if (!viewName) {
        console.error('switchView called without viewName');
        return;
    }
    
    rtCurrentView = viewName;
    
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
        renderBlueprintList();
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
    launchConfig: createDefaultLaunchConfig(),
    launchControlsReady: false,
    walletGroups: [],
    isLoadingGroups: false,
    automationControlsReady: false,
    pendingDraftId: null,
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
}

const blueprintFormState = {
    controlsReady: false
};

const PUMPFUN_IMAGE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB limit to match Pump.fun
const EMBED_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // Embed directly only if <= 2 MB

// Initialize PumpFun Trading
function initializePumpFun() {
    if (!pumpFunTrading && solana) {
        const settingsProvider = () => window.settingsManager?.getSettings();
        pumpFunTrading = new PumpFunTrading(solana, settingsProvider);
        console.log('✅ PumpFun Trading initialized');
    }
}

// Initialize Multi-Wallet Manager
function initializeMultiWallet() {
    if (!multiWalletManager && solana) {
        multiWalletManager = new MultiWalletManager(solana);
        multiWalletManager.loadBlueprints();
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
    if (!solana) {
        console.warn('Solana integration not ready for settings initialization');
        return;
    }

    if (!settingsManager || force) {
        if (!settingsManager) {
            settingsManager = new SettingsManager(solana);
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
    if (apiBase && apiBase.includes('/.netlify/functions')) {
        return apiBase;
    }
    return '/.netlify/functions';
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
            tokenLaunchState.selectedWalletId = event.target.value;
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
        const wallets = Array.isArray(response?.wallets) ? response.wallets : [];

        if (wallets.length) {
            populateCreatorWalletSelect(walletSelect, wallets, { walletStatus });
            tokenLaunchState.wallets = wallets;
            return;
        }

        // Fall back to local wallets if backend has none (useful during migration)
        const localWallets = Array.isArray(window.solana?.wallets) ? window.solana.wallets : [];
        if (localWallets.length) {
            populateCreatorWalletSelect(walletSelect, localWallets, {
                walletStatus,
                local: true
            });
            tokenLaunchState.wallets = [];
            return;
        }

        populateCreatorWalletSelect(walletSelect, [], { walletStatus });
        tokenLaunchState.wallets = [];
    } catch (error) {
        console.error('Failed to load creator wallets:', error);
        const operationsWallets =
            typeof window.walletOperations?.getWallets === 'function'
                ? window.walletOperations.getWallets()
                : [];

        if (operationsWallets.length) {
            populateCreatorWalletSelect(walletSelect, operationsWallets, {
                walletStatus,
                local: !operationsWallets[0]?.id,
                error
            });
            tokenLaunchState.wallets = operationsWallets;
            return;
        }

        const localWallets = Array.isArray(window.solana?.wallets) ? window.solana.wallets : [];

        if (localWallets.length) {
            populateCreatorWalletSelect(walletSelect, localWallets, {
                walletStatus,
                local: true,
                error
            });
        } else {
            walletSelect.innerHTML = '<option value="">Unable to load wallets</option>';
            walletSelect.disabled = true;
            if (walletStatus) {
                walletStatus.textContent = `Unable to load wallets (${error.message}). Import wallets from the Wallets view.`;
                walletStatus.classList.remove('text-gray-500');
                walletStatus.classList.add('text-red-400');
            }
        }
    }
}

function populateCreatorWalletSelect(selectEl, wallets, options = {}) {
    const walletStatus = options.walletStatus;
    const isLocal = options.local;
    const error = options.error;

    selectEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = wallets.length ? 'Select wallet...' : 'No wallets available';
    placeholder.disabled = true;
    placeholder.selected = true;
    selectEl.appendChild(placeholder);

    wallets.forEach(wallet => {
        const value = wallet.id || wallet.publicKey;
        if (!value) return;

        const option = document.createElement('option');
        option.value = value;
        const baseLabel = wallet.name || 'Unnamed';
        const suffix = isLocal ? ' (local)' : '';
        option.textContent = `${baseLabel}${suffix} • ${truncateAddress(wallet.publicKey || wallet.address || value)}`;

        const balance = wallet.balance ?? wallet.solBalance;
        if (typeof balance === 'number') {
            option.dataset.balance = balance.toFixed(4);
        }
        selectEl.appendChild(option);
    });

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
            placeholder.selected = false;
        }
    } else if (wallets.length === 1) {
        selectEl.value = wallets[0].id || wallets[0].publicKey;
        tokenLaunchState.selectedWalletId = selectEl.value;
        placeholder.selected = false;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (wallets.length > 1) {
        const firstOption = selectEl.options[1];
        if (firstOption) {
            firstOption.selected = true;
            placeholder.selected = false;
            tokenLaunchState.selectedWalletId = firstOption.value;
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
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select group...';
        selectEl.appendChild(placeholder);

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
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select dev wallet...';
    placeholder.disabled = true;
    selectEl.appendChild(placeholder);

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
        placeholder.selected = false;
        tokenLaunchState.launchConfig.devWalletId = selectedId;
        tokenLaunchState.selectedWalletId = selectedId;
    } else {
        placeholder.selected = true;
    }

    if (statusEl) {
        statusEl.textContent = `${wallets.length} wallet${wallets.length === 1 ? '' : 's'} available.`;
        statusEl.classList.remove('text-red-400');
        statusEl.classList.add('text-gray-500');
    }
}

function updateBlockZeroModeUI() {
    const mode = tokenLaunchState.launchConfig.blockZero.mode || 'quick';
    const quickCard = getElement('block-zero-quick');
    if (quickCard) {
        const isActive = mode === 'quick';
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
                        <input type="number" class="w-28 bg-black border border-neutral-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-neutral-500" data-block-zero-amount value="${amountValue !== '' ? escapeHtml(String(amountValue)) : ''}" step="0.001" min="0" placeholder="0.00" ${selected ? '' : 'disabled'}>
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
    if (forceWalletReload || getLaunchWallets().length === 0) {
        try {
            await loadCreatorWallets();
        } catch (error) {
            console.error('Failed to load creator wallets for launch view:', error);
        }
    }

    populateLaunchDevWalletSelect();

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
        const response = await fetch('/.netlify/functions/groups', {
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

        const enableSmartSell = document.getElementById('enable-smart-sell')?.checked || false;
        const enableVolumeBot = document.getElementById('enable-volume-bot')?.checked || false;

        const smartSellSelection = resolveLaunchAutomationSelection('smartSell', creatorWalletId);
        const volumeSelection = resolveLaunchAutomationSelection('volumeBot', creatorWalletId);

        let smartSellConfig = null;
        if (enableSmartSell) {
            const validation = validateAutomationSelection('Smart Sell', smartSellSelection);
            if (!validation.valid) {
                notify(`${validation.message} Draft saved without Smart Sell.`, 'warning');
                addConsoleLog(`⚠️ Smart Sell disabled for draft: ${validation.message}`, 'warning');
            } else {
                smartSellConfig = (() => {
                    const config = {
                        enabled: true,
                        walletSelector: smartSellSelection,
                        walletMode: smartSellSelection.mode,
                        walletIds: smartSellSelection.mode !== 'group' ? smartSellSelection.walletIds : undefined,
                        walletGroupId: smartSellSelection.mode === 'group' ? smartSellSelection.groupId : undefined,
                        walletGroupName:
                            smartSellSelection.mode === 'group'
                                ? getWalletGroupById(smartSellSelection.groupId)?.name || null
                                : null,
                        profitTarget: parseFloat(document.getElementById('smart-sell-profit')?.value || '30'),
                        stopLoss: parseFloat(document.getElementById('smart-sell-stoploss')?.value || '-15'),
                        trailingStop: parseFloat(document.getElementById('smart-sell-trailing')?.value || '10'),
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

                    return config;
                })();
            }
        }

        let volumeBotConfig = null;
        if (enableVolumeBot) {
            const validation = validateAutomationSelection('Volume Bot', volumeSelection);
            if (!validation.valid) {
                notify(`${validation.message} Draft saved without Volume Bot.`, 'warning');
                addConsoleLog(`⚠️ Volume Bot disabled for draft: ${validation.message}`, 'warning');
            } else {
                volumeBotConfig = (() => {
                    const readNumber = (id) => {
                        const value = parseFloat(document.getElementById(id)?.value ?? '');
                        return Number.isFinite(value) ? value : null;
                    };

                    const config = {
                        enabled: true,
                        walletSelector: volumeSelection,
                        walletMode: volumeSelection.mode,
                        walletIds: volumeSelection.mode !== 'group' ? volumeSelection.walletIds : undefined,
                        walletGroupId: volumeSelection.mode === 'group' ? volumeSelection.groupId : undefined,
                        walletGroupName:
                            volumeSelection.mode === 'group'
                                ? getWalletGroupById(volumeSelection.groupId)?.name || null
                                : null,
                        buyAmount: parseFloat(document.getElementById('volume-bot-amount')?.value || '0.01'),
                        sellDelay: parseInt(document.getElementById('volume-bot-delay')?.value || '30', 10),
                        cycles: parseInt(document.getElementById('volume-bot-cycles')?.value || '10', 10),
                        randomizeAmounts: Boolean(document.getElementById('volume-bot-randomize')?.checked),
                        randomizeDelay: Boolean(document.getElementById('volume-bot-randomize-delay')?.checked)
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

                    const guardrailsEnabled = Boolean(document.getElementById('volume-bot-guardrails-enabled')?.checked);
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

                    if (!Array.isArray(config.walletIds) || config.walletIds.length === 0) {
                        delete config.walletIds;
                    }
                    if (!config.walletGroupId) {
                        delete config.walletGroupId;
                    }
                    if (!config.walletGroupName) {
                        delete config.walletGroupName;
                    }

                    return config;
                })();
            }
        }

        const automationsPayload = {};
        if (smartSellConfig) automationsPayload.smartSell = smartSellConfig;
        if (volumeBotConfig) automationsPayload.volumeBot = volumeBotConfig;

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
            notes: ''
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
            notify(`Copying via ${platform} isn’t supported yet. Choose Pump.fun.`, 'warning');
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

        const record = {
            mint: response.tokenMint,
            name: response.copiedMetadata?.name || response.metadata?.name || 'Copied Token',
            symbol: response.copiedMetadata?.symbol || response.metadata?.symbol || '',
            description: response.copiedMetadata?.description || '',
            image: response.copiedMetadata?.image || '',
            status: 'Copied',
            type: 'copy',
            launchpad: 'Pump.fun',
            sourceMint: mintAddress,
            metadataUri: response.metadataUri || response.copiedMetadata?.metadataUri || '',
            signature: response.signature,
            explorerUrl: response.viewOnExplorer,
            website: response.copiedMetadata?.website,
            twitter: response.copiedMetadata?.twitter,
            telegram: response.copiedMetadata?.telegram
        };

        registerImportedToken(record);

        addConsoleLog(`✅ Token copied successfully. New mint: ${response.tokenMint}`, 'success');
        notify(`Token copied! New mint: ${response.tokenMint}`, 'success');

        if (response.viewOnExplorer) {
            window.open(response.viewOnExplorer, '_blank', 'noopener');
        } else if (response.tokenMint) {
            openLaunchLinks(response.tokenMint);
        }

        renderTokensTable();
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

        setButtonLoading(button, true, 'Importing token…');
        await ensureApiClientReady();

        addConsoleLog(`📥 Importing token ${mintAddress} from Pump.fun...`, 'info');
        notify('Fetching live token metadata from Pump.fun…', 'info');

        const response = await window.apiClient.importToken(mintAddress, { platform });

        if (!response?.success) {
            throw new Error(response?.error || 'Import request failed');
        }

        const info = response.token || {};

        const record = {
            mint: info.mint || mintAddress,
            name: info.name || 'Imported Token',
            symbol: info.symbol || '',
            description: info.description || '',
            image: info.image || '',
            status: 'Imported',
            type: 'imported',
            launchpad: 'Pump.fun',
            metadataUri: info.metadataUri || response.source?.metadataUri || '',
            website: info.website || response.source?.website,
            twitter: info.twitter || response.source?.twitter,
            telegram: info.telegram || response.source?.telegram,
            marketCap: info.marketCap,
            price: info.price,
            totalSupply: info.totalSupply,
            decimals: info.decimals
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
    const wallets = Array.isArray(solana?.wallets) ? solana.wallets : [];
    const prefixes = ['blueprint-smart-sell', 'blueprint-volume'];

    prefixes.forEach((prefix) => {
        const selectors = getBlueprintAutomationSelectors(prefix);
        const selectEl = getElement(selectors.walletSelect);
        if (!selectEl) return;

        const previousValues = new Set(getSelectValues(selectEl).map((value) => value.toLowerCase()));
        selectEl.innerHTML = '';

        wallets.forEach((wallet) => {
            const value = getWalletIdentifier(wallet);
            if (!value) return;
            const option = document.createElement('option');
            option.value = value;
            option.textContent = buildWalletOptionLabel(wallet);
            option.selected = previousValues.has(value.toLowerCase());
            selectEl.appendChild(option);
        });
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
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select group...';
        selectEl.appendChild(placeholder);

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
            if (selector.groupId || selector.walletGroupId || automationConfig.walletGroupId) {
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
    
    const blueprint = multiWalletManager.createBlueprint({
        name,
        type,
        wallets: solana.wallets || [],
        settings: {
            // Default settings based on type
            tokenMint: '',
            buyAmount: 0.01,
            slippage: 1,
            cycles: 10,
            sellDelay: 30
        }
    });
    
    addConsoleLog(`✅ Blueprint created: ${blueprint.name}`, 'success');
    alert(`Blueprint "${name}" created successfully!`);
}

// Execute blueprint
async function executeBlueprint(blueprintId) {
    initializeMultiWallet();
    
    addConsoleLog(`🚀 Executing blueprint: ${blueprintId}`, 'info');
    
    const result = await multiWalletManager.executeBlueprint(blueprintId);
    
    if (result.success) {
        addConsoleLog(`✅ ${result.message}`, 'success');
    } else {
        addConsoleLog(`❌ Blueprint failed: ${result.error}`, 'error');
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

    if (!solana) {
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

        const walletsWithBalances = await solana.getAllWalletsWithBalances();
        const metrics = await calculateCollectFeesMetrics(walletsWithBalances);

        if (multiWalletManager?.getFeeHistory) {
            collectFeesState.history = multiWalletManager.getFeeHistory();
        }

        metrics.tradingLastCollected = getLastCollectionTimestamp(collectFeesState.history, ['trading', 'all']);
        metrics.rentLastCollected = getLastCollectionTimestamp(collectFeesState.history, ['rent', 'all']);

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
        metrics.solPrice = await solana.getSolPrice();
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
    if (!solana?.connection || !window.solanaWeb3?.PublicKey) {
        return { rentLamports: 0, closableAccounts: 0 };
    }

    try {
        if (!window.__CHAOSBOT_TOKEN_PROGRAM) {
            window.__CHAOSBOT_TOKEN_PROGRAM = new window.solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        }

        const owner = new window.solanaWeb3.PublicKey(publicKeyString);
        const response = await solana.connection.getParsedTokenAccountsByOwner(owner, {
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
        rentLastCollected: data.rentLastCollected || null
    };

    const tradingFeesEl = document.getElementById('trading-fees');
    const rentFeesEl = document.getElementById('rent-fees');
    const totalFeesEl = document.getElementById('total-fees');
    const tradingWalletsEl = document.getElementById('trading-wallets');
    const rentWalletsEl = document.getElementById('rent-wallets');
    const tradingLastEl = document.getElementById('trading-last');
    const rentLastEl = document.getElementById('rent-last');
    const usdEl = document.getElementById('fees-usd');

    if (tradingFeesEl) tradingFeesEl.textContent = `${metrics.tradingFees.toFixed(4)} SOL`;
    if (rentFeesEl) rentFeesEl.textContent = `${metrics.rentFees.toFixed(4)} SOL`;
    if (totalFeesEl) totalFeesEl.textContent = `${metrics.totalFees.toFixed(4)} SOL`;
    if (tradingWalletsEl) tradingWalletsEl.textContent = metrics.tradingWallets.toString();
    if (rentWalletsEl) rentWalletsEl.textContent = metrics.rentWallets.toString();
    if (usdEl) usdEl.textContent = `$${metrics.usdValue.toFixed(2)}`;

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
        const successful = Number(entry.successful) || 0;
        const processed = Number(entry.walletsProcessed) || entry.walletIds?.length || 0;
        const amount = Number(entry.totalCollected) || 0;

        const statusClass = successful === processed
            ? 'text-green-400'
            : successful === 0
                ? 'text-red-400'
                : 'text-yellow-400';

        return `
            <tr class="border-b border-neutral-800 hover:bg-neutral-800/40 transition">
                <td class="p-4 text-sm text-gray-300">${formatTimestamp(entry.timestamp)}</td>
                <td class="p-4 text-sm text-gray-300">${getFeeCategoryLabel(entry.category)}</td>
                <td class="p-4 text-sm font-mono text-purple-200">${amount.toFixed(4)} SOL</td>
                <td class="p-4 text-sm text-gray-300">${processed}</td>
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

// Collect all fees
async function collectAllFees(options = {}) {
    initializeMultiWallet();
    
    if (!solana.wallets || solana.wallets.length === 0) {
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
    
    // Confirm
    const walletCount = config.walletIds ? config.walletIds.length : solana.wallets.length;
    const confirm = window.confirm(
        config.confirmMessage
            || `Collect SOL from ${walletCount} wallet${walletCount === 1 ? '' : 's'} to ${targetWallet}?\n\nThis will transfer all available SOL (minus rent) to the target wallet.`
    );
    
    if (!confirm) return;
    
    addConsoleLog(`💎 Starting fee collection (${config.category})...`, 'info');
    setCollectFeesLoading(true);
    
    try {
        const result = await multiWalletManager.collectFees(targetWallet, {
            walletIds: config.walletIds,
            category: config.category
        });
        window.__reclaimRentConfig = null;
        
        if (result.success) {
            addConsoleLog(`✅ Fee collection complete!`, 'success');
            addConsoleLog(`   Total collected: ${result.totalCollected.toFixed(4)} SOL`, 'success');
            addConsoleLog(`   Wallets processed: ${result.walletsProcessed}`, 'info');
            addConsoleLog(`   Successful: ${result.successful}`, 'info');
            
            alert(`✅ Collected ${result.totalCollected.toFixed(4)} SOL from ${result.successful} wallets!`);
            
            // Refresh wallets
            await loadRealData();
            await refreshCollectFeesView();
        } else {
            addConsoleLog(`❌ Fee collection failed: ${result.error}`, 'error');
            alert(`Fee collection failed: ${result.error}`);
        }
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
            solana.saveWallet(wallet);
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
window.collectAllFees = collectAllFees;
window.collectTradingFees = collectTradingFees;
window.collectRentFees = collectRentFees;
window.toggleAutoCollect = toggleAutoCollect;
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
// Instant Trading Functions
async function loadInstantTradingData() {
    try {
        const API_BASE = getApiBase();
        const endpoint = API_BASE.includes('/.netlify/functions') 
            ? `${API_BASE}/instant-trading/status` 
            : `${API_BASE}/api/instant-trading/status`;
        
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
    }, 5000); // Refresh every 5 seconds
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
        devBuyAmount: 0.2,
        blockZero: {
            enabled: false,
            mode: 'quick',
            selections: {}
        }
    };
}

const BLOCK_ZERO_MAX_SELECTIONS = 3;

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
    vanityFilter: 'available'
};

const tokenRegistry = {
    imported: new Map(),
    drafts: new Map(),
    current: null,
    currentSource: null
};

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
    const placeholder = '<span class="text-2xl">🪙</span>';
    if (!record?.image) {
        return `<div class="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">${placeholder}</div>`;
    }
    return `
        <div class="w-10 h-10 rounded-full bg-neutral-800 overflow-hidden flex items-center justify-center">
            <img src="${escapeHtml(record.image)}" alt="${escapeHtml(record.name || 'Token')}" class="w-full h-full object-cover" />
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
        updatedAt: Date.now()
    };

    if (merged.image) {
        merged.image = resolveImageUrl(merged.image);
    }

    tokenRegistry.imported.set(normalizedMint, merged);
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

    if (records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-12 text-center text-gray-500">
                    <div class="flex flex-col items-center gap-2">
                        <i data-lucide="inbox" class="w-10 h-10"></i>
                        <p class="text-base font-medium">No tokens tracked yet</p>
                        <p class="text-sm text-gray-500">Copy or import a Pump.fun token to populate this table.</p>
                    </div>
                </td>
            </tr>
        `;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        return;
    }

    tbody.innerHTML = records.map(buildTokenRow).join('');
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

    return `
        <tr data-token-id="${escapeHtml(identifier)}" data-token-source="${rowSource}" class="border-b border-neutral-800 hover:bg-neutral-800/40 transition cursor-pointer">
            <td class="p-4">
                <div class="flex items-center gap-3">
                    ${tokenAvatar(record)}
                    <div>
                        <div class="text-white font-semibold flex items-center gap-2">
                            <span>${escapeHtml(record.name || 'Unnamed')}</span>
                            ${record.symbol ? `<span class="text-xs text-gray-400">(${escapeHtml(record.symbol)})</span>` : ''}
                        </div>
                        <div class="text-xs text-gray-500 mt-1">${escapeHtml(description)}</div>
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
        row.addEventListener('click', () => {
            const identifier = row.getAttribute('data-token-id');
            const source = row.getAttribute('data-token-source') || 'imported';
            viewTokenDetails(identifier, source);
        });
    });
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

function populateTokenDetailView(record) {
    if (!record) return;
    tokenRegistry.current = record;
    tokenRegistry.currentSource = record.type === 'draft' ? 'draft' : 'imported';

    const nameEl = document.getElementById('selected-token-name');
    const titleEl = document.getElementById('selected-token-title');
    const subtitleEl = document.getElementById('selected-token-subtitle');
    const addressEl = document.getElementById('selected-token-address');
    const iconEl = document.getElementById('selected-token-icon');
    const statusEl = document.getElementById('token-status');
    const copyIcon = document.getElementById('selected-token-copy');
    const prepareButton = document.getElementById('prepare-launch-btn');

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

    if (iconEl) {
        if (record.image) {
            iconEl.innerHTML = `<img src="${escapeHtml(record.image)}" alt="${escapeHtml(record.name || 'Token')}" class="w-full h-full object-cover rounded-full" />`;
        } else {
            iconEl.textContent = '🪙';
        }
    }

    if (statusEl) {
        const statusLabel = record.status || (isDraft ? 'PRE-LAUNCH' : record.type?.toUpperCase() || 'ACTIVE');
        statusEl.textContent = statusLabel;
    }

    if (copyIcon) {
        if (isDraft) {
            copyIcon.classList.add('opacity-40', 'pointer-events-none');
            copyIcon.onclick = null;
        } else {
            copyIcon.classList.remove('opacity-40', 'pointer-events-none');
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

    updateTokenDetailLinks(record);

    const walletsTable = document.getElementById('token-wallets-table');
    if (walletsTable) {
        walletsTable.innerHTML = `
            <tr>
                <td colspan="3" class="p-4 text-center text-gray-500 text-sm">
                    Wallet breakdown will appear once balances are synced.
                </td>
            </tr>
        `;
    }
}

function viewTokenDetails(identifier, source = 'imported') {
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

    populateTokenDetailView(record);
    tokenLaunchState.pendingDraftId = record.type === 'draft' ? record.id : null;
    navigateToPage('token-detail');
}

window.viewTokenDetails = viewTokenDetails;

function hydrateLaunchConfiguratorFromDraft(draft) {
    if (!draft) return;

    const launchNameEl = getElement('launch-token-name');
    if (launchNameEl) {
        launchNameEl.textContent = draft.name || 'Token';
    }

    const devBuyInput = getElement('dev-buy-amount');
    if (devBuyInput && draft.initialBuyAmount !== undefined && draft.initialBuyAmount !== null) {
        const normalized = safeNumber(draft.initialBuyAmount);
        if (normalized !== null) {
            devBuyInput.value = normalized.toString();
        }
    }
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
    if (window.location.hostname === 'localhost') {
        return 'http://localhost:3000';
    }
    if (window.__CHAOSBOT_API_BASE__) {
        return window.__CHAOSBOT_API_BASE__;
    }
    return '/.netlify/functions';
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
    if (typeof existing === 'function' && !existing.__placeholder) {
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
    if (!address || !solana || typeof solana.getBalance !== 'function') {
        return null;
    }
    try {
        const balance = await solana.getBalance(address);
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

registerGlobalHandler('executeTokenLaunch', () => {
    navigateToPage('launch-token');
    notify('Prepare token launch configuration below.', 'info');
});

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
    const showActive = tab === 'Active';
    activeBtn?.classList.toggle('bg-neutral-700', showActive);
    activeBtn?.classList.toggle('text-white', showActive);
    archivedBtn?.classList.toggle('bg-neutral-700', !showActive);
    archivedBtn?.classList.toggle('text-white', !showActive);
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
            creatorWalletId: draft.creatorWalletId || '',
            creatorWalletLabel: draft.creatorWalletLabel || '',
            createdAt: draft.createdAt || Date.now(),
            updatedAt: draft.updatedAt || Date.now(),
            initialBuyAmount: draft.initialBuyAmount ?? null,
            metadata: draft.metadata || null,
            metadataUri: draft.metadataUri || null,
            notes: draft.notes || ''
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
                creatorWalletId: entry.creatorWalletId || '',
                creatorWalletLabel: entry.creatorWalletLabel || '',
                createdAt: entry.createdAt || Date.now(),
                updatedAt: entry.updatedAt || entry.createdAt || Date.now(),
                initialBuyAmount: safeNumber(entry.initialBuyAmount),
                metadata: entry.metadata || null,
                metadataUri: entry.metadataUri || null,
                notes: entry.notes || ''
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
        createdAt: existing.createdAt || record.createdAt || Date.now()
    };

    if (merged.imageUri && !merged.image) {
        merged.image = resolveImageUrl(merged.imageUri);
    }

    tokenRegistry.drafts.set(merged.id, merged);
    persistTokenDrafts();
    renderTokensTable();
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
    if (value.startsWith('ipfs://')) {
        return `https://ipfs.io/ipfs/${value.replace('ipfs://', '')}`;
    }
    return value;
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
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (Math.abs(diff) < minute) {
        return 'just now';
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
                console.warn(`Failed to refresh performance for ${entry.tokenMint}:`, error.message || error);
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

function submitBlueprintForm() {
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

    const blueprint = multiWalletManager.createBlueprint({
        name: formData.name,
        type: formData.type,
        template: formData.template,
        description: formData.description,
        notes: formData.notes,
        wallets: solana?.wallets || [],
        settings: formData.settings
    });

    addConsoleLog(`✅ Blueprint created: ${blueprint.name}`, 'success');
    notify(`Blueprint "${blueprint.name}" saved.`, 'success');

    closeModal('create-blueprint-modal');
    resetBlueprintForm();
    renderBlueprintList();
}

function formatTimestamp(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString();
    } catch (error) {
        return '—';
    }
}

function buildBlueprintCard(blueprint) {
    const card = document.createElement('div');
    card.className = 'bg-neutral-900 border border-neutral-800 rounded-lg p-4';

    const header = document.createElement('div');
    header.className = 'flex items-start justify-between gap-3';

    const title = document.createElement('div');
    title.innerHTML = `<h4 class="text-lg font-semibold text-white">${blueprint.name}</h4>
        <p class="text-xs text-gray-400">${(blueprint.template || blueprint.type || 'custom').replace(/-/g, ' ')}</p>`;

    const meta = document.createElement('div');
    meta.className = 'text-right text-xs text-gray-500 space-y-1';
    meta.innerHTML = `
        <div>Created: ${formatTimestamp(blueprint.createdAt)}</div>
        <div>Last used: ${formatTimestamp(blueprint.lastApplied)}</div>
        <div>Applied ${blueprint.stats?.appliedCount || 0} time(s)</div>
    `;

    header.appendChild(title);
    header.appendChild(meta);

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

    const applyBtn = document.createElement('button');
    applyBtn.className = 'bg-purple-700 hover:bg-purple-600 text-white text-xs px-3 py-2 rounded transition';
    applyBtn.textContent = 'Apply to Launch';
    applyBtn.onclick = () => applyBlueprint(blueprint.id);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'bg-neutral-800 hover:bg-neutral-700 text-gray-200 text-xs px-3 py-2 rounded transition';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => deleteBlueprint(blueprint.id);

    actions.appendChild(applyBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);

    return card;
}

function renderBlueprintList() {
    if (!ensureMultiWalletReady()) {
        return;
    }

    const listEl = getElement('blueprints-list');
    const emptyEl = getElement('blueprints-empty-state');
    if (!listEl || !emptyEl) {
        return;
    }

    const blueprints = multiWalletManager.getBlueprints() || [];
    listEl.innerHTML = '';

    if (blueprints.length === 0) {
        emptyEl.classList.remove('hidden');
        listEl.classList.add('hidden');
        return;
    }

    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');

    blueprints
        .slice()
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
        .forEach(blueprint => {
            listEl.appendChild(buildBlueprintCard(blueprint));
        });
}

function deleteBlueprint(blueprintId) {
    if (!ensureMultiWalletReady()) {
        return;
    }

    const blueprint = multiWalletManager.getBlueprintById(blueprintId);
    if (!blueprint) {
        notify('Blueprint not found.', 'error');
        return;
    }

    if (!window.confirm(`Delete blueprint "${blueprint.name}"?`)) {
        return;
    }

    multiWalletManager.deleteBlueprint(blueprintId);
    notify(`Blueprint "${blueprint.name}" deleted.`, 'success');
    addConsoleLog(`🗑️ Blueprint deleted: ${blueprint.name}`, 'info');
    renderBlueprintList();
}

function applyBlueprint(blueprintId) {
    if (!ensureMultiWalletReady()) {
        return;
    }

    const blueprint = multiWalletManager.getBlueprintById(blueprintId);
    if (!blueprint) {
        notify('Blueprint not found.', 'error');
        return;
    }

    navigateToPage('create-token');

    setTimeout(() => {
        applyBlueprintToLaunch(blueprint);
        multiWalletManager.recordBlueprintUsage(blueprintId);
        renderBlueprintList();
    }, 200);
}

function applyBlueprintToLaunch(blueprint) {
    const launch = blueprint.settings?.launch || {};
    const automations = blueprint.settings?.automations || {};

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
registerGlobalHandler('executeBulkSellTask', () => handleAutomationTask('Bulk sell', { smartSell: true }));
registerGlobalHandler('executeBumpTask', () => handleAutomationTask('Bump'));
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

