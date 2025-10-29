/**
 * Wallet Group Manager
 * Manages wallet groups for organized trading operations
 */

const { Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

class WalletGroupManager {
  constructor(connection) {
    this.connection = connection;
    this.groups = new Map();
    this.configFile = path.join(__dirname, 'groups-config.json');
    this.loadGroups();
  }

  /**
   * Load groups from configuration file
   */
  loadGroups() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const config = JSON.parse(data);
        
        for (const [groupId, groupData] of Object.entries(config.groups || {})) {
          this.groups.set(groupId, {
            id: groupId,
            name: groupData.name,
            description: groupData.description,
            wallets: groupData.wallets || [],
            settings: groupData.settings || {},
            createdAt: groupData.createdAt || Date.now(),
            updatedAt: groupData.updatedAt || Date.now()
          });
        }
        
        console.log(`✅ Loaded ${this.groups.size} wallet groups`);
      } else {
        this.createDefaultGroups();
      }
    } catch (error) {
      console.error('❌ Error loading wallet groups:', error.message);
      this.createDefaultGroups();
    }
  }

  /**
   * Create default wallet groups
   */
  createDefaultGroups() {
    const defaultGroups = {
      'volume': {
        name: 'Volume Trading',
        description: 'Wallets for volume generation',
        wallets: [],
        settings: {
          maxAmount: 0.01,
          minAmount: 0.001,
          delayBetween: 3000
        }
      },
      'pumpfun': {
        name: 'Pump.fun Launch',
        description: 'Wallets for pump.fun token launches',
        wallets: [],
        settings: {
          maxAmount: 0.05,
          minAmount: 0.005,
          delayBetween: 2000
        }
      }
    };

    for (const [groupId, groupData] of Object.entries(defaultGroups)) {
      this.groups.set(groupId, {
        id: groupId,
        ...groupData,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    this.saveGroups();
  }

  /**
   * Save groups to configuration file
   */
  saveGroups() {
    try {
      const config = {
        groups: {}
      };

      for (const [groupId, group] of this.groups) {
        config.groups[groupId] = {
          name: group.name,
          description: group.description,
          wallets: group.wallets,
          settings: group.settings,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt
        };
      }

      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      console.log('✅ Wallet groups saved to configuration');
    } catch (error) {
      console.error('❌ Error saving wallet groups:', error.message);
    }
  }

  /**
   * Create a new wallet group
   */
  createGroup(name, description, settings = {}) {
    const groupId = name.toLowerCase().replace(/\s+/g, '-');
    
    if (this.groups.has(groupId)) {
      throw new Error(`Group '${name}' already exists`);
    }

    const group = {
      id: groupId,
      name,
      description,
      wallets: [],
      settings: {
        maxAmount: 0.01,
        minAmount: 0.001,
        delayBetween: 3000,
        ...settings
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.groups.set(groupId, group);
    this.saveGroups();
    
    console.log(`✅ Created wallet group: ${name}`);
    return group;
  }

  /**
   * Get a wallet group by ID
   */
  getGroup(groupId) {
    return this.groups.get(groupId);
  }

  /**
   * Get all wallet groups
   */
  getAllGroups() {
    const result = {};
    for (const [groupId, group] of this.groups) {
      result[groupId] = { ...group };
    }
    return result;
  }

  /**
   * Add wallet to group
   */
  addWalletToGroup(groupId, walletData) {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group '${groupId}' not found`);
    }

    // Generate keypair if not provided
    let keypair;
    if (walletData.privateKey) {
      keypair = Keypair.fromSecretKey(new Uint8Array(walletData.privateKey));
    } else {
      keypair = Keypair.generate();
    }

    const wallet = {
      id: walletData.id || `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: walletData.name || `Wallet_${group.wallets.length + 1}`,
      publicKey: keypair.publicKey.toString(),
      privateKey: Array.from(keypair.secretKey),
      groupId: groupId,
      status: 'active',
      createdAt: Date.now(),
      ...walletData
    };

    group.wallets.push(wallet);
    group.updatedAt = Date.now();
    this.saveGroups();

    console.log(`✅ Added wallet to group ${groupId}: ${wallet.name}`);
    return wallet;
  }

  /**
   * Remove wallet from group
   */
  removeWalletFromGroup(groupId, walletId) {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group '${groupId}' not found`);
    }

    const walletIndex = group.wallets.findIndex(w => w.id === walletId);
    if (walletIndex === -1) {
      throw new Error(`Wallet '${walletId}' not found in group`);
    }

    const removedWallet = group.wallets.splice(walletIndex, 1)[0];
    group.updatedAt = Date.now();
    this.saveGroups();

    console.log(`✅ Removed wallet from group ${groupId}: ${removedWallet.name}`);
    return removedWallet;
  }

  /**
   * Generate multiple wallets for a group
   */
  generateWalletsForGroup(groupId, count, walletNames = []) {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group '${groupId}' not found`);
    }

    const wallets = [];
    for (let i = 0; i < count; i++) {
      const keypair = Keypair.generate();
      const walletName = walletNames[i] || `${group.name}_${group.wallets.length + i + 1}`;
      
      const wallet = {
        id: `wallet_${Date.now()}_${i}`,
        name: walletName,
        publicKey: keypair.publicKey.toString(),
        privateKey: Array.from(keypair.secretKey),
        groupId: groupId,
        status: 'active',
        createdAt: Date.now()
      };

      group.wallets.push(wallet);
      wallets.push(wallet);
    }

    group.updatedAt = Date.now();
    this.saveGroups();

    console.log(`✅ Generated ${count} wallets for group ${groupId}`);
    return wallets;
  }

  /**
   * Get wallets by group ID
   */
  getWalletsByGroup(groupId) {
    const group = this.groups.get(groupId);
    return group ? group.wallets : [];
  }

  /**
   * Update group settings
   */
  updateGroupSettings(groupId, settings) {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group '${groupId}' not found`);
    }

    group.settings = { ...group.settings, ...settings };
    group.updatedAt = Date.now();
    this.saveGroups();

    console.log(`✅ Updated settings for group ${groupId}`);
    return group;
  }

  /**
   * Delete a wallet group
   */
  deleteGroup(groupId) {
    if (!this.groups.has(groupId)) {
      throw new Error(`Group '${groupId}' not found`);
    }

    const group = this.groups.get(groupId);
    this.groups.delete(groupId);
    this.saveGroups();

    console.log(`✅ Deleted wallet group: ${group.name}`);
    return group;
  }

  /**
   * Get wallet by public key
   */
  getWalletByPublicKey(publicKey) {
    for (const [groupId, group] of this.groups) {
      const wallet = group.wallets.find(w => w.publicKey === publicKey);
      if (wallet) {
        return { ...wallet, groupId };
      }
    }
    return null;
  }

  /**
   * Get all wallets across all groups
   */
  getAllWallets() {
    const allWallets = [];
    for (const [groupId, group] of this.groups) {
      for (const wallet of group.wallets) {
        allWallets.push({ ...wallet, groupId });
      }
    }
    return allWallets;
  }

  /**
   * Export wallets for a group
   */
  exportGroupWallets(groupId, format = 'json') {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group '${groupId}' not found`);
    }

    if (format === 'csv') {
      const csv = [
        ['Name', 'Public Key', 'Private Key', 'Status', 'Created At'],
        ...group.wallets.map(wallet => [
          wallet.name,
          wallet.publicKey,
          wallet.privateKey.join(','),
          wallet.status,
          new Date(wallet.createdAt).toISOString()
        ])
      ].map(row => row.join(',')).join('\n');

      return csv;
    }

    return group.wallets;
  }

  /**
   * Get group statistics
   */
  getGroupStats(groupId) {
    const group = this.groups.get(groupId);
    if (!group) {
      return null;
    }

    const activeWallets = group.wallets.filter(w => w.status === 'active').length;
    const totalWallets = group.wallets.length;

    return {
      groupId,
      name: group.name,
      totalWallets,
      activeWallets,
      inactiveWallets: totalWallets - activeWallets,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    };
  }

  /**
   * Get all group statistics
   */
  getAllGroupStats() {
    const stats = [];
    for (const [groupId, group] of this.groups) {
      stats.push(this.getGroupStats(groupId));
    }
    return stats;
  }
}

module.exports = { WalletGroupManager };