# Token Detail Page - Complete Code Reference

This document contains all the JavaScript code that powers the token detail page section (`#token-detail-page`).

## Table of Contents
1. [Main Functions](#main-functions)
2. [Metrics Functions](#metrics-functions)
3. [Holdings Functions](#holdings-functions)
4. [Activity Functions](#activity-functions)
5. [Task List Functions](#task-list-functions)
6. [Helper Functions](#helper-functions)
7. [Event Handlers](#event-handlers)

---

## Main Functions

### `populateTokenDetailView(record)`
Populates the token detail view with token information.

```8088:8284:webapp/real-trading-ui.js
function populateTokenDetailView(record) {
    if (!record) return;
    stopTokenActivityStream();
    tokenRegistry.current = record;
    tokenRegistry.currentSource = record.type === 'draft' ? 'draft' : 'imported';
    tokenDetailViewState.currentKey = record.mint || record.id || null;
    tokenDetailViewState.lastRuntime = null;
    updateTokenLastRuntime(null);

    const nameEl = document.getElementById('selected-token-name');
    const titleEl = document.getElementById('selected-token-title');
    const subtitleEl = document.getElementById('selected-token-subtitle');
    const addressEl = document.getElementById('selected-token-address');
    const iconEl = document.getElementById('selected-token-icon');
    const statusEl = document.getElementById('token-status');
    const copyIcon = document.getElementById('selected-token-copy');
    const prepareButton = document.getElementById('prepare-launch-btn');
    const platformEl = document.getElementById('selected-token-platform');

    const isDraft = record.type === 'draft';

    if (nameEl) {
        nameEl.textContent = record.name || 'Token';
    }

    if (titleEl) {
        titleEl.textContent = record.name || 'Token';
        if (subtitleEl) {
            subtitleEl.textContent = record.symbol ? `(${record.symbol})` : '';
        }
    }

    if (addressEl) {
        addressEl.textContent = isDraft ? 'Not launched yet' : record.mint;
    }

    if (iconEl) {
        const pumpFunLogo = 'https://pump.fun/logo.png';
        const hasImage = record?.image && typeof record.image === 'string' && record.image.trim().length > 0;
        const imageUrl = hasImage ? (resolveImageUrl(record.image) || record.image) : pumpFunLogo;
        
        // Always use an img tag to ensure proper styling and fallback behavior
        iconEl.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(record.name || 'Token')}" class="w-full h-full object-cover rounded-full" loading="lazy" onerror="this.onerror=null; this.src='${pumpFunLogo}'; this.onerror=function(){this.style.display='none'; this.parentElement.innerHTML='<span class=\\'text-4xl\\'>🪙</span>';};" />`;
    }

    if (statusEl) {
        const statusLabel = (record.status || (isDraft ? 'PRE-LAUNCH' : record.type?.toUpperCase() || 'ACTIVE')).toString();
        statusEl.textContent = statusLabel;
        statusEl.className = 'inline-flex items-center px-2 py-1 text-xs rounded-full';
        const normalized = statusLabel.toLowerCase();
        if (normalized.includes('running') || normalized.includes('live')) {
            statusEl.classList.add('bg-emerald-900/60', 'text-emerald-200');
        } else if (normalized.includes('queued') || normalized.includes('pre')) {
            statusEl.classList.add('bg-blue-900/50', 'text-blue-200');
        } else if (normalized.includes('paused')) {
            statusEl.classList.add('bg-yellow-900/60', 'text-yellow-200');
        } else {
            statusEl.classList.add('bg-neutral-800', 'text-gray-200');
        }
    }

    if (platformEl) {
        const sourceLabel = typeof record.source === 'string' ? record.source : '';
        const fallbackPlatform =
            record.type === 'draft'
                ? ''
                : record.provider ||
                  (sourceLabel && sourceLabel.toLowerCase() === 'pumpfun' ? 'Pump.fun' : '') ||
                  (record.launchSource && typeof record.launchSource === 'string'
                      ? record.launchSource
                      : '');
        const platform =
            record.launchPlatform ||
            record.platform ||
            sourceLabel ||
            (typeof record.launchSource === 'string' ? record.launchSource : '') ||
            record.market ||
            fallbackPlatform;
        if (platform) {
            platformEl.textContent = platform;
            platformEl.classList.remove('hidden');
        } else {
            platformEl.textContent = '';
            platformEl.classList.add('hidden');
        }
    }

    const editButton = getElement('token-edit-btn');
    if (editButton) {
        const isEditableDraft = record.type === 'draft';
        const editLabel = editButton.querySelector('span');
        editButton.disabled = !isEditableDraft;
        editButton.classList.toggle('opacity-60', !isEditableDraft);
        editButton.classList.toggle('pointer-events-none', !isEditableDraft);
        editButton.setAttribute('aria-disabled', isEditableDraft ? 'false' : 'true');
        editButton.title = isEditableDraft ? 'Edit draft configuration' : 'Editing is available for saved drafts';
        if (editLabel) {
            editLabel.textContent = 'Edit';
        }
    }

    const archiveButton = getElement('token-archive-btn');
    if (archiveButton) {
        const archiveLabel = archiveButton.querySelector('span');
        const isArchived = Boolean(record.archived);
        if (archiveLabel) {
            archiveLabel.textContent = isArchived ? 'Unarchive' : 'Archive';
        }
        archiveButton.setAttribute('aria-pressed', isArchived ? 'true' : 'false');
    }

    const collectFeesButton = getElement('token-collect-fees-btn');
    if (collectFeesButton) {
        if (isDraft) {
            collectFeesButton.classList.add('hidden');
        } else {
            collectFeesButton.classList.remove('hidden');
        }
    }

    // Show/hide Collect Creator Fees button (only for launched tokens)
    const collectCreatorFeesButton = getElement('token-collect-creator-fees-btn');
    if (collectCreatorFeesButton) {
        // Only show for launched tokens (not drafts, not imported)
        const isLaunched = !isDraft && record.mint && (record.type === 'launch' || record.status === 'Launched' || (record.type !== 'imported' && record.type !== 'copy'));
        if (isLaunched) {
            collectCreatorFeesButton.classList.remove('hidden');
        } else {
            collectCreatorFeesButton.classList.add('hidden');
        }
    }

    setTokenHoldingsSource(tokenDetailViewState.holdingsSource || 'jito', {
        silent: true,
        skipReload: true
    });

    if (copyIcon) {
        copyIcon.setAttribute('type', 'button');
        if (isDraft) {
            copyIcon.classList.add('opacity-40', 'pointer-events-none');
            copyIcon.setAttribute('disabled', 'disabled');
            copyIcon.onclick = null;
        } else {
            copyIcon.classList.remove('opacity-40', 'pointer-events-none');
            copyIcon.removeAttribute('disabled');
        copyIcon.onclick = async () => {
            try {
                await navigator.clipboard.writeText(record.mint);
                notify('Token mint copied to clipboard.', 'success');
            } catch (error) {
                notify('Unable to copy mint address.', 'error');
            }
        };
        }
    }

    if (prepareButton) {
        if (isDraft) {
            prepareButton.classList.remove('hidden');
        } else {
            prepareButton.classList.add('hidden');
        }
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    updateTokenDetailLinks(record);

    resetTokenMetrics();
    resetHoldingsTable({
        message: isDraft
            ? 'Holdings will populate once the token is launched.'
            : 'Fetching live wallet balances…'
    });
    renderTokenActivity([], { isLive: !isDraft, loading: !isDraft });

    if (isDraft) {
        renderTokenTaskList(record, { runtimeTasks: [] });
        return;
    }

    renderTokenTaskList(record, { loading: true });

    if (!record.mint) {
        notify('Token mint unavailable; live dashboards require a mint address.', 'warning');
        return;
    }

    loadLiveTokenDetail(record).catch((error) => {
        console.error('Failed to load live token detail:', error);
        notify(`Unable to load live token metrics: ${error.message}`, 'error');
    });
}
```

### `loadLiveTokenDetail(record)`
Loads live token data including metrics, holdings, tasks, and activity.

```6869:7003:webapp/real-trading-ui.js
async function loadLiveTokenDetail(record) {
    if (!record || !record.mint) {
        return;
    }

    const runtimeKey = record.mint;
    if (tokenDetailViewState.loading && tokenDetailViewState.currentKey === runtimeKey) {
        return;
    }

    tokenDetailViewState.loading = true;
    tokenDetailViewState.currentKey = runtimeKey;

    resetHoldingsTable({ message: 'Syncing wallet balances…', isLoading: true });
    renderTokenTaskList(record, { loading: true });
    renderTokenActivity([], { loading: true, isLive: true });

    try {
        const solPrice = await (solanaIntegration?.getSolPrice?.() || Promise.resolve(null));
        const holdingsSource = tokenDetailViewState.holdingsSource || 'jito';

        // Fetch data in parallel, but handle trade feed errors gracefully
        const [pumpFunInfoResult, priceDetailsResult, runtimeAutomationsResult, holdingsResultResult, activityResult] = await Promise.allSettled([
            fetchPumpFunTokenDetails(record.mint),
            fetchTokenPriceDetails(record.mint, { solPrice }),
            fetchRuntimeAutomationsForMint(record.mint),
            fetchWalletHoldingsForMint(record.mint, { source: holdingsSource }),
            fetchPumpFunTradeFeed(record.mint, 20).catch(error => {
                // Silently handle trade feed errors - API might be down
                return [];
            })
        ]);
        
        // Extract values from settled promises
        const pumpFunInfo = pumpFunInfoResult.status === 'fulfilled' ? pumpFunInfoResult.value : null;
        const priceDetails = priceDetailsResult.status === 'fulfilled' ? priceDetailsResult.value : { priceSol: null, priceUsd: null, source: '' };
        const runtimeAutomations = runtimeAutomationsResult.status === 'fulfilled' ? runtimeAutomationsResult.value : { tasks: [], stats: { totalVolume: 0, activeSessions: 0 } };
        const holdingsResult = holdingsResultResult.status === 'fulfilled' ? holdingsResultResult.value : { holdings: [], summary: { totalTokenBalance: 0, totalHoldingsSol: 0 } };
        const activity = activityResult.status === 'fulfilled' ? activityResult.value : [];

        const priceSol = priceDetails.priceSol ?? null;
        const priceUsd = priceDetails.priceUsd ?? null;
        const marketCapUsd = priceDetails.marketCapUsd ?? (pumpFunInfo ? safeNumber(pumpFunInfo.marketCap) : null);
        const bondingPercent =
            pumpFunInfo && pumpFunInfo.bondingCurve && safeNumber(pumpFunInfo.bondingCurve?.percentComplete) !== null
                ? safeNumber(pumpFunInfo.bondingCurve.percentComplete)
                : pumpFunInfo && pumpFunInfo.bondingCurvePercentage !== undefined
                ? safeNumber(pumpFunInfo.bondingCurvePercentage)
                : null;

        const holdingsSummary = holdingsResult.summary || { totalTokenBalance: 0, totalHoldingsSol: 0 };
        const holdingsValueSol =
            priceSol !== null ? holdingsSummary.totalTokenBalance * priceSol : holdingsSummary.totalHoldingsSol || null;
        const holdingsValueUsd =
            holdingsValueSol !== null && solPrice ? holdingsValueSol * solPrice : null;

        const amountInvestedSol = safeNumber(record.initialBuyAmount);
        const amountSoldSol =
            runtimeAutomations.stats.totalVolume > 0 ? runtimeAutomations.stats.totalVolume : null;

        let profitLossSol = null;
        if (holdingsValueSol !== null && amountInvestedSol !== null) {
            const soldComponent = amountSoldSol || 0;
            profitLossSol = holdingsValueSol + soldComponent - amountInvestedSol;
        }

        // Log data for debugging
        const metricsData = {
            priceSol,
            priceUsd,
            marketCapUsd,
            bondingPercent,
            totalTokenHoldings: holdingsSummary.totalTokenBalance,
            holdingsValueSol,
            holdingsValueUsd,
            amountInvestedSol,
            amountSoldSol,
            profitLossSol,
            solPrice,
            source: priceDetails.source || (pumpFunInfo?.success ? 'pumpfun' : '')
        };
        console.log('Token metrics data:', metricsData);
        
        // Provide helpful feedback about missing data
        if (holdingsSummary.totalTokenBalance === 0) {
            console.info('ℹ️ No token holdings found. Make sure wallets are loaded and contain tokens for this mint.');
        }
        if (marketCapUsd === null) {
            console.debug('ℹ️ Market cap unavailable - Pump.fun API may be down or token not fully launched.');
        }
        if (bondingPercent === null) {
            console.debug('ℹ️ Bonding curve data unavailable - token may have completed bonding or API unavailable.');
        }

        updateTokenMetrics({
            priceSol,
            priceUsd,
            marketCapUsd,
            bondingPercent,
            totalTokenHoldings: holdingsSummary.totalTokenBalance,
            holdingsValueSol,
            holdingsValueUsd,
            amountInvestedSol: amountInvestedSol ?? null,
            amountSoldSol,
            profitLossSol,
            solPrice,
            source: priceDetails.source || (pumpFunInfo?.success ? 'pumpfun' : '')
        });

        renderTokenHoldingsTable(holdingsResult.holdings, {
            priceSol,
            priceUsd
        });

        renderTokenTaskList(record, {
            runtimeTasks: runtimeAutomations.tasks
        });

        renderTokenActivity(activity, { isLive: true });
        startTokenActivityStream(record.mint);

        tokenDetailViewState.lastRuntime = Date.now();
        updateTokenLastRuntime(tokenDetailViewState.lastRuntime);
        
        console.log('✅ Token detail data loaded successfully');
    } catch (error) {
        console.error('Failed to load live token data:', error);
        console.error('Error stack:', error.stack);
        notify(`Unable to load live token dashboard: ${error.message || error}`, 'error');
        resetHoldingsTable({ message: 'Live holdings unavailable. Try reloading or check RPC connection.' });
        
        // Still try to update metrics with whatever data we have (nulls)
        updateTokenMetrics({
            priceSol: null,
            priceUsd: null,
            marketCapUsd: null,
            bondingPercent: null,
            totalTokenHoldings: null,
            holdingsValueSol: null,
            holdingsValueUsd: null,
            amountInvestedSol: safeNumber(record.initialBuyAmount),
            amountSoldSol: null,
            profitLossSol: null,
            solPrice: null,
            source: ''
        });
    } finally {
        tokenDetailViewState.loading = false;
    }
}
```

---

## Metrics Functions

### `updateTokenMetrics({...})`
Updates all token metric displays with calculated values.

```5374:5512:webapp/real-trading-ui.js
function updateTokenMetrics({
    priceSol = null,
    priceUsd = null,
    marketCapUsd = null,
    bondingPercent = null,
    totalTokenHoldings = null,
    holdingsValueSol = null,
    holdingsValueUsd = null,
    amountInvestedSol = null,
    amountSoldSol = null,
    profitLossSol = null,
    solPrice = null,
    source = ''
} = {}) {
    // Debug: Check if we're in the token detail page
    const tokenDetailPage = document.getElementById('token-detail-page');
    if (!tokenDetailPage || tokenDetailPage.classList.contains('hidden')) {
        console.warn('updateTokenMetrics called but token-detail-page is hidden or not found');
    }
    
    const formatMaybeSol = (value) => (value !== null ? formatSol(value) : '—');
    const formatMaybeUsd = (value) => (value !== null ? formatUSD(value) : '—');

    const priceDisplay = (() => {
        if (priceSol === null && priceUsd === null) {
            return '—';
        }
        if (priceSol !== null && priceUsd !== null) {
            return `${priceSol.toFixed(priceSol >= 1 ? 3 : 6)} SOL (${formatUSD(priceUsd)})`;
        }
        if (priceSol !== null) {
            return `${priceSol.toFixed(priceSol >= 1 ? 3 : 6)} SOL`;
        }
        return formatUSD(priceUsd);
    })();

    const profitDisplay = profitLossSol !== null ? formatSol(profitLossSol) : '—';
    const profitDetail =
        profitLossSol !== null && holdingsValueUsd !== null
            ? `${formatUSD(profitLossSol * (solPrice || 0))} converted`
            : '';

    const amountInvestedDisplay = amountInvestedSol !== null ? formatSol(amountInvestedSol) : '—';
    const holdingsDisplay =
        totalTokenHoldings !== null
            ? `${totalTokenHoldings.toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens`
            : '—';
    const holdingsDetail =
        holdingsValueSol !== null
            ? `${formatSol(holdingsValueSol)}${holdingsValueUsd !== null ? ` (${formatUSD(holdingsValueUsd)})` : ''}`
            : '';

    const amountSoldDisplay = amountSoldSol !== null ? formatSol(amountSoldSol) : '—';
    const amountSoldDetail =
        amountSoldSol !== null && solPrice !== null ? `${formatUSD(amountSoldSol * solPrice)}` : '';

    const priceDetail = source ? `Source: ${source.toUpperCase()}` : '';
    const marketCapDisplay = marketCapUsd !== null ? formatUSD(marketCapUsd) : '—';

    const bondingDisplay =
        bondingPercent !== null && Number.isFinite(bondingPercent)
            ? `${Math.max(0, Math.min(100, bondingPercent)).toFixed(1)}%`
            : '—';

    const profitEl = getElement('metric-profit-loss');
    if (profitEl) profitEl.textContent = profitDisplay;
    const profitDetailEl = getElement('metric-profit-loss-detail');
    if (profitDetailEl) profitDetailEl.textContent = profitDetail;

    const investedEl = getElement('metric-amount-invested');
    if (investedEl) investedEl.textContent = amountInvestedDisplay;
    const investedDetailEl = getElement('metric-amount-invested-detail');
    if (investedDetailEl && amountInvestedSol !== null && solPrice !== null) {
        investedDetailEl.textContent = formatUSD(amountInvestedSol * solPrice);
    } else if (investedDetailEl) {
        investedDetailEl.textContent = '';
    }

    const holdingsEl = getElement('metric-token-holdings');
    if (holdingsEl) holdingsEl.textContent = holdingsDisplay;
    const holdingsDetailEl = getElement('metric-token-holdings-detail');
    if (holdingsDetailEl) holdingsDetailEl.textContent = holdingsDetail;

    const holdingsValueEl = getElement('metric-holdings-value');
    if (holdingsValueEl) holdingsValueEl.textContent = formatMaybeSol(holdingsValueSol);
    const holdingsValueDetailEl = getElement('metric-holdings-value-detail');
    if (holdingsValueDetailEl) holdingsValueDetailEl.textContent = holdingsValueUsd !== null ? formatUSD(holdingsValueUsd) : '';

    const soldEl = getElement('metric-amount-sold');
    if (soldEl) soldEl.textContent = amountSoldDisplay;
    const soldDetailEl = getElement('metric-amount-sold-detail');
    if (soldDetailEl) soldDetailEl.textContent = amountSoldDetail;

    const priceEl = getElement('metric-price-per-token');
    if (priceEl) priceEl.textContent = priceDisplay;
    const priceDetailEl = getElement('metric-price-per-token-detail');
    if (priceDetailEl) priceDetailEl.textContent = priceDetail;

    const marketCapEl = getElement('metric-market-cap');
    if (marketCapEl) marketCapEl.textContent = marketCapDisplay;

    const marketCapDetailEl = getElement('metric-market-cap-detail');
    if (marketCapDetailEl && marketCapUsd !== null) {
        marketCapDetailEl.textContent = solPrice ? `${formatSol(marketCapUsd / solPrice)} equivalent` : '';
    } else if (marketCapDetailEl) {
        marketCapDetailEl.textContent = '';
    }

    const bondingPercentEl = getElement('metric-bonding-percent');
    if (bondingPercentEl) bondingPercentEl.textContent = bondingDisplay;

    const bondingBar = getElement('metric-bonding-bar');
    if (bondingBar) {
        const width = bondingPercent !== null && Number.isFinite(bondingPercent)
            ? `${Math.max(0, Math.min(100, bondingPercent))}%`
            : '0%';
        bondingBar.style.width = width;
    }
    
    // Debug: Log which elements were found/updated
    const allMetricIds = [
        'metric-profit-loss', 'metric-profit-loss-detail',
        'metric-amount-invested', 'metric-amount-invested-detail',
        'metric-token-holdings', 'metric-token-holdings-detail',
        'metric-holdings-value', 'metric-holdings-value-detail',
        'metric-amount-sold', 'metric-amount-sold-detail',
        'metric-price-per-token', 'metric-price-per-token-detail',
        'metric-market-cap', 'metric-market-cap-detail',
        'metric-bonding-percent', 'metric-bonding-bar'
    ];
    const foundElements = allMetricIds.filter(id => getElement(id) !== null);
    const missingElements = allMetricIds.filter(id => getElement(id) === null);
    if (missingElements.length > 0) {
        console.warn('Missing metric elements:', missingElements);
    }
    if (foundElements.length > 0) {
        console.log(`✅ Updated ${foundElements.length} metric elements`);
    }
}
```

### `resetTokenMetrics()`
Resets all metric displays to default "—" values.

```5340:5373:webapp/real-trading-ui.js
function resetTokenMetrics() {
    const metricIds = [
        'metric-profit-loss',
        'metric-profit-loss-detail',
        'metric-amount-invested',
        'metric-amount-invested-detail',
        'metric-token-holdings',
        'metric-token-holdings-detail',
        'metric-holdings-value',
        'metric-holdings-value-detail',
        'metric-amount-sold',
        'metric-amount-sold-detail',
        'metric-price-per-token',
        'metric-price-per-token-detail',
        'metric-market-cap',
        'metric-market-cap-detail',
        'metric-bonding-percent'
    ];

    metricIds.forEach((id) => {
        const el = getElement(id);
        if (!el) return;
        if (id.endsWith('-detail')) {
            el.textContent = '';
        } else {
            el.textContent = '—';
        }
    });

    const bar = getElement('metric-bonding-bar');
    if (bar) {
        bar.style.width = '0%';
    }
}
```

### `updateTokenLastRuntime(timestamp)`
Updates the "Recent run" timestamp display.

```5514:5525:webapp/real-trading-ui.js
function updateTokenLastRuntime(timestamp = null) {
    const runtimeEl = getElement('token-last-runtime');
    if (!runtimeEl) {
        return;
    }
    if (!timestamp) {
        runtimeEl.textContent = '—';
        return;
    }
    runtimeEl.textContent = formatRelativeTime(timestamp);
}
```

---

## Holdings Functions

### `renderTokenHoldingsTable(holdings, { priceSol, priceUsd })`
Renders the token holdings table with wallet balances and actions.

```5680:5822:webapp/real-trading-ui.js
function renderTokenHoldingsTable(holdings = [], { priceSol = null, priceUsd = null } = {}) {
    const body = getElement('token-holdings-body');
    if (!body) {
        return;
    }

    // Filter out holdings with zero or null token balance
    const validHoldings = holdings.filter(h => 
        h.tokenBalance !== null && 
        h.tokenBalance !== undefined && 
        Number.isFinite(h.tokenBalance) && 
        h.tokenBalance > 0
    );
    
    if (!Array.isArray(holdings) || validHoldings.length === 0) {
        resetHoldingsTable({ message: 'No token holdings detected across managed wallets.' });
        return;
    }

    const rows = validHoldings
        .map((holding) => {
            const solBalanceLabel =
                holding.solBalance !== null && holding.solBalance !== undefined
                    ? formatSol(holding.solBalance)
                    : '—';

            const tokenBalanceLabel =
                holding.tokenBalance !== null && holding.tokenBalance !== undefined
                    ? `${holding.tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}`
                    : '—';

            let tokenValueLabel = '';
            if (priceSol !== null && holding.tokenBalance !== null) {
                const valueSol = holding.tokenBalance * priceSol;
                const valueUsd =
                    priceUsd !== null && priceSol > 0 ? valueSol * (priceUsd / priceSol) : null;
                tokenValueLabel = `${formatSol(valueSol)}${
                    valueUsd !== null ? ` (${formatUSD(valueUsd)})` : ''
                }`;
            }

            const walletTags =
                Array.isArray(holding.tags) && holding.tags.length
                    ? `<div class="flex flex-wrap gap-1 mt-1">${holding.tags
                          .map(
                              (tag) =>
                                  `<span class="px-2 py-0.5 text-[10px] rounded-full bg-neutral-900 text-gray-400 border border-neutral-800">${escapeHtml(
                                      tag
                                  )}</span>`
                          )
                          .join('')}</div>`
                    : '';

            let actionMarkup = '<span class="text-xs text-gray-500">Read-only wallet</span>';

            if (holding.walletId) {
                const quickBuyOptions = [0.1, 0.5, 1];
                const quickBuyButtons = quickBuyOptions
                    .map(
                        (amount) => `
                            <button class="px-2 py-1 rounded-md text-[11px] font-medium bg-neutral-900 text-gray-300 border border-neutral-800 hover:bg-neutral-800 transition"
                                onclick="handleQuickBuy('${holding.walletId}', '${holding.address}', '${holding.tokenMint || ''}', ${amount})">
                                ${amount}
                    </button>`
                    )
                    .join('');

                const sellButtons =
                    holding.tokenBalance && holding.tokenBalance > 0
                        ? [25, 50, 100]
                              .map(
                                  (percentage) => `
                                <button class="px-2 py-1 rounded-md text-[11px] bg-neutral-900 text-gray-400 border border-neutral-800 hover:bg-neutral-800 transition"
                                    onclick="handleWalletTradeAction('sell-percentage', '${holding.walletId}', '${holding.address}', '${holding.tokenMint || ''}', ${percentage}, ${holding.tokenBalance})">
                                ${percentage}%
                            </button>`
                              )
                              .join('')
                        : '';

                actionMarkup = `
                    <div class="flex flex-wrap items-center justify-end gap-2">
                        <div class="flex items-center gap-1">${quickBuyButtons}</div>
                        <button class="px-3 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition border border-emerald-500/40"
                            onclick="handleWalletTradeAction('buy', '${holding.walletId}', '${holding.address}', '${holding.tokenMint || ''}')">
                            Buy
                        </button>
                        ${sellButtons}
                        ${
                            holding.tokenBalance && holding.tokenBalance > 0
                                ? `<button class="px-3 py-1 rounded-md text-xs font-semibold bg-rose-900/70 text-rose-200 border border-rose-900 hover:bg-rose-800/80 transition"
                                    onclick="handleWalletTradeAction('sell-percentage', '${holding.walletId}', '${holding.address}', '${holding.tokenMint || ''}', 100, ${holding.tokenBalance})">
                                    Sell
                                </button>`
                                : ''
                        }
                    </div>
                `;
            }

            return `
                <tr class="border-b border-neutral-900/60 hover:bg-black/40 transition">
                    <td class="py-4 pl-4">
                        <div class="flex items-center gap-3">
                            <span class="text-xl">${escapeHtml(holding.emoji || '👛')}</span>
                            <div>
                                <div class="text-sm font-semibold text-white">${escapeHtml(holding.name || 'Unnamed Wallet')}</div>
                                ${walletTags}
                            </div>
                        </div>
                    </td>
                    <td class="py-4 text-gray-400">
                        <div class="flex items-center gap-2">
                            <code class="font-mono text-xs text-gray-300 bg-black/40 px-2 py-1 rounded-md border border-neutral-900">${escapeHtml(
                                truncateMiddle(holding.address)
                            )}</code>
                            <button class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-neutral-900 text-gray-300 border border-neutral-800 hover:bg-neutral-800 transition"
                                onclick="copyAddress('${holding.address}')">
                                <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                                Copy
                            </button>
                        </div>
                    </td>
                    <td class="py-4 text-gray-300">
                        <div class="font-medium">${solBalanceLabel}</div>
                    </td>
                    <td class="py-4 text-gray-300">
                        <div class="font-medium">${tokenBalanceLabel}</div>
                        ${tokenValueLabel ? `<div class="text-[11px] text-gray-500 mt-1">${tokenValueLabel}</div>` : ''}
                    </td>
                    <td class="py-4 pr-4">
                        ${actionMarkup}
                    </td>
                </tr>
            `;
        })
        .join('');

    body.innerHTML = rows;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
```

### `resetHoldingsTable({ message, isLoading })`
Resets the holdings table to show a message (loading or empty state).

```5526:5543:webapp/real-trading-ui.js
function resetHoldingsTable({ message = 'Holdings will populate once the token is launched.', isLoading = false } = {}) {
    const body = getElement('token-holdings-body');
    if (!body) return;
    const loadingIcon = isLoading ? '<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin"></i>' : '';
    body.innerHTML = `
        <tr>
            <td colspan="5" class="py-10 px-4 text-center text-sm text-gray-500 bg-black/30">
                <div class="flex items-center justify-center gap-2">
                ${loadingIcon}
                <span>${escapeHtml(message)}</span>
                </div>
            </td>
        </tr>
    `;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
```

### `setTokenHoldingsSource(source, { silent, skipReload })`
Switches between Jito and RPC data sources for holdings.

```7938:7975:webapp/real-trading-ui.js
function setTokenHoldingsSource(source, { silent = false, skipReload = false } = {}) {
    const normalized = source === 'rpc' ? 'rpc' : 'jito';
    tokenDetailViewState.holdingsSource = normalized;

    const activeClasses = ['bg-purple-600', 'text-white', 'shadow-lg', 'shadow-purple-500/30'];
    const inactiveClasses = ['bg-neutral-900', 'text-gray-400'];

    const applyState = (button, active) => {
        if (!button) return;
        button.classList.remove(
            ...activeClasses,
            ...inactiveClasses,
            'shadow-lg',
            'shadow-purple-500/30'
        );
        if (active) {
            button.classList.add(...activeClasses);
        } else {
            button.classList.add(...inactiveClasses);
        }
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
    };

    applyState(getElement('token-holdings-source-jito'), normalized === 'jito');
    applyState(getElement('token-holdings-source-rpc'), normalized === 'rpc');

    if (!silent) {
        notify(`Holdings source switched to ${normalized.toUpperCase()}.`, 'info');
    }

    const current = tokenRegistry.current;
    if (!skipReload && current && current.type !== 'draft') {
        tokenDetailViewState.loading = false;
        loadLiveTokenDetail(current).catch((error) => {
            console.error('Failed to refresh holdings after source change:', error);
        });
    }
}
```

---

## Activity Functions

### `renderTokenActivity(entries, { loading, isLive })`
Renders the token activity/transactions table.

```5824:5843:webapp/real-trading-ui.js
function renderTokenActivity(entries = [], { loading = false, isLive = false } = {}) {
    const empty = getElement('token-activity-empty');
    const tableWrapper = getElement('token-activity-table');
    const tbody = getElement('token-activity-body');

    if (!empty || !tableWrapper || !tbody) {
        return;
    }

    if (loading) {
        empty.classList.remove('hidden');
        empty.innerHTML = `
            <div class="flex items-center justify-center text-sm text-gray-500">
                <i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i>
                <span>${isLive ? 'Streaming live trades…' : 'Loading activity…'}</span>
            </div>
        `;
        tableWrapper.classList.add('hidden');
        return;
    }

    if (!Array.isArray(entries) || entries.length === 0) {
        empty.classList.remove('hidden');
        empty.innerHTML = `
            <div class="text-sm text-gray-500">
                ${isLive ? 'No live trades captured yet.' : 'No activity recorded.'}
            </div>
        `;
        tableWrapper.classList.add('hidden');
        return;
    }

    tableWrapper.classList.remove('hidden');
    empty.classList.add('hidden');

    const rows = entries
        .map((entry) => {
            const age = entry.timestamp ? formatRelativeTime(entry.timestamp) : '—';
            const walletLabel = entry.wallet ? truncateMiddle(entry.wallet) : '—';
            const typeBadgeClass =
                entry.type === 'buy'
                    ? 'text-emerald-300'
                    : entry.type === 'sell'
                    ? 'text-rose-300'
                    : 'text-gray-300';
            const amountLabel = entry.amountSol !== undefined && entry.amountSol !== null
                ? `${entry.amountSol.toFixed(entry.amountSol >= 1 ? 3 : 6)} SOL`
                : entry.amountTokens !== undefined && entry.amountTokens !== null
                ? `${entry.amountTokens.toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens`
                : '—';

            return `
                <tr class="border-b border-neutral-800 last:border-b-0">
                    <td class="py-2 text-sm text-gray-400">${escapeHtml(age)}</td>
                    <td class="py-2 text-sm text-gray-300">${escapeHtml(walletLabel)}</td>
                    <td class="py-2 text-sm ${typeBadgeClass} font-medium text-uppercase">${escapeHtml((entry.type || '—').toUpperCase())}</td>
                    <td class="py-2 text-sm text-right text-gray-200">${amountLabel}</td>
                </tr>
            `;
        })
        .join('');

    tbody.innerHTML = rows;
}
```

---

## Task List Functions

### `renderTokenTaskList(record, options)`
Renders the automation tasks list.

```8453:8600:webapp/real-trading-ui.js
function renderTokenTaskList(record, options = {}) {
    const body = getElement('token-tasks-body');
    const emptyState = getElement('token-tasks-empty');
    const tableWrapper = getElement('token-tasks-table');
    const summaryEl = getElement('token-tasks-summary');

    if (!body || !emptyState || !tableWrapper || !summaryEl) {
        return;
    }

    if (options.loading) {
        tableWrapper.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.innerHTML = `
            <div class="flex items-center justify-center gap-2 text-sm text-gray-500">
                <i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>
                <span>Loading automation status…</span>
            </div>
        `;
        summaryEl.textContent = '';
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        return;
    }

    const runtimeTasks = Array.isArray(options.runtimeTasks) ? options.runtimeTasks : [];
    const tasks = buildAutomationTaskEntries(record, runtimeTasks);

    runtimeTaskRegistry.clear();
    tasks.filter((task) => task.source === 'runtime').forEach((task) => runtimeTaskRegistry.set(task.key, task));

    if (!tasks.length) {
        body.innerHTML = '';
        tableWrapper.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptyState.textContent = 'No automations configured for this token.';
        summaryEl.textContent = '';
        return;
    }

    tableWrapper.classList.remove('hidden');
    emptyState.classList.add('hidden');

    const runningCount = tasks.filter((task) => task.statusState === 'running').length;
    const queuedCount = tasks.filter((task) => task.statusState === 'queued').length;
    const totalLabel = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
    const statusFragments = [];
    if (runningCount) statusFragments.push(`${runningCount} running`);
    if (queuedCount) statusFragments.push(`${queuedCount} queued`);
    summaryEl.textContent = statusFragments.length ? `${totalLabel} • ${statusFragments.join(', ')}` : totalLabel;

    const actionsToHtml = (task) => {
        const actionButtons = [];
        
        // Add Edit button for configurable tasks
        const canEdit = task.type === 'volumeBot' || task.type === 'smartSell' || task.type === 'launch';
        if (canEdit) {
            const editHandler = task.source === 'runtime' 
                ? `handleRuntimeTaskAction('edit', '${task.key}')`
                : `handleTokenTaskAction('edit', '${task.key}')`;
            actionButtons.push(`
                <button
                    class="inline-flex items-center justify-center w-8 h-8 rounded-full border border-blue-500/40 text-blue-200 hover:text-blue-100 transition"
                    onclick="${editHandler}"
                    title="Edit ${escapeHtml(task.title || 'task')}"
                >
                    <i data-lucide="settings" class="w-4 h-4"></i>
                </button>
            `);
        }

        // Add existing action buttons
        if (Array.isArray(task.actions) && task.actions.length) {
            task.actions.forEach((action) => {
                const isRuntime = task.source === 'runtime';
                const disabled = action.disabled;
                const handler = isRuntime
                    ? `handleRuntimeTaskAction('${action.type}', '${task.key}')`
                    : `handleTokenTaskAction('${action.type}', '${task.key}')`;

                const intentClass =
                    action.intent === 'green'
                        ? 'border-emerald-500/40 text-emerald-200 hover:text-emerald-100'
                        : action.intent === 'yellow'
                        ? 'border-amber-500/40 text-amber-200 hover:text-amber-100'
                        : 'border-rose-500/40 text-rose-200 hover:text-rose-100';

                const baseClass =
                    'inline-flex items-center justify-center w-8 h-8 rounded-full border transition';
                const disabledClass = disabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : '';

                actionButtons.push(`
                    <button
                        class="${baseClass} ${intentClass} ${disabledClass}"
                        ${disabled ? 'disabled' : `onclick="${handler}"`}
                        title="${escapeHtml(action.label || action.type)}"
                    >
                        <i data-lucide="${escapeHtml(action.icon || 'zap')}" class="w-4 h-4"></i>
                    </button>
                `);
            });
        }
        
        if (actionButtons.length === 0) {
            return '<span class="text-xs text-gray-500">—</span>';
        }
        
        return actionButtons.join('');
    };

    const rowsHtml = tasks
        .map((task) => {
            const subtitle = task.subtitle ? `<div class="text-xs text-gray-400">${escapeHtml(task.subtitle)}</div>` : '';
            return `
                <tr class="border-b border-neutral-800 last:border-b-0">
                    <td class="py-3">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 ${escapeHtml(task.iconBackground || 'bg-neutral-800')} rounded-lg flex items-center justify-center">
                                <i data-lucide="${escapeHtml(task.icon || 'settings')}" class="w-4 h-4 text-white"></i>
                            </div>
                            <div>
                                <div class="text-sm font-semibold text-white">${escapeHtml(task.title || 'Task')}</div>
                                ${subtitle}
                            </div>
                        </div>
                    </td>
                    <td class="py-3 align-middle">
                        <span class="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded ${task.statusClass || 'bg-neutral-800 text-gray-300'}">
                            ${escapeHtml(task.statusLabel || 'Unknown')}
                        </span>
                    </td>
                    <td class="py-3 text-right align-middle">
                        <div class="inline-flex items-center gap-2">
                            ${actionsToHtml(task)}
                        </div>
                    </td>
                </tr>
            `;
        })
        .join('');

    body.innerHTML = rowsHtml;

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}
```

---

## Helper Functions

### `updateTokenDetailLinks(record)`
Updates social media and metadata links.

```7739:7760:webapp/real-trading-ui.js
function updateTokenDetailLinks(record = {}) {
    const websiteLink = document.getElementById('selected-token-website');
    const twitterLink = document.getElementById('selected-token-twitter');
    const telegramLink = document.getElementById('selected-token-telegram');
    const metadataLink = document.getElementById('selected-token-metadata');

    const setLink = (element, url) => {
        if (!element) return;
        if (url) {
            element.href = url;
            element.classList.remove('opacity-40', 'pointer-events-none');
        } else {
            element.href = '#';
            element.classList.add('opacity-40', 'pointer-events-none');
        }
    };

    setLink(websiteLink, record.website);
    setLink(twitterLink, record.twitter);
    setLink(telegramLink, record.telegram);
    setLink(metadataLink, record.metadataUri ? resolveMetadataUri(record.metadataUri) : null);
}
```

### `resyncTokenHoldings()`
Re-syncs token holdings data.

```7024:7042:webapp/real-trading-ui.js
function resyncTokenHoldings() {
    const current = tokenRegistry.current;
    if (!current) {
        notify('Select a token before syncing holdings.', 'warning');
        return;
    }

    if (current.type === 'draft') {
        notify('Launch the token before syncing holdings.', 'info');
        resetHoldingsTable({ message: 'Holdings will populate once the token is launched.' });
        return;
    }

    resetHoldingsTable({ message: 'Syncing wallet balances…', isLoading: true });
    loadLiveTokenDetail(current).catch((error) => {
        console.error('Unable to re-sync holdings:', error);
        notify(`Unable to re-sync holdings: ${error.message || error}`, 'error');
    });
}
```

---

## Event Handlers

### Navigation Handler (in `switchView`)
Ensures token detail data loads when navigating to the view.

```1041:1057:webapp/real-trading-ui.js
    if (viewName === 'token-detail') {
        // Ensure token detail data is loaded when navigating to this view
        if (tokenRegistry.current && tokenRegistry.current.mint) {
            const currentRecord = tokenRegistry.imported.get(tokenRegistry.current.mint) || tokenRegistry.current;
            if (currentRecord) {
                console.log('Loading token detail data for:', currentRecord.mint);
                loadLiveTokenDetail(currentRecord).catch(error => {
                    console.error('Failed to load token detail data:', error);
                    notify(`Unable to load token metrics: ${error.message || error}`, 'error');
                });
            } else {
                console.warn('Token detail view opened but no token record found');
            }
        } else {
            console.warn('Token detail view opened but no current token set');
        }
    }
```

---

## HTML Element IDs Reference

### Metrics
- `metric-profit-loss` - Total profit/loss display
- `metric-profit-loss-detail` - Profit/loss detail
- `metric-amount-invested` - Amount invested display
- `metric-amount-invested-detail` - Amount invested detail
- `metric-token-holdings` - Token holdings count
- `metric-token-holdings-detail` - Token holdings value
- `metric-holdings-value` - Value of holdings (SOL)
- `metric-holdings-value-detail` - Value of holdings (USD)
- `metric-amount-sold` - Amount sold display
- `metric-amount-sold-detail` - Amount sold detail
- `metric-price-per-token` - Price per token
- `metric-price-per-token-detail` - Price source
- `metric-market-cap` - Market cap display
- `metric-market-cap-detail` - Market cap detail
- `metric-bonding-percent` - Bonding curve percentage
- `metric-bonding-bar` - Bonding curve progress bar

### Token Info
- `selected-token-name` - Token name in breadcrumb
- `selected-token-title` - Token title
- `selected-token-subtitle` - Token symbol
- `selected-token-address` - Token mint address
- `selected-token-icon` - Token icon container
- `token-status` - Token status badge
- `selected-token-platform` - Launch platform badge
- `selected-token-copy` - Copy address button
- `selected-token-website` - Website link
- `selected-token-twitter` - Twitter link
- `selected-token-telegram` - Telegram link
- `selected-token-metadata` - Metadata link

### Buttons
- `prepare-launch-btn` - Prepare launch button
- `token-edit-btn` - Edit token button
- `token-collect-fees-btn` - Collect fees button
- `token-collect-creator-fees-btn` - Collect creator fees button
- `token-archive-btn` - Archive button

### Holdings
- `token-holdings-body` - Holdings table body
- `token-holdings-source-jito` - Jito source button
- `token-holdings-source-rpc` - RPC source button

### Tasks
- `token-tasks-body` - Tasks table body
- `token-tasks-empty` - Empty tasks state
- `token-tasks-table` - Tasks table wrapper
- `token-tasks-summary` - Tasks summary text

### Activity
- `token-activity-empty` - Empty activity state
- `token-activity-table` - Activity table wrapper
- `token-activity-body` - Activity table body

### Other
- `token-last-runtime` - Last runtime timestamp

---

## Data Flow

1. **User navigates to token detail** → `switchView('token-detail')` → calls `loadLiveTokenDetail()`
2. **Token selected** → `populateTokenDetailView(record)` → calls `loadLiveTokenDetail()`
3. **loadLiveTokenDetail()** fetches:
   - Token price data (Jupiter/Pump.fun)
   - Wallet holdings (on-chain)
   - Runtime automations (backend API)
   - Trade activity (Pump.fun API)
4. **Data updates**:
   - `updateTokenMetrics()` - Updates all metric displays
   - `renderTokenHoldingsTable()` - Updates holdings table
   - `renderTokenTaskList()` - Updates tasks list
   - `renderTokenActivity()` - Updates activity feed
5. **Real-time updates**:
   - `startTokenActivityStream()` - WebSocket for live trades
   - Periodic refresh via `loadLiveTokenDetail()`

---

## Notes

- All functions use `getElement(id)` helper which calls `document.getElementById(id)`
- Error handling is graceful - missing data shows "—" instead of breaking
- Pump.fun API errors (530/404) are expected and handled silently
- Metrics update even when some data sources fail
- Holdings source can be switched between Jito and RPC
- Activity stream uses WebSocket with polling fallback

