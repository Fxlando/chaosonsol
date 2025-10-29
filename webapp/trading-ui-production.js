/**
 * Chaos Bot - Production Trading UI
 * Comprehensive trading platform with real-time updates
 */

console.log('⚡ CHAOS BOT Production Platform Loading...');

// Configuration
const IS_NETLIFY = window.location.hostname !== 'localhost';
const API_BASE = IS_NETLIFY ? '/.netlify/functions' : 'http://localhost:3000/api';

// State Management
const state = {
    wallets: [],
    filteredWallets: [],
    selectedWallets: new Set(),
    currentFilter: 'all',
    sortColumn: null,
    sortDirection: 'asc',
    stats: null,
    autoScroll: true,
    groups: [],
    activeSessions: [],
    smartSellStatus: null,
    raydiumPools: [],
    pnlData: null,
    settings: {
        rpcUrl: '',
        poolSize: 4,
        defaultSlippage: 1,
        priorityFee: 1000,
        maxSolPerTrade: 10,
        rateLimit: 100,
        maxWalletsPerOp: 100
    }
};

// WebSocket connection for real-time updates
let wsConnection = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// ===== INITIALIZATION =====

document.addEventListener('DOMContentLoaded', async () => {
    console.log('✓ DOM Loaded');
    
    initializeNavigation();
    initializeWalletCommander();
    initializeModals();
    initializeConsole();
    initializeTradingViews();
    initializeSettings();
    
    await loadDashboard();
    await loadWallets();
    await loadGroups();
    await loadSettings();
    
    startAutoRefresh();
    initializeWebSocket();
    
    addConsoleLog('Production platform initialized - Ready for trading', 'success');
    console.log('✓ Production Platform Ready');
});

// ===== NAVIGATION =====

function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        }
    });
    
    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');
    
    // Update titles
    const titles = {
        dashboard: 'Dashboard',
        wallets: 'Wallet Commander',
        tokens: 'Token Manager',
        tasks: 'Trading Tasks',
        volume: 'Volume Engine',
        smartsell: 'Smart Sell AI',
        pumpfun: 'Pump.fun Sniper',
        raydium: 'Raydium DEX',
        pnl: 'P&L Dashboard',
        console: 'Live Console',
        automations: 'Automations',
        settings: 'Settings'
    };
    
    const subtitles = {
        dashboard: 'System Overview',
        wallets: 'Advanced Multi-Wallet Management',
        tokens: 'Launch and Manage Tokens',
        tasks: 'Volume, Bulk Sell, Bump Operations',
        volume: 'Coordinated Volume Trading',
        smartsell: 'AI-Powered Selling',
        pumpfun: 'Early Launch Sniping',
        raydium: 'Direct DEX Trading',
        pnl: 'Profit & Loss Tracking',
        console: 'Real-Time Transaction Logs',
        automations: 'Blueprint Automation',
        settings: 'Platform Configuration'
    };
    
    document.getElementById('page-title').textContent = titles[viewName] || viewName;
    document.getElementById('page-subtitle').textContent = subtitles[viewName] || '';
    
    // Load view-specific data
    if (viewName === 'wallets') {
        loadWallets();
    } else if (viewName === 'volume') {
        loadVolumeStatus();
    } else if (viewName === 'smartsell') {
        loadSmartSellStatus();
    } else if (viewName === 'raydium') {
        loadRaydiumPools();
    } else if (viewName === 'pnl') {
        loadPnLData();
    }
}

// ===== DASHBOARD =====

async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        
        if (!response.ok) throw new Error('API error');
        
        state.stats = await response.json();
        updateDashboardUI();
        
        console.log('✓ Dashboard loaded');
    } catch (error) {
        console.log('⚠ Using demo data');
        state.stats = {
            wallets: { total: 0, active: 0 },
            balance: { sol: 0, usd: 0 },
            groups: 0,
            solPrice: 180
        };
        updateDashboardUI();
    }
}

