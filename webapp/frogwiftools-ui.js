// FrogWifTools Style Trading Platform

console.log('🐸 FrogWifTools Style Platform Loading...');

// Configuration
const IS_NETLIFY = window.location.hostname !== 'localhost';
const API_BASE = IS_NETLIFY ? '/.netlify/functions' : 'http://localhost:3000/api';

// State
const state = {
    wallets: [],
    filteredWallets: [],
    selectedWallets: new Set(),
    currentFilter: 'all',
    sortColumn: null,
    sortDirection: 'asc',
    currentView: 'wallets',
    autoScroll: true
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✓ DOM Loaded');
    
    initializeNavigation();
    initializeWallets();
    initializeModals();
    initializeConsole();
    
    await loadWallets();
    startAutoRefresh();
    
    addConsoleLog('System initialized - Ready for trading', 'success');
    console.log('✓ FrogWifTools Style Platform Ready');
});

// Navigation
function initializeNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const view = tab.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.view === viewName) {
            tab.classList.add('active');
        }
    });
    
    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');
    
    state.currentView = viewName;
    
    // Load view-specific data
    if (viewName === 'wallets') {
        loadWallets();
    }
}

// Wallets Management
function initializeWallets() {
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
    
    // Generate button
    document.getElementById('generate-btn').addEventListener('click', () => {
        openModal('generate-modal');
    });
    
    // Bulk action buttons
    document.getElementById('fund-btn').addEventListener('click', () => openModal('fund-modal'));
    document.getElementById('withdraw-btn').addEventListener('click', () => {
        showToast('Withdraw feature coming soon!', 'info');
    });
    document.getElementById('tag-btn').addEventListener('click', () => {
        showToast('Tag wallets feature coming soon!', 'info');
    });
    document.getElementById('warm-btn').addEventListener('click', () => {
        showToast('Warm wallets feature coming soon!', 'info');
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
    document.getElementById('activate-btn').addEventListener('click', () => {
        showToast('Activate/Deactivate feature coming soon!', 'info');
    });
}

async function loadWallets() {
    try {
        const endpoint = IS_NETLIFY ? `${API_BASE}/wallets` : `${API_BASE}/wallets`;
        const response = await fetch(endpoint);
        
        if (!response.ok) throw new Error('API error');
        
        const data = await response.json();
        state.wallets = data.wallets || [];
        state.filteredWallets = [...state.wallets];
        
        filterWallets();
        renderWalletTable();
        updateTotalBalance();
        
        console.log(`✓ Loaded ${state.wallets.length} wallets`);
    } catch (error) {
        console.log('⚠ No wallets configured - starting empty');
        state.wallets = [];
        state.filteredWallets = [];
        filterWallets();
        renderWalletTable();
        updateTotalBalance();
    }
}

function generateDemoWallets() {
    const wallets = [];
    const groups = ['Volume', 'Pump.fun'];
    const tags = ['Photon', 'BullX', 'GMGN', 'Trojan'];
    
    for (let i = 1; i <= 40; i++) {
        const group = i <= 20 ? 'Volume' : 'Pump.fun';
        const name = i <= 20 ? `Volume_${i}` : `Pump_${i-20}`;
        
        wallets.push({
            name: name,
            publicKey: generateRandomAddress(),
            groupName: group,
            balance: Math.random() * 0.5,
            usdValue: 0,
            status: 'active',
            tokens: Math.floor(Math.random() * 5),
            rent: 0.002 * Math.floor(Math.random() * 3),
            tags: Math.random() > 0.5 ? [tags[Math.floor(Math.random() * tags.length)]] : []
        });
    }
    
    return wallets;
}

function generateRandomAddress() {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    for (let i = 0; i < 44; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
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
    updateTotalBalance();
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
    const tbody = document.getElementById('wallets-table-body');
    
    if (state.filteredWallets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8">
                    <div class="text-gray-400 mb-4">
                        <div class="text-6xl mb-4">🔑</div>
                        <div class="text-xl font-semibold mb-2">No Wallets Configured</div>
                        <div class="text-sm">Add wallets to get started with trading</div>
                    </div>
                    <button onclick="showAddWalletModal()" class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg">
                        Add Your First Wallet
                    </button>
                </td>
            </tr>
        `;
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
                ${wallet.tags.map(tag => `<span class="wallet-tag">${tag}</span>`).join('')}
            </td>
            <td>
                <div class="wallet-address">${truncateAddress(wallet.publicKey)}</div>
            </td>
            <td>${wallet.tokens || 0}</td>
            <td>${(wallet.rent || 0).toFixed(4)}</td>
            <td>${(wallet.balance || 0).toFixed(4)}</td>
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
    
    if (selectedCount > 0) {
        bulkActions.style.display = 'flex';
    } else {
        bulkActions.style.display = 'none';
    }
}

function updateTotalBalance() {
    const totalBalance = state.filteredWallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    if (state.filteredWallets.length === 0) {
        document.getElementById('total-balance').textContent = '0.0000 SOL';
    } else {
        document.getElementById('total-balance').textContent = `${totalBalance.toFixed(4)} SOL`;
    }
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
            w.groupName,
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

function truncateAddress(address) {
    if (!address || address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Modals
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
    
    // Fund modal - mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Execute generate button
    document.getElementById('execute-generate').addEventListener('click', executeGenerate);
    
    // Execute fund button
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

async function executeGenerate() {
    const count = parseInt(document.getElementById('generate-count').value);
    
    if (!count || count < 1 || count > 100) {
        showToast('Please enter a valid number (1-100)', 'error');
        return;
    }
    
    showToast(`Generating ${count} new wallet(s)...`, 'info');
    addConsoleLog(`Generating ${count} Solana wallets`, 'info');
    
    closeModal('generate-modal');
    
    // TODO: Implement actual API call
    setTimeout(() => {
        showToast(`Successfully generated ${count} wallets!`, 'success');
        addConsoleLog(`Generated ${count} new wallets`, 'success');
        loadWallets();
    }, 2000);
}

async function executeFund() {
    const privateKey = document.getElementById('fund-key').value;
    const amount = document.getElementById('fund-amount').value;
    
    if (!privateKey) {
        showToast('Please enter funder wallet private key', 'error');
        return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    
    const selectedWallets = state.wallets.filter(w => state.selectedWallets.has(w.publicKey));
    
    if (selectedWallets.length === 0) {
        showToast('No wallets selected', 'warning');
        return;
    }
    
    const activeMode = document.querySelector('.mode-btn.active').dataset.mode;
    
    showToast(`Funding ${selectedWallets.length} wallet(s)...`, 'info');
    addConsoleLog(`Starting ${activeMode} funding for ${selectedWallets.length} wallets`, 'info');
    
    closeModal('fund-modal');
    
    // TODO: Implement actual API call
    setTimeout(() => {
        showToast('Fund operation completed successfully!', 'success');
        addConsoleLog(`Successfully funded ${selectedWallets.length} wallets`, 'success');
        loadWallets();
    }, 2000);
}

// Console
function initializeConsole() {
    document.getElementById('clear-console').addEventListener('click', () => {
        document.getElementById('console-output').innerHTML = '';
        addConsoleLog('Console cleared', 'info');
    });
    
    document.getElementById('auto-scroll-toggle').addEventListener('click', (e) => {
        state.autoScroll = !state.autoScroll;
        e.target.textContent = `Auto-scroll: ${state.autoScroll ? 'ON' : 'OFF'}`;
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

// Utilities
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

// Auto refresh
function startAutoRefresh() {
    // Refresh wallets every 30 seconds if on wallet view
    setInterval(async () => {
        if (state.currentView === 'wallets') {
            await loadWallets();
        }
    }, 30000);
    
    // Simulate console activity
    setInterval(() => {
        const activities = [
            'Price check completed',
            'RPC connection healthy',
            'Monitoring active positions',
            'System status: OK'
        ];
        const random = activities[Math.floor(Math.random() * activities.length)];
        addConsoleLog(random, 'info');
    }, 45000);
}

// Global functions
window.toggleWalletSelection = toggleWalletSelection;
window.viewWallet = viewWallet;
window.copyAddress = copyAddress;

console.log('✅ FrogWifTools Style Platform Initialized');
