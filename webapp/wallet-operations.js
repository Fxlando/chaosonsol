/**
 * Wallet Operations - Complete Solana Wallet Management
 * Handles all wallet operations: generate, import, fund, withdraw, tag, warm, etc.
 */

var API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000' 
  : (window.__CHAOSBOT_API_BASE__ || '/api');

// Global state
let wallets = [];
let selectedWallets = new Set();
let walletGroups = new Map();
let groupingSearchTerm = '';
let tagActiveWalletId = null;
const TAG_PLATFORM_IDS = ['trojan', 'photon', 'axiom', 'gmgn', 'pepeboost', 'bullx'];
const WALLET_NAME_MIN_LENGTH = 2;
const WALLET_NAME_MAX_LENGTH = 64;
let walletNameEditingId = null;
function escapeHtml(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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
  walletOperationsUpdateTagInfo();
  
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
    
    // api-server.js handles both /api/wallets and /wallets routes
    const endpoint = API_BASE.startsWith('http') ? `${API_BASE}/api/wallets` : `${API_BASE}/wallets`;
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

    wallets = wallets.map((wallet) => ({
      ...wallet,
      status: wallet?.status === 'inactive' ? 'inactive' : 'active'
    }));
    
    // Update wallet groups
    updateWalletGroups();
    
    // Render wallets
    walletOperationsRenderTable();
    
    // Update total balance
    walletOperationsUpdateTotals();

    // Update grouping view
    walletOperationsRenderGroupingTable();
    walletOperationsRenderActivateList();
    walletOperationsSyncSelectionUI();
    
    showToast(`Loaded ${wallets.length} wallets`, 'success');
    addConsoleLog(`Loaded ${wallets.length} wallets successfully`, 'success');
    
  } catch (error) {
    console.error('Error loading wallets:', error);
    showToast('Failed to load wallets. Verify the Chaos Bot API server is running.', 'error');
    addConsoleLog(`Error loading wallets: ${error.message}`, 'error');

    wallets = [];
    walletOperationsRenderTable();
    walletOperationsUpdateTotals();
    walletOperationsRenderGroupingTable();
    walletOperationsSyncSelectionUI();
    if (typeof renderWalletsError === 'function') {
      renderWalletsError('Backend unavailable - start the Chaos Bot API server and refresh.');
    }
  }
}

function walletOperationsGetWalletId(wallet) {
  if (!wallet) return '';
  return wallet.id || wallet.address || wallet.publicKey || wallet.pubkey || '';
}

function walletOperationsGetPrimaryAddress(wallet) {
  if (!wallet) return '';
  return wallet.address || wallet.publicKey || wallet.pubkey || '';
}

function walletOperationsFindWallet(walletId) {
  if (!walletId) return null;
  return wallets.find((wallet) => walletOperationsGetWalletId(wallet) === walletId) || null;
}

function walletOperationsSetActiveTagWallet(walletId) {
  if (!walletId) return;
  const wallet = walletOperationsFindWallet(walletId);
  if (!wallet) return;
  tagActiveWalletId = walletId;
  walletOperationsUpdateTagInfo();
}