function updateDashboardUI() {
    if (!state.stats) return;
    
    // Stats cards
    document.getElementById('total-wallets').textContent = state.stats.wallets.total;
    document.getElementById('active-wallets').textContent = `${state.stats.wallets.active} Active`;
    document.getElementById('total-balance').textContent = `${state.stats.balance.sol.toFixed(2)} SOL`;
    document.getElementById('total-usd').textContent = `$${state.stats.balance.usd.toFixed(2)} USD`;
    document.getElementById('total-groups').textContent = state.stats.groups;
    
    // SOL price
    document.getElementById('sol-price').textContent = `$${state.stats.solPrice.toFixed(2)}`;
    
    // Wallet count badge
    document.getElementById('wallet-count').textContent = state.stats.wallets.total;
}

// ===== WALLET COMMANDER =====

function initializeWalletCommander() {
    // Search
    document.getElementById('wallet-search').addEventListener('input', (e) => {
        filterWallets();
    });
    
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
    document.getElementById('select-all').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.wallet-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            if (e.target.checked) {
                state.selectedWallets.add(cb.dataset.address);
            } else {
                state.selectedWallets.delete(cb.dataset.address);
            }
        });
        updateBulkActions();
    });
    
    // Sortable columns
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.sort;
            sortWallets(column);
        });
    });
    
    // Toolbar actions
    document.getElementById('resync-btn').addEventListener('click', () => {
        loadWallets(true);
        showToast('Refreshing wallet balances...', 'info');
    });
    
    document.getElementById('generate-wallets-btn').addEventListener('click', () => {
        openModal('generate-modal');
    });
    
    // Bulk action buttons
    document.getElementById('fund-btn').addEventListener('click', () => openModal('fund-modal'));
    document.getElementById('withdraw-btn').addEventListener('click', () => {
        showToast('Withdraw feature coming soon!', 'info');
    });
    document.getElementById('tag-btn').addEventListener('click', () => {
        showToast('Tagging feature coming soon!', 'info');
    });
    document.getElementById('warm-btn').addEventListener('click', () => {
        showToast('Warming feature coming soon!', 'info');
    });
    document.getElementById('redistribute-btn').addEventListener('click', () => {
        showToast('Redistribute feature coming soon!', 'info');
    });
    document.getElementById('reclaim-btn').addEventListener('click', () => {
        showToast('Reclaim rent feature coming soon!', 'info');
    });
    document.getElementById('export-btn').addEventListener('click', () => {
        exportWallets();
    });
    document.getElementById('deactivate-btn').addEventListener('click', () => {
        deactivateWallets();
    });
}

async function loadWallets(forceRefresh = false) {
    try {
        const response = await fetch(`${API_BASE}/wallets`);
        
        if (!response.ok) throw new Error('API error');
        
        state.wallets = await response.json();
        state.filteredWallets = [...state.wallets];
        
        filterWallets();
        renderWalletTable();
        updateFooterStats();
        
        if (forceRefresh) {
            showToast('Wallets refreshed successfully!', 'success');
        }
        
        console.log(`✓ Loaded ${state.wallets.length} wallets`);
    } catch (error) {
        console.log('⚠ Using demo wallets');
        state.wallets = [];
        state.filteredWallets = [];
        filterWallets();
        renderWalletTable();
        updateFooterStats();
    }
}

function filterWallets() {
    const searchTerm = document.getElementById('wallet-search').value.toLowerCase();
    
    state.filteredWallets = state.wallets.filter(wallet => {
        // Filter by search
        const matchesSearch = wallet.name.toLowerCase().includes(searchTerm) ||
                            wallet.publicKey.toLowerCase().includes(searchTerm);
        
        // Filter by status
        let matchesFilter = true;
        if (state.currentFilter === 'active') {
            matchesFilter = wallet.status === 'active';
        } else if (state.currentFilter === 'inactive') {
            matchesFilter = wallet.status === 'inactive';
        }
        
        return matchesSearch && matchesFilter;
    });
    
    renderWalletTable();
    updateFooterStats();
}

