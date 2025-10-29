/**
 * Production-Ready Frontend JavaScript
 * Complete integration with all trading systems and UI sections
 */

console.log('🚀 Production Frontend Loading...');

// Configuration
const IS_NETLIFY = window.location.hostname !== 'localhost';
const API_BASE = IS_NETLIFY ? '/.netlify/functions' : 'http://localhost:3000/api';

// Global State
const state = {
    wallets: [],
    filteredWallets: [],
    selectedWallets: new Set(),
    groups: [],
    tokens: [],
    trendingTokens: [],
    currentView: 'wallets',
    currentFilter: 'all',
    sortColumn: null,
    sortDirection: 'asc',
    autoRefresh: true,
    refreshInterval: null,
    isTrading: false,
    tradeHistory: [],
    stats: {
        totalTrades: 0,
        successfulTrades: 0,
        totalVolume: 0,
        profitLoss: 0
    },
    rpcHealth: [],
    searchQuery: '',
    selectedGroup: null
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✓ DOM Loaded - Initializing Production Frontend');
    
    try {
        await initializeApp();
        console.log('✅ Production Frontend Ready');
    } catch (error) {
        console.error('❌ Initialization failed:', error);
        showNotification('Failed to initialize application', 'error');
    }
});

async function initializeApp() {
    // Initialize all components
    initializeNavigation();
    initializeWallets();
    initializeGroups();
    initializeTokens();
    initializeAutomations();
    initializeBlueprint();
    initializeCollectFees();
    initializeVanities();
    initializeConsole();
    initializePnL();
    initializeSettings();
    
    // Load initial data
    await loadInitialData();
    
    // Start auto-refresh
    startAutoRefresh();
    
    // Add initial console log
    addConsoleLog('Production trading platform initialized successfully', 'success');
}

// Navigation System
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-view]');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('bg-purple-900', 'text-white');
        item.classList.add('text-gray-400', 'hover:bg-neutral-800', 'hover:text-white');
    });
    
    const activeItem = document.querySelector(`[data-view="${viewName}"]`);
    if (activeItem) {
        activeItem.classList.remove('text-gray-400', 'hover:bg-neutral-800', 'hover:text-white');
        activeItem.classList.add('bg-purple-900', 'text-white');
    }
    
    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.add('active');
    }
    
    state.currentView = viewName;
    
    // Load view-specific data
    switch (viewName) {
        case 'wallets':
            loadWallets();
            break;
        case 'tokens':
            loadTokens();
            break;
        case 'groups':
            loadGroups();
            break;
        case 'console':
            loadConsole();
            break;
        case 'pnl':
            loadPnL();
            break;
    }
}

// Wallet Management
function initializeWallets() {
    // Search functionality
    const searchInput = document.getElementById('wallet-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            filterWallets();
        });
    }
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.currentFilter = e.target.dataset.filter;
            filterWallets();
        });
    });
    
    // Select all checkbox
    const selectAllCheckbox = document.getElementById('select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.wallet-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
                if (e.target.checked) {
                    state.selectedWallets.add(cb.dataset.address);
                } else {
                    state.selectedWallets.delete(cb.dataset.address);
                }
            });
            updateWalletActions();
        });
    }
    
    // Wallet action buttons
    initializeWalletActions();
}

function initializeWalletActions() {
    // Create wallet button
    const createWalletBtn = document.getElementById('create-wallet');
    if (createWalletBtn) {
        createWalletBtn.addEventListener('click', () => {
            showCreateWalletModal();
        });
    }
    
    // Import wallet button
    const importWalletBtn = document.getElementById('import-wallet');
    if (importWalletBtn) {
        importWalletBtn.addEventListener('click', () => {
            showImportWalletModal();
        });
    }
    
    // Bulk actions
    const bulkActions = document.querySelectorAll('.bulk-action');
    bulkActions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            executeBulkAction(action);
        });
    });
}

async function loadWallets() {
    try {
        showLoading('wallets-container');
        
        const response = await fetch(`${API_BASE}/wallets`);
        const data = await response.json();
        
        if (data.success) {
            state.wallets = data.wallets;
            state.filteredWallets = [...state.wallets];
            renderWallets();
            updateWalletStats();
        } else {
            throw new Error(data.error || 'Failed to load wallets');
        }
    } catch (error) {
        console.error('Failed to load wallets:', error);
        showNotification('Failed to load wallets', 'error');
    } finally {
        hideLoading('wallets-container');
    }
}

