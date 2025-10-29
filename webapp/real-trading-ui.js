// Real On-Chain Trading UI - No Fake Data
// 100% Solana Blockchain Integration

let solana;
let selectedWallets = new Set();
let currentView = 'wallets';
let autoScroll = true;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Real On-Chain Trading Platform...');
    
    // Initialize Solana integration
    solana = new SolanaIntegration();
    
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Load real data
    await loadRealData();
    
    // Initialize UI
    initializeEventListeners();
    startRealTimeUpdates();
    
    // Add console log
    addConsoleLog('✅ System initialized - Real on-chain trading ready', 'success');
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
        
        // Check RPC health
        const rpcHealth = await solana.checkRPCHealth();
        updateRPCStatus(rpcHealth);
        
        addConsoleLog(`✅ Loaded ${wallets.length} wallets with real balances`, 'info');
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
                <div class="font-mono text-sm text-gray-400">
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
        selectedWallets.add(address);
    } else {
        selectedWallets.delete(address);
    }
    updateBulkActionsUI();
}

function updateBulkActionsUI() {
    const bulkActions = document.getElementById('bulk-actions');
    if (bulkActions) {
        if (selectedWallets.size > 0) {
            bulkActions.style.display = 'block';
            bulkActions.innerHTML = `${selectedWallets.size} wallet(s) selected`;
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
    if (autoScroll) {
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
        });
    });
    
    // Add more event listeners as needed
}

function switchView(viewName) {
    currentView = viewName;
    
    // Hide all views
    document.querySelectorAll('[id$="-view"]').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Show selected view
    const selectedView = document.getElementById(`${viewName}-view`);
    if (selectedView) {
        selectedView.classList.remove('hidden');
    }
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.view === viewName) {
            item.classList.add('bg-purple-900', 'text-white');
            item.classList.remove('text-gray-400');
        } else {
            item.classList.remove('bg-purple-900', 'text-white');
            item.classList.add('text-gray-400');
        }
    });
    
    addConsoleLog(`📱 Switched to ${viewName} view`, 'info');
}

// Token Launch with Automations
let pumpFunTrading;

// Initialize PumpFun Trading
function initializePumpFun() {
    if (!pumpFunTrading && solana) {
        pumpFunTrading = new PumpFunTrading(solana);
        console.log('✅ PumpFun Trading initialized');
    }
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
    }
}

// Execute Token Creation & Launch with Automations
async function executeCreateAndLaunchToken() {
    try {
        // Initialize PumpFun if not already
        initializePumpFun();
        
        addConsoleLog('🚀 Starting token launch process...', 'info');
        
        // Get token metadata
        const name = document.getElementById('token-name')?.value;
        const symbol = document.getElementById('token-symbol')?.value;
        const description = document.getElementById('token-description')?.value;
        const website = document.getElementById('token-website')?.value;
        const twitter = document.getElementById('token-twitter')?.value;
        const telegram = document.getElementById('token-telegram')?.value;
        
        // Validation
        if (!name || !symbol) {
            addConsoleLog('❌ Token name and symbol are required!', 'error');
            alert('Please enter token name and symbol');
            return;
        }
        
        if (!solana.wallets || solana.wallets.length === 0) {
            addConsoleLog('❌ No wallets found! Create or import a wallet first.', 'error');
            alert('Please create or import a wallet first');
            return;
        }
        
        // Get creator wallet (first wallet)
        const creatorWallet = solana.wallets[0];
        
        // Get automation settings
        const enableSmartSell = document.getElementById('enable-smart-sell')?.checked || false;
        const enableVolumeBot = document.getElementById('enable-volume-bot')?.checked || false;
        const initialBuyAmount = parseFloat(document.getElementById('initial-buy-amount')?.value || '0');
        
        // Smart Sell Config
        const smartSellConfig = enableSmartSell ? {
            wallets: solana.wallets,
            profitTarget: parseFloat(document.getElementById('smart-sell-profit')?.value || '30'),
            stopLoss: parseFloat(document.getElementById('smart-sell-stoploss')?.value || '-15'),
            trailingStop: parseFloat(document.getElementById('smart-sell-trailing')?.value || '10'),
            partialSells: document.getElementById('smart-sell-partial')?.checked || true,
            sellPercentages: [25, 25, 25, 25]
        } : null;
        
        // Volume Bot Config
        const volumeBotConfig = enableVolumeBot ? {
            wallets: solana.wallets,
            buyAmount: parseFloat(document.getElementById('volume-bot-amount')?.value || '0.01'),
            sellDelay: parseInt(document.getElementById('volume-bot-delay')?.value || '30'),
            cycles: parseInt(document.getElementById('volume-bot-cycles')?.value || '10'),
            randomizeAmounts: document.getElementById('volume-bot-randomize')?.checked || true,
            minAmount: 0.005,
            maxAmount: 0.02
        } : null;
        
        addConsoleLog('📝 Token Configuration:', 'info');
        addConsoleLog(`   Name: ${name}`, 'info');
        addConsoleLog(`   Symbol: ${symbol}`, 'info');
        addConsoleLog(`   Creator: ${creatorWallet.publicKey}`, 'info');
        if (initialBuyAmount > 0) {
            addConsoleLog(`   Initial Buy: ${initialBuyAmount} SOL`, 'info');
        }
        if (enableSmartSell) {
            addConsoleLog(`   🤖 Smart Sell: Enabled`, 'success');
        }
        if (enableVolumeBot) {
            addConsoleLog(`   📊 Volume Bot: Enabled`, 'success');
        }
        
        // Create token config
        const tokenConfig = {
            name,
            symbol,
            description,
            image: '', // TODO: Handle image upload
            twitter,
            telegram,
            website,
            creatorWallet,
            initialBuyAmount,
            enableSmartSell,
            smartSellConfig,
            enableVolumeBot,
            volumeBotConfig
        };
        
        // Launch token
        addConsoleLog('🔨 Creating token on PumpFun...', 'info');
        const result = await pumpFunTrading.createToken(tokenConfig);
        
        if (result.success) {
            addConsoleLog('✅ TOKEN LAUNCHED SUCCESSFULLY!', 'success');
            addConsoleLog(`🪙 Token Mint: ${result.tokenMint}`, 'success');
            addConsoleLog(`📄 Metadata: ${result.metadataUri}`, 'info');
            
            // Show automations status
            if (result.automations && result.automations.length > 0) {
                addConsoleLog(`🤖 Active Automations: ${result.automations.length}`, 'success');
                result.automations.forEach(auto => {
                    addConsoleLog(`   - ${auto.type}: ${auto.bot.id}`, 'info');
                });
            }
            
            // Show success modal or redirect
            alert(`🚀 Token Launched!\n\nMint: ${result.tokenMint}\n\nView on Solscan`);
            window.open(`https://solscan.io/token/${result.tokenMint}`, '_blank');
            
            // Navigate back to tokens view
            setTimeout(() => {
                switchView('tokens');
            }, 2000);
            
        } else {
            addConsoleLog(`❌ Launch failed: ${result.error}`, 'error');
            alert(`Token launch failed: ${result.error}`);
        }
        
    } catch (error) {
        addConsoleLog(`❌ Error: ${error.message}`, 'error');
        console.error('Token launch error:', error);
        alert(`Error: ${error.message}`);
    }
}

// View active automations
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
window.executeCreateAndLaunchToken = executeCreateAndLaunchToken;
window.viewActiveAutomations = viewActiveAutomations;
window.stopAutomation = stopAutomation;

console.log('✅ Real Trading UI JavaScript loaded');