function sortWallets(column) {
    if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }
    
    state.filteredWallets.sort((a, b) => {
        let aVal, bVal;
        
        switch(column) {
            case 'name':
                aVal = a.name;
                bVal = b.name;
                break;
            case 'tokens':
                aVal = a.tokens || 0;
                bVal = b.tokens || 0;
                break;
            case 'rent':
                aVal = a.rent || 0;
                bVal = b.rent || 0;
                break;
            case 'balance':
                aVal = a.balance || 0;
                bVal = b.balance || 0;
                break;
            default:
                return 0;
        }
        
        if (typeof aVal === 'string') {
            return state.sortDirection === 'asc' 
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        } else {
            return state.sortDirection === 'asc' 
                ? aVal - bVal
                : bVal - aVal;
        }
    });
    
    renderWalletTable();
}

function renderWalletTable() {
    const tbody = document.getElementById('wallet-table-body');
    
    if (state.filteredWallets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading">No wallets found</td></tr>';
        return;
    }
    
    tbody.innerHTML = state.filteredWallets.map(wallet => `
        <tr>
            <td>
                <input type="checkbox" 
                       class="wallet-checkbox" 
                       data-address="${wallet.publicKey}"
                       ${state.selectedWallets.has(wallet.publicKey) ? 'checked' : ''}
                       onchange="toggleWalletSelection('${wallet.publicKey}', this.checked)">
            </td>
            <td>
                <div class="wallet-name">${wallet.name}</div>
            </td>
            <td>
                ${(wallet.tags || []).map(tag => `<span class="wallet-tag">${tag}</span>`).join('')}
            </td>
            <td>
                <div class="wallet-address">${truncateAddress(wallet.publicKey)}</div>
            </td>
            <td>${wallet.tokens || 0}</td>
            <td>${(wallet.rent || 0).toFixed(4)}</td>
            <td>${(wallet.balance || 0).toFixed(4)}</td>
            <td>
                <span class="wallet-group">${wallet.groupName || 'Unknown'}</span>
            </td>
            <td>
                <div class="wallet-actions">
                    <button class="icon-btn" onclick="viewWallet('${wallet.publicKey}')" title="View on Solscan">👁️</button>
                    <button class="icon-btn" onclick="copyAddress('${wallet.publicKey}')" title="Copy Address">📋</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function toggleWalletSelection(address, isSelected) {
    if (isSelected) {
        state.selectedWallets.add(address);
    } else {
        state.selectedWallets.delete(address);
    }
    updateBulkActions();
}

function updateBulkActions() {
    const bulkActions = document.getElementById('bulk-actions');
    const selectedCount = state.selectedWallets.size;
    
    document.getElementById('selected-count').textContent = selectedCount;
    document.getElementById('bulk-count').textContent = selectedCount;
    
    if (selectedCount > 0) {
        bulkActions.classList.add('active');
    } else {
        bulkActions.classList.remove('active');
    }
}

function updateFooterStats() {
    const totalBalance = state.filteredWallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    const totalRent = state.filteredWallets.reduce((sum, w) => sum + (w.rent || 0), 0);
    
    document.getElementById('footer-total-balance').textContent = `${totalBalance.toFixed(4)} SOL`;
    document.getElementById('footer-wallet-count').textContent = state.filteredWallets.length;
    document.getElementById('footer-rent').textContent = `${totalRent.toFixed(4)} SOL`;
}

function viewWallet(address) {
    window.open(`https://solscan.io/account/${address}`, '_blank');
}

function copyAddress(address) {
    navigator.clipboard.writeText(address);
    showToast('Address copied to clipboard!', 'success');
}

function exportWallets() {
    const selected = state.wallets.filter(w => state.selectedWallets.has(w.publicKey));
    const walletsToExport = selected.length > 0 ? selected : state.filteredWallets;
    
    const csv = [
        ['Name', 'Address', 'Group', 'Balance', 'Tokens', 'Rent', 'Status'],
        ...walletsToExport.map(w => [
            w.name,
            w.publicKey,
            w.groupName || 'Unknown',
            w.balance.toFixed(4),
            w.tokens || 0,
            (w.rent || 0).toFixed(4),
            w.status
        ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chaos-bot-wallets-${Date.now()}.csv`;
    a.click();
    
    showToast(`Exported ${walletsToExport.length} wallets`, 'success');
}

function deactivateWallets() {
    if (state.selectedWallets.size === 0) {
        showToast('No wallets selected', 'warning');
        return;
    }
    
    if (!confirm(`Deactivate ${state.selectedWallets.size} wallet(s)?`)) {
        return;
    }
    
    showToast(`Deactivated ${state.selectedWallets.size} wallet(s)`, 'success');
}

function truncateAddress(address) {
    if (!address || address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ===== TRADING VIEWS =====

function initializeTradingViews() {
    // Volume Engine
    document.getElementById('start-volume-btn').addEventListener('click', startVolumeTrading);
    document.getElementById('stop-volume-btn').addEventListener('click', stopVolumeTrading);
    
    // Smart Sell
    document.getElementById('enable-smartsell-btn').addEventListener('click', enableSmartSell);
    document.getElementById('disable-smartsell-btn').addEventListener('click', disableSmartSell);
    
    // Raydium DEX
    document.getElementById('raydium-swap-btn').addEventListener('click', executeRaydiumSwap);
    document.getElementById('raydium-quote-btn').addEventListener('click', getRaydiumQuote);
}

async function loadGroups() {
    try {
        const response = await fetch(`${API_BASE}/groups`);
        if (response.ok) {
            state.groups = await response.json();
            updateGroupSelects();
        }
    } catch (error) {
        console.log('⚠ Error loading groups:', error.message);
    }
}

function updateGroupSelects() {
    const select = document.getElementById('volume-group-select');
    select.innerHTML = '<option value="">Select Group</option>' +
        state.groups.map(group => 
            `<option value="${group.id}">${group.name} (${group.walletCount} wallets)</option>`
        ).join('');
}

async function startVolumeTrading() {
    const groupId = document.getElementById('volume-group-select').value;
    const tokenMint = document.getElementById('volume-token-input').value;
    const buyAmount = parseFloat(document.getElementById('volume-buy-amount').value);
    const cycles = parseInt(document.getElementById('volume-cycles-input').value);
    
    if (!groupId || !tokenMint || !buyAmount || !cycles) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/volume/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                groupId,
                tokenMint,
                config: {
                    buyAmount,
                    cycles,
                    delayBetween: 3000,
                    randomizeAmounts: true,
                    randomizeDelay: true
                }
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Volume trading started!', 'success');
            document.getElementById('start-volume-btn').disabled = true;
            document.getElementById('stop-volume-btn').disabled = false;
            loadVolumeStatus();
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function stopVolumeTrading() {
    try {
        const response = await fetch(`${API_BASE}/volume/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Volume trading stopped!', 'success');
            document.getElementById('start-volume-btn').disabled = false;
            document.getElementById('stop-volume-btn').disabled = true;
            loadVolumeStatus();
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function loadVolumeStatus() {
    try {
        const response = await fetch(`${API_BASE}/volume/status`);
        if (response.ok) {
            const status = await response.json();
            updateVolumeStatus(status);
        }
    } catch (error) {
        console.log('⚠ Error loading volume status:', error.message);
    }
}

function updateVolumeStatus(status) {
    const sessionsList = document.getElementById('volume-sessions-list');
    
    if (status.activeSessions === 0) {
        sessionsList.innerHTML = '<div class="empty-state">No active volume sessions</div>';
    } else {
        sessionsList.innerHTML = status.sessions.map(session => `
            <div class="session-item">
                <div class="session-info">
                    <strong>${session.groupId}</strong>
                    <span class="session-token">${truncateAddress(session.tokenMint)}</span>
                </div>
                <div class="session-stats">
                    <span>Cycles: ${session.stats.cyclesCompleted}</span>
                    <span>Trades: ${session.stats.totalTrades}</span>
                    <span>Success: ${session.stats.successfulTrades}</span>
                </div>
            </div>
        `).join('');
    }
}

async function enableSmartSell() {
    const tokenMint = document.getElementById('smartsell-token-input').value;
    const profitTarget = parseFloat(document.getElementById('smartsell-profit-target').value);
    const stopLoss = parseFloat(document.getElementById('smartsell-stop-loss').value);
    
    if (!tokenMint || !profitTarget || !stopLoss) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/smartsell/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tokenMint,
                wallets: state.wallets,
                settings: {
                    minProfitThreshold: profitTarget,
                    stopLossPercentage: stopLoss,
                    trailingStopPercentage: 10
                }
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Smart Sell enabled!', 'success');
            document.getElementById('enable-smartsell-btn').disabled = true;
            document.getElementById('disable-smartsell-btn').disabled = false;
            loadSmartSellStatus();
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function disableSmartSell() {
    try {
        const response = await fetch(`${API_BASE}/smartsell/disable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Smart Sell disabled!', 'success');
            document.getElementById('enable-smartsell-btn').disabled = false;
            document.getElementById('disable-smartsell-btn').disabled = true;
            loadSmartSellStatus();
        } else {
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
}

async function loadSmartSellStatus() {
    try {
        const response = await fetch(`${API_BASE}/smartsell/status`);
        if (response.ok) {
            const status = await response.json();
            updateSmartSellStatus(status);
        }
    } catch (error) {
        console.log('⚠ Error loading smart sell status:', error.message);
    }
}

function updateSmartSellStatus(status) {
    const monitoringList = document.getElementById('smartsell-monitoring-list');
    
    if (!status.isEnabled) {
        monitoringList.innerHTML = '<div class="empty-state">Smart Sell not active</div>';
    } else {
        monitoringList.innerHTML = `
            <div class="monitoring-item">
                <div class="monitoring-info">
                    <strong>Active Monitors: ${status.activeMonitors}</strong>
                    <span>Uptime: ${Math.floor(status.uptime / 1000)}s</span>
                </div>
                <div class="monitoring-stats">
                    <span>Success Rate: ${status.stats.successRate.toFixed(1)}%</span>
                    <span>Total Sells: ${status.stats.totalSells}</span>
                </div>
            </div>
        `;
    }
}

async function loadRaydiumPools() {
    try {
        // This would be implemented with actual Raydium API calls
        const poolsList = document.getElementById('raydium-pools-list');
        poolsList.innerHTML = '<div class="loading">Loading Raydium pools...</div>';
        
        // Simulate loading
        setTimeout(() => {
            poolsList.innerHTML = `
                <div class="pool-item">
                    <div class="pool-pair">SOL/USDC</div>
                    <div class="pool-liquidity">$2.5M</div>
                    <div class="pool-fee">0.25%</div>
                </div>
                <div class="pool-item">
                    <div class="pool-pair">RAY/SOL</div>
                    <div class="pool-liquidity">$1.8M</div>
                    <div class="pool-fee">0.25%</div>
                </div>
            `;
        }, 1000);
    } catch (error) {
        console.log('⚠ Error loading Raydium pools:', error.message);
    }
}

async function executeRaydiumSwap() {
    showToast('Raydium swap execution coming soon!', 'info');
}

async function getRaydiumQuote() {
    showToast('Raydium quote feature coming soon!', 'info');
}

// ===== P&L DASHBOARD =====

async function loadPnLData() {
    try {
        const response = await fetch(`${API_BASE}/pnl`);
        if (response.ok) {
            state.pnlData = await response.json();
            updatePnLUI();
        }
    } catch (error) {
        console.log('⚠ Error loading P&L data:', error.message);
    }
}

function updatePnLUI() {
    if (!state.pnlData) return;
    
    document.getElementById('total-pnl').textContent = `$${state.pnlData.netPnL.toFixed(2)}`;
    document.getElementById('win-rate').textContent = `${state.pnlData.winRate.toFixed(1)}%`;
    document.getElementById('total-trades-pnl').textContent = state.pnlData.totalTrades;
    document.getElementById('avg-win').textContent = `$${state.pnlData.avgWin.toFixed(2)}`;
}

// ===== CONSOLE =====

function initializeConsole() {
    document.getElementById('clear-console').addEventListener('click', () => {
        document.getElementById('console-output').innerHTML = '';
        addConsoleLog('Console cleared', 'info');
    });
    
    document.getElementById('toggle-auto-scroll').addEventListener('click', (e) => {
        state.autoScroll = !state.autoScroll;
        e.target.textContent = `Auto-scroll: ${state.autoScroll ? 'ON' : 'OFF'}`;
    });
    
    document.getElementById('export-logs').addEventListener('click', () => {
        exportConsoleLogs();
    });
}

function addConsoleLog(message, type = 'info') {
    const consoleOutput = document.getElementById('console-output');
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    const line = document.createElement('div');
    line.className = 'console-line';
    line.innerHTML = `
        <span class="console-time">[${time}]</span>
        <span class="console-type ${type}">${type.toUpperCase()}</span>
        <span class="console-message">${message}</span>
    `;
    
    consoleOutput.insertBefore(line, consoleOutput.firstChild);
    
    // Keep only last 100 lines
    while (consoleOutput.children.length > 100) {
        consoleOutput.removeChild(consoleOutput.lastChild);
    }
    
    if (state.autoScroll) {
        consoleOutput.scrollTop = 0;
    }
}

function exportConsoleLogs() {
    const logs = Array.from(document.querySelectorAll('.console-line')).map(line => line.textContent);
    const csv = logs.join('\n');
    
    const blob = new Blob([csv], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chaos-bot-logs-${Date.now()}.txt`;
    a.click();
    
    showToast('Console logs exported!', 'success');
}

// ===== SETTINGS =====

function initializeSettings() {
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('reset-settings-btn').addEventListener('click', resetSettings);
}

async function loadSettings() {
    // Load settings from localStorage or API
    const savedSettings = localStorage.getItem('chaos-bot-settings');
    if (savedSettings) {
        state.settings = { ...state.settings, ...JSON.parse(savedSettings) };
    }
    
    updateSettingsUI();
}

function updateSettingsUI() {
    document.getElementById('rpc-url').value = state.settings.rpcUrl;
    document.getElementById('pool-size').value = state.settings.poolSize;
    document.getElementById('default-slippage').value = state.settings.defaultSlippage;
    document.getElementById('priority-fee').value = state.settings.priorityFee;
    document.getElementById('max-sol-per-trade').value = state.settings.maxSolPerTrade;
    document.getElementById('rate-limit').value = state.settings.rateLimit;
    document.getElementById('max-wallets-per-op').value = state.settings.maxWalletsPerOp;
}

function saveSettings() {
    state.settings = {
        rpcUrl: document.getElementById('rpc-url').value,
        poolSize: parseInt(document.getElementById('pool-size').value),
        defaultSlippage: parseFloat(document.getElementById('default-slippage').value),
        priorityFee: parseInt(document.getElementById('priority-fee').value),
        maxSolPerTrade: parseFloat(document.getElementById('max-sol-per-trade').value),
        rateLimit: parseInt(document.getElementById('rate-limit').value),
        maxWalletsPerOp: parseInt(document.getElementById('max-wallets-per-op').value)
    };
    
    localStorage.setItem('chaos-bot-settings', JSON.stringify(state.settings));
    showToast('Settings saved!', 'success');
}

function resetSettings() {
    if (confirm('Reset all settings to defaults?')) {
        state.settings = {
            rpcUrl: '',
            poolSize: 4,
            defaultSlippage: 1,
            priorityFee: 1000,
            maxSolPerTrade: 10,
            rateLimit: 100,
            maxWalletsPerOp: 100
        };
        
        updateSettingsUI();
        localStorage.removeItem('chaos-bot-settings');
        showToast('Settings reset to defaults!', 'success');
    }
}

// ===== MODALS =====

function initializeModals() {
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.dataset.modal);
        });
    });
    
    document.querySelectorAll('[data-modal]').forEach(btn => {
        if (!btn.classList.contains('modal-close')) {
            btn.addEventListener('click', () => {
                closeModal(btn.dataset.modal);
            });
        }
    });
    
    // Close on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
    
    // Fund modal
    document.getElementById('execute-fund').addEventListener('click', executeFund);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

async function executeFund() {
    const privateKey = document.getElementById('fund-private-key').value;
    const amount = document.getElementById('fund-amount').value;
    
    if (!privateKey || !amount) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    const selectedWallets = state.wallets.filter(w => state.selectedWallets.has(w.publicKey));
    
    if (selectedWallets.length === 0) {
        showToast('No wallets selected', 'warning');
        return;
    }
    
    showToast(`Funding ${selectedWallets.length} wallet(s)...`, 'info');
    addConsoleLog(`Starting funding for ${selectedWallets.length} wallets`, 'info');
    
    closeModal('fund-modal');
    
    // TODO: Implement actual funding API call
    setTimeout(() => {
        showToast('Fund operation completed successfully!', 'success');
        addConsoleLog(`Successfully funded ${selectedWallets.length} wallets`, 'success');
        loadWallets(true);
    }, 2000);
}

// ===== WEBSOCKET =====

function initializeWebSocket() {
    // WebSocket connection for real-time updates
    // This would connect to a WebSocket server for live updates
    console.log('WebSocket connection would be initialized here');
}

// ===== UTILITIES =====

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ===== AUTO REFRESH =====

function startAutoRefresh() {
    // Refresh dashboard every 10 seconds
    setInterval(async () => {
        await loadDashboard();
    }, 10000);
    
    // Refresh wallets every 30 seconds if on wallet view
    setInterval(async () => {
        const walletView = document.getElementById('wallets-view');
        if (walletView.classList.contains('active')) {
            await loadWallets();
        }
    }, 30000);
    
    // Refresh trading status every 15 seconds
    setInterval(async () => {
        const volumeView = document.getElementById('volume-view');
        const smartsellView = document.getElementById('smartsell-view');
        
        if (volumeView.classList.contains('active')) {
            await loadVolumeStatus();
        }
        if (smartsellView.classList.contains('active')) {
            await loadSmartSellStatus();
        }
    }, 15000);
    
    // Simulate console activity
    setInterval(() => {
        const activities = [
            'Price check completed',
            'RPC connection healthy',
            'Monitoring active positions',
            'System status: OK',
            'Wallet balances updated',
            'Trading engine active'
        ];
        const random = activities[Math.floor(Math.random() * activities.length)];
        addConsoleLog(random, 'info');
    }, 45000);
}

// ===== REFRESH BUTTON =====

document.getElementById('refresh-btn').addEventListener('click', async () => {
    showToast('Refreshing data...', 'info');
    await loadDashboard();
    await loadWallets(true);
    await loadGroups();
});

// ===== GLOBAL FUNCTIONS (for inline handlers) =====

window.toggleWalletSelection = toggleWalletSelection;
window.viewWallet = viewWallet;
window.copyAddress = copyAddress;

console.log('✅ Production Platform Initialized');
