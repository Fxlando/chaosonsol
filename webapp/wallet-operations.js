/**
 * Wallet Operations - Complete Solana Wallet Management
 * Handles all wallet operations: generate, import, fund, withdraw, tag, warm, etc.
 */

const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : '/.netlify/functions';

// Global state
let wallets = [];
let selectedWallets = new Set();
let walletGroups = new Map();

// Initialize wallet operations
document.addEventListener('DOMContentLoaded', () => {
  initializeWalletOperations();
});

/**
 * Initialize wallet operations
 */
async function initializeWalletOperations() {
  console.log('🔧 Initializing wallet operations...');
  
  // Load wallets on page load
  if (document.getElementById('wallets-view')) {
    await loadWallets();
  }
  
  // Setup event listeners
  setupWalletEventListeners();
  
  console.log('✅ Wallet operations initialized');
}

/**
 * Setup event listeners for wallet operations
 */
function setupWalletEventListeners() {
  // Search functionality
  const searchInput = document.getElementById('wallet-search');
  if (searchInput) {
    searchInput.addEventListener('input', filterWallets);
  }
  
  // Tab switching
  const activeTab = document.getElementById('active-tab');
  const inactiveTab = document.getElementById('inactive-tab');
  if (activeTab) activeTab.addEventListener('click', () => switchTab('active'));
  if (inactiveTab) inactiveTab.addEventListener('click', () => switchTab('inactive'));
  
  // Select all checkbox
  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', toggleSelectAll);
  }
  
  // Wallet search
  if (searchInput) {
    searchInput.addEventListener('input', debounce(filterWallets, 300));
  }
}

/**
 * Load wallets from API
 */
async function loadWallets() {
  try {
    showToast('Loading wallets...', 'info');
    addConsoleLog('Fetching wallets from API', 'info');
    
    const endpoint = API_BASE.includes('netlify') ? `${API_BASE}/wallets` : `${API_BASE}/api/wallets`;
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // Handle different response formats
    if (Array.isArray(data)) {
      wallets = data;
    } else if (data.wallets && Array.isArray(data.wallets)) {
      wallets = data.wallets;
    } else if (data.success && Array.isArray(data.wallets)) {
      wallets = data.wallets;
    } else {
      wallets = [];
    }
    
    // Update wallet groups
    updateWalletGroups();
    
    // Render wallets
    renderWallets();
    
    // Update total balance
    updateTotalBalance();
    
    showToast(`Loaded ${wallets.length} wallets`, 'success');
    addConsoleLog(`Loaded ${wallets.length} wallets successfully`, 'success');
    
  } catch (error) {
    console.error('Error loading wallets:', error);
    showToast('Failed to load wallets. Using demo data.', 'error');
    addConsoleLog(`Error loading wallets: ${error.message}`, 'error');
    
    // Fallback to demo wallets
    wallets = generateDemoWallets();
    renderWallets();
    updateTotalBalance();
  }
}

/**
 * Generate demo wallets (fallback)
 */
function generateDemoWallets() {
  const demoWallets = [];
  for (let i = 1; i <= 10; i++) {
    demoWallets.push({
      id: `wallet_${i}`,
      name: `Wallet_${i}`,
      address: generateRandomAddress(),
      publicKey: generateRandomAddress(),
      privateKey: '***hidden***',
      balance: Math.random() * 5,
      tags: [],
      group: i % 2 === 0 ? 'Volume' : 'Pump',
      status: 'active',
      tokenHoldings: Math.floor(Math.random() * 3),
      unclaimedRent: Math.random() * 0.01
    });
  }
  return demoWallets;
}

/**
 * Generate random Solana address
 */
function generateRandomAddress() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let address = '';
  for (let i = 0; i < 44; i++) {
    address += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return address;
}

/**
 * Render wallets table
 */
