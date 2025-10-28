// Chaos Bot Control Panel - Main Application
const API_BASE = window.location.origin;

// State
let currentView = 'dashboard';
let wallets = [];
let groups = [];
let stats = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeNav();
    loadDashboard();
    startAutoRefresh();
});

// Navigation
function initializeNav() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.getAttribute('data-view');
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-view') === viewName) {
            item.classList.add('active');
        }
    });
    
    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');
    
    // Update title
    const titles = {
        'dashboard': 'Dashboard',
        'wallets': 'Wallets',
        'volume': 'Volume Trading',
        'smartsell': 'Smart Sell',
        'trade': 'Manual Trade',
        'history': 'Trade History'
    };
    document.getElementById('page-title').textContent = titles[viewName];
    
    // Load view data
    currentView = viewName;
    loadViewData(viewName);
}

async function loadViewData(viewName) {
    switch(viewName) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'wallets':
            await loadWallets();
            break;
        case 'volume':
            await loadVolumeView();
            break;
        case 'smartsell':
            await loadSmartSellView();
            break;
        case 'trade':
            await loadTradeView();
            break;
        case 'history':
            await loadHistory();
            break;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        stats = await response.json();
        
        // Update stats
        document.getElementById('stat-wallets').textContent = stats.wallets.total;
        document.querySelector('#stat-wallets + .stat-change').textContent = 
            `${stats.wallets.active} active`;
        
        document.getElementById('stat-sol').textContent = 
            `${stats.balance.sol.toFixed(2)} SOL`;
        document.getElementById('stat-usd').textContent = 
            `$${stats.balance.usd.toFixed(2)}`;
        
        document.getElementById('stat-groups').textContent = stats.groups;
        
        // Update SOL price
        document.getElementById('sol-price').textContent = 
            `$${stats.solPrice.toFixed(2)}`;
        
        // Load volume status
        const volumeStatus = await fetch(`${API_BASE}/api/volume/status`);
        const volume = await volumeStatus.json();
        document.getElementById('volume-status').textContent = 
            volume.isActive ? 'Active' : 'Standby';
        
        // Load smart sell status
        const smartSellStatus = await fetch(`${API_BASE}/api/smartsell/status`);
        const smartSell = await smartSellStatus.json();
        document.getElementById('smartsell-status').textContent = 
            smartSell.isEnabled ? 'Enabled' : 'Disabled';
            
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showToast('Failed to load dashboard data', 'error');
    }
}

// Wallets
async function loadWallets() {
    try {
        const response = await fetch(`${API_BASE}/api/wallets`);
        wallets = await response.json();
        
        const tbody = document.getElementById('wallets-table');
        tbody.innerHTML = '';
        
        if (wallets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No wallets found</td></tr>';
            return;
        }
        
        wallets.forEach(wallet => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${wallet.name}</td>
                <td><span class="wallet-address">${truncateAddress(wallet.publicKey)}</span></td>
                <td>${wallet.groupName || 'N/A'}</td>
                <td>${wallet.balance.toFixed(4)}</td>
                <td>$${wallet.usdValue.toFixed(2)}</td>
                <td><span class="status-badge ${wallet.status}">${wallet.status}</span></td>
            `;
            tbody.appendChild(row);
        });
        
    } catch (error) {
        console.error('Failed to load wallets:', error);
        showToast('Failed to load wallets', 'error');
    }
}

async function refreshWallets() {
    showToast('Refreshing wallets...', 'success');
    await loadWallets();
}

// Volume Trading
async function loadVolumeView() {
    try {
        const response = await fetch(`${API_BASE}/api/groups`);
        groups = await response.json();
        
        const select = document.getElementById('volume-group');
        select.innerHTML = '<option value="">Select group...</option>';
        
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = `${group.name} (${group.walletCount} wallets)`;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Failed to load groups:', error);
    }
}

async function startVolume() {
    const groupId = document.getElementById('volume-group').value;
    const tokenAddress = document.getElementById('volume-token').value;
    const cycles = parseInt(document.getElementById('volume-cycles').value);
    
    if (!groupId || !tokenAddress) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/volume/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId, tokenAddress, cycles })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Volume trading session started!', 'success');
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to start volume trading', 'error');
    }
}

async function stopVolume() {
    try {
        const response = await fetch(`${API_BASE}/api/volume/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('All volume sessions stopped', 'success');
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to stop volume trading', 'error');
    }
}

// Smart Sell
async function loadSmartSellView() {
    // Settings are already set in HTML
}

async function enableSmartSell() {
    const tokenAddress = document.getElementById('smartsell-token').value;
    
    if (!tokenAddress) {
        showToast('Please enter a token address', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/smartsell/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tokenAddress,
                wallets: wallets.map(w => w.publicKey)
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Smart Sell enabled!', 'success');
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to enable Smart Sell', 'error');
    }
}

async function disableSmartSell() {
    try {
        const response = await fetch(`${API_BASE}/api/smartsell/disable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Smart Sell disabled', 'success');
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to disable Smart Sell', 'error');
    }
}

// Manual Trade
async function loadTradeView() {
    if (wallets.length === 0) {
        await loadWallets();
    }
    
    const select = document.getElementById('trade-wallet');
    select.innerHTML = '<option value="">Select wallet...</option>';
    
    wallets.forEach(wallet => {
        const option = document.createElement('option');
        option.value = wallet.publicKey;
        option.textContent = `${wallet.name} (${wallet.balance.toFixed(4)} SOL)`;
        select.appendChild(option);
    });
}

async function executeTrade(action) {
    const walletAddress = document.getElementById('trade-wallet').value;
    const tokenAddress = document.getElementById('trade-token').value;
    const amount = parseFloat(document.getElementById('trade-amount').value);
    
    if (!walletAddress || !tokenAddress || !amount) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to ${action.toUpperCase()} ${amount} SOL worth of tokens?`)) {
        return;
    }
    
    try {
        showToast(`Executing ${action}...`, 'success');
        
        const response = await fetch(`${API_BASE}/api/trade/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress, tokenAddress, action, amount })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast(`${action.toUpperCase()} successful! Sig: ${truncateAddress(result.signature)}`, 'success');
        } else {
            showToast(`Trade failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to execute trade', 'error');
    }
}

// History
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE}/api/history`);
        const history = await response.json();
        
        const tbody = document.getElementById('history-table');
        tbody.innerHTML = '';
        
        if (!history || history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No trades yet</td></tr>';
            return;
        }
        
        history.slice(0, 50).forEach(trade => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(trade.timestamp).toLocaleString()}</td>
                <td>${trade.type}</td>
                <td><span class="wallet-address">${truncateAddress(trade.wallet)}</span></td>
                <td><span class="wallet-address">${truncateAddress(trade.token)}</span></td>
                <td>${trade.amount}</td>
                <td>${trade.status}</td>
                <td><span class="wallet-address">${truncateAddress(trade.signature)}</span></td>
            `;
            tbody.appendChild(row);
        });
        
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

async function refreshHistory() {
    showToast('Refreshing history...', 'success');
    await loadHistory();
}

// Utilities
function truncateAddress(address) {
    if (!address) return 'N/A';
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Auto refresh
function startAutoRefresh() {
    // Refresh dashboard every 10 seconds
    setInterval(async () => {
        if (currentView === 'dashboard') {
            await loadDashboard();
        }
    }, 10000);
    
    // Update SOL price every 5 seconds
    setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/api/stats`);
            const data = await response.json();
            document.getElementById('sol-price').textContent = 
                `$${data.solPrice.toFixed(2)}`;
        } catch (error) {}
    }, 5000);
}

// CSS for slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

