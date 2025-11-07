// Chaos Bot Control Panel - Advanced Trading Platform
const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : (window.__CHAOSBOT_API_BASE__ || '/.netlify/functions');
let isBackendAvailable = false;

// State
let currentView = 'dashboard';
let wallets = [];
let groups = [];
let stats = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('⚡ Chaos Bot Control Panel Loading...');
    console.log('🌐 Location:', window.location.href);
    console.log('🔧 API Base:', API_BASE);
    
    initializeNav();
    await checkBackendConnection();
    await loadDashboard();
    startAutoRefresh();
});

// Check if backend API is available
async function checkBackendConnection() {
    try {
        const endpoint = API_BASE.includes('netlify') ? `${API_BASE}/stats` : `${API_BASE}/api/stats`;
        const response = await fetch(endpoint);
        if (response.ok) {
            isBackendAvailable = true;
            console.log('✅ Backend API connected');
        }
    } catch (error) {
        isBackendAvailable = false;
        console.log('ℹ️ Running in demo mode (backend not connected)');
    }
}

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
        'wallets': 'Wallet Groups',
        'analytics': 'Analytics',
        'volume': 'Volume Trading',
        'smartsell': 'Smart Sell AI',
        'instant': 'Instant Trading',
        'pumpfun': 'Pump.fun Sniper',
        'trade': 'Manual Trade',
        'history': 'Trade History'
    };
    
    const subtitles = {
        'dashboard': 'System Overview',
        'wallets': 'Multi-wallet Operations',
        'analytics': 'Performance Insights',
        'volume': 'Coordinated Trading',
        'smartsell': 'AI-Powered Selling',
        'instant': '10s Detection System',
        'pumpfun': 'Early Launch Sniping',
        'trade': 'Jupiter V6 Swaps',
        'history': 'Transaction Logs'
    };
    
    document.getElementById('page-title').textContent = titles[viewName];
    document.getElementById('page-subtitle').textContent = subtitles[viewName];
    
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
        case 'instant':
            await loadInstantTradingView();
            break;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        const endpoint = API_BASE.includes('netlify') ? `${API_BASE}/stats` : `${API_BASE}/api/stats`;
        console.log('🔄 Loading dashboard from:', endpoint);
        
        const response = await fetch(endpoint);
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error:', errorText);
            throw new Error(`API returned ${response.status}`);
        }
        
        stats = await response.json();
        console.log('✅ Stats loaded:', stats);
        
        updateDashboardStats();
        await updateSystemStatus();
        
    } catch (error) {
        console.error('❌ Dashboard load error:', error);
        console.error('Error details:', error.message);
        // Fallback to demo data
        stats = {
            wallets: { total: 0, active: 0 },
            balance: { sol: 0, usd: 0 },
            groups: 0,
            solPrice: null,
            network: 'mainnet-beta'
        };
        console.log('⚠️ Using fallback demo data');
        updateDashboardStats();
        showToast('Using demo data - check console for errors', 'error');
    }
}

function updateDashboardStats() {
    if (!stats) return;
    
    // Update stats
    document.getElementById('total-wallets').textContent = stats.wallets.total;
    document.getElementById('active-wallets').textContent = stats.wallets.active;
    document.getElementById('total-sol').textContent = `${stats.balance.sol.toFixed(2)} SOL`;
    document.getElementById('total-usd').textContent = `$${stats.balance.usd.toFixed(2)}`;
    document.getElementById('total-groups').textContent = stats.groups;
    
    // Update SOL price
    const solPriceEl = document.getElementById('sol-price');
    if (typeof stats.solPrice === 'number' && !Number.isNaN(stats.solPrice)) {
        solPriceEl.textContent = `$${stats.solPrice.toFixed(2)}`;
    } else {
        solPriceEl.textContent = 'N/A';
    }
    solPriceEl.setAttribute('data-source', stats.priceSource || 'unknown');
}

async function updateSystemStatus() {
    try {
        // Volume status
        const volumeEndpoint = API_BASE.includes('netlify') ? `${API_BASE}/volume-status` : `${API_BASE}/api/volume/status`;
        const volumeResp = await fetch(volumeEndpoint);
        const volume = await volumeResp.json();
        document.getElementById('volume-status').textContent = 
            volume.isActive ? 'Active' : 'Standby';
        document.getElementById('volume-indicator').className = 
            volume.isActive ? 'indicator-dot status-active' : 'indicator-dot';
        document.getElementById('volume-sessions').textContent = 
            volume.sessions.length || 0;
        document.getElementById('volume-cycles').textContent = 
            volume.stats.totalTrades || 0;
        
        // Smart sell status
        const smartEndpoint = API_BASE.includes('netlify') ? `${API_BASE}/smartsell-status` : `${API_BASE}/api/smartsell/status`;
        const smartResp = await fetch(smartEndpoint);
        const smart = await smartResp.json();
        document.getElementById('smartsell-status').textContent = 
            smart.isEnabled ? 'Enabled' : 'Disabled';
        document.getElementById('smartsell-indicator').className = 
            smart.isEnabled ? 'indicator-dot status-active' : 'indicator-dot';
        document.getElementById('smartsell-monitoring').textContent = 
            `${smart.activeMonitors || 0} tokens`;
    } catch (error) {
        console.error('Status update error:', error);
        // Set defaults on error
        document.getElementById('volume-status').textContent = 'Standby';
        document.getElementById('volume-indicator').className = 'indicator-dot';
        document.getElementById('volume-sessions').textContent = '0';
        document.getElementById('volume-cycles').textContent = '0';
        document.getElementById('smartsell-status').textContent = 'Disabled';
        document.getElementById('smartsell-indicator').className = 'indicator-dot';
        document.getElementById('smartsell-monitoring').textContent = '0 tokens';
    }
}

