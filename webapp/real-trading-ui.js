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
    
    // Show wallets view by default
    switchView('wallets');
    
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
    // Navigation - simple and clean
    document.querySelectorAll('.nav-item').forEach(item => {
        // Remove any existing click listeners by cloning
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        // Add click listener
        newItem.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const viewName = this.dataset.view;
            if (viewName) {
                switchView(viewName);
            }
        });
    });
    
    // Add more event listeners as needed
}

function switchView(viewName) {
    if (!viewName) {
        console.error('switchView called without viewName');
        return;
    }
    
    currentView = viewName;
    
    // Hide ALL views and pages
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Show selected view - try -view first, then -page
    let selectedView = document.getElementById(`${viewName}-view`);
    if (!selectedView) {
        selectedView = document.getElementById(`${viewName}-page`);
    }
    
    if (selectedView) {
        selectedView.classList.remove('hidden');
    } else {
        console.warn(`View not found: ${viewName}-view or ${viewName}-page`);
    }
    
    // Update navigation styling
    document.querySelectorAll('.nav-item').forEach(item => {
        const itemView = item.dataset.view;
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
window.switchView = switchView;
window.initializeEventListeners = initializeEventListeners;

console.log('✅ Real Trading UI JavaScript loaded');