function walletOperationsUpdateTagInfo() {
  const container = document.getElementById('tag-wallet-info');
  if (!container) return;

  const selectedList = Array.from(selectedWallets)
    .map(walletOperationsFindWallet)
    .filter(Boolean);

  if (selectedList.length === 0) {
    tagActiveWalletId = null;
    container.innerHTML = '<p class="text-sm text-gray-400">Select wallet(s) from the table to configure tagging settings.</p>';
    container.classList.add('opacity-60');
    return;
  }

  container.classList.remove('opacity-60');

  if (!tagActiveWalletId || !selectedList.some((wallet) => walletOperationsGetWalletId(wallet) === tagActiveWalletId)) {
    tagActiveWalletId = walletOperationsGetWalletId(selectedList[0]);
  }

  const activeWallet = selectedList.find((wallet) => walletOperationsGetWalletId(wallet) === tagActiveWalletId) || selectedList[0];
  const activeId = walletOperationsGetWalletId(activeWallet);
  const address = walletOperationsGetPrimaryAddress(activeWallet);
  const balanceValue = typeof activeWallet.balance === 'number' ? activeWallet.balance : 0;
  const tags = Array.isArray(activeWallet.tags) ? activeWallet.tags : [];

  const selectorOptions = selectedList.map((wallet) => {
    const walletId = walletOperationsGetWalletId(wallet);
    const label = `${wallet.name || 'Unnamed Wallet'} • ${truncateAddress(walletOperationsGetPrimaryAddress(wallet))}`;
    const selectedAttr = walletId === activeId ? 'selected' : '';
    return `<option value="${walletId}" ${selectedAttr}>${label}</option>`;
  }).join('');

  const chips = selectedList.map((wallet) => {
    const walletId = walletOperationsGetWalletId(wallet);
    const isActive = walletId === activeId;
    const chipLabel = `${wallet.name || 'Wallet'} • ${truncateAddress(walletOperationsGetPrimaryAddress(wallet))}`;
    return `<button type="button" class="tag-wallet-chip ${isActive ? 'tag-wallet-chip--active' : ''}" data-wallet-id="${walletId}" onclick="walletOperationsSetActiveTagWallet(this.dataset.walletId)">${chipLabel}</button>`;
  }).join('');

  const tagContent = tags.length > 0
    ? `<div class="flex flex-wrap gap-2">${tags.map((tag) => `<span class="px-2 py-0.5 bg-purple-900/30 text-purple-200 rounded-full text-xs">${tag}</span>`).join('')}</div>`
    : `<div class="text-xs text-gray-500">No tags recorded yet.</div>`;

  const selectorControl = selectedList.length > 1
    ? `<div class="flex flex-col text-right gap-1">
        <label for="tag-wallet-selector" class="text-xs text-gray-500 uppercase tracking-wide">Active wallet</label>
        <select id="tag-wallet-selector" class="bg-black border border-neutral-700 rounded px-2 py-1 text-xs text-gray-200" onchange="walletOperationsSetActiveTagWallet(this.value)">
          ${selectorOptions}
        </select>
      </div>`
    : '';

  const chipSection = selectedList.length > 1
    ? `<div class="space-y-2">
        <div class="text-xs text-gray-500 uppercase tracking-wide">Selected wallets</div>
        <div class="flex flex-wrap gap-2">
          ${chips}
        </div>
      </div>`
    : '';

  container.innerHTML = `
    <div class="space-y-5">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div class="space-y-1">
          <div class="text-xs text-gray-500 uppercase tracking-wide">Active wallet</div>
          <div class="text-lg font-semibold text-white">${activeWallet.name || 'Unnamed Wallet'}</div>
            <div class="flex items-center gap-2">
              <code class="text-xs font-mono text-gray-400">${address ? truncateAddress(address) : '—'}</code>
              ${address ? `<button type="button" class="text-xs text-purple-300 hover:text-purple-100" data-wallet-address="${address}" onclick="copyToClipboard(this.dataset.walletAddress)">Copy</button>` : ''}
            </div>
        </div>
        ${selectorControl}
      </div>

      ${chipSection}

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="tag-stat-card">
          <div class="tag-stat-label">SOL Balance</div>
          <div class="tag-stat-value">${balanceValue.toFixed(4)} SOL</div>
        </div>
        <div class="tag-stat-card sm:col-span-2">
          <div class="tag-stat-label">Current Tags</div>
          ${tagContent}
        </div>
      </div>
    </div>
  `;
}

