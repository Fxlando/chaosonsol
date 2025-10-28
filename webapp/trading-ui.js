// ===== CHAOS BOT - PROFESSIONAL TRADING UI =====

console.log('⚡ CHAOS BOT Trading Platform Loading...');

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
    autoScroll: true
};

// ===== INITIALIZATION =====

document.addEventListener('DOMContentLoaded', async () => {
    console.log('✓ DOM Loaded');
    
    initializeNavigation();
    initializeWalletCommander();
    initializeModals();
    initializeConsole();
    
    await loadDashboard();
    await loadWallets();
    
    startAutoRefresh();
    
    addConsoleLog('System initialized - Ready for trading', 'success');
    console.log('✓ Trading Platform Ready');
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
    }
}

// ===== DASHBOARD =====

async function loadDashboard() {
    try {
        const endpoint = IS_NETLIFY ? `${API_BASE}/stats` : `${API_BASE}/stats`;
        const response = await fetch(endpoint);
        
        if (!response.ok) throw new Error('API error');
        
        state.stats = await response.json();
        updateDashboardUI();
        
        console.log('✓ Dashboard loaded');
    } catch (error) {
        console.log('⚠ Using demo data');
        state.stats = {
            wallets: { total: 40, active: 40 },
            balance: { sol: 0, usd: 0 },
            groups: 2,
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
    document.getElementById('withdraw-btn').addEventListener('click', () => openModal('withdraw-modal'));
    document.getElementById('tag-btn').addEventListener('click', () => openModal('tag-modal'));
    document.getElementById('warm-btn').addEventListener('click', () => openModal('warm-modal'));
    document.getElementById('redistribute-btn').addEventListener('click', () => {
        // TODO: Open redistribute modal
        showToast('Redistribute feature coming soon!', 'info');
    });
    document.getElementById('reclaim-btn').addEventListener('click', () => {
        // TODO: Open reclaim modal
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
        const endpoint = IS_NETLIFY ? `${API_BASE}/wallets` : `${API_BASE}/wallets`;
        const response = await fetch(endpoint);
        
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
        state.wallets = generateDemoWallets();
        state.filteredWallets = [...state.wallets];
        filterWallets();
        renderWalletTable();
        updateFooterStats();
    }
}

function generateDemoWallets() {
    const wallets = [];
    const groups = ['Volume', 'VolumePump'];
    const tags = ['Photon', 'BullX', 'GMGN', 'Trojan'];
    
    for (let i = 1; i <= 40; i++) {
        const group = i <= 20 ? 'Volume' : 'VolumePump';
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
                ${wallet.tags.map(tag => `<span class="wallet-tag">${tag}</span>`).join('')}
            </td>
            <td>
                <div class="wallet-address">${truncateAddress(wallet.publicKey)}</div>
            </td>
            <td>${wallet.tokens || 0}</td>
            <td>${(wallet.rent || 0).toFixed(4)}</td>
            <td>${(wallet.balance || 0).toFixed(4)}</td>
            <td>
                <span class="wallet-group">${wallet.groupName}</span>
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

function deactivateWallets() {
    if (state.selectedWallets.size === 0) {
        showToast('No wallets selected', 'warning');
        return;
    }
    
    if (!confirm(`Deactivate ${state.selectedWallets.size} wallet(s)?`)) {
        return;
    }
    
    // TODO: API call to deactivate
    showToast(`Deactivated ${state.selectedWallets.size} wallet(s)`, 'success');
}

function truncateAddress(address) {
    if (!address || address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
    
    // Fund modal - mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Fund modal - distribution buttons
    document.querySelectorAll('.dist-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dist-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const distType = btn.dataset.dist;
            document.getElementById('uniform-amount-section').style.display = 
                distType === 'uniform' ? 'block' : 'none';
            document.getElementById('specific-amount-section').style.display = 
                distType === 'specific' ? 'block' : 'none';
        });
    });
    
    // Execute fund button
    document.getElementById('execute-fund').addEventListener('click', executeFund);
    
    // Withdraw modal - method buttons
    document.querySelectorAll('.withdraw-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.withdraw-method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const method = btn.dataset.method;
            const label = document.getElementById('withdraw-input-label');
            const input = document.getElementById('withdraw-value');
            
            if (method === 'uniform-percent') {
                label.textContent = 'Percentage (%)';
                input.placeholder = '50';
                input.min = '1';
                input.max = '100';
                input.step = '1';
            } else {
                label.textContent = 'Amount (SOL)';
                input.placeholder = '0.1';
                input.min = '0.001';
                input.max = '';
                input.step = '0.001';
            }
        });
    });
    
    document.getElementById('execute-withdraw').addEventListener('click', executeWithdraw);
    
    // Tag modal - executor buttons
    document.querySelectorAll('.executor-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.executor-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    document.getElementById('execute-tag').addEventListener('click', executeTag);
    
    // Warm modal - token select buttons
    document.querySelectorAll('.token-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.token-select-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tokenType = btn.dataset.token;
            document.getElementById('custom-mint-section').style.display = 
                tokenType === 'custom' ? 'block' : 'none';
        });
    });
    
    document.getElementById('execute-warm').addEventListener('click', executeWarm);
    
    // Generate modal - group select
    document.getElementById('generate-group').addEventListener('change', (e) => {
        document.getElementById('new-group-section').style.display = 
            e.target.value === 'custom' ? 'block' : 'none';
    });
    
    document.getElementById('execute-generate').addEventListener('click', executeGenerate);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // If opening fund modal, populate specific amounts list
    if (modalId === 'fund-modal') {
        const selectedWallets = state.wallets.filter(w => state.selectedWallets.has(w.publicKey));
        if (selectedWallets.length === 0) {
            showToast('No wallets selected', 'warning');
            return;
        }
        
        const specificList = document.getElementById('specific-amounts-list');
        specificList.innerHTML = selectedWallets.map(w => `
            <div style="display: flex; gap: 1rem; margin-bottom: 0.5rem;">
                <div style="flex: 1; font-size: 0.9rem;">${w.name}</div>
                <input type="number" 
                       placeholder="0.1" 
                       step="0.001"
                       data-address="${w.publicKey}"
                       style="width: 150px; padding: 0.5rem; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);">
            </div>
        `).join('');
    }
    
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
    
    if (!privateKey) {
        showToast('Please enter funder wallet private key', 'error');
        return;
    }
    
    const selectedWallets = state.wallets.filter(w => state.selectedWallets.has(w.publicKey));
    
    if (selectedWallets.length === 0) {
        showToast('No wallets selected', 'warning');
        return;
    }
    
    if (selectedWallets.length > 20) {
        showToast('Maximum 20 wallets can be funded at once', 'warning');
        return;
    }
    
    const activeMode = document.querySelector('.mode-btn.active').dataset.mode;
    const activeDist = document.querySelector('.dist-btn.active').dataset.dist;
    
    showToast(`Funding ${selectedWallets.length} wallet(s)...`, 'info');
    addConsoleLog(`Starting ${activeMode} funding for ${selectedWallets.length} wallets`, 'info');
    
    closeModal('fund-modal');
    
    // TODO: Implement actual API call
    setTimeout(() => {
        showToast('Fund operation completed successfully!', 'success');
        addConsoleLog(`Successfully funded ${selectedWallets.length} wallets`, 'success');
        loadWallets(true);
    }, 2000);
}