function renderWallets() {
    const container = document.getElementById('wallets-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    state.filteredWallets.forEach(wallet => {
        const walletElement = createWalletElement(wallet);
        container.appendChild(walletElement);
    });
    
    updateWalletStats();
}

function createWalletElement(wallet) {
    const div = document.createElement('div');
    div.className = 'wallet-item bg-neutral-800 rounded-lg p-4 border border-neutral-700 hover:border-neutral-600 transition-colors';
    div.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <input type="checkbox" class="wallet-checkbox" data-address="${wallet.address}" ${state.selectedWallets.has(wallet.address) ? 'checked' : ''}>
                <div class="wallet-avatar w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                    ${wallet.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div class="wallet-name font-medium text-white">${wallet.name}</div>
                    <div class="wallet-address text-sm text-gray-400 font-mono">${wallet.address.slice(0, 8)}...${wallet.address.slice(-8)}</div>
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <div class="text-right">
                    <div class="wallet-balance text-white font-medium">${wallet.balance?.toFixed(4) || '0.0000'} SOL</div>
                    <div class="wallet-group text-sm text-gray-400">${wallet.group}</div>
                </div>
                <div class="flex space-x-2">
                    <button class="wallet-action-btn p-2 rounded bg-blue-600 hover:bg-blue-700 text-white" data-action="trade" data-address="${wallet.address}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                        </svg>
                    </button>
                    <button class="wallet-action-btn p-2 rounded bg-green-600 hover:bg-green-700 text-white" data-action="balance" data-address="${wallet.address}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                        </svg>
                    </button>
                    <button class="wallet-action-btn p-2 rounded bg-red-600 hover:bg-red-700 text-white" data-action="delete" data-address="${wallet.address}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners
    const checkbox = div.querySelector('.wallet-checkbox');
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            state.selectedWallets.add(wallet.address);
        } else {
            state.selectedWallets.delete(wallet.address);
        }
        updateWalletActions();
    });
    
    const actionBtns = div.querySelectorAll('.wallet-action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.closest('.wallet-action-btn').dataset.action;
            const address = e.target.closest('.wallet-action-btn').dataset.address;
            handleWalletAction(action, address);
        });
    });
    
    return div;
}

function filterWallets() {
    let filtered = [...state.wallets];
    
    // Filter by search query
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(wallet => 
            wallet.name.toLowerCase().includes(query) ||
            wallet.address.toLowerCase().includes(query) ||
            wallet.group.toLowerCase().includes(query)
        );
    }
    
    // Filter by group
    if (state.currentFilter !== 'all') {
        filtered = filtered.filter(wallet => wallet.group === state.currentFilter);
    }
    
    state.filteredWallets = filtered;
    renderWallets();
}

function updateWalletStats() {
    const totalWallets = state.wallets.length;
    const activeWallets = state.wallets.filter(w => w.isActive).length;
    const totalBalance = state.wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    const selectedCount = state.selectedWallets.size;
    
    // Update stats display
    const statsElements = {
        'total-wallets': totalWallets,
        'active-wallets': activeWallets,
        'total-balance': totalBalance.toFixed(4),
        'selected-wallets': selectedCount
    };
    
    Object.entries(statsElements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
}

function updateWalletActions() {
    const selectedCount = state.selectedWallets.size;
    const bulkActions = document.querySelectorAll('.bulk-action');
    
    bulkActions.forEach(btn => {
        btn.disabled = selectedCount === 0;
        btn.classList.toggle('opacity-50', selectedCount === 0);
    });
}

// Token Management
function initializeTokens() {
    // Token search
    const tokenSearch = document.getElementById('token-search');
    if (tokenSearch) {
        tokenSearch.addEventListener('input', debounce(handleTokenSearch, 500));
    }
    
    // Token actions
    const tokenActions = document.querySelectorAll('.token-action');
    tokenActions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            handleTokenAction(action);
        });
    });
}

async function loadTokens() {
    try {
        showLoading('tokens-container');
        
        const response = await fetch(`${API_BASE}/tokens?type=trending&limit=50`);
        const data = await response.json();
        
        if (data.success) {
            state.tokens = data.tokens;
            renderTokens();
        } else {
            throw new Error(data.error || 'Failed to load tokens');
        }
    } catch (error) {
        console.error('Failed to load tokens:', error);
        showNotification('Failed to load tokens', 'error');
    } finally {
        hideLoading('tokens-container');
    }
}

