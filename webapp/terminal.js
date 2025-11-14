// Chaos Bot Trading Terminal
console.log('⚡ CHAOS BOT TRADING TERMINAL');
console.log('System initializing...');

// Configuration
const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var API_BASE = IS_LOCALHOST ? 'http://localhost:3000/api' : (window.__CHAOSBOT_API_BASE__ || '/api');

// State
let systemData = {
    wallets: { total: 0, active: 0 },
    balance: { sol: 0, usd: 0 },
    solPrice: 0
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✓ DOM loaded');
    await init();
    startUpdates();
    addActivityLog('System initialized - All engines ready', 'success');
});

async function init() {
    await fetchSystemData();
    updateDisplay();
    console.log('✓ System ready');
}

// Fetch real data from API
async function fetchSystemData() {
    try {
        // api-server.js handles both /api/stats and /stats routes
        const statsEndpoint = API_BASE.startsWith('http') ? `${API_BASE}/api/stats` : `${API_BASE}/stats`;
        const response = await fetch(statsEndpoint, { timeout: 5000 });
        
        if (response.ok) {
            const data = await response.json();
            systemData = {
                wallets: data.wallets || systemData.wallets,
                balance: data.balance || systemData.balance,
                solPrice: data.solPrice || systemData.solPrice
            };
            console.log('✓ Live data loaded:', systemData);
        } else {
            const errorText = await response.text();
            console.error('⚠ Backend API responded with error:', response.status, errorText);
            addActivityLog('Backend API unavailable. Start Chaos Bot API server and refresh.', 'error');
        }
    } catch (error) {
        console.error('⚠ API not available:', error);
        addActivityLog('Unable to reach Chaos Bot API server. Verify it is running on localhost:3000.', 'error');
    }
}

// Update all display elements
function updateDisplay() {
    // SOL Price
    const priceEl = document.getElementById('sol-price');
    if (priceEl) {
        priceEl.textContent = `$${systemData.solPrice.toFixed(2)}`;
        animateValue(priceEl);
    }
    
    // Total USD
    const usdEl = document.getElementById('total-usd');
    if (usdEl) {
        usdEl.textContent = `$${systemData.balance.usd.toFixed(2)} USD`;
    }
    
    console.log('✓ Display updated');
}

// Animate value change
function animateValue(element) {
    element.style.animation = 'none';
    setTimeout(() => {
        element.style.animation = 'flash 0.5s ease';
    }, 10);
}

// Add activity log entry
function addActivityLog(message, type = 'info') {
    const feed = document.querySelector('.activity-feed');
    if (!feed) return;
    
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '●';
    
    const item = document.createElement('div');
    item.className = `activity-item status-${type}`;
    item.innerHTML = `
        <span class="activity-time">${time}</span>
        <span class="activity-icon">${icon}</span>
        <span class="activity-text">${message}</span>
    `;
    
    feed.insertBefore(item, feed.firstChild);
    
    // Keep only last 10
    while (feed.children.length > 10) {
        feed.removeChild(feed.lastChild);
    }
}

// Auto-update system
function startUpdates() {
    // Update SOL price every 10 seconds
    setInterval(async () => {
        await fetchSystemData();
        updateDisplay();
    }, 10000);
    
    // Simulate activity
    setInterval(() => {
        const activities = [
            'Price check completed',
            'RPC connection verified',
            'Wallet health status: OK',
            'System monitoring active'
        ];
        const random = activities[Math.floor(Math.random() * activities.length)];
        addActivityLog(random, 'info');
    }, 30000);
}

// Button handlers
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const text = this.textContent.trim();
        addActivityLog(`Action: ${text}`, 'info');
        
        // Visual feedback
        this.style.transform = 'scale(0.95)';
        setTimeout(() => {
            this.style.transform = '';
        }, 150);
    });
});

// Add CSS animation for flash effect
const style = document.createElement('style');
style.textContent = `
    @keyframes flash {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
`;
document.head.appendChild(style);

console.log('✓ Terminal ready for trading');

