/**
 * Wallet Operations - Complete Solana Wallet Management
 * Handles all wallet operations: generate, import, fund, withdraw, tag, warm, etc.
 */

var API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : '/.netlify/functions';

// Global state
let wallets = [];
let selectedWallets = new Set();
let walletGroups = new Map();
let groupingSearchTerm = '';

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
  const searchInput = document.getElementById('wallet-search');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(walletOperationsFilterWallets, 200));
  }

  const activeTab = document.getElementById('active-tab');
  const inactiveTab = document.getElementById('inactive-tab');
  if (activeTab) activeTab.addEventListener('click', () => walletOperationsSwitchTab('active'));
  if (inactiveTab) inactiveTab.addEventListener('click', () => walletOperationsSwitchTab('inactive'));

  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', walletOperationsToggleSelectAll);
  }

  const groupingSearch = document.getElementById('grouping-search');
  if (groupingSearch) {
    groupingSearch.addEventListener('input', debounce((event) => {
      groupingSearchTerm = (event?.target?.value || '').toLowerCase();
      walletOperationsRenderGroupingTable();
      walletOperationsSyncSelectionUI({ skipBulkUpdate: true });
    }, 200));
  }

  const groupingClear = document.getElementById('grouping-clear-selection');
  if (groupingClear) {
    groupingClear.addEventListener('click', () => {
      if (selectedWallets.size === 0) {
        showToast('No wallets selected to clear', 'info');
        return;
      }
      selectedWallets.clear();
      walletOperationsSyncSelectionUI();
      showToast('Wallet selection cleared', 'success');
    });
  }

  const groupingSelectAll = document.getElementById('grouping-select-all');
  if (groupingSelectAll) {
    groupingSelectAll.addEventListener('change', walletOperationsToggleGroupingSelectAll);
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
    walletOperationsRenderTable();
    
    // Update total balance
    walletOperationsUpdateTotals();

    // Update grouping view
    walletOperationsRenderGroupingTable();
    walletOperationsSyncSelectionUI();
    
    showToast(`Loaded ${wallets.length} wallets`, 'success');
    addConsoleLog(`Loaded ${wallets.length} wallets successfully`, 'success');
    
  } catch (error) {
    console.error('Error loading wallets:', error);
    showToast('Failed to load wallets. Using demo data.', 'error');
    addConsoleLog(`Error loading wallets: ${error.message}`, 'error');
    
    // Fallback to demo wallets
    wallets = generateDemoWallets();
    walletOperationsRenderTable();
    walletOperationsUpdateTotals();
    walletOperationsRenderGroupingTable();
    walletOperationsSyncSelectionUI();
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
function walletOperationsRenderTable() {
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
    const walletId = wallet.id || wallet.address || wallet.publicKey || wallet.pubkey || address;
    const balance = wallet.balance || 0;
    const tags = Array.isArray(wallet.tags) ? wallet.tags : [];
    const tokenHoldings = wallet.tokenHoldings || 0;
    const unclaimedRent = wallet.unclaimedRent || 0;
    const isSelected = selectedWallets.has(walletId);
    
    row.innerHTML = `
      <td class="p-4">
        <input 
          type="checkbox" 
          class="wallet-checkbox wallet-table-checkbox rounded" 
          data-wallet-id="${walletId}"
          ${isSelected ? 'checked' : ''}
          onchange="walletOperationsToggleSelection('${walletId}', this.checked)"
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
        <code class="text-sm font-mono cursor-pointer hover:text-purple-400" data-address onclick="copyToClipboard('${address}')">
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
  
  walletOperationsSyncSelectionUI({ skipBulkUpdate: true });
}

/**
 * Render grouping wallet table
 */
function walletOperationsRenderGroupingTable() {
  const tbody = document.getElementById('grouping-wallet-table');
  if (!tbody) return;

  if (!Array.isArray(wallets) || wallets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-gray-500">
          No wallets available yet. Generate or import wallets first.
        </td>
      </tr>
    `;
    return;
  }

  const searchTerm = groupingSearchTerm?.trim() || '';
  const filtered = wallets.filter((wallet) => {
    if (!searchTerm) return true;
    const target = [
      wallet.name,
      wallet.address,
      wallet.publicKey,
      wallet.group,
      wallet.groupName,
      wallet.tags ? wallet.tags.join(' ') : ''
    ].filter(Boolean).join(' ').toLowerCase();
    return target.includes(searchTerm.toLowerCase());
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-center text-gray-500">
          No wallets matched your search.
        </td>
      </tr>
    `;
    walletOperationsUpdateSelectAllIndicators();
    return;
  }

  const rows = filtered.map((wallet) => {
    const address = wallet.address || wallet.publicKey || wallet.pubkey || '';
    const walletId = wallet.id || wallet.address || wallet.publicKey || wallet.pubkey || address;
    const isSelected = selectedWallets.has(walletId);
    const balance = wallet.balance || 0;
    const groupLabel = wallet.groupName || wallet.group || '—';

    return `
      <tr class="border-b border-neutral-800 hover:bg-neutral-800/40">
        <td class="p-3 align-top">
          <input
            type="checkbox"
            class="wallet-checkbox grouping-wallet-checkbox rounded"
            data-wallet-id="${walletId}"
            ${isSelected ? 'checked' : ''}
            onchange="walletOperationsToggleSelection('${walletId}', this.checked)"
          />
        </td>
        <td class="p-3 align-top">
          <div class="font-medium">${wallet.name || 'Unnamed Wallet'}</div>
          <div class="text-xs text-gray-500 mt-1">${wallet.tags && wallet.tags.length ? wallet.tags.join(', ') : 'No tags'}</div>
        </td>
        <td class="p-3 align-top">
          <code class="text-xs font-mono" data-address>${truncateAddress(address)}</code>
        </td>
        <td class="p-3 align-top">
          <span class="font-mono">${balance.toFixed(4)}</span>
        </td>
        <td class="p-3 align-top">
          <span class="text-sm ${groupLabel !== '—' ? 'text-purple-300' : 'text-gray-500'}">${groupLabel}</span>
        </td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rows;
  walletOperationsUpdateSelectAllIndicators();
}

/**
 * Render selected wallet chips on grouping page
 */
function walletOperationsRenderGroupingChips() {
  const container = document.getElementById('grouping-selected-chips');
  if (!container) return;

  container.innerHTML = '';

  if (selectedWallets.size === 0) {
    container.innerHTML = `<span class="text-xs text-gray-500">No wallets selected yet. Use the checkboxes below to choose wallets.</span>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  let count = 0;

  wallets.forEach((wallet) => {
    const address = wallet.address || wallet.publicKey || wallet.pubkey;
    const walletId = wallet.id || wallet.address || wallet.publicKey || wallet.pubkey || address;
    if (!selectedWallets.has(walletId)) return;

    count += 1;
    if (count > 25) {
      return;
    }

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'flex items-center gap-2 bg-purple-900/40 text-purple-200 text-xs px-3 py-1 rounded-full hover:bg-purple-800/60 transition';
    chip.innerHTML = `
      <span>${wallet.name || truncateAddress(address)}</span>
      <span class="text-purple-200 hover:text-white text-sm" aria-hidden="true">×</span>
    `;
    chip.addEventListener('click', () => walletOperationsToggleSelection(walletId, false));
    fragment.appendChild(chip);
  });

  container.appendChild(fragment);

  if (selectedWallets.size > 25) {
    const extra = document.createElement('span');
    extra.className = 'text-xs text-gray-400';
    extra.textContent = `+${selectedWallets.size - 25} more selected`;
    container.appendChild(extra);
  }
}

/**
 * Update total balance
 */
async function walletOperationsUpdateTotals() {
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
function walletOperationsFilterWallets() {
  walletOperationsRenderTable();
  walletOperationsSyncSelectionUI({ skipBulkUpdate: true });
}

/**
 * Switch tab (active/inactive)
 */
function walletOperationsSwitchTab(tab) {
  const activeTab = document.getElementById('active-tab');
  const inactiveTab = document.getElementById('inactive-tab');
  
  if (tab === 'active') {
    if (activeTab) activeTab.className = 'px-4 py-1.5 rounded text-sm font-medium transition bg-neutral-700 text-white';
    if (inactiveTab) inactiveTab.className = 'px-4 py-1.5 rounded text-sm font-medium transition text-gray-400 hover:text-white';
  } else {
    if (activeTab) activeTab.className = 'px-4 py-1.5 rounded text-sm font-medium transition text-gray-400 hover:text-white';
    if (inactiveTab) inactiveTab.className = 'px-4 py-1.5 rounded text-sm font-medium transition bg-neutral-700 text-white';
  }
  
  walletOperationsRenderTable();
  walletOperationsSyncSelectionUI({ skipBulkUpdate: true });
}

/**
 * Toggle select all in wallets table
 */
function walletOperationsToggleSelectAll(event) {
  const selectAll = event?.target || document.getElementById('select-all');
  if (!selectAll) return;

  const shouldSelect = !!selectAll.checked;
  const checkboxes = document.querySelectorAll('#wallets-table-body .wallet-checkbox');

  checkboxes.forEach((cb) => {
    const walletId = cb.dataset.walletId;
    if (!walletId) return;
    if (shouldSelect) {
      selectedWallets.add(walletId);
    } else {
      selectedWallets.delete(walletId);
    }
  });

  walletOperationsSyncSelectionUI();
}

/**
 * Toggle select all in grouping table
 */
function walletOperationsToggleGroupingSelectAll(event) {
  const selectAll = event?.target || document.getElementById('grouping-select-all');
  if (!selectAll) return;

  const shouldSelect = !!selectAll.checked;
  const checkboxes = document.querySelectorAll('#grouping-wallet-table .wallet-checkbox');

  checkboxes.forEach((cb) => {
    const walletId = cb.dataset.walletId;
    if (!walletId) return;
    if (shouldSelect) {
      selectedWallets.add(walletId);
    } else {
      selectedWallets.delete(walletId);
    }
  });

  walletOperationsSyncSelectionUI();
}

/**
 * Toggle wallet selection for a specific wallet
 */
function walletOperationsToggleSelection(walletId, isChecked) {
  if (!walletId) return;

  let shouldSelect;
  if (typeof isChecked === 'boolean') {
    shouldSelect = isChecked;
  } else {
    shouldSelect = !selectedWallets.has(walletId);
  }

  if (shouldSelect) {
    selectedWallets.add(walletId);
  } else {
    selectedWallets.delete(walletId);
  }

  walletOperationsSyncSelectionUI();
}

/**
 * Update select-all indicators and chips
 */
function walletOperationsSyncSelectionUI(options = {}) {
  const { skipBulkUpdate = false } = options;

  document.querySelectorAll('.wallet-checkbox').forEach((checkbox) => {
    const walletId = checkbox.dataset.walletId;
    if (!walletId) return;
    checkbox.checked = selectedWallets.has(walletId);
  });

  walletOperationsUpdateSelectAllIndicators();
  walletOperationsRenderGroupingChips();

  if (!skipBulkUpdate) {
    walletOperationsUpdateBulkActions();
  }
}

/**
 * Update select-all checkbox states
 */
function walletOperationsUpdateSelectAllIndicators() {
  const selectAll = document.getElementById('select-all');
  const tableCheckboxes = Array.from(document.querySelectorAll('#wallets-table-body .wallet-checkbox'));

  if (selectAll) {
    if (tableCheckboxes.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    } else {
      const selectedCount = tableCheckboxes.filter((cb) => selectedWallets.has(cb.dataset.walletId)).length;
      selectAll.checked = selectedCount > 0 && selectedCount === tableCheckboxes.length;
      selectAll.indeterminate = selectedCount > 0 && selectedCount < tableCheckboxes.length;
    }
  }

  const groupingSelectAll = document.getElementById('grouping-select-all');
  const groupingCheckboxes = Array.from(document.querySelectorAll('#grouping-wallet-table .wallet-checkbox'));

  if (groupingSelectAll) {
    if (groupingCheckboxes.length === 0) {
      groupingSelectAll.checked = false;
      groupingSelectAll.indeterminate = false;
    } else {
      const selectedGrouping = groupingCheckboxes.filter((cb) => selectedWallets.has(cb.dataset.walletId)).length;
      groupingSelectAll.checked = selectedGrouping > 0 && selectedGrouping === groupingCheckboxes.length;
      groupingSelectAll.indeterminate = selectedGrouping > 0 && selectedGrouping < groupingCheckboxes.length;
    }
  }
}

/**
 * Update bulk actions visibility
 */
function walletOperationsUpdateBulkActions() {
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
      const selectedCount = document.getElementById('selected-count');
      if (selectedCount) {
        selectedCount.textContent = '0 wallets selected';
      }
    }
  }

  const actionTargets = [
    'fund-selected-count',
    'withdraw-selected-count',
    'tag-selected-count',
    'warm-selected-count',
    'redistribute-selected-count',
    'reclaim-selected-count',
    'export-selected-count',
    'activate-selected-count',
    'grouping-selected-count'
  ];

  actionTargets.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = selectedWallets.size;
    }
  });
}

/**
 * Generate wallets
 */
async function executeGenerateWallets(options = {}) {
  try {
    let countInput = null;
    const modalInput = document.getElementById('generate-count');
    const pageInput = document.getElementById('generate-count-input');

    if (options?.source === 'modal') {
      countInput = modalInput || pageInput;
    }

    if (!countInput) {
      countInput = pageInput || modalInput;
    }

    if (!countInput) {
      showToast('Generate count input not found', 'error');
      return;
    }

    const count = parseInt(countInput.value);
    if (!count || count < 1 || count > 100) {
      showToast('Please enter a valid number between 1 and 100', 'error');
      return;
    }
    
    const usingModal = countInput.id === 'generate-count';
    if (usingModal && typeof window.closeModal === 'function') {
      window.closeModal('generate-modal');
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

      if (countInput) {
        countInput.value = '';
      }
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
 * Import a wallet from an existing private key
 */
async function executeImportWallet() {
  try {
    const keyInput = document.getElementById('import-private-key');
    if (!keyInput || !keyInput.value.trim()) {
      showToast('Please provide the wallet private key to import', 'error');
      return;
    }

    const nameInput = document.getElementById('import-wallet-name');
    const tagsInput = document.getElementById('import-wallet-tags');

    let privateKeyRaw = keyInput.value.trim();
    let privateKeyPayload = privateKeyRaw;

    if (privateKeyRaw.startsWith('[')) {
      try {
        const parsed = JSON.parse(privateKeyRaw);
        if (!Array.isArray(parsed) || parsed.length !== 64) {
          throw new Error('Invalid JSON key format');
        }
        privateKeyPayload = parsed;
      } catch (error) {
        showToast('Private key JSON is not valid', 'error');
        addConsoleLog(`Failed to parse private key JSON: ${error.message}`, 'error');
        return;
      }
    }

    const name = nameInput?.value.trim();
    const tags = (tagsInput?.value || '')
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    showToast('Importing wallet...', 'info');
    addConsoleLog('Importing wallet from provided private key', 'info');

    const endpoint = API_BASE.includes('netlify')
      ? `${API_BASE}/wallets/import`
      : `${API_BASE}/api/wallets/import`;

    const payload = { privateKey: privateKeyPayload };
    if (name) payload.name = name;
    if (tags.length > 0) payload.tags = tags;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `API returned ${response.status}`);
    }

    showToast('Wallet imported successfully!', 'success');
    addConsoleLog(`Imported wallet ${result.wallet?.publicKey || ''}`, 'success');

    keyInput.value = '';
    if (nameInput) nameInput.value = '';
    if (tagsInput) tagsInput.value = '';

    await loadWallets();
    navigateToPage('wallets');
  } catch (error) {
    console.error('Error importing wallet:', error);
    showToast(`Failed to import wallet: ${error.message}`, 'error');
    addConsoleLog(`Error importing wallet: ${error.message}`, 'error');
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
 * Convenience wrapper for export action button
 */
function executeExportWallets() {
  exportWallets();
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
    
    const affectedCount = selectedWallets.size;
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
    walletOperationsRenderTable();
    walletOperationsRenderGroupingTable();
    walletOperationsSyncSelectionUI();
    
    showToast(`Deactivated ${affectedCount} wallet${affectedCount === 1 ? '' : 's'}`, 'success');
    addConsoleLog(`Deactivated ${affectedCount} wallet${affectedCount === 1 ? '' : 's'}`, 'success');
    
  } catch (error) {
    console.error('Error deactivating wallets:', error);
    showToast(`Failed to deactivate wallets: ${error.message}`, 'error');
    addConsoleLog(`Error deactivating wallets: ${error.message}`, 'error');
  }
}

/**
 * Activate wallets
 */
async function executeActivateWallets() {
  try {
    if (selectedWallets.size === 0) {
      showToast('Please select wallets to activate', 'error');
      return;
    }

    showToast(`Activating ${selectedWallets.size} wallets...`, 'info');
    addConsoleLog(`Activating ${selectedWallets.size} wallets`, 'info');

    const endpoint = API_BASE.includes('netlify')
      ? `${API_BASE}/wallets/activate`
      : `${API_BASE}/api/wallets/activate`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletIds: Array.from(selectedWallets) })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `API returned ${response.status}`);
    }

    wallets.forEach(wallet => {
      const walletId = wallet.id || wallet.address || wallet.publicKey;
      if (selectedWallets.has(walletId)) {
        wallet.status = 'active';
      }
    });

    selectedWallets.clear();
    await loadWallets();

    showToast(`Activated ${result.activated || 0} wallets`, 'success');
    addConsoleLog(`Activated ${result.activated || 0} wallets`, 'success');
  } catch (error) {
    console.error('Error activating wallets:', error);
    showToast(`Failed to activate wallets: ${error.message}`, 'error');
    addConsoleLog(`Error activating wallets: ${error.message}`, 'error');
  }
}

/**
 * Group wallets under a shared label
 */
async function executeGroupWallets() {
  try {
    if (selectedWallets.size === 0) {
      showToast('Select at least one wallet to group', 'error');
      return;
    }

    const nameInput = document.getElementById('grouping-name');
    if (!nameInput || !nameInput.value.trim()) {
      showToast('Enter a group name', 'error');
      return;
    }

    const groupName = nameInput.value.trim();
    const keepExisting = document.getElementById('grouping-keep-existing')?.checked;

    showToast(`Assigning ${selectedWallets.size} wallets to ${groupName}...`, 'info');
    addConsoleLog(`Grouping wallets into ${groupName} (keep existing: ${keepExisting ? 'yes' : 'no'})`, 'info');

    const endpoint = API_BASE.includes('netlify')
      ? `${API_BASE}/wallets/group`
      : `${API_BASE}/api/wallets/group`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletIds: Array.from(selectedWallets),
        groupName
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `API returned ${response.status}`);
    }

    wallets.forEach(wallet => {
      const walletId = wallet.id || wallet.address || wallet.publicKey;
      if (selectedWallets.has(walletId)) {
        wallet.group = groupName;
        wallet.groupName = groupName;
      }
    });

    showToast(`Grouped ${result.grouped || selectedWallets.size} wallets`, 'success');
    addConsoleLog(`Grouped ${result.grouped || selectedWallets.size} wallets`, 'success');

    selectedWallets.clear();
    await loadWallets();
    navigateToPage('wallets');
  } catch (error) {
    console.error('Error grouping wallets:', error);
    showToast(`Failed to group wallets: ${error.message}`, 'error');
    addConsoleLog(`Error grouping wallets: ${error.message}`, 'error');
  }
}

/**
 * Reclaim rent from selected wallets
 */
async function executeReclaimRent() {
  try {
    const targetInput = document.getElementById('reclaim-target-address');
    const includeActive = document.getElementById('reclaim-include-active')?.checked;
    const closeEmptyAccounts = document.getElementById('reclaim-close-empty')?.checked;

    if (!targetInput || !targetInput.value.trim()) {
      showToast('Enter the destination address for reclaimed rent', 'error');
      return;
    }

    if (selectedWallets.size === 0 && !includeActive) {
      showToast('Select wallets to reclaim from or enable "Include currently active wallets"', 'warning');
      return;
    }

    const targetAddress = targetInput.value.trim();

    const scopeDescription = includeActive ? 'all active wallets' : `${selectedWallets.size} selected wallet(s)`;

    addConsoleLog(`Preparing rent reclaim to ${targetAddress} from ${scopeDescription}`, 'info');
    addConsoleLog(`Close empty token accounts: ${closeEmptyAccounts ? 'yes' : 'no'}`, 'info');
    showToast('Launching rent reclaim workflow...', 'info');

    window.__reclaimRentConfig = {
      targetAddress,
      includeActive,
      closeEmptyAccounts,
      walletIds: includeActive ? null : Array.from(selectedWallets)
    };

    if (typeof collectRentFees === 'function') {
      await collectRentFees();
      showToast('Rent reclaim initiated via fee collector. Follow on-screen prompts.', 'success');
    } else {
      showToast('Rent reclaim requires the advanced fee collector, which is not loaded.', 'error');
      addConsoleLog('collectRentFees function unavailable. Ensure advanced modules are loaded.', 'error');
    }
  } catch (error) {
    console.error('Error reclaiming rent:', error);
    showToast(`Failed to reclaim rent: ${error.message}`, 'error');
    addConsoleLog(`Error reclaiming rent: ${error.message}`, 'error');
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
  getWallets: () => wallets.slice(),
  executeGenerateWallets,
  exportWallets,
  deactivateWallets,
  refreshBalances,
  walletOperationsToggleSelection,
  walletOperationsToggleSelectAll,
  walletOperationsSwitchTab,
  walletOperationsFilterWallets,
  walletOperationsRenderTable,
  walletOperationsRenderGroupingTable,
  walletOperationsRenderGroupingChips,
  walletOperationsUpdateTotals,
  walletOperationsUpdateBulkActions
};

// Also expose functions globally for onclick handlers
window.loadWallets = loadWallets;
window.executeGenerateWallets = executeGenerateWallets;
window.executeImportWallet = executeImportWallet;
window.exportWallets = exportWallets;
window.executeExportWallets = executeExportWallets;
window.deactivateWallets = deactivateWallets;
window.executeActivateWallets = executeActivateWallets;
window.refreshBalances = refreshBalances;
window.walletOperationsToggleSelection = walletOperationsToggleSelection;
window.walletOperationsToggleSelectAll = walletOperationsToggleSelectAll;
window.walletOperationsToggleGroupingSelectAll = walletOperationsToggleGroupingSelectAll;
window.walletOperationsSwitchTab = walletOperationsSwitchTab;
window.walletOperationsFilterWallets = walletOperationsFilterWallets;
window.walletOperationsRenderTable = walletOperationsRenderTable;
window.walletOperationsRenderGroupingTable = walletOperationsRenderGroupingTable;
window.walletOperationsRenderGroupingChips = walletOperationsRenderGroupingChips;
window.walletOperationsUpdateTotals = walletOperationsUpdateTotals;
window.walletOperationsUpdateBulkActions = walletOperationsUpdateBulkActions;
window.executeGroupWallets = executeGroupWallets;
window.executeReclaimRent = executeReclaimRent;