function walletOperationsAutoAssignTags() {
  const availableButtons = TAG_PLATFORM_IDS
    .map((tag) => document.querySelector(`[data-tag-button="${tag}"]`))
    .filter(Boolean);

  if (availableButtons.length === 0) {
    showToast('Tag buttons are not available in this view', 'error');
    return;
  }

  // Clear any existing active tags
  availableButtons.forEach((button) => {
    if (button.classList.contains('tag-option--active')) {
      toggleTag(button.dataset.tagButton);
    }
  });

  const randomCount = Math.max(1, Math.floor(Math.random() * Math.min(TAG_PLATFORM_IDS.length, 3)) + 1);
  const chosen = new Set();

  while (chosen.size < randomCount) {
    const pick = TAG_PLATFORM_IDS[Math.floor(Math.random() * TAG_PLATFORM_IDS.length)];
    chosen.add(pick);
  }

  chosen.forEach((tag) => toggleTag(tag));
  showToast(`Auto-assigned ${Array.from(chosen).join(', ')} tags`, 'success');
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
    const walletStatus = wallet.status || 'active';
    const matchesSearch = !searchTerm || 
      wallet.name?.toLowerCase().includes(searchTerm) ||
      wallet.address?.toLowerCase().includes(searchTerm) ||
      wallet.publicKey?.toLowerCase().includes(searchTerm);
    
    const matchesTab = activeTab === undefined || 
      (activeTab && walletStatus !== 'inactive') ||
      (!activeTab && walletStatus === 'inactive');
    
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
    const displayName = wallet.name && wallet.name.trim() ? wallet.name.trim() : 'Unnamed Wallet';

    let nameCellContent = `
      <div class="flex items-center gap-2">
        <span class="font-medium">${escapeHtml(displayName)}</span>
        <button
          type="button"
          class="text-gray-500 hover:text-purple-300 transition inline-flex items-center justify-center rounded"
          aria-label="Rename wallet"
          onclick="walletOperationsStartRename('${walletId}')"
        >
          <i data-lucide="pencil-line" class="w-4 h-4"></i>
        </button>
      </div>
    `;

    if (walletNameEditingId === walletId) {
      const inputId = `wallet-name-input-${walletId}`;
      nameCellContent = `
        <form class="flex items-center gap-2" data-wallet-editing="${walletId}" onsubmit="walletOperationsSaveRename('${walletId}', event)">
          <input
            id="${inputId}"
            type="text"
            class="bg-black border border-purple-500/60 focus:border-purple-400 rounded px-2 py-1 text-sm text-gray-100 w-44"
            value="${escapeHtml(displayName)}"
            maxlength="${WALLET_NAME_MAX_LENGTH}"
            placeholder="Wallet name"
            aria-label="Wallet name"
          />
          <button
            type="submit"
            class="text-emerald-400 hover:text-emerald-300 transition inline-flex items-center justify-center rounded"
            aria-label="Save wallet name"
          >
            <i data-lucide="check" class="w-4 h-4"></i>
          </button>
          <button
            type="button"
            class="text-gray-500 hover:text-gray-300 transition inline-flex items-center justify-center rounded"
            aria-label="Cancel rename"
            onclick="walletOperationsCancelRename()"
          >
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </form>
      `;
    }
    
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
        ${nameCellContent}
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

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function walletOperationsStartRename(walletId) {
  if (!walletId) return;
  if (walletNameEditingId === walletId) return;
  walletNameEditingId = walletId;
  walletOperationsRenderTable();
  setTimeout(() => {
    const input = document.getElementById(`wallet-name-input-${walletId}`);
    if (input) {
      input.focus();
      input.select();
    }
  }, 0);
}

function walletOperationsCancelRename() {
  walletNameEditingId = null;
  walletOperationsRenderTable();
}

async function walletOperationsSaveRename(walletId, event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  if (!walletId) {
    return;
  }

  const input = document.getElementById(`wallet-name-input-${walletId}`);
  if (!input) {
    return;
  }

  const newName = input.value.trim();
  if (newName.length < WALLET_NAME_MIN_LENGTH || newName.length > WALLET_NAME_MAX_LENGTH) {
    showToast(`Wallet name must be between ${WALLET_NAME_MIN_LENGTH} and ${WALLET_NAME_MAX_LENGTH} characters`, 'error');
    input.focus();
    return;
  }

  const wallet = walletOperationsFindWallet(walletId);
  if (!wallet) {
    showToast('Wallet not found locally', 'error');
    return;
  }

  if (wallet.name === newName) {
    walletOperationsCancelRename();
    return;
  }

  try {
    // api-server.js handles both /api/wallets/rename and /wallets/rename routes
    const endpoint = API_BASE.startsWith('http') 
      ? `${API_BASE}/api/wallets/rename`
      : `${API_BASE}/wallets/rename`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletId,
        newName
      })
    });

    if (!response.ok) {
      const errorResult = await response.json().catch(() => ({}));
      const message = errorResult?.message || errorResult?.error || `API returned ${response.status}`;
      throw new Error(message);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || result.error || 'Failed to rename wallet');
    }

    wallet.name = newName;
    wallet.updatedAt = new Date().toISOString();
    walletNameEditingId = null;

    walletOperationsRenderTable();
    walletOperationsRenderGroupingTable();
    walletOperationsUpdateTagInfo();
    showToast('Wallet name updated', 'success');
  } catch (error) {
    console.error('Failed to rename wallet:', error);
    showToast(`Failed to rename wallet: ${error.message}`, 'error');
  }
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
 * Render list of deactivated wallets on the activate page
 */