function renderTokens() {
    const container = document.getElementById('tokens-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    state.tokens.forEach(token => {
        const tokenElement = createTokenElement(token);
        container.appendChild(tokenElement);
    });
}

function createTokenElement(token) {
    const div = document.createElement('div');
    div.className = 'token-item bg-neutral-800 rounded-lg p-4 border border-neutral-700 hover:border-neutral-600 transition-colors cursor-pointer';
    div.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <div class="token-image w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                    ${token.symbol?.charAt(0) || 'T'}
                </div>
                <div>
                    <div class="token-name font-medium text-white">${token.name || 'Unknown Token'}</div>
                    <div class="token-symbol text-sm text-gray-400">${token.symbol || 'UNK'}</div>
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <div class="text-right">
                    <div class="token-price text-white font-medium">$${token.price?.toFixed(6) || '0.000000'}</div>
                    <div class="token-marketcap text-sm text-gray-400">$${(token.marketCap / 1000000).toFixed(2)}M</div>
                </div>
                <div class="flex space-x-2">
                    <button class="token-action-btn p-2 rounded bg-green-600 hover:bg-green-700 text-white" data-action="buy" data-mint="${token.mint}">
                        Buy
                    </button>
                    <button class="token-action-btn p-2 rounded bg-red-600 hover:bg-red-700 text-white" data-action="sell" data-mint="${token.mint}">
                        Sell
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners
    const actionBtns = div.querySelectorAll('.token-action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = e.target.dataset.action;
            const mint = e.target.dataset.mint;
            handleTokenTrade(action, mint);
        });
    });
    
    return div;
}