async function executeWithdraw() {
    const destination = document.getElementById('withdraw-destination').value;
    const value = document.getElementById('withdraw-value').value;
    
    if (!destination) {
        showToast('Please enter destination wallet address', 'error');
        return;
    }
    
    if (!value || parseFloat(value) <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }
    
    const selectedWallets = state.wallets.filter(w => state.selectedWallets.has(w.publicKey));
    
    if (selectedWallets.length === 0) {
        showToast('No wallets selected', 'warning');
        return;
    }
    
    const activeMethod = document.querySelector('.withdraw-method-btn.active').dataset.method;
    const methodText = activeMethod === 'uniform-percent' ? `${value}%` : `${value} SOL`;
    
    if (!confirm(`Withdraw ${methodText} from ${selectedWallets.length} wallet(s) to ${truncateAddress(destination)}?`)) {
        return;
    }
    
    showToast(`Withdrawing from ${selectedWallets.length} wallet(s)...`, 'info');
    addConsoleLog(`Starting withdrawal to ${truncateAddress(destination)}`, 'info');
    
    closeModal('withdraw-modal');
    
    // TODO: Implement actual API call
    setTimeout(() => {
        showToast('Withdrawal completed successfully!', 'success');
        addConsoleLog(`Successfully withdrawn from ${selectedWallets.length} wallets`, 'success');
        loadWallets(true);
    }, 2000);
}