function walletOperationsRenderActivateList() {
  const list = document.getElementById('activate-wallet-list');
  const emptyState = document.getElementById('activate-wallet-empty');
  const countLabel = document.getElementById('activate-inactive-count');

  if (!list) {
    return;
  }

  list.innerHTML = '';

  const inactiveWallets = wallets.filter((wallet) => wallet?.status === 'inactive');

  if (countLabel) {
    countLabel.textContent = inactiveWallets.length.toString();
  }

  if (inactiveWallets.length === 0) {
    list.classList.add('hidden');
    if (emptyState) {
      emptyState.classList.remove('hidden');
    }
    return;
  }

  list.classList.remove('hidden');
  if (emptyState) {
    emptyState.classList.add('hidden');
  }

  const fragment = document.createDocumentFragment();

  inactiveWallets.forEach((wallet) => {
    const walletId = walletOperationsGetWalletId(wallet);
    const address = walletOperationsGetPrimaryAddress(wallet);
    const balance = Number(wallet.balance || 0);
    const tags = Array.isArray(wallet.tags) ? wallet.tags : [];
    const isSelected = selectedWallets.has(walletId);

    const tagChips = tags.length
      ? tags
          .map(
            (tag) =>
              `<span class="px-2 py-0.5 bg-purple-900/40 text-purple-200 rounded-full text-[10px] uppercase tracking-wide">${escapeHtml(
                tag
              )}</span>`
          )
          .join('')
      : '<span class="text-[10px] text-gray-500 uppercase tracking-wide">No tags</span>';

    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-4 p-4 bg-neutral-950/80 border border-neutral-800/60 rounded-2xl';

    row.innerHTML = `
      <label class="flex items-start gap-3 flex-1 cursor-pointer">
        <input
          type="checkbox"
          class="wallet-checkbox rounded border-neutral-700 bg-neutral-900 text-purple-500 focus:ring-purple-500 mt-1"
          data-wallet-id="${walletId}"
          ${isSelected ? 'checked' : ''}
          onchange="walletOperationsToggleSelection('${walletId}', this.checked)"
        />
        <div class="flex flex-col gap-1">
          <span class="text-sm font-semibold text-white leading-tight">${escapeHtml(wallet.name || 'Unnamed Wallet')}</span>
          <div class="flex items-center gap-2 text-xs text-gray-400 font-mono">
            <span>${truncateAddress(address)}</span>
            ${
              address
                ? `<button type="button" class="text-gray-500 hover:text-purple-300 transition" onclick="copyToClipboard('${address}')"><i data-lucide="copy" class="w-3 h-3"></i></button>`
                : ''
            }
          </div>
          <div class="flex flex-wrap gap-1.5 pt-1">
            ${tagChips}
          </div>
        </div>
      </label>
      <div class="text-right min-w-[110px]">
        <div class="text-[10px] uppercase text-gray-500 tracking-wide">Balance</div>
        <div class="text-sm font-mono text-purple-200">${balance.toFixed(4)} SOL</div>
      </div>
    `;

    fragment.appendChild(row);
  });

  list.appendChild(fragment);

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
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
walletOperationsUpdateTagInfo();

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
    // api-server.js handles both /api/wallets/generate and /wallets/generate routes
    const endpoint = API_BASE.startsWith('http') 
      ? `${API_BASE}/api/wallets/generate` 
      : `${API_BASE}/wallets/generate`;
    
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

    // api-server.js handles both /api/wallets/import and /wallets/import routes
    const endpoint = API_BASE.startsWith('http') 
      ? `${API_BASE}/api/wallets/import`
      : `${API_BASE}/wallets/import`;

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

    const walletIds = walletsToExport
      .map((wallet) => wallet.id || wallet.address || wallet.publicKey)
      .filter(Boolean);

    // api-server.js handles both /api/wallets/export and /wallets/export routes
    const endpoint = API_BASE.startsWith('http') 
      ? `${API_BASE}/api/wallets/export`
      : `${API_BASE}/wallets/export`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletIds,
        includePrivateKey: true
      })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const message = errorPayload?.error || `API returned ${response.status}`;
      throw new Error(message);
    }

    const result = await response.json();
    if (!result?.success || !Array.isArray(result.wallets)) {
      throw new Error(result?.error || 'Failed to export wallets');
    }

    const exportData = result.wallets.map((wallet) => ({
      id: wallet.id,
      name: wallet.name,
      address: wallet.publicKey,
      privateKeyArray: wallet.privateKeyArray || null,
      privateKeyBase58: wallet.privateKeyBase58 || null,
      tags: wallet.tags || [],
      group: wallet.group || 'default',
      createdAt: wallet.createdAt,
      lastUsed: wallet.lastUsed
    }));

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
 * Set the selected wallet as creator wallet
 */