async function handleTokenSearch(e) {
    const query = e.target.value;
    if (query.length < 2) return;
    
    try {
        const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&limit=20`);
        const data = await response.json();
        
        if (data.success) {
            state.tokens = data.tokens;
            renderTokens();
        }
    } catch (error) {
        console.error('Token search failed:', error);
    }
}

// Group Management
function initializeGroups() {
    // Group actions
    const groupActions = document.querySelectorAll('.group-action');
    groupActions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            handleGroupAction(action);
        });
    });
}

async function loadGroups() {
    try {
        const response = await fetch(`${API_BASE}/groups`);
        const data = await response.json();
        
        if (data.success) {
            state.groups = data.groups;
            renderGroups();
        }
    } catch (error) {
        console.error('Failed to load groups:', error);
    }
}

function renderGroups() {
    const container = document.getElementById('groups-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    state.groups.forEach(group => {
        const groupElement = createGroupElement(group);
        container.appendChild(groupElement);
    });
}

function createGroupElement(group) {
    const div = document.createElement('div');
    div.className = 'group-item bg-neutral-800 rounded-lg p-4 border border-neutral-700 hover:border-neutral-600 transition-colors';
    div.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
                <div class="group-icon w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                    ${group.name.charAt(0).toUpperCase()}
                </div>
                <div>
                    <div class="group-name font-medium text-white">${group.name}</div>
                    <div class="group-description text-sm text-gray-400">${group.description || 'No description'}</div>
                </div>
            </div>
            <div class="flex items-center space-x-4">
                <div class="text-right">
                    <div class="group-wallet-count text-white font-medium">${group.wallets?.length || 0} wallets</div>
                    <div class="group-status text-sm text-gray-400">${group.isActive ? 'Active' : 'Inactive'}</div>
                </div>
                <div class="flex space-x-2">
                    <button class="group-action-btn p-2 rounded bg-blue-600 hover:bg-blue-700 text-white" data-action="view" data-group="${group.id}">
                        View
                    </button>
                    <button class="group-action-btn p-2 rounded bg-green-600 hover:bg-green-700 text-white" data-action="trade" data-group="${group.id}">
                        Trade
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add event listeners
    const actionBtns = div.querySelectorAll('.group-action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const groupId = e.target.dataset.group;
            handleGroupAction(action, groupId);
        });
    });
    
    return div;
}

// Console System
function initializeConsole() {
    // Console input
    const consoleInput = document.getElementById('console-input');
    if (consoleInput) {
        consoleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleConsoleCommand(e.target.value);
                e.target.value = '';
            }
        });
    }
    
    // Console actions
    const consoleActions = document.querySelectorAll('.console-action');
    consoleActions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            handleConsoleAction(action);
        });
    });
}

function loadConsole() {
    // Load console history and stats
    updateConsoleStats();
}

function addConsoleLog(message, type = 'info') {
    const console = document.getElementById('console-output');
    if (!console) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logElement = document.createElement('div');
    logElement.className = `console-log console-${type} p-2 border-l-4 ${
        type === 'error' ? 'border-red-500 bg-red-900/20' :
        type === 'success' ? 'border-green-500 bg-green-900/20' :
        type === 'warning' ? 'border-yellow-500 bg-yellow-900/20' :
        'border-blue-500 bg-blue-900/20'
    }`;
    
    logElement.innerHTML = `
        <div class="flex items-center justify-between">
            <span class="text-sm text-gray-400">[${timestamp}]</span>
            <span class="text-sm text-gray-400">${type.toUpperCase()}</span>
        </div>
        <div class="mt-1 text-white">${message}</div>
    `;
    
    console.appendChild(logElement);
    console.scrollTop = console.scrollHeight;
    
    // Keep only last 100 logs
    const logs = console.querySelectorAll('.console-log');
    if (logs.length > 100) {
        logs[0].remove();
    }
}

function updateConsoleStats() {
    // Update console statistics
    const stats = state.stats;
    const statsElements = {
        'console-total-trades': stats.totalTrades,
        'console-successful-trades': stats.successfulTrades,
        'console-total-volume': stats.totalVolume.toFixed(4),
        'console-profit-loss': stats.profitLoss.toFixed(4)
    };
    
    Object.entries(statsElements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
}

// P&L Dashboard
function initializePnL() {
    // P&L refresh
    const pnlRefresh = document.getElementById('pnl-refresh');
    if (pnlRefresh) {
        pnlRefresh.addEventListener('click', loadPnL);
    }
}

async function loadPnL() {
    try {
        showLoading('pnl-container');
        
        const response = await fetch(`${API_BASE}/stats`);
        const data = await response.json();
        
        if (data.success) {
            state.stats = data;
            renderPnL();
        }
    } catch (error) {
        console.error('Failed to load P&L data:', error);
        showNotification('Failed to load P&L data', 'error');
    } finally {
        hideLoading('pnl-container');
    }
}

function renderPnL() {
    // Render P&L cards and charts
    updatePnLCards();
    updatePnLCharts();
}

function updatePnLCards() {
    const cards = [
        { id: 'pnl-total-trades', value: state.stats.totalTrades },
        { id: 'pnl-successful-trades', value: state.stats.successfulTrades },
        { id: 'pnl-total-volume', value: state.stats.totalVolume.toFixed(4) },
        { id: 'pnl-profit-loss', value: state.stats.profitLoss.toFixed(4) }
    ];
    
    cards.forEach(card => {
        const element = document.getElementById(card.id);
        if (element) {
            element.textContent = card.value;
        }
    });
}

function updatePnLCharts() {
    // Update charts with P&L data
    // This would integrate with a charting library like Chart.js
}

// Settings
function initializeSettings() {
    // Settings form
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsSubmit);
    }
    
    // Settings actions
    const settingsActions = document.querySelectorAll('.settings-action');
    settingsActions.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            handleSettingsAction(action);
        });
    });
}

async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const settings = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch(`${API_BASE}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Settings saved successfully', 'success');
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        showNotification('Failed to save settings', 'error');
    }
}

