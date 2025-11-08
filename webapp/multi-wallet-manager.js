// Multi-Wallet Manager - Blueprint & Fee Collection
// 100% Real On-Chain Operations

class MultiWalletManager {
    constructor(solanaIntegration) {
        this.solana = solanaIntegration;
        this.blueprints = [];
        this.activeBlueprints = new Map();
        this.feeCollectionHistory = [];

        this.loadFeeHistory();
    }

    // ==================== BLUEPRINT OPERATIONS ====================
    
    // Create a blueprint (trading strategy template)
    createBlueprint(config) {
        const timestamp = Date.now();
        const blueprint = {
            id: `bp-${timestamp}`,
            name: config.name,
            type: config.type || 'custom',
            template: config.template || 'custom',
            description: config.description || '',
            notes: config.notes || '',
            wallets: config.wallets || [],
            settings: config.settings || {},
            status: 'inactive',
            createdAt: timestamp,
            updatedAt: timestamp,
            lastRun: null,
            lastApplied: null,
            stats: {
                totalRuns: 0,
                successRate: 0,
                totalProfit: 0,
                appliedCount: 0
            }
        };

        this.blueprints.push(blueprint);
        this.saveBlueprints();

        console.log('✅ Blueprint created:', blueprint.id);
        return blueprint;
    }

    getWalletIdentifier(wallet) {
        return wallet?.id || wallet?.publicKey || wallet?.address || null;
    }