async function walletOperationsSetCreatorWallet() {
  try {
    if (selectedWallets.size === 0) {
      showToast('Select a wallet to set as creator', 'warning');
      return;
    }

    if (selectedWallets.size > 1) {
      showToast('Select only one wallet when setting the creator wallet', 'warning');
      return;
    }

    const walletId = Array.from(selectedWallets)[0];
    const wallet = walletOperationsFindWallet(walletId);
    if (!wallet) {
      showToast('Selected wallet could not be found', 'error');
      return;
    }

    showToast('Linking creator wallet...', 'info');
    addConsoleLog(`Setting wallet ${walletId} as creator`, 'info');

    let privateKeyPayload = null;
    try {
      // api-server.js handles both /api/wallets/export and /wallets/export routes
      const endpoint = API_BASE.startsWith('http') 
        ? `${API_BASE}/api/wallets/export`
        : `${API_BASE}/wallets/export`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletIds: [walletId],
          includePrivateKey: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result?.wallets?.[0]) {
          privateKeyPayload = result.wallets[0];
        }
      }
    } catch (exportError) {
      console.warn('Unable to fetch private key for creator wallet assignment:', exportError);
    }

    if (typeof window.setCreatorWalletFromSelection !== 'function') {
      throw new Error('Creator wallet handler is not available yet. Try again after the UI finishes loading.');
    }

    const assignmentResult = await window.setCreatorWalletFromSelection({
      wallet: { ...wallet },
      privateKeyBase58: privateKeyPayload?.privateKeyBase58 || null,
      privateKeyArray: privateKeyPayload?.privateKeyArray || null
    });

    if (assignmentResult && Array.isArray(assignmentResult.tags)) {
      wallet.tags = assignmentResult.tags;
    } else if (Array.isArray(wallet.tags)) {
      if (!wallet.tags.includes('creator')) {
        wallet.tags.push('creator');
      }
    } else {
      wallet.tags = ['creator'];
    }

    wallets = wallets.map((entry) => {
      const entryId = walletOperationsGetWalletId(entry);
      if (entryId === walletId) {
        return {
          ...entry,
          ...wallet,
          tags: wallet.tags
        };
      }
      return entry;
    });

    updateWalletGroups();
    walletOperationsRenderTable();
    walletOperationsRenderGroupingTable();
    walletOperationsRenderActivateList();
    walletOperationsUpdateTagInfo();
    walletOperationsRenderGroupingChips();
    walletOperationsUpdateBulkActions();

    showToast('Creator wallet updated', 'success');
    addConsoleLog(`Creator wallet set to ${wallet.name || walletId}`, 'success');
  } catch (error) {
    console.error('Error setting creator wallet:', error);
    showToast(`Failed to set creator wallet: ${error.message}`, 'error');
    addConsoleLog(`Error setting creator wallet: ${error.message}`, 'error');
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

    const targetIds = Array.from(selectedWallets);
    const affectedCount = targetIds.length;
    showToast(`Deactivating ${selectedWallets.size} wallets...`, 'info');
    addConsoleLog(`Deactivating ${selectedWallets.size} wallets`, 'info');

    // api-server.js handles both /api/wallets/deactivate and /wallets/deactivate routes
    const endpoint = API_BASE.startsWith('http') 
      ? `${API_BASE}/api/wallets/deactivate`
      : `${API_BASE}/wallets/deactivate`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletIds: targetIds
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success) {
      const message = result?.error || result?.message || `API returned ${response.status}`;
      throw new Error(message);
    }

    const updatedLookup = new Map();
    if (Array.isArray(result.wallets)) {
      result.wallets.forEach((entry) => {
        if (!entry) return;
        const entryId = entry.id || entry.publicKey || entry.address;
        if (!entryId) return;
        updatedLookup.set(entryId, entry);
      });
    }

    wallets = wallets.map((wallet) => {
      const walletId = walletOperationsGetWalletId(wallet);
      if (!targetIds.includes(walletId)) {
        return wallet;
      }

      const updated = updatedLookup.get(walletId)
        || updatedLookup.get(wallet.id)
        || updatedLookup.get(wallet.publicKey);

      return {
        ...wallet,
        status: updated?.status === 'inactive' ? 'inactive' : 'inactive',
        lastUsed: updated?.lastUsed || wallet.lastUsed
      };
    });

    updateWalletGroups();
    selectedWallets.clear();
    walletOperationsRenderTable();
    walletOperationsRenderGroupingTable();
    walletOperationsRenderActivateList();
    walletOperationsSyncSelectionUI();

    const updatedCount = Number.isFinite(result.updatedCount) ? result.updatedCount : affectedCount;
    showToast(`Deactivated ${updatedCount} wallet${updatedCount === 1 ? '' : 's'}`, 'success');
    addConsoleLog(`Deactivated ${updatedCount} wallet${updatedCount === 1 ? '' : 's'}`, 'success');
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

    const targetIds = Array.from(selectedWallets);

    showToast(`Activating ${targetIds.length} wallets...`, 'info');
    addConsoleLog(`Activating ${targetIds.length} wallets`, 'info');

    // api-server.js handles both /api/wallets/activate and /wallets/activate routes
    const endpoint = API_BASE.startsWith('http') 
      ? `${API_BASE}/api/wallets/activate`
      : `${API_BASE}/wallets/activate`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletIds: targetIds })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `API returned ${response.status}`);
    }

    const updatedLookup = new Map();
    if (Array.isArray(result.wallets)) {
      result.wallets.forEach((entry) => {
        if (!entry) return;
        const entryId = entry.id || entry.publicKey || entry.address;
        if (!entryId) return;
        updatedLookup.set(entryId, entry);
      });
    }

    wallets = wallets.map((wallet) => {
      const walletId = walletOperationsGetWalletId(wallet);
      if (!targetIds.includes(walletId)) {
        return wallet;
      }
      const updated = updatedLookup.get(walletId)
        || updatedLookup.get(wallet.id)
        || updatedLookup.get(wallet.publicKey);
      return {
        ...wallet,
        status: updated?.status === 'inactive' ? 'inactive' : 'active',
        lastUsed: updated?.lastUsed || wallet.lastUsed
      };
    });

    updateWalletGroups();
    selectedWallets.clear();
    walletOperationsRenderTable();
    walletOperationsRenderGroupingTable();
    walletOperationsRenderActivateList();
    walletOperationsSyncSelectionUI();

    const activatedCount = Number.isFinite(result.updatedCount)
      ? result.updatedCount
      : result.activated || targetIds.length;

    showToast(`Activated ${activatedCount} wallet${activatedCount === 1 ? '' : 's'}`, 'success');
    addConsoleLog(`Activated ${activatedCount} wallet${activatedCount === 1 ? '' : 's'}`, 'success');
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

    // api-server.js handles both /api/wallets/group and /wallets/group routes
    const endpoint = API_BASE.startsWith('http') 
      ? `${API_BASE}/api/wallets/group`
      : `${API_BASE}/wallets/group`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletIds: Array.from(selectedWallets),
        groupName,
        keepExisting: !!keepExisting
      })
    });

    const raw = await response.text();
    let result = {};
    if (raw) {
      try {
        result = JSON.parse(raw);
      } catch (parseError) {
        throw new Error('Unexpected response from server');
      }
    }

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
 * Uses global window.showToast if available, otherwise creates local implementation
 */