// Wallets
async function loadWallets() {
    try {
        const endpoint = API_BASE.includes('netlify') ? `${API_BASE}/wallets` : `${API_BASE}/api/wallets`;
        const response = await fetch(endpoint);
        wallets = await response.json();
        
        updateWalletGroups();
        updateWalletsTable();
        
    } catch (error) {
        console.error('Wallets load error:', error);
        wallets = generateDemoWallets();
        updateWalletGroups();
        updateWalletsTable();
    }
}

function generateDemoWallets() {
    const demoWallets = [];
    for (let i = 1; i <= 20; i++) {
        demoWallets.push({
            name: `Volume_${i}`,
            publicKey: generateRandomAddress(),
            groupName: 'Volume',
            balance: 0,
            usdValue: 0,
            status: 'active'
        });
    }
    for (let i = 1; i <= 20; i++) {
        demoWallets.push({
            name: `Pump_${i}`,
            publicKey: generateRandomAddress(),
            groupName: 'VolumePump',
            balance: 0,
            usdValue: 0,
            status: 'active'
        });
    }
    return demoWallets;
}

function generateRandomAddress() {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    for (let i = 0; i < 44; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
}

function updateWalletGroups() {
    const volumeWallets = wallets.filter(w => w.groupName === 'Volume' || w.groupName === 'test');
    const pumpWallets = wallets.filter(w => w.groupName === 'VolumePump');
    
    document.getElementById('volume-group-count').textContent = `${volumeWallets.length} wallets`;
    document.getElementById('pump-group-count').textContent = `${pumpWallets.length} wallets`;
    
    const volumeBalance = volumeWallets.reduce((sum, w) => sum + w.balance, 0);
    const pumpBalance = pumpWallets.reduce((sum, w) => sum + w.balance, 0);
    
    document.getElementById('volume-balance').textContent = `${volumeBalance.toFixed(2)} SOL`;
    document.getElementById('pump-balance').textContent = `${pumpBalance.toFixed(2)} SOL`;
}

function updateWalletsTable() {
    const tbody = document.getElementById('wallets-table');
    tbody.innerHTML = '';
    
    if (wallets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">No wallets found</td></tr>';
        return;
    }
    
    wallets.slice(0, 20).forEach(wallet => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${wallet.name}</td>
            <td><code>${truncateAddress(wallet.publicKey)}</code></td>
            <td><span class="group-badge">${wallet.groupName}</span></td>
            <td>${wallet.balance.toFixed(4)}</td>
            <td>$${wallet.usdValue.toFixed(2)}</td>
            <td><span class="status-${wallet.status}">${wallet.status}</span></td>
            <td><button class="btn-small" onclick="viewWallet('${wallet.publicKey}')">View</button></td>
        `;
        tbody.appendChild(row);
    });
}

async function refreshWallets() {
    showToast('Refreshing wallet balances...', 'success');
    await loadWallets();
    showToast('Wallets refreshed!', 'success');
}

function viewWallet(address) {
    const solscanUrl = `https://solscan.io/account/${address}`;
    window.open(solscanUrl, '_blank');
}

// Volume Trading
async function loadVolumeView() {
    try {
        const endpoint = API_BASE.includes('netlify') ? `${API_BASE}/groups` : `${API_BASE}/api/groups`;
        const response = await fetch(endpoint);
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
        console.error('Volume view load error:', error);
        // Fallback groups
        groups = [
            { id: 'test', name: 'Test Wallets', walletCount: 10 },
            { id: 'VolumePump', name: 'Pump.Fun Launch Group', walletCount: 20 }
        ];
        const select = document.getElementById('volume-group');
        select.innerHTML = '<option value="">Select group...</option>';
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = `${group.name} (${group.walletCount} wallets)`;
            select.appendChild(option);
        });
    }
}