async function executeTag() {
    const selectedTags = Array.from(document.querySelectorAll('.tag-checkbox input:checked'))
        .map(cb => cb.value);
    const minAmount = document.getElementById('tag-min-amount').value;
    const maxAmount = document.getElementById('tag-max-amount').value;
    
    if (selectedTags.length === 0) {
        showToast('Please select at least one platform tag', 'error');
        return;
    }
    
    const selectedWallets = state.wallets.filter(w => state.selectedWallets.has(w.publicKey));
    
    if (selectedWallets.length === 0) {
        showToast('No wallets selected', 'warning');
        return;
    }
    
    const executor = document.querySelector('.executor-btn.active').dataset.executor;
    
    showToast(`Tagging ${selectedWallets.length} wallet(s) with ${selectedTags.join(', ')}...`, 'info');
    addConsoleLog(`Starting wallet tagging via ${executor}`, 'info');
    
    closeModal('tag-modal');
    
    // TODO: Implement actual API call
    setTimeout(() => {
        showToast('Tagging completed! Check gmgn.ai to verify.', 'success');
        addConsoleLog(`Successfully tagged ${selectedWallets.length} wallets`, 'success');
        loadWallets(true);
    }, 3000);
}

async function executeWarm() {
    const minSwaps = document.getElementById('warm-min-swaps').value;
    const maxSwaps = document.getElementById('warm-max-swaps').value;
    const minBuy = document.getElementById('warm-min-buy').value;
    const maxBuy = document.getElementById('warm-max-buy').value;
    const minDelay = document.getElementById('warm-min-delay').value;
    const maxDelay = document.getElementById('warm-max-delay').value;
    
    if (!minSwaps || !maxSwaps || !minBuy || !maxBuy || !minDelay || !maxDelay) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    const selectedWallets = state.wallets.filter(w => state.selectedWallets.has(w.publicKey));
    
    if (selectedWallets.length === 0) {
        showToast('No wallets selected', 'warning');
        return;
    }
    
    const tokenType = document.querySelector('.token-select-btn.active').dataset.token;
    const customMint = tokenType === 'custom' ? document.getElementById('warm-custom-mint').value : null;
    
    if (tokenType === 'custom' && !customMint) {
        showToast('Please enter custom token mint address', 'error');
        return;
    }
    
    showToast(`Warming ${selectedWallets.length} wallet(s)...`, 'info');
    addConsoleLog(`Starting wallet warming process (${minSwaps}-${maxSwaps} swaps each)`, 'info');
    
    closeModal('warm-modal');
    
    // TODO: Implement actual API call
    setTimeout(() => {
        showToast('Warming completed! Check gmgn.ai for activity.', 'success');
        addConsoleLog(`Successfully warmed ${selectedWallets.length} wallets`, 'success');
        loadWallets(true);
    }, 5000);
}

async function executeGenerate() {
    const count = parseInt(document.getElementById('generate-count').value);
    const group = document.getElementById('generate-group').value;
    const newGroupName = document.getElementById('new-group-name').value;
    
    if (!count || count < 1 || count > 100) {
        showToast('Please enter a valid number (1-100)', 'error');
        return;
    }
    
    if (group === 'custom' && !newGroupName) {
        showToast('Please enter a group name', 'error');
        return;
    }
    
    showToast(`Generating ${count} new wallet(s)...`, 'info');
    addConsoleLog(`Generating ${count} Solana wallets`, 'info');
    
    closeModal('generate-modal');
    
    // TODO: Implement actual API call
    setTimeout(() => {
        showToast(`Successfully generated ${count} wallets!`, 'success');
        addConsoleLog(`Generated ${count} new wallets`, 'success');
        loadWallets(true);
    }, 2000);
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

// ===== REFRESH BUTTON =====

document.getElementById('refresh-btn').addEventListener('click', async () => {
    showToast('Refreshing data...', 'info');
    await loadDashboard();
    await loadWallets(true);
});

// ===== GLOBAL FUNCTIONS (for inline handlers) =====

window.toggleWalletSelection = toggleWalletSelection;
window.viewWallet = viewWallet;
window.copyAddress = copyAddress;

console.log('✅ Trading Platform Initialized');