function showToast(message, type = 'info') {
  // Use global showToast if available (from index.html)
  if (typeof window.showToast === 'function') {
    return window.showToast(message, type);
  }
  
  // Fallback local implementation
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

// Expose to global scope if not already exposed
if (typeof window.showToast === 'undefined') {
  window.showToast = showToast;
}

/**
 * Add console log
 * Uses global window.addConsoleLog if available, otherwise creates local implementation
 */
function addConsoleLog(message, type = 'info') {
  // Use global addConsoleLog if available (from index.html)
  if (typeof window.addConsoleLog === 'function') {
    return window.addConsoleLog(message, type);
  }
  
  // Fallback local implementation
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

// Expose to global scope if not already exposed
if (typeof window.addConsoleLog === 'undefined') {
  window.addConsoleLog = addConsoleLog;
}

// Make functions globally available
window.walletOperations = {
  loadWallets,
  getWallets: () => wallets.slice(),
  getSelectedWalletIds: () => Array.from(selectedWallets),
  executeGenerateWallets,
  exportWallets,
  walletOperationsSetCreatorWallet,
  deactivateWallets,
  refreshBalances,
  walletOperationsToggleSelection,
  walletOperationsToggleSelectAll,
  walletOperationsSwitchTab,
  walletOperationsFilterWallets,
  walletOperationsRenderTable,
  walletOperationsRenderGroupingTable,
  walletOperationsRenderActivateList,
  walletOperationsRenderGroupingChips,
  walletOperationsUpdateTotals,
  walletOperationsUpdateBulkActions,
  walletOperationsUpdateTagInfo,
  walletOperationsAutoAssignTags
};

// Also expose functions globally for onclick handlers
window.loadWallets = loadWallets;
window.executeGenerateWallets = executeGenerateWallets;
window.executeImportWallet = executeImportWallet;
window.exportWallets = exportWallets;
window.executeExportWallets = executeExportWallets;
window.walletOperationsSetCreatorWallet = walletOperationsSetCreatorWallet;
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
window.walletOperationsRenderActivateList = walletOperationsRenderActivateList;
window.walletOperationsRenderGroupingChips = walletOperationsRenderGroupingChips;
window.walletOperationsUpdateTotals = walletOperationsUpdateTotals;
window.walletOperationsUpdateBulkActions = walletOperationsUpdateBulkActions;
window.walletOperationsSetActiveTagWallet = walletOperationsSetActiveTagWallet;
window.walletOperationsUpdateTagInfo = walletOperationsUpdateTagInfo;
window.walletOperationsAutoAssignTags = walletOperationsAutoAssignTags;
window.walletOperationsGetSelectedWalletIds = () => Array.from(selectedWallets);
window.executeGroupWallets = executeGroupWallets;
window.executeReclaimRent = executeReclaimRent;