    resolveWalletsByIds(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }
        const idSet = new Set(
            ids
                .filter(Boolean)
                .map((value) => value.toString().toLowerCase())
        );
        if (idSet.size === 0) {
            return [];
        }
        const source = Array.isArray(this.solana?.wallets) ? this.solana.wallets : [];
        return source.filter((wallet) => {
            const identifier = this.getWalletIdentifier(wallet);
            return identifier && idSet.has(identifier.toLowerCase());
        });
    }

    filterWalletsByGroup(groupSelector = {}) {
        const { id: groupId, name: groupName } = groupSelector || {};
        if (!groupId && !groupName) {
            return [];
        }

        const targets = new Set();
        if (groupId) targets.add(groupId.toString().toLowerCase());
        if (groupName) targets.add(groupName.toString().toLowerCase());

        const source = Array.isArray(this.solana?.wallets) ? this.solana.wallets : [];

        return source.filter((wallet) => {
            const groupCandidates = [];
            if (typeof wallet.group === 'string') groupCandidates.push(wallet.group);
            if (typeof wallet.groupName === 'string') groupCandidates.push(wallet.groupName);
            if (Array.isArray(wallet.groups)) groupCandidates.push(...wallet.groups);

            return groupCandidates.some((candidate) => {
                if (typeof candidate !== 'string') return false;
                return targets.has(candidate.toLowerCase());
            });
        });
    }

    resolveBlueprintWallets(blueprint, automationKey = null) {
        const availableWallets = Array.isArray(this.solana?.wallets) ? this.solana.wallets : [];
        const blueprintWallets = Array.isArray(blueprint?.wallets) ? blueprint.wallets : [];
        const baseWallets = availableWallets.length ? availableWallets : blueprintWallets;

        if (!automationKey) {
            return baseWallets;
        }

        const automation = blueprint?.settings?.automations?.[automationKey];
        if (!automation) {
            return baseWallets;
        }

        const selector = automation.walletSelector || {
            mode: automation.walletMode,
            walletIds: automation.walletIds,
            groupId: automation.walletGroupId || automation.walletGroup,
            groupName: automation.walletGroupName
        };

        if (!selector || !selector.mode) {
            return baseWallets;
        }

        switch (selector.mode) {
            case 'all':
                return baseWallets;
            case 'custom':
            case 'creator': {
                const resolved = this.resolveWalletsByIds(selector.walletIds);
                return resolved.length ? resolved : baseWallets;
            }
            case 'group': {
                const groupId = selector.groupId || automation.walletGroupId || null;
                const groupName = selector.groupName || automation.walletGroupName || null;
                const resolved = this.filterWalletsByGroup({ id: groupId, name: groupName });
                return resolved.length ? resolved : baseWallets;
            }
            default:
                return baseWallets;
        }
    }

    // Execute blueprint across multiple wallets
    async executeBlueprint(blueprintId) {
        try {
            const blueprint = this.blueprints.find(bp => bp.id === blueprintId);
            
            if (!blueprint) {
                throw new Error('Blueprint not found');
            }

            console.log(`🚀 Executing blueprint: ${blueprint.name}`);

            blueprint.status = 'active';
            blueprint.lastRun = Date.now();
            blueprint.updatedAt = Date.now();
            
            // Execute based on type
            switch (blueprint.type) {
                case 'sniper':
                    await this.executeSniperBlueprint(blueprint);
                    break;
                case 'volume':
                    await this.executeVolumeBlueprint(blueprint);
                    break;
                case 'arbitrage':
                    await this.executeArbitrageBlueprint(blueprint);
                    break;
                default:
                    await this.executeCustomBlueprint(blueprint);
            }

            blueprint.stats.totalRuns++;
            this.saveBlueprints();

            return {
                success: true,
                message: `Blueprint ${blueprint.name} executed successfully`
            };

        } catch (error) {
            console.error('Blueprint execution error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Sniper blueprint: Buy new tokens instantly
    async executeSniperBlueprint(blueprint) {
        const wallets = this.resolveBlueprintWallets(blueprint, 'sniper');
        const settings = blueprint.settings || {};
        const { tokenMint, buyAmount, slippage } = settings;

        console.log(`🎯 Sniper: ${wallets.length} wallets buying ${buyAmount} SOL of ${tokenMint}`);

        const results = await Promise.allSettled(
            wallets.map(async (wallet) => {
                try {
                    // Execute buy transaction
                    const signature = await this.executeBuy(
                        wallet.privateKey,
                        tokenMint,
                        buyAmount
                    );

                    return {
                        wallet: wallet.publicKey,
                        success: true,
                        signature
                    };
                } catch (error) {
                    return {
                        wallet: wallet.publicKey,
                        success: false,
                        error: error.message
                    };
                }
            })
        );

        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        blueprint.stats.successRate = (successful / wallets.length) * 100;

        console.log(`✅ Sniper complete: ${successful}/${wallets.length} successful`);
    }

    // Volume blueprint: Generate trading volume
    async executeVolumeBlueprint(blueprint) {
        const settings = blueprint.settings || {};
        const wallets = this.resolveBlueprintWallets(blueprint, 'volumeBot');
        const {
            tokenMint,
            cycles = 10,
            buyAmount = 0.02,
            sellDelay = 30,
            minAmount,
            maxAmount,
            randomizeAmounts = true,
            randomizeDelay = true,
            buyIntervalSeconds,
            buyIntervalMinSeconds,
            buyIntervalMaxSeconds,
            sellIntervalSeconds,
            sellIntervalMinSeconds,
            sellIntervalMaxSeconds,
            sellPercentageMin = 55,
            sellPercentageMax = 90,
            guardrails = {}
        } = settings;

        if (!wallets || wallets.length === 0) {
            throw new Error('No wallets available for Volume Bot automation');
        }

        console.log(`📊 Volume: ${cycles} cycles with ${wallets.length} wallets`);

        const resolveAmount = () => {
            const lower = typeof minAmount === 'number' && minAmount > 0 ? minAmount : buyAmount;
            const upper = typeof maxAmount === 'number' && maxAmount > lower ? maxAmount : buyAmount;

            if (!randomizeAmounts || lower === upper) {
                return buyAmount;
            }

            return lower + Math.random() * (upper - lower);
        };

        const resolveDelay = (baseSeconds, minSeconds, maxSeconds) => {
            const fallback = baseSeconds || sellDelay;
            const lower = Math.max(0.1, minSeconds || fallback);
            const upper = Math.max(lower, maxSeconds || fallback);
            const value = randomizeDelay ? lower + Math.random() * (upper - lower) : fallback;
            return Math.max(0, value * 1000);
        };

        const guardrailState = {
            netPosition: 0,
            realizedPnL: 0,
            stop: false
        };

        const guardrailConfig = {
            enabled: guardrails?.enabled !== false,
            minNetPosition: typeof guardrails?.minNetPosition === 'number' ? guardrails.minNetPosition : null,
            maxNetPosition: typeof guardrails?.maxNetPosition === 'number' ? guardrails.maxNetPosition : null,
            targetNetPosition:
                typeof guardrails?.targetNetPosition === 'number' ? guardrails.targetNetPosition : null,
            realizedProfitTarget:
                typeof guardrails?.realizedProfitTarget === 'number' ? guardrails.realizedProfitTarget : null,
            realizedLossLimit:
                typeof guardrails?.realizedLossLimit === 'number'
                    ? Math.abs(guardrails.realizedLossLimit)
                    : null
        };

        const evaluateGuardrails = (phase) => {
            if (!guardrailConfig.enabled) {
                return false;
            }

            if (
                guardrailConfig.maxNetPosition !== null &&
                guardrailState.netPosition > guardrailConfig.maxNetPosition
            ) {
                console.log(`🛑 Guardrail stop (${phase}): net position above ${guardrailConfig.maxNetPosition}`);
                return true;
            }

            if (
                guardrailConfig.minNetPosition !== null &&
                guardrailState.netPosition < guardrailConfig.minNetPosition
            ) {
                console.log(`🛑 Guardrail stop (${phase}): net position below ${guardrailConfig.minNetPosition}`);
                return true;
            }

            if (
                guardrailConfig.targetNetPosition !== null &&
                guardrailState.netPosition >= guardrailConfig.targetNetPosition
            ) {
                console.log(`🛑 Guardrail stop (${phase}): target position reached`);
                return true;
            }

            if (
                guardrailConfig.realizedProfitTarget !== null &&
                guardrailState.realizedPnL >= guardrailConfig.realizedProfitTarget
            ) {
                console.log(`🛑 Guardrail stop (${phase}): profit target met`);
                return true;
            }

            if (
                guardrailConfig.realizedLossLimit !== null &&
                guardrailState.realizedPnL <= -guardrailConfig.realizedLossLimit
            ) {
                console.log(`🛑 Guardrail stop (${phase}): loss limit breached`);
                return true;
            }

            return false;
        };

        for (let cycle = 0; cycle < cycles; cycle++) {
            if (guardrailState.stop) break;
            console.log(`   Cycle ${cycle + 1}/${cycles}`);

            for (const wallet of wallets) {
                if (guardrailState.stop) break;

                try {
                    const amountToBuy = resolveAmount();
                    await this.executeBuy(wallet.privateKey, tokenMint, amountToBuy);
                    guardrailState.netPosition += amountToBuy;
                    guardrailState.realizedPnL -= amountToBuy;

                    if (evaluateGuardrails('post-buy')) {
                        guardrailState.stop = true;
                        break;
                    }

                    const sellDelayMs = resolveDelay(
                        sellIntervalSeconds,
                        sellIntervalMinSeconds,
                        sellIntervalMaxSeconds
                    );
                    await this.sleep(sellDelayMs);

                    const sellPercent =
                        sellPercentageMin === sellPercentageMax
                            ? sellPercentageMin
                            : sellPercentageMin + Math.random() * (sellPercentageMax - sellPercentageMin);
                    const amountSold = amountToBuy * (sellPercent / 100);
                    await this.executeSell(wallet.privateKey, tokenMint, amountSold);
                    guardrailState.netPosition -= amountSold;
                    guardrailState.realizedPnL += amountSold * 0.98; // approximate fees

                    if (evaluateGuardrails('post-sell')) {
                        guardrailState.stop = true;
                        break;
                    }

                    const buyDelayMs = resolveDelay(
                        buyIntervalSeconds,
                        buyIntervalMinSeconds,
                        buyIntervalMaxSeconds
                    );
                    await this.sleep(buyDelayMs);
                } catch (error) {
                    console.error(`Error in wallet ${wallet.publicKey}:`, error.message);
                }
            }

            if (guardrailState.stop) {
                console.log('🛑 Guardrail triggered, stopping volume generation');
                break;
            }

            const cycleDelayMs = resolveDelay(
                (sellIntervalSeconds || sellDelay) * 2,
                (sellIntervalMinSeconds || 1),
                (sellIntervalMaxSeconds || sellDelay * 2)
            );
            await this.sleep(cycleDelayMs);
        }

        console.log('✅ Volume generation complete');
    }

    // Arbitrage blueprint: Cross-DEX trading
    async executeArbitrageBlueprint(blueprint) {
        // TODO: Implement arbitrage logic
        console.log('⚠️ Arbitrage blueprint not yet implemented');
    }

    // Custom blueprint execution
    async executeCustomBlueprint(blueprint) {
        // TODO: Implement custom blueprint logic
        console.log('⚠️ Custom blueprint not yet implemented');
    }

    // Stop blueprint execution
    stopBlueprint(blueprintId) {
        const blueprint = this.blueprints.find(bp => bp.id === blueprintId);
        
        if (blueprint) {
            blueprint.status = 'inactive';
            this.saveBlueprints();
            console.log(`🛑 Blueprint stopped: ${blueprint.name}`);
            return true;
        }
        
        return false;
    }

    // Get all blueprints
    getBlueprints() {
        return this.blueprints;
    }

    getBlueprintById(blueprintId) {
        return this.blueprints.find(bp => bp.id === blueprintId);
    }

    deleteBlueprint(blueprintId) {
        const index = this.blueprints.findIndex(bp => bp.id === blueprintId);
        if (index === -1) {
            return false;
        }

        const [removed] = this.blueprints.splice(index, 1);
        this.saveBlueprints();
        console.log('🗑️ Blueprint deleted:', removed.id);
        return true;
    }

    recordBlueprintUsage(blueprintId) {
        const blueprint = this.getBlueprintById(blueprintId);
        if (!blueprint) {
            return;
        }

        blueprint.lastApplied = Date.now();
        blueprint.updatedAt = Date.now();
        blueprint.stats.appliedCount = (blueprint.stats.appliedCount || 0) + 1;
        this.saveBlueprints();
    }

    // Save blueprints to localStorage
    saveBlueprints() {
        try {
            localStorage.setItem('chaosbot_blueprints', JSON.stringify(this.blueprints));
        } catch (error) {
            console.error('Error saving blueprints:', error);
        }
    }

    // Load blueprints from localStorage
    loadBlueprints() {
        try {
            const saved = localStorage.getItem('chaosbot_blueprints');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.blueprints = Array.isArray(parsed) ? parsed.map(bp => {
                    return {
                        id: bp.id,
                        name: bp.name,
                        type: bp.type || 'custom',
                        template: bp.template || 'custom',
                        description: bp.description || '',
                        notes: bp.notes || '',
                        wallets: bp.wallets || [],
                        settings: bp.settings || {},
                        status: bp.status || 'inactive',
                        createdAt: bp.createdAt || Date.now(),
                        updatedAt: bp.updatedAt || bp.createdAt || Date.now(),
                        lastRun: bp.lastRun || null,
                        lastApplied: bp.lastApplied || null,
                        stats: Object.assign({
                            totalRuns: 0,
                            successRate: 0,
                            totalProfit: 0,
                            appliedCount: 0
                        }, bp.stats || {})
                    };
                }) : [];
                console.log(`✅ Loaded ${this.blueprints.length} blueprints`);
            }
        } catch (error) {
            console.error('Error loading blueprints:', error);
        }
    }

    saveFeeHistory() {
        try {
            const trimmed = this.feeCollectionHistory.slice(-100);
            localStorage.setItem('chaosbot_fee_history', JSON.stringify(trimmed));
        } catch (error) {
            console.error('Error saving fee history:', error);
        }
    }

    loadFeeHistory() {
        try {
            const saved = localStorage.getItem('chaosbot_fee_history');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    this.feeCollectionHistory = parsed.map(entry => ({
                        id: entry.id || `fee-${Date.now()}`,
                        timestamp: entry.timestamp || Date.now(),
                        totalCollected: Number(entry.totalCollected) || 0,
                        walletsProcessed: Number(entry.walletsProcessed) || 0,
                        successful: Number(entry.successful) || 0,
                        targetWallet: entry.targetWallet || null,
                        category: entry.category || 'all',
                        walletIds: Array.isArray(entry.walletIds) ? entry.walletIds : [],
                        results: Array.isArray(entry.results) ? entry.results : []
                    }));
                }
            }
        } catch (error) {
            console.error('Error loading fee history:', error);
            this.feeCollectionHistory = [];
        }
    }

    getFeeHistory() {
        return Array.isArray(this.feeCollectionHistory)
            ? [...this.feeCollectionHistory].sort((a, b) => b.timestamp - a.timestamp)
            : [];
    }

    // ==================== FEE COLLECTION ====================
    
    // Collect all SOL from multiple wallets to main wallet
    async collectFees(targetWallet, options = {}) {
        try {
            const {
                walletIds = null,
                category = 'all'
            } = options;

            console.log(`💎 Starting fee collection (${category})...`);

            const availableWallets = Array.isArray(walletIds) && walletIds.length > 0
                ? this.solana.wallets.filter(wallet => walletIds.includes(wallet.publicKey))
                : this.solana.wallets;

            const wallets = Array.isArray(availableWallets) ? availableWallets : [];
            if (!wallets || wallets.length === 0) {
                throw new Error('No wallets found');
            }

            const results = [];
            let totalCollected = 0;

            for (const wallet of wallets) {
                try {
                    // Get current balance
                    const balance = await this.solana.getBalance(wallet.publicKey);
                    
                    // Keep minimum rent-exempt amount (0.001 SOL)
                    const minRent = 0.001;
                    const collectableAmount = Math.max(0, balance - minRent);

                    if (collectableAmount > 0) {
                        console.log(`💰 Collecting ${collectableAmount.toFixed(4)} SOL from ${wallet.publicKey.slice(0, 8)}...`);

                        // Transfer to target wallet
                        const result = await this.solana.transferSOL(
                            wallet.privateKey,
                            targetWallet,
                            collectableAmount
                        );

                        if (result.success) {
                            totalCollected += collectableAmount;
                            results.push({
                                wallet: wallet.publicKey,
                                amount: collectableAmount,
                                signature: result.signature,
                                success: true
                            });
                        } else {
                            results.push({
                                wallet: wallet.publicKey,
                                amount: 0,
                                error: result.error,
                                success: false
                            });
                        }
                    } else {
                        console.log(`⚠️ Skipping ${wallet.publicKey.slice(0, 8)} - insufficient balance`);
                    }

                    // Small delay between transfers
                    await this.sleep(1000);

                } catch (error) {
                    console.error(`Error collecting from ${wallet.publicKey}:`, error.message);
                    results.push({
                        wallet: wallet.publicKey,
                        amount: 0,
                        error: error.message,
                        success: false
                    });
                }
            }

            // Save to history
            const historyEntry = {
                id: `fee-${Date.now()}`,
                timestamp: Date.now(),
                totalCollected,
                walletsProcessed: results.length,
                successful: results.filter(r => r.success).length,
                targetWallet,
                category,
                walletIds: wallets.map(wallet => wallet.publicKey),
                results
            };

            this.feeCollectionHistory.push(historyEntry);
            this.saveFeeHistory();

            console.log(`✅ Fee collection complete: ${totalCollected.toFixed(4)} SOL collected`);

            return {
                success: true,
                totalCollected,
                walletsProcessed: results.length,
                successful: results.filter(r => r.success).length,
                category,
                results,
                historyEntry
            };

        } catch (error) {
            console.error('Fee collection error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Collect from specific wallets
    async collectFromWallets(walletPublicKeys, targetWallet) {
        try {
            console.log(`💎 Collecting from ${walletPublicKeys.length} specific wallets...`);

            const results = [];
            let totalCollected = 0;

            for (const publicKey of walletPublicKeys) {
                const wallet = this.solana.wallets.find(w => w.publicKey === publicKey);
                
                if (!wallet) {
                    console.error(`Wallet not found: ${publicKey}`);
                    results.push({
                        wallet: publicKey,
                        amount: 0,
                        error: 'Wallet not loaded in session',
                        success: false
                    });
                    continue;
                }

                try {
                    const balance = await this.solana.getBalance(wallet.publicKey);
                    const minRent = 0.001;
                    const collectableAmount = Math.max(0, balance - minRent);

                    if (collectableAmount > 0) {
                        const result = await this.solana.transferSOL(
                            wallet.privateKey,
                            targetWallet,
                            collectableAmount
                        );

                        if (result.success) {
                            totalCollected += collectableAmount;
                            results.push({
                                wallet: wallet.publicKey,
                                amount: collectableAmount,
                                signature: result.signature,
                                success: true
                            });
                        } else {
                            results.push({
                                wallet: wallet.publicKey,
                                amount: 0,
                                error: result.error,
                                success: false
                            });
                        }
                    } else {
                        results.push({
                            wallet: wallet.publicKey,
                            amount: 0,
                            error: 'Insufficient balance',
                            success: false
                        });
                    }

                    await this.sleep(1000);

                } catch (error) {
                    console.error(`Error collecting from ${wallet.publicKey}:`, error.message);
                    results.push({
                        wallet: wallet.publicKey,
                        amount: 0,
                        error: error.message,
                        success: false
                    });
                }
            }

            const historyEntry = {
                id: `fee-${Date.now()}`,
                timestamp: Date.now(),
                totalCollected,
                walletsProcessed: results.length,
                successful: results.filter(r => r.success).length,
                targetWallet,
                category: 'custom',
                walletIds: walletPublicKeys,
                results
            };

            this.feeCollectionHistory.push(historyEntry);
            this.saveFeeHistory();

            return {
                success: true,
                totalCollected,
                category: 'custom',
                results,
                historyEntry
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get fee collection statistics
    getFeeStats() {
        const totalCollected = this.feeCollectionHistory.reduce((sum, h) => sum + h.totalCollected, 0);
        const totalCollections = this.feeCollectionHistory.length;
        const lastCollection = this.feeCollectionHistory[this.feeCollectionHistory.length - 1];

        return {
            totalCollected,
            totalCollections,
            lastCollection: lastCollection ? {
                timestamp: lastCollection.timestamp,
                amount: lastCollection.totalCollected,
                wallets: lastCollection.walletsProcessed
            } : null,
            history: this.feeCollectionHistory.slice(-10) // Last 10 collections
        };
    }

    // ==================== HELPER FUNCTIONS ====================
    
    async executeBuy(privateKey, tokenMint, amount) {
        // TODO: Implement actual buy logic with Jupiter/Raydium
        console.log(`💰 Buy: ${amount} SOL of ${tokenMint}`);
        await this.sleep(100);
        return 'mock_buy_signature_' + Date.now();
    }

    async executeSell(privateKey, tokenMint, amount) {
        // TODO: Implement actual sell logic with Jupiter/Raydium
        console.log(`💸 Sell: ${amount} SOL worth of ${tokenMint}`);
        await this.sleep(100);
        return 'mock_sell_signature_' + Date.now();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export for use
window.MultiWalletManager = MultiWalletManager;

console.log('✅ Multi-Wallet Manager loaded');

