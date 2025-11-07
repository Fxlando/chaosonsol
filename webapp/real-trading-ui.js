// Real On-Chain Trading UI - No Fake Data
// 100% Solana Blockchain Integration

let solana;
let rtSelectedWallets = new Set();
let rtCurrentView = 'wallets';
let rtAutoScroll = true;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Real On-Chain Trading Platform...');
    
    // FIRST: Set up navigation immediately - this is critical
    initializeEventListeners();
    
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
    
    // Add console log
    try {
        if (typeof addConsoleLog === 'function') {
            addConsoleLog('✅ System initialized - Real on-chain trading ready', 'success');
        }
    } catch (error) {
        console.warn('Error adding console log:', error);
    }
    
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
    });
    
    // Show selected view - try -view first, then -page
    let selectedView = document.getElementById(`${viewName}-view`);
    if (!selectedView) {
        selectedView = document.getElementById(`${viewName}-page`);
    }
    
    if (selectedView) {
        selectedView.classList.remove('hidden');
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
    
    // Load view-specific data
    if (viewName === 'wallets') {
        // Load wallets using wallet-operations if available
        if (window.walletOperations && window.walletOperations.loadWallets) {
            window.walletOperations.loadWallets();
        } else if (typeof loadRealData === 'function') {
            loadRealData();
        }
    } else if (viewName === 'instant') {
        // Load instant trading data
        loadInstantTradingData();
        startInstantTradingRefresh();
    } else {
        // Stop refresh when leaving instant view
        stopInstantTradingRefresh();
    }

    if (viewName === 'blueprint') {
        renderBlueprintList();
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

// Initialize PumpFun Trading
function initializePumpFun() {
    if (!pumpFunTrading && solana) {
        pumpFunTrading = new PumpFunTrading(solana);
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
function initializeSettings() {
    if (!settingsManager && solana) {
        settingsManager = new SettingsManager(solana);
        settingsManager.applySettings();
        console.log('✅ Settings Manager initialized');
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

// ==================== BLUEPRINT FUNCTIONS ====================

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

// Collect all fees
async function collectAllFees() {
    initializeMultiWallet();
    
    if (!solana.wallets || solana.wallets.length === 0) {
        addConsoleLog('❌ No wallets found!', 'error');
        alert('No wallets to collect from. Add wallets first.');
        return;
    }
    
    // Ask for target wallet
    const targetWallet = prompt('Enter target wallet address to collect fees to:');
    if (!targetWallet) return;
    
    // Confirm
    const confirm = window.confirm(
        `Collect SOL from ${solana.wallets.length} wallets to ${targetWallet}?\n\nThis will transfer all available SOL (minus rent) to the target wallet.`
    );
    
    if (!confirm) return;
    
    addConsoleLog('💎 Starting fee collection...', 'info');
    
    const result = await multiWalletManager.collectFees(targetWallet);
    
    if (result.success) {
        addConsoleLog(`✅ Fee collection complete!`, 'success');
        addConsoleLog(`   Total collected: ${result.totalCollected.toFixed(4)} SOL`, 'success');
        addConsoleLog(`   Wallets processed: ${result.walletsProcessed}`, 'info');
        addConsoleLog(`   Successful: ${result.successful}`, 'info');
        
        alert(`✅ Collected ${result.totalCollected.toFixed(4)} SOL from ${result.successful} wallets!`);
        
        // Refresh wallets
        await loadRealData();
    } else {
        addConsoleLog(`❌ Fee collection failed: ${result.error}`, 'error');
        alert(`Fee collection failed: ${result.error}`);
    }
}

// Collect trading fees
async function collectTradingFees() {
    addConsoleLog('💰 Collecting trading fees...', 'info');
    // TODO: Implement specific trading fee collection
    await collectAllFees();
}

// Collect rent fees
async function collectRentFees() {
    addConsoleLog('🏠 Collecting rent fees...', 'info');
    // TODO: Implement specific rent fee collection
    await collectAllFees();
}

// Toggle auto-collect
function toggleAutoCollect() {
    addConsoleLog('⚙️ Auto-collect feature coming soon', 'info');
    // TODO: Implement auto-collect scheduling
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
    
    settingsManager.updateTrading({ priorityFee: fee });
    addConsoleLog(`✅ Priority fee set to ${fee} SOL`, 'success');
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
window.executeCreateAndLaunchToken = executeCreateAndLaunchToken;
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
        const API_BASE = window.location.hostname === 'localhost' 
            ? 'http://localhost:3000' 
            : '/.netlify/functions';
        
        const endpoint = API_BASE.includes('netlify') 
            ? `${API_BASE}/api/instant-trading/status` 
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

// ==================== UI HELPER REGISTRATION ====================

const uiHelperState = {
    fundMode: 'standard',
    tagExecutor: 'jito',
    warmExecutor: 'jito',
    redistributeMode: 'standard',
    tokenPlatform: 'pumpfun',
    copyPlatform: 'pumpfun',
    blockZeroMode: 'bundled',
    tagFilters: new Set()
};

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
                sellDelay: 45
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
                sellDelay: 40
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
                sellDelay: 55
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
                sellDelay: 35
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
    if (typeof window[name] !== 'function') {
        window[name] = handler;
    }
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
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    modal.focus?.();
});

registerGlobalHandler('closeModal', (modalId) => {
    const modal = getElement(modalId);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
});

registerGlobalHandler('executeGenerate', () => {
    window.openModal('generate-modal');
    const input = getElement('generate-count');
    input?.focus();
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
    jitoBtn.classList.toggle('bg-purple-600', executor === 'jito');
    jitoBtn.classList.toggle('bg-neutral-800', executor !== 'jito');
    rpcBtn.classList.toggle('bg-purple-600', executor === 'rpc');
    rpcBtn.classList.toggle('bg-neutral-800', executor !== 'rpc');
    notify(`Tag executor switched to ${executor.toUpperCase()}`, 'info');
});

registerGlobalHandler('toggleTag', (tag) => {
    const button = document.querySelector(`[onclick="toggleTag('${tag}')"]`);
    if (!button) return;
    if (uiHelperState.tagFilters.has(tag)) {
        uiHelperState.tagFilters.delete(tag);
        button.classList.remove('bg-blue-600', 'text-white');
        button.classList.add('bg-neutral-700');
    } else {
        uiHelperState.tagFilters.add(tag);
        button.classList.add('bg-blue-600', 'text-white');
        button.classList.remove('bg-neutral-700');
    }
    notify(`Tag filter updated: ${Array.from(uiHelperState.tagFilters).join(', ') || 'none'}`, 'info');
});

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

registerGlobalHandler('selectTokenPlatform', (platform) => {
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
    notify(`Token platform set to ${platform}`, 'info');
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
    uiHelperState.blockZeroMode = mode;
    const bundled = getElement('block-zero-bundled');
    const undetectable = getElement('block-zero-undetectable');
    bundled?.classList.toggle('border-white', mode === 'bundled');
    undetectable?.classList.toggle('border-white', mode === 'undetectable');
    notify(`Block zero mode set to ${mode}`, 'info');
});

registerGlobalHandler('openCreateBlueprintModal', openCreateBlueprintModal);
registerGlobalHandler('submitBlueprintForm', submitBlueprintForm);
registerGlobalHandler('applyBlueprint', applyBlueprint);
registerGlobalHandler('deleteBlueprint', deleteBlueprint);

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

function setBlueprintFormValue(id, value) {
    const element = getElement(id);
    if (!element) return;
    if (element.type === 'checkbox') {
        element.checked = Boolean(value);
    } else {
        element.value = value;
    }
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
                    enabled: Boolean(getElement('blueprint-smart-sell-enabled')?.checked),
                    profitTarget: parseFloat(getElement('blueprint-smart-sell-profit')?.value || '0') || 0,
                    stopLoss: parseFloat(getElement('blueprint-smart-sell-stoploss')?.value || '0') || 0
                },
                volumeBot: {
                    enabled: Boolean(getElement('blueprint-volume-enabled')?.checked),
                    buyAmount: parseFloat(getElement('blueprint-volume-amount')?.value || '0') || 0,
                    cycles: parseInt(getElement('blueprint-volume-cycles')?.value || '0', 10) || 0,
                    sellDelay: parseInt(getElement('blueprint-volume-delay')?.value || '0', 10) || 0
                }
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

    setBlueprintFormValue('blueprint-volume-enabled', preset.automations.volumeBot.enabled);
    setBlueprintFormValue('blueprint-volume-amount', preset.automations.volumeBot.buyAmount);
    setBlueprintFormValue('blueprint-volume-cycles', preset.automations.volumeBot.cycles);
    setBlueprintFormValue('blueprint-volume-delay', preset.automations.volumeBot.sellDelay);
}

function openCreateBlueprintModal(template = 'custom') {
    if (!ensureMultiWalletReady()) {
        return;
    }

    setBlueprintFormValue('blueprint-template', template);
    applyBlueprintPreset(template);

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
        if (volumeAmount && automations.volumeBot?.buyAmount !== undefined) {
            volumeAmount.value = automations.volumeBot.buyAmount;
        }
        if (volumeCycles && automations.volumeBot?.cycles !== undefined) {
            volumeCycles.value = automations.volumeBot.cycles;
        }
        if (volumeDelay && automations.volumeBot?.sellDelay !== undefined) {
            volumeDelay.value = automations.volumeBot.sellDelay;
        }
    }

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

registerGlobalHandler('copyFeeWalletAddress', () => copyInnerText('fee-wallet-address', 'Fee wallet address'));
registerGlobalHandler('copyFeeWalletKey', () => {
    const storedKeyElement = getElement('fee-wallet-key');
    if (storedKeyElement) {
        copyInnerText('fee-wallet-key', 'Fee wallet private key');
        return;
    }
    notify('Fee wallet private key is stored securely. Download wallets to export keys.', 'warning');
});

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