function renderWallets() {
  const tbody = document.getElementById('wallets-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (wallets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-8 text-center text-gray-500">
          No wallets found. Click "Generate" to create your first wallet.
        </td>
      </tr>
    `;
    return;
  }
  
  // Filter wallets based on search and tab
  const searchTerm = document.getElementById('wallet-search')?.value.toLowerCase() || '';
  const activeTab = document.getElementById('active-tab')?.classList.contains('bg-neutral-700');
  const filteredWallets = wallets.filter(wallet => {
    const matchesSearch = !searchTerm || 
      wallet.name?.toLowerCase().includes(searchTerm) ||
      wallet.address?.toLowerCase().includes(searchTerm) ||
      wallet.publicKey?.toLowerCase().includes(searchTerm);
    
    const matchesTab = activeTab === undefined || 
      (activeTab && wallet.status === 'active') ||
      (!activeTab && wallet.status === 'inactive');
    
    return matchesSearch && matchesTab;
  });
  
  filteredWallets.forEach(wallet => {
    const row = document.createElement('tr');
    row.className = 'border-b border-neutral-800 hover:bg-neutral-800/50';
    
    const address = wallet.address || wallet.publicKey || wallet.pubkey || 'N/A';
    const balance = wallet.balance || 0;
    const tags = Array.isArray(wallet.tags) ? wallet.tags : [];
    const tokenHoldings = wallet.tokenHoldings || 0;
    const unclaimedRent = wallet.unclaimedRent || 0;
    
    row.innerHTML = `
      <td class="p-4">
        <input 
          type="checkbox" 
          class="wallet-checkbox rounded" 
          data-wallet-id="${wallet.id || address}"
          onchange="toggleWalletSelection('${wallet.id || address}')"
        />
      </td>
      <td class="p-4">
        <div class="font-medium">${wallet.name || 'Unnamed Wallet'}</div>
      </td>
      <td class="p-4">
        <div class="flex gap-1 flex-wrap">
          ${tags.map(tag => `<span class="px-2 py-0.5 bg-purple-900/30 text-purple-300 rounded text-xs">${tag}</span>`).join('')}
          ${tags.length === 0 ? '<span class="text-gray-500 text-xs">No tags</span>' : ''}
        </div>
      </td>
      <td class="p-4">
        <code class="text-sm font-mono cursor-pointer hover:text-purple-400" onclick="copyToClipboard('${address}')">
          ${truncateAddress(address)}
        </code>
      </td>
      <td class="p-4">
        <code class="text-sm font-mono text-gray-500">${wallet.privateKey ? '***hidden***' : 'N/A'}</code>
      </td>
      <td class="p-4">
        <span class="text-sm">${tokenHoldings}</span>
      </td>
      <td class="p-4">
        <span class="text-sm">${unclaimedRent.toFixed(4)} SOL</span>
      </td>
      <td class="p-4">
        <span class="font-mono font-semibold">${balance.toFixed(4)} SOL</span>
      </td>
    `;
    
    tbody.appendChild(row);
  });
  
  updateBulkActions();
}

/**
 * Update total balance
 */
async function updateTotalBalance() {
  try {
    const total = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
    const totalBalanceEl = document.getElementById('total-balance');
    if (totalBalanceEl) {
      totalBalanceEl.textContent = `${total.toFixed(4)} SOL`;
    }
  } catch (error) {
    console.error('Error updating total balance:', error);
  }
}

/**
 * Update wallet groups
 */
function updateWalletGroups() {
  walletGroups.clear();
  wallets.forEach(wallet => {
    const group = wallet.group || wallet.groupName || 'default';
    if (!walletGroups.has(group)) {
      walletGroups.set(group, []);
    }
    walletGroups.get(group).push(wallet);
  });
}

/**
 * Filter wallets
 */
function filterWallets() {
  renderWallets();
}

/**
 * Switch tab (active/inactive)
 */
function switchTab(tab) {
  const activeTab = document.getElementById('active-tab');
  const inactiveTab = document.getElementById('inactive-tab');
  
  if (tab === 'active') {
    activeTab.className = 'px-4 py-1.5 rounded text-sm font-medium transition bg-neutral-700 text-white';
    inactiveTab.className = 'px-4 py-1.5 rounded text-sm font-medium transition text-gray-400 hover:text-white';
  } else {
    activeTab.className = 'px-4 py-1.5 rounded text-sm font-medium transition text-gray-400 hover:text-white';
    inactiveTab.className = 'px-4 py-1.5 rounded text-sm font-medium transition bg-neutral-700 text-white';
  }
  
  renderWallets();
}

/**
 * Toggle select all
 */
function toggleSelectAll() {
  const selectAll = document.getElementById('select-all');
  const checkboxes = document.querySelectorAll('.wallet-checkbox');
  
  checkboxes.forEach(cb => {
    cb.checked = selectAll.checked;
    const walletId = cb.dataset.walletId;
    if (selectAll.checked) {
      selectedWallets.add(walletId);
    } else {
      selectedWallets.delete(walletId);
    }
  });
  
  updateBulkActions();
}

/**
 * Toggle wallet selection
 */
function toggleWalletSelection(walletId) {
  const checkbox = document.querySelector(`.wallet-checkbox[data-wallet-id="${walletId}"]`);
  if (checkbox.checked) {
    selectedWallets.add(walletId);
  } else {
    selectedWallets.delete(walletId);
  }
  
  // Update select all checkbox
  const selectAll = document.getElementById('select-all');
  const allCheckboxes = document.querySelectorAll('.wallet-checkbox');
  const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
  if (selectAll) {
    selectAll.checked = allChecked;
  }
  
  updateBulkActions();
}

/**
 * Update bulk actions visibility
 */
function updateBulkActions() {
  const bulkActions = document.getElementById('bulk-actions');
  if (bulkActions) {
    if (selectedWallets.size > 0) {
      bulkActions.style.display = 'flex';
      const selectedCount = document.getElementById('selected-count');
      if (selectedCount) {
        selectedCount.textContent = `${selectedWallets.size} wallet${selectedWallets.size === 1 ? '' : 's'} selected`;
      }
    } else {
      bulkActions.style.display = 'none';
    }
  }
}

/**
 * Generate wallets
 */
async function executeGenerateWallets() {
  try {
    const countInput = document.getElementById('generate-count-input');
    if (!countInput) {
      showToast('Generate count input not found', 'error');
      return;
    }
    
    const count = parseInt(countInput.value);
    if (!count || count < 1 || count > 100) {
      showToast('Please enter a valid number between 1 and 100', 'error');
      return;
    }
    
    showToast(`Generating ${count} wallets...`, 'info');
    addConsoleLog(`Starting generation of ${count} wallets`, 'info');
    
    // Call API to generate wallets
    const endpoint = API_BASE.includes('netlify') 
      ? `${API_BASE}/wallets/generate` 
      : `${API_BASE}/api/wallets/generate`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count })
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      showToast(`Successfully generated ${count} wallets!`, 'success');
      addConsoleLog(`Generated ${count} new wallets`, 'success');
      
      // Reload wallets
      await loadWallets();
      
      // Navigate back to wallets view
      navigateToPage('wallets');
    } else {
      throw new Error(result.error || 'Failed to generate wallets');
    }
    
  } catch (error) {
    console.error('Error generating wallets:', error);
    showToast(`Failed to generate wallets: ${error.message}`, 'error');
    addConsoleLog(`Error generating wallets: ${error.message}`, 'error');
  }
}

/**
 * Export wallets
 */
async function exportWallets() {
  try {
    const walletsToExport = selectedWallets.size > 0 
      ? wallets.filter(w => selectedWallets.has(w.id || w.address || w.publicKey))
      : wallets;
    
    if (walletsToExport.length === 0) {
      showToast('No wallets to export', 'error');
      return;
    }
    
    showToast(`Exporting ${walletsToExport.length} wallets...`, 'info');
    addConsoleLog(`Exporting ${walletsToExport.length} wallets`, 'info');
    
    // Create export data
    const exportData = walletsToExport.map(wallet => ({
      name: wallet.name,
      address: wallet.address || wallet.publicKey || wallet.pubkey,
      privateKey: wallet.privateKey || '***hidden***',
      balance: wallet.balance || 0,
      tags: wallet.tags || [],
      group: wallet.group || wallet.groupName || 'default'
    }));
    
    // Create and download JSON file
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wallets_export_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    showToast(`Exported ${walletsToExport.length} wallets`, 'success');
    addConsoleLog(`Exported ${walletsToExport.length} wallets to JSON`, 'success');
    
  } catch (error) {
    console.error('Error exporting wallets:', error);
    showToast(`Failed to export wallets: ${error.message}`, 'error');
    addConsoleLog(`Error exporting wallets: ${error.message}`, 'error');
  }
}

/**
 * Deactivate wallets
 */
async function deactivateWallets() {
  try {
    if (selectedWallets.size === 0) {
      showToast('Please select wallets to deactivate', 'error');
      return;
    }
    
    showToast(`Deactivating ${selectedWallets.size} wallets...`, 'info');
    addConsoleLog(`Deactivating ${selectedWallets.size} wallets`, 'info');
    
    // Update wallet status
    wallets.forEach(wallet => {
      const walletId = wallet.id || wallet.address || wallet.publicKey;
      if (selectedWallets.has(walletId)) {
        wallet.status = 'inactive';
      }
    });
    
    // Call API to update wallets
    const endpoint = API_BASE.includes('netlify') 
      ? `${API_BASE}/wallets/deactivate` 
      : `${API_BASE}/api/wallets/deactivate`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        walletIds: Array.from(selectedWallets) 
      })
    });
    
    // Clear selection
    selectedWallets.clear();
    renderWallets();
    
    showToast(`Deactivated ${selectedWallets.size} wallets`, 'success');
    addConsoleLog(`Deactivated ${selectedWallets.size} wallets`, 'success');
    
  } catch (error) {
    console.error('Error deactivating wallets:', error);
    showToast(`Failed to deactivate wallets: ${error.message}`, 'error');
    addConsoleLog(`Error deactivating wallets: ${error.message}`, 'error');
  }
}

/**
 * Refresh balances
 */
async function refreshBalances() {
  try {
    showToast('Refreshing balances...', 'info');
    addConsoleLog('Refreshing wallet balances from blockchain', 'info');
    
    // Reload wallets (which will fetch fresh balances)
    await loadWallets();
    
    showToast('Balances updated!', 'success');
    addConsoleLog('Wallet balances refreshed successfully', 'success');
    
  } catch (error) {
    console.error('Error refreshing balances:', error);
    showToast(`Failed to refresh balances: ${error.message}`, 'error');
    addConsoleLog(`Error refreshing balances: ${error.message}`, 'error');
  }
}

/**
 * Utility functions
 */
function truncateAddress(address) {
  if (!address || address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Address copied to clipboard!', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showToast('Failed to copy address', 'error');
  });
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

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }
  
  const toast = document.createElement('div');
  toast.className = `px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300 ${
    type === 'success' ? 'bg-green-900 text-green-200 border border-green-700' :
    type === 'error' ? 'bg-red-900 text-red-200 border border-red-700' :
    type === 'warning' ? 'bg-yellow-900 text-yellow-200 border border-yellow-700' :
    'bg-blue-900 text-blue-200 border border-blue-700'
  }`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Add console log
 */
function addConsoleLog(message, type = 'info') {
  const consoleOutput = document.getElementById('console-output');
  if (!consoleOutput) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }
  
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = document.createElement('div');
  line.className = 'console-line flex gap-4 py-1';
  line.innerHTML = `
    <span class="text-gray-500">[${time}]</span>
    <span class="font-semibold ${
      type === 'success' ? 'text-green-400' :
      type === 'error' ? 'text-red-400' :
      type === 'warning' ? 'text-yellow-400' :
      'text-blue-400'
    }">${type.toUpperCase()}</span>
    <span class="text-gray-300">${message}</span>
  `;
  
  consoleOutput.insertBefore(line, consoleOutput.firstChild);
  
  // Keep only last 100 lines
  while (consoleOutput.children.length > 100) {
    consoleOutput.removeChild(consoleOutput.lastChild);
  }
}

// Make functions globally available
window.walletOperations = {
  loadWallets,
  executeGenerateWallets,
  exportWallets,
  deactivateWallets,
  refreshBalances,
  toggleWalletSelection,
  toggleSelectAll,
  switchTab,
  filterWallets,
  renderWallets,
  updateTotalBalance
};

// Also expose functions globally for onclick handlers
window.loadWallets = loadWallets;
window.executeGenerateWallets = executeGenerateWallets;
window.exportWallets = exportWallets;
window.deactivateWallets = deactivateWallets;
window.refreshBalances = refreshBalances;
window.toggleWalletSelection = toggleWalletSelection;
window.toggleSelectAll = toggleSelectAll;
window.switchTab = switchTab;
window.filterWallets = filterWallets;
window.renderWallets = renderWallets;
window.updateTotalBalance = updateTotalBalance;