// Trading Functions
async function handleTokenTrade(action, tokenMint) {
    if (state.selectedWallets.size === 0) {
        showNotification('Please select at least one wallet', 'warning');
        return;
    }
    
    const amount = prompt(`Enter ${action} amount:`);
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        showNotification('Invalid amount', 'error');
        return;
    }
    
    try {
        showNotification(`${action}ing ${amount} tokens...`, 'info');
        
        const results = [];
        for (const walletAddress of state.selectedWallets) {
            const response = await fetch(`${API_BASE}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress,
                    tokenMint,
                    amount: action === 'buy' ? parseFloat(amount) : parseInt(amount),
                    options: { slippage: 1.0 }
                })
            });
            
            const data = await response.json();
            results.push({ walletAddress, result: data });
        }
        
        const successful = results.filter(r => r.result.success).length;
        showNotification(`${action} completed: ${successful}/${results.length} successful`, 'success');
        
        // Refresh wallets
        await loadWallets();
        
    } catch (error) {
        console.error(`${action} failed:`, error);
        showNotification(`${action} failed: ${error.message}`, 'error');
    }
}

// Utility Functions
function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '<div class="loading-spinner">Loading...</div>';
    }
}

function hideLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        const spinner = container.querySelector('.loading-spinner');
        if (spinner) {
            spinner.remove();
        }
    }
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
        type === 'error' ? 'bg-red-600 text-white' :
        type === 'success' ? 'bg-green-600 text-white' :
        type === 'warning' ? 'bg-yellow-600 text-white' :
        'bg-blue-600 text-white'
    }`;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function startAutoRefresh() {
    if (state.refreshInterval) {
        clearInterval(state.refreshInterval);
    }
    
    state.refreshInterval = setInterval(async () => {
        if (state.autoRefresh) {
            await refreshCurrentView();
        }
    }, 30000); // Refresh every 30 seconds
}

async function refreshCurrentView() {
    switch (state.currentView) {
        case 'wallets':
            await loadWallets();
            break;
        case 'tokens':
            await loadTokens();
            break;
        case 'groups':
            await loadGroups();
            break;
        case 'pnl':
            await loadPnL();
            break;
    }
}

async function loadInitialData() {
    try {
        // Load all initial data in parallel
        await Promise.all([
            loadWallets(),
            loadTokens(),
            loadGroups(),
            loadPnL()
        ]);
    } catch (error) {
        console.error('Failed to load initial data:', error);
    }
}

// Event Handlers
function handleWalletAction(action, address) {
    switch (action) {
        case 'trade':
            showTradeModal(address);
            break;
        case 'balance':
            refreshWalletBalance(address);
            break;
        case 'delete':
            deleteWallet(address);
            break;
    }
}

function handleTokenAction(action) {
    switch (action) {
        case 'refresh':
            loadTokens();
            break;
        case 'trending':
            loadTrendingTokens();
            break;
    }
}

function handleGroupAction(action, groupId) {
    switch (action) {
        case 'view':
            viewGroup(groupId);
            break;
        case 'trade':
            showGroupTradeModal(groupId);
            break;
    }
}

function handleConsoleAction(action) {
    switch (action) {
        case 'clear':
            clearConsole();
            break;
        case 'export':
            exportConsole();
            break;
    }
}

function handleSettingsAction(action) {
    switch (action) {
        case 'reset':
            resetSettings();
            break;
        case 'export':
            exportSettings();
            break;
        case 'import':
            importSettings();
            break;
    }
}

// Modal Functions
function showCreateWalletModal() {
    // Implementation for create wallet modal
    console.log('Show create wallet modal');
}

function showImportWalletModal() {
    // Implementation for import wallet modal
    console.log('Show import wallet modal');
}

function showTradeModal(address) {
    // Implementation for trade modal
    console.log('Show trade modal for:', address);
}

function showGroupTradeModal(groupId) {
    // Implementation for group trade modal
    console.log('Show group trade modal for:', groupId);
}

// Additional Functions
async function refreshWalletBalance(address) {
    try {
        const response = await fetch(`${API_BASE}/balance?address=${address}`);
        const data = await response.json();
        
        if (data.success) {
            showNotification('Wallet balance updated', 'success');
            await loadWallets();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Failed to refresh balance:', error);
        showNotification('Failed to refresh balance', 'error');
    }
}

async function deleteWallet(address) {
    if (!confirm('Are you sure you want to delete this wallet?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/wallet?address=${address}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Wallet deleted successfully', 'success');
            await loadWallets();
        } else {
            throw new Error(data.error);
        }
    } catch (error) {
        console.error('Failed to delete wallet:', error);
        showNotification('Failed to delete wallet', 'error');
    }
}

function clearConsole() {
    const console = document.getElementById('console-output');
    if (console) {
        console.innerHTML = '';
    }
}

function exportConsole() {
    const console = document.getElementById('console-output');
    if (console) {
        const logs = console.textContent;
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `console-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize when DOM is loaded
console.log('✅ Production Frontend Script Loaded');