async function startVolume() {
    const groupId = document.getElementById('volume-group').value;
    const tokenAddress = document.getElementById('volume-token').value;
    const buyAmount = parseFloat(document.getElementById('volume-buy-amount').value);
    const sellAmount = parseFloat(document.getElementById('volume-sell-amount').value);
    const cycles = parseInt(document.getElementById('volume-cycles').value);
    const bundlingMode = document.getElementById('bundling-mode').value;
    
    if (!groupId || !tokenAddress) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    if (!isBackendAvailable) {
        showToast('Backend API not connected. Start the bot with: npm run web', 'error');
        return;
    }
    
    try {
        showToast('Starting volume trading session...', 'success');
        
        const response = await fetch(`${API_BASE}/api/volume/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                groupId, 
                tokenAddress, 
                buyAmount,
                sellAmount,
                cycles,
                bundlingMode
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Volume trading session started!', 'success');
            await updateSystemStatus();
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to start volume trading', 'error');
    }
}

async function stopVolume() {
    if (!isBackendAvailable) {
        showToast('Backend API not connected', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/volume/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('All volume sessions stopped', 'success');
            await updateSystemStatus();
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to stop volume trading', 'error');
    }
}

// Smart Sell
async function loadSmartSellView() {
    // Settings are pre-populated
}

// Instant Trading
async function loadInstantTradingView() {
    try {
        const endpoint = API_BASE.includes('netlify') 
            ? `${API_BASE}/instant-trading/status` 
            : `${API_BASE}/api/instant-trading/status`;
        
        const response = await fetch(endpoint);
        
        if (response.ok) {
            const data = await response.json();
            updateInstantTradingStatus(data);
        } else {
            console.error('Failed to load instant trading status');
            updateInstantTradingStatus({
                available: false,
                connected: false,
                isRunning: false
            });
        }
    } catch (error) {
        console.error('Error loading instant trading view:', error);
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
    if (!statusEl) return;
    
    if (data.available && data.connected) {
        statusEl.innerHTML = `
            <div class="status-card ${data.isRunning ? 'active' : 'inactive'}">
                <h3>Instant Trading System</h3>
                <p>Status: ${data.isRunning ? '🟢 Running' : '🟡 Stopped'}</p>
                ${data.currentToken ? `<p>Token: ${data.currentToken.substring(0, 8)}...${data.currentToken.substring(-6)}</p>` : ''}
                ${data.stats ? `
                    <p>Detections: ${data.stats.totalDetections || 0}</p>
                    <p>Successful Sells: ${data.stats.successfulSells || 0}</p>
                ` : ''}
            </div>
        `;
    } else {
        statusEl.innerHTML = `
            <div class="status-card inactive">
                <h3>Instant Trading System</h3>
                <p>Status: ${data.available ? '🟡 Available but not connected' : '🔴 Not available'}</p>
                <p>${data.message || 'Start the bot to activate instant trading'}</p>
            </div>
        `;
    }
}

async function enableSmartSell() {
    const tokenAddress = document.getElementById('smartsell-token').value;
    const profitTarget = parseFloat(document.getElementById('profit-target').value);
    const stopLoss = parseFloat(document.getElementById('stop-loss').value);
    const trailingStop = parseFloat(document.getElementById('trailing-stop').value);
    const emergencyStop = parseFloat(document.getElementById('emergency-stop').value);
    
    if (!tokenAddress) {
        showToast('Please enter a token address', 'error');
        return;
    }
    
    if (!isBackendAvailable) {
        showToast('Backend API not connected. Start the bot with: npm run web', 'error');
        return;
    }
    
    try {
        showToast('Enabling Smart Sell AI...', 'success');
        
        const response = await fetch(`${API_BASE}/api/smartsell/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                tokenAddress,
                settings: {
                    profitTarget,
                    stopLoss,
                    trailingStop,
                    emergencyStop
                },
                wallets: wallets.map(w => w.publicKey)
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Smart Sell enabled! Monitoring active.', 'success');
            await updateSystemStatus();
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to enable Smart Sell', 'error');
    }
}

async function disableSmartSell() {
    if (!isBackendAvailable) {
        showToast('Backend API not connected', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/smartsell/disable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Smart Sell disabled', 'success');
            await updateSystemStatus();
        } else {
            showToast(`Failed: ${result.error}`, 'error');
        }
    } catch (error) {
        showToast('Failed to disable Smart Sell', 'error');
    }
}

// Utilities
function truncateAddress(address) {
    if (!address || address.length <= 12) return address;
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
    }, 4000);
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
            const endpoint = API_BASE.includes('netlify') ? `${API_BASE}/stats` : `${API_BASE}/api/stats`;
            const response = await fetch(endpoint);
            const data = await response.json();
            const solPriceEl = document.getElementById('sol-price');
            if (typeof data.solPrice === 'number' && !Number.isNaN(data.solPrice)) {
                solPriceEl.textContent = `$${data.solPrice.toFixed(2)}`;
            } else {
                solPriceEl.textContent = 'N/A';
            }
            solPriceEl.setAttribute('data-source', data.priceSource || 'unknown');
        } catch (error) {}
    }, 5000);
}

// Add slideOut animation
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
    
    code {
        font-family: 'Courier New', monospace;
        font-size: 0.85em;
    }
    
    .group-badge {
        padding: 0.25rem 0.5rem;
        background: rgba(139, 92, 246, 0.15);
        border-radius: 4px;
        font-size: 0.85rem;
        font-weight: 600;
    }
    
    .status-active {
        color: var(--success);
    }
    
    .btn-small {
        padding: 0.35rem 0.75rem;
        background: var(--primary);
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .btn-small:hover {
        background: var(--primary-dark);
    }
`;
document.head.appendChild(style);

console.log('✅ Chaos Bot Control Panel Loaded');
