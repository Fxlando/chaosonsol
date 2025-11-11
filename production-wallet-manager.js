/**
 * Production-Ready Wallet Management System
 * Complete wallet operations with real-time monitoring
 */

const { Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ProductionWalletManager {
    constructor(solanaCore, config = {}) {
        this.solanaCore = solanaCore;
        this.config = {
            walletsFile: config.walletsFile || 'production-wallets.json',
            groupsFile: config.groupsFile || 'production-groups.json',
            maxWallets: config.maxWallets || 1000,
            autoBackup: config.autoBackup !== false,
            ...config
        };
        
        this.wallets = new Map();
        this.groups = new Map();
        this.walletStats = new Map();
        this.isInitialized = false;
        
        this.initialize();
    }

    async initialize() {
        console.log('👛 Initializing Wallet Manager...');
        
        await this.loadWallets();
        await this.loadGroups();
        await this.loadWalletStats();
        
        this.isInitialized = true;
        console.log(`✅ Wallet Manager Ready - ${this.wallets.size} wallets loaded`);
    }

    async loadWallets() {
        try {
            if (fs.existsSync(this.config.walletsFile)) {
                const data = JSON.parse(fs.readFileSync(this.config.walletsFile, 'utf8'));
                
                for (const wallet of data.wallets || []) {
                    this.wallets.set(wallet.address, {
                        address: wallet.address,
                        publicKey: wallet.publicKey,
                        privateKey: wallet.privateKey,
                        name: wallet.name || `Wallet ${wallet.address.slice(0, 8)}`,
                        group: wallet.group || 'default',
                        created: wallet.created || Date.now(),
                        lastUsed: wallet.lastUsed || Date.now(),
                        balance: wallet.balance || 0,
                        tokenBalances: wallet.tokenBalances || {},
                        isActive: wallet.isActive !== false,
                        metadata: wallet.metadata || {}
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load wallets:', error.message);
        }
    }

    normalizeGroupSettings(settings = {}) {
        const toNumber = (value, fallback) =>
            typeof value === 'number' && Number.isFinite(value) ? value : fallback;

        const normalized = {
            maxWallets: toNumber(settings.maxWallets, 100),
            slippage: toNumber(settings.slippage, 1.0),
            priorityFee: toNumber(settings.priorityFee, 1000),
            reserveBalance: toNumber(settings.reserveBalance, 0),
            allocation: toNumber(settings.allocation, 0.1),
            maxPerTrade: toNumber(settings.maxPerTrade, 0.5),
            minTrade: toNumber(settings.minTrade, 0.02),
            targetProfit: toNumber(settings.targetProfit, 0.25),
            stopLoss: toNumber(settings.stopLoss, 0.15),
            minBalance: toNumber(settings.minBalance, 0.05)
        };

        const rawAutoTrade = settings.autoTrade;
        let autoTrade;

        if (rawAutoTrade && typeof rawAutoTrade === 'object') {
            autoTrade = {
                enabled: rawAutoTrade.enabled !== false,
                minBalance: toNumber(rawAutoTrade.minBalance, normalized.minBalance),
                allocation: toNumber(rawAutoTrade.allocation, normalized.allocation),
                maxPerTrade: toNumber(rawAutoTrade.maxPerTrade, normalized.maxPerTrade),
                minTrade: toNumber(rawAutoTrade.minTrade, normalized.minTrade),
                targetProfit: toNumber(rawAutoTrade.targetProfit, normalized.targetProfit),
                stopLoss: toNumber(rawAutoTrade.stopLoss, normalized.stopLoss),
                reserveBalance: toNumber(rawAutoTrade.reserveBalance, normalized.reserveBalance),
                cooldownMs: toNumber(rawAutoTrade.cooldownMs, undefined)
            };
        } else {
            autoTrade = {
                enabled: Boolean(rawAutoTrade)
            };
        }

        normalized.autoTrade = autoTrade;
        return normalized;
    }

    async loadGroups() {
        try {
            if (fs.existsSync(this.config.groupsFile)) {
                const data = JSON.parse(fs.readFileSync(this.config.groupsFile, 'utf8'));
                
                for (const group of data.groups || []) {
                    this.groups.set(group.id, {
                        id: group.id,
                        name: group.name,
                        description: group.description || '',
                        wallets: group.wallets || [],
                        settings: this.normalizeGroupSettings(group.settings || {}),
                        created: group.created || Date.now(),
                        isActive: group.isActive !== false
                    });
                }
            }
        } catch (error) {
            console.warn('Failed to load groups:', error.message);
        }
    }

    async loadWalletStats() {
        try {
            const statsFile = 'wallet-stats.json';
            if (fs.existsSync(statsFile)) {
                const data = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
                
                for (const [address, stats] of Object.entries(data)) {
                    this.walletStats.set(address, stats);
                }
            }
        } catch (error) {
            console.warn('Failed to load wallet stats:', error.message);
        }
    }

    async saveWallets() {
        try {
            const walletsArray = Array.from(this.wallets.values());
            const data = {
                wallets: walletsArray,
                lastUpdated: Date.now(),
                version: '1.0.0'
            };
            
            fs.writeFileSync(this.config.walletsFile, JSON.stringify(data, null, 2));
            
            if (this.config.autoBackup) {
                const backupFile = `backup-${Date.now()}-wallets.json`;
                fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
            }
        } catch (error) {
            console.error('Failed to save wallets:', error.message);
        }
    }

    async saveGroups() {
        try {
            const groupsArray = Array.from(this.groups.values()).map(group => ({
                ...group,
                settings: this.normalizeGroupSettings(group.settings || {})
            }));
            const data = {
                groups: groupsArray,
                lastUpdated: Date.now(),
                version: '1.0.0'
            };
            
            fs.writeFileSync(this.config.groupsFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save groups:', error.message);
        }
    }

    async saveWalletStats() {
        try {
            const statsObject = Object.fromEntries(this.walletStats);
            fs.writeFileSync('wallet-stats.json', JSON.stringify(statsObject, null, 2));
        } catch (error) {
            console.error('Failed to save wallet stats:', error.message);
        }
    }

    generateWallet(name = null, group = 'default') {
        const keypair = Keypair.generate();
        const address = keypair.publicKey.toString();
        const privateKey = bs58.encode(keypair.secretKey);
        
        const wallet = {
            address: address,
            publicKey: address,
            privateKey: privateKey,
            name: name || `Wallet ${address.slice(0, 8)}`,
            group: group,
            created: Date.now(),
            lastUsed: Date.now(),
            balance: 0,
            tokenBalances: {},
            isActive: true,
            metadata: {
                generated: true,
                version: '1.0.0'
            }
        };
        
        this.wallets.set(address, wallet);
        this.saveWallets();
        
        return wallet;
    }

    importWallet(privateKey, name = null, group = 'default') {
        try {
            const secretKey = bs58.decode(privateKey);
            const keypair = Keypair.fromSecretKey(secretKey);
            const address = keypair.publicKey.toString();
            
            if (this.wallets.has(address)) {
                throw new Error('Wallet already exists');
            }
            
            const wallet = {
                address: address,
                publicKey: address,
                privateKey: privateKey,
                name: name || `Imported ${address.slice(0, 8)}`,
                group: group,
                created: Date.now(),
                lastUsed: Date.now(),
                balance: 0,
                tokenBalances: {},
                isActive: true,
                metadata: {
                    imported: true,
                    version: '1.0.0'
                }
            };
            
            this.wallets.set(address, wallet);
            this.saveWallets();
            
            return wallet;
        } catch (error) {
            throw new Error(`Invalid private key: ${error.message}`);
        }
    }

    getWallet(address) {
        return this.wallets.get(address) || null;
    }

    getAllWallets() {
        return Array.from(this.wallets.values());
    }

    getWalletsByGroup(groupId) {
        return Array.from(this.wallets.values()).filter(wallet => wallet.group === groupId);
    }

    getActiveWallets() {
        return Array.from(this.wallets.values()).filter(wallet => wallet.isActive);
    }

    async updateWalletBalance(address) {
        try {
            const wallet = this.wallets.get(address);
            if (!wallet) {
                throw new Error('Wallet not found');
            }
            
            const balanceInfo = await this.solanaCore.getSOLBalance(address);
            const tokenAccounts = await this.solanaCore.getTokenAccounts(address);
            
            wallet.balance = balanceInfo.balance;
            wallet.lastUsed = Date.now();
            
            // Update token balances
            wallet.tokenBalances = {};
            for (const tokenAccount of tokenAccounts) {
                wallet.tokenBalances[tokenAccount.mint] = {
                    amount: tokenAccount.amount,
                    decimals: tokenAccount.decimals,
                    uiAmount: tokenAccount.uiAmount
                };
            }
            
            this.wallets.set(address, wallet);
            this.saveWallets();
            
            return {
                address: address,
                solBalance: wallet.balance,
                tokenBalances: wallet.tokenBalances,
                success: true
            };
        } catch (error) {
            return {
                address: address,
                solBalance: 0,
                tokenBalances: {},
                success: false,
                error: error.message
            };
        }
    }

    async updateAllWalletBalances() {
        const results = [];
        const wallets = this.getActiveWallets();
        
        for (const wallet of wallets) {
            const result = await this.updateWalletBalance(wallet.address);
            results.push(result);
            
            // Add delay to avoid rate limiting
            await this.delay(100);
        }
        
        return results;
    }

    createGroup(id, name, description = '', settings = {}) {
        if (this.groups.has(id)) {
            throw new Error('Group already exists');
        }
        
        const group = {
            id: id,
            name: name,
            description: description,
            wallets: [],
            settings: this.normalizeGroupSettings(settings),
            created: Date.now(),
            isActive: true
        };
        
        this.groups.set(id, group);
        this.saveGroups();
        
        return group;
    }

    getGroup(id) {
        return this.groups.get(id) || null;
    }

    getAllGroups() {
        return Array.from(this.groups.values());
    }

    addWalletToGroup(walletAddress, groupId) {
        const wallet = this.wallets.get(walletAddress);
        const group = this.groups.get(groupId);
        
        if (!wallet) {
            throw new Error('Wallet not found');
        }
        
        if (!group) {
            throw new Error('Group not found');
        }
        
        if (group.wallets.includes(walletAddress)) {
            throw new Error('Wallet already in group');
        }
        
        group.wallets.push(walletAddress);
        wallet.group = groupId;
        
        this.groups.set(groupId, group);
        this.wallets.set(walletAddress, wallet);
        
        this.saveGroups();
        this.saveWallets();
        
        return true;
    }

    removeWalletFromGroup(walletAddress, groupId) {
        const group = this.groups.get(groupId);
        
        if (!group) {
            throw new Error('Group not found');
        }
        
        const index = group.wallets.indexOf(walletAddress);
        if (index === -1) {
            throw new Error('Wallet not in group');
        }
        
        group.wallets.splice(index, 1);
        this.groups.set(groupId, group);
        this.saveGroups();
        
        return true;
    }

    async getWalletStats(address) {
        let stats = this.walletStats.get(address);
        
        if (!stats) {
            stats = {
                address: address,
                totalTrades: 0,
                successfulTrades: 0,
                totalVolume: 0,
                totalFees: 0,
                profitLoss: 0,
                lastTrade: null,
                created: Date.now()
            };
            this.walletStats.set(address, stats);
        }
        
        return stats;
    }

    async updateWalletStats(address, tradeData) {
        const stats = await this.getWalletStats(address);
        
        stats.totalTrades++;
        if (tradeData.success) {
            stats.successfulTrades++;
        }
        
        stats.totalVolume += tradeData.volume || 0;
        stats.totalFees += tradeData.fees || 0;
        stats.profitLoss += tradeData.profitLoss || 0;
        stats.lastTrade = Date.now();
        
        this.walletStats.set(address, stats);
        this.saveWalletStats();
        
        return stats;
    }

    async getGroupStats(groupId) {
        const group = this.groups.get(groupId);
        if (!group) {
            throw new Error('Group not found');
        }
        
        const wallets = group.wallets.map(addr => this.wallets.get(addr)).filter(Boolean);
        const stats = {
            groupId: groupId,
            walletCount: wallets.length,
            totalBalance: 0,
            totalTrades: 0,
            successfulTrades: 0,
            totalVolume: 0,
            totalFees: 0,
            profitLoss: 0,
            activeWallets: 0
        };
        
        for (const wallet of wallets) {
            stats.totalBalance += wallet.balance || 0;
            if (wallet.isActive) {
                stats.activeWallets++;
            }
            
            const walletStats = await this.getWalletStats(wallet.address);
            stats.totalTrades += walletStats.totalTrades;
            stats.successfulTrades += walletStats.successfulTrades;
            stats.totalVolume += walletStats.totalVolume;
            stats.totalFees += walletStats.totalFees;
            stats.profitLoss += walletStats.profitLoss;
        }
        
        return stats;
    }

    async searchWallets(query) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        for (const wallet of this.wallets.values()) {
            if (
                wallet.address.toLowerCase().includes(queryLower) ||
                wallet.name.toLowerCase().includes(queryLower) ||
                wallet.group.toLowerCase().includes(queryLower)
            ) {
                results.push(wallet);
            }
        }
        
        return results;
    }

    async filterWallets(filters = {}) {
        let wallets = Array.from(this.wallets.values());
        
        if (filters.group) {
            wallets = wallets.filter(w => w.group === filters.group);
        }
        
        if (filters.isActive !== undefined) {
            wallets = wallets.filter(w => w.isActive === filters.isActive);
        }
        
        if (filters.minBalance !== undefined) {
            wallets = wallets.filter(w => (w.balance || 0) >= filters.minBalance);
        }
        
        if (filters.maxBalance !== undefined) {
            wallets = wallets.filter(w => (w.balance || 0) <= filters.maxBalance);
        }
        
        if (filters.hasTokens) {
            wallets = wallets.filter(w => Object.keys(w.tokenBalances || {}).length > 0);
        }
        
        return wallets;
    }

    async sortWallets(wallets, sortBy = 'balance', direction = 'desc') {
        return wallets.sort((a, b) => {
            let aValue, bValue;
            
            switch (sortBy) {
                case 'balance':
                    aValue = a.balance || 0;
                    bValue = b.balance || 0;
                    break;
                case 'name':
                    aValue = a.name.toLowerCase();
                    bValue = b.name.toLowerCase();
                    break;
                case 'created':
                    aValue = a.created || 0;
                    bValue = b.created || 0;
                    break;
                case 'lastUsed':
                    aValue = a.lastUsed || 0;
                    bValue = b.lastUsed || 0;
                    break;
                default:
                    aValue = a[sortBy] || 0;
                    bValue = b[sortBy] || 0;
            }
            
            if (direction === 'asc') {
                return aValue > bValue ? 1 : -1;
            } else {
                return aValue < bValue ? 1 : -1;
            }
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Export/Import functionality
    exportWallets(password = null) {
        const walletsArray = Array.from(this.wallets.values());
        const data = {
            wallets: walletsArray,
            groups: Array.from(this.groups.values()),
            exported: Date.now(),
            version: '1.0.0'
        };
        
        if (password) {
            const cipher = crypto.createCipher('aes-256-cbc', password);
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return encrypted;
        }
        
        return JSON.stringify(data, null, 2);
    }

    importWallets(data, password = null) {
        try {
            let parsedData;
            
            if (password) {
                const decipher = crypto.createDecipher('aes-256-cbc', password);
                let decrypted = decipher.update(data, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                parsedData = JSON.parse(decrypted);
            } else {
                parsedData = JSON.parse(data);
            }
            
            // Import wallets
            for (const wallet of parsedData.wallets || []) {
                this.wallets.set(wallet.address, wallet);
            }
            
            // Import groups
            for (const group of parsedData.groups || []) {
                this.groups.set(group.id, group);
            }
            
            this.saveWallets();
            this.saveGroups();
            
            return {
                walletsImported: parsedData.wallets?.length || 0,
                groupsImported: parsedData.groups?.length || 0,
                success: true
            };
        } catch (error) {
            return {
                walletsImported: 0,
                groupsImported: 0,
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = { ProductionWalletManager };
