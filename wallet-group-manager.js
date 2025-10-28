const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const crypto = require('crypto');

class WalletGroupManager {
  constructor(connection, walletsFilePath = './wallets.json', groupsConfigPath = './groups-config.json') {
    this.connection = connection;
    this.walletsFilePath = walletsFilePath;
    this.groupsConfigPath = groupsConfigPath;
    this.wallets = this.loadWallets();
    this.groupsConfig = this.loadGroupsConfig();
    this.groupTemplates = this.initializeGroupTemplates();
  }

  // ===========================================
  // INITIALIZATION & DATA MANAGEMENT
  // ===========================================
  
  loadWallets() {
    try {
      if (fs.existsSync(this.walletsFilePath)) {
        const data = fs.readFileSync(this.walletsFilePath, 'utf8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('Error loading wallets:', error);
      return [];
    }
  }

  saveWallets() {
    try {
      fs.writeFileSync(this.walletsFilePath, JSON.stringify(this.wallets, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving wallets:', error);
      return false;
    }
  }

  loadGroupsConfig() {
    try {
      if (fs.existsSync(this.groupsConfigPath)) {
        const data = fs.readFileSync(this.groupsConfigPath, 'utf8');
        return JSON.parse(data);
      }
      return this.getDefaultGroupsConfig();
    } catch (error) {
      console.error('Error loading groups config:', error);
      return this.getDefaultGroupsConfig();
    }
  }

  saveGroupsConfig() {
    try {
      fs.writeFileSync(this.groupsConfigPath, JSON.stringify(this.groupsConfig, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving groups config:', error);
      return false;
    }
  }

  getDefaultGroupsConfig() {
    return {
      test: {
        name: 'Test Wallets',
        description: 'Development and testing wallets',
        maxWallets: 10,
        defaultBalance: 0.01,
        strategy: 'round-robin',
        settings: {
          buyAmount: 0.001,
          sellAmount: 0.001,
          slippage: 0.5,
          priorityFee: 5000
        },
        status: 'active'
      },
      volume: {
        name: 'Volume Generation',
        description: 'Wallets for creating trading volume',
        maxWallets: 20,
        defaultBalance: 0.001,
        strategy: 'simultaneous',
        settings: {
          buyAmount: 0.0005,
          sellAmount: 0.0005,
          slippage: 1.0,
          priorityFee: 10000
        },
        status: 'active'
      },
      snipers: {
        name: 'Sniper Bots',
        description: 'Fast execution wallets for sniping',
        maxWallets: 5,
        defaultBalance: 0.01,
        strategy: 'priority',
        settings: {
          buyAmount: 0.01,
          sellAmount: 0.01,
          slippage: 2.0,
          priorityFee: 50000
        },
        status: 'active'
      },
      trading_bots: {
        name: 'Trading Bots',
        description: 'Automated trading wallets',
        maxWallets: 15,
        defaultBalance: 0.005,
        strategy: 'load-balanced',
        settings: {
          buyAmount: 0.002,
          sellAmount: 0.002,
          slippage: 1.5,
          priorityFee: 15000
        },
        status: 'active'
      }
    };
  }

  initializeGroupTemplates() {
    return {
      default: {
        name: 'Default Group',
        walletCount: 0, // Don't create any wallets initially - let the user specify the count
        initialBalance: 0.001,
        settings: {
          buyAmount: 0.001,
          sellAmount: 0.001,
          slippage: 1.0,
          priorityFee: 10000
        }
      },
      volume_generator: {
        name: 'Volume Generator',
        walletCount: 10,
        initialBalance: 0.001,
        settings: {
          buyAmount: 0.0005,
          sellAmount: 0.0005,
          slippage: 1.0,
          priorityFee: 10000
        }
      },
      sniper_squad: {
        name: 'Sniper Squad',
        walletCount: 3,
        initialBalance: 0.01,
        settings: {
          buyAmount: 0.005,
          sellAmount: 0.005,
          slippage: 3.0,
          priorityFee: 50000
        }
      },
      trading_army: {
        name: 'Trading Army',
        walletCount: 15,
        initialBalance: 0.002,
        settings: {
          buyAmount: 0.001,
          sellAmount: 0.001,
          slippage: 1.5,
          priorityFee: 20000
        }
      },
      volume_swarm: {
        name: 'Volume Swarm',
        walletCount: 25,
        initialBalance: 0.0005,
        settings: {
          buyAmount: 0.0002,
          sellAmount: 0.0002,
          slippage: 0.8,
          priorityFee: 8000
        }
      }
    };
  }

  // ===========================================
  // GROUP MANAGEMENT
  // ===========================================

  createGroup(groupName, config = {}) {
    if (this.groupsConfig[groupName]) {
      throw new Error(`Group '${groupName}' already exists`);
    }

    const defaultConfig = {
      name: groupName,
      description: `${groupName} group`,
      maxWallets: 10,
      defaultBalance: 0.001,
      settings: {
        buyAmount: 0.001,
        sellAmount: 0.001,
        slippage: 1.0,
        priorityFee: 10000
      },
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.groupsConfig[groupName] = { ...defaultConfig, ...config };
    this.saveGroupsConfig();
    
    return this.groupsConfig[groupName];
  }

  deleteGroup(groupName) {
    if (!this.groupsConfig[groupName]) {
      throw new Error(`Group '${groupName}' not found`);
    }

    // Remove all wallets from the group first
    const groupWallets = this.getWalletsByGroup(groupName);
    for (const wallet of groupWallets) {
      this.removeWalletFromGroup(wallet.pubkey, groupName);
    }

    // Delete the group configuration
    delete this.groupsConfig[groupName];
    this.saveGroupsConfig();
    
    return true;
  }

  updateGroupConfig(groupName, newConfig) {
    if (!this.groupsConfig[groupName]) {
      throw new Error(`Group '${groupName}' not found`);
    }

    this.groupsConfig[groupName] = { 
      ...this.groupsConfig[groupName], 
      ...newConfig,
      updatedAt: new Date().toISOString()
    };
    this.saveGroupsConfig();
    
    return this.groupsConfig[groupName];
  }

  createGroupFromTemplate(groupName, templateName) {
    if (!this.groupTemplates[templateName]) {
      throw new Error(`Template '${templateName}' not found`);
    }

    const template = this.groupTemplates[templateName];
    const groupConfig = {
      name: template.name,
      description: `${template.name} created from template`,
      maxWallets: Math.max(template.walletCount * 2, 20), // Allow room for growth with minimum 20
      defaultBalance: template.initialBalance,
      settings: template.settings,
      status: 'active'
    };

    const group = this.createGroup(groupName, groupConfig);
    
    // Generate wallets for the template
    for (let i = 1; i <= template.walletCount; i++) {
      this.generateWalletForGroup(groupName, `${groupName}_${i}`);
    }

    return {
      group,
      walletsCreated: template.walletCount,
      wallets: this.getWalletsByGroup(groupName)
    };
  }

  // ===========================================
  // WALLET MANAGEMENT
  // ===========================================

  generateWalletForGroup(groupName, walletName = null) {
    if (!this.groupsConfig[groupName]) {
      throw new Error(`Group '${groupName}' not found`);
    }

    const groupWallets = this.getWalletsByGroup(groupName);
    if (groupWallets.length >= this.groupsConfig[groupName].maxWallets) {
      throw new Error(`Group '${groupName}' is at maximum capacity (${this.groupsConfig[groupName].maxWallets} wallets)`);
    }

    const keypair = Keypair.generate();
    const name = walletName || `${groupName}_${groupWallets.length + 1}`;
    
    const wallet = {
      pubkey: keypair.publicKey.toString(),
      secretKey: Array.from(keypair.secretKey),
      name,
      balance: 0,
      group: groupName,
      groupRole: 'secondary',
      tags: [],
      priority: groupWallets.length + 1,
      status: 'active',
      addedAt: new Date().toISOString(),
      index: groupWallets.length + 1
    };

    this.wallets.push(wallet);
    this.saveWallets();
    
    return wallet;
  }

  // Alias for generateWalletForGroup
  createWallet(walletName, groupName) {
    return this.generateWalletForGroup(groupName, walletName);
  }

  addWalletToGroup(wallet, groupName) {
    if (!this.groupsConfig[groupName]) {
      throw new Error(`Group '${groupName}' not found`);
    }

    const groupWallets = this.getWalletsByGroup(groupName);
    if (groupWallets.length >= this.groupsConfig[groupName].maxWallets) {
      throw new Error(`Group '${groupName}' is at maximum capacity`);
    }

    // Find wallet in current wallets array
    const walletIndex = this.wallets.findIndex(w => w.pubkey === wallet.pubkey);
    if (walletIndex === -1) {
      throw new Error('Wallet not found');
    }

    this.wallets[walletIndex].group = groupName;
    this.wallets[walletIndex].priority = groupWallets.length + 1;
    this.wallets[walletIndex].index = groupWallets.length + 1;
    
    this.saveWallets();
    return this.wallets[walletIndex];
  }

  removeWalletFromGroup(walletAddress, groupName) {
    const walletIndex = this.wallets.findIndex(w => 
      w.pubkey === walletAddress && w.group === groupName
    );
    
    if (walletIndex === -1) {
      throw new Error('Wallet not found in group');
    }

    this.wallets.splice(walletIndex, 1);
    this.saveWallets();
    
    return true;
  }

  moveWalletBetweenGroups(walletAddress, fromGroup, toGroup) {
    if (!this.groupsConfig[toGroup]) {
      throw new Error(`Destination group '${toGroup}' not found`);
    }

    const wallet = this.wallets.find(w => 
      w.pubkey === walletAddress && w.group === fromGroup
    );
    
    if (!wallet) {
      throw new Error('Wallet not found in source group');
    }

    const toGroupWallets = this.getWalletsByGroup(toGroup);
    if (toGroupWallets.length >= this.groupsConfig[toGroup].maxWallets) {
      throw new Error(`Destination group '${toGroup}' is at maximum capacity`);
    }

    wallet.group = toGroup;
    wallet.priority = toGroupWallets.length + 1;
    wallet.index = toGroupWallets.length + 1;
    
    this.saveWallets();
    return wallet;
  }

  // ===========================================
  // QUERY OPERATIONS
  // ===========================================

  getGroup(groupName) {
    if (!this.groupsConfig[groupName]) {
      return null;
    }

    const wallets = this.getWalletsByGroup(groupName);
    return {
      config: this.groupsConfig[groupName],
      wallets,
      stats: this.getGroupStats(groupName)
    };
  }

  getAllGroups() {
    const groups = {};
    
    for (const [groupName, config] of Object.entries(this.groupsConfig)) {
      groups[groupName] = {
        config,
        wallets: this.getWalletsByGroup(groupName),
        stats: this.getGroupStats(groupName)
      };
    }
    
    return groups;
  }

  getGroupConfig(groupName) {
    if (!this.groupsConfig[groupName]) {
      return null;
    }
    return this.groupsConfig[groupName];
  }

  getWalletsByGroup(groupName) {
    return this.wallets
      .filter(wallet => wallet.group === groupName)
      .sort((a, b) => a.priority - b.priority);
  }

  getGroupStats(groupName) {
    const wallets = this.getWalletsByGroup(groupName);
    
    if (wallets.length === 0) {
      return {
        totalWallets: 0,
        totalBalance: 0,
        averageBalance: 0,
        activeWallets: 0,
        inactiveWallets: 0
      };
    }

    const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
    const activeWallets = wallets.filter(w => w.status === 'active').length;
    
    return {
      totalWallets: wallets.length,
      totalBalance,
      averageBalance: totalBalance / wallets.length,
      activeWallets,
      inactiveWallets: wallets.length - activeWallets,
      maxCapacity: this.groupsConfig[groupName]?.maxWallets || 0,
      utilizationRate: (wallets.length / (this.groupsConfig[groupName]?.maxWallets || 1)) * 100
    };
  }

  // ===========================================
  // BALANCE MANAGEMENT
  // ===========================================

  async distributeSOLToGroup(groupName, totalAmount, fromWallet = null) {
    const wallets = this.getWalletsByGroup(groupName);
    if (wallets.length === 0) {
      throw new Error(`Group '${groupName}' has no wallets`);
    }

    const amountPerWallet = totalAmount / wallets.length;
    const results = [];

    for (const wallet of wallets) {
      if (fromWallet) {
        try {
          const result = await this.transferSOL(fromWallet, wallet.pubkey, amountPerWallet);
          results.push({
            wallet: wallet.name,
            amount: amountPerWallet,
            success: true,
            txHash: result.txHash
          });
        } catch (error) {
          results.push({
            wallet: wallet.name,
            amount: amountPerWallet,
            success: false,
            error: error.message
          });
        }
      } else {
        // Update balance in memory (for simulation/tracking)
        wallet.balance += amountPerWallet;
        results.push({
          wallet: wallet.name,
          amount: amountPerWallet,
          success: true,
          simulated: true
        });
      }
    }

    if (!fromWallet) {
      this.saveWallets();
    }

    return {
      groupName,
      totalAmount,
      amountPerWallet,
      walletsCount: wallets.length,
      results
    };
  }

  async collectSOLFromGroup(groupName, targetWallet, minBalance = 0) {
    const wallets = this.getWalletsByGroup(groupName);
    if (wallets.length === 0) {
      throw new Error(`Group '${groupName}' has no wallets`);
    }

    const results = [];
    let totalCollected = 0;

    for (const wallet of wallets) {
      if (wallet.balance > minBalance) {
        const amountToCollect = wallet.balance - minBalance;
        
        try {
          const result = await this.transferSOL(wallet.pubkey, targetWallet, amountToCollect);
          wallet.balance = minBalance;
          totalCollected += amountToCollect;
          
          results.push({
            wallet: wallet.name,
            amount: amountToCollected,
            success: true,
            txHash: result.txHash
          });
        } catch (error) {
          results.push({
            wallet: wallet.name,
            amount: amountToCollect,
            success: false,
            error: error.message
          });
        }
      }
    }

    this.saveWallets();

    return {
      groupName,
      targetWallet,
      totalCollected,
      walletsProcessed: results.length,
      results
    };
  }

  async balanceGroup(groupName, targetBalance = null) {
    const wallets = this.getWalletsByGroup(groupName);
    if (wallets.length === 0) {
      throw new Error(`Group '${groupName}' has no wallets`);
    }

    const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
    const balanceTarget = targetBalance || (totalBalance / wallets.length);
    
    const results = [];
    
    // First pass: identify wallets that need SOL and those that have excess
    const needSOL = [];
    const hasExcess = [];
    
    for (const wallet of wallets) {
      if (wallet.balance < balanceTarget) {
        needSOL.push({
          wallet,
          needed: balanceTarget - wallet.balance
        });
      } else if (wallet.balance > balanceTarget) {
        hasExcess.push({
          wallet,
          excess: wallet.balance - balanceTarget
        });
      }
    }

    // Second pass: redistribute from excess to needed
    for (const excess of hasExcess) {
      for (const need of needSOL) {
        if (need.needed <= 0) continue;
        
        const transferAmount = Math.min(excess.excess, need.needed);
        if (transferAmount <= 0) continue;

        try {
          const result = await this.transferSOL(
            excess.wallet.pubkey, 
            need.wallet.pubkey, 
            transferAmount
          );
          
          excess.wallet.balance -= transferAmount;
          need.wallet.balance += transferAmount;
          excess.excess -= transferAmount;
          need.needed -= transferAmount;

          results.push({
            from: excess.wallet.name,
            to: need.wallet.name,
            amount: transferAmount,
            success: true,
            txHash: result.txHash
          });
        } catch (error) {
          results.push({
            from: excess.wallet.name,
            to: need.wallet.name,
            amount: transferAmount,
            success: false,
            error: error.message
          });
        }

        if (excess.excess <= 0) break;
      }
    }

    this.saveWallets();

    return {
      groupName,
      targetBalance: balanceTarget,
      totalTransfers: results.length,
      results
    };
  }

  async transferSOL(fromWallet, toAddress, amount) {
    // This is a helper method that would integrate with your existing SOL transfer logic
    // For now, it's a placeholder that simulates the transfer
    
    const fromKeypair = typeof fromWallet === 'string' 
      ? this.getKeypairFromAddress(fromWallet)
      : fromWallet;

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports: amount * LAMPORTS_PER_SOL
      })
    );

    // This would be your actual transaction sending logic
    // const signature = await this.connection.sendTransaction(transaction, [fromKeypair]);
    // return { txHash: signature };
    
    // For now, return simulated result
    return { 
      txHash: 'simulated_' + crypto.randomBytes(16).toString('hex'),
      amount,
      from: fromKeypair.publicKey.toString(),
      to: toAddress
    };
  }

  getKeypairFromAddress(address) {
    const wallet = this.wallets.find(w => w.pubkey === address);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    return Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
  }

  // ===========================================
  // PHANTOM WALLET COMPATIBILITY
  // ===========================================

  exportWalletForPhantom(walletAddress) {
    const wallet = this.wallets.find(w => w.pubkey === walletAddress);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const keypair = Keypair.fromSecretKey(new Uint8Array(wallet.secretKey));
    const privateKeyBase58 = bs58.encode(keypair.secretKey);
    
    return {
      name: wallet.name,
      publicKey: wallet.pubkey,
      privateKey: privateKeyBase58,
      importInstructions: [
        '1. Open Phantom Wallet',
        '2. Click Settings → Add/Connect Wallet',
        '3. Select "Import Private Key"',
        '4. Paste the private key below',
        `5. Name it: ${wallet.name}`
      ],
      privateKeyForImport: privateKeyBase58,
      group: wallet.group,
      balance: wallet.balance
    };
  }

  exportGroupForPhantom(groupName) {
    const wallets = this.getWalletsByGroup(groupName);
    if (wallets.length === 0) {
      throw new Error(`Group '${groupName}' has no wallets`);
    }

    return {
      groupName,
      totalWallets: wallets.length,
      wallets: wallets.map(wallet => this.exportWalletForPhantom(wallet.pubkey)),
      importInstructions: [
        `Importing ${wallets.length} wallets from group '${groupName}'`,
        '1. Open Phantom Wallet',
        '2. For each wallet below:',
        '   - Click Settings → Add/Connect Wallet',
        '   - Select "Import Private Key"',
        '   - Copy the private key and paste it',
        '   - Use the provided name',
        '3. Repeat for all wallets in the group'
      ]
    };
  }

  // ===========================================
  // GROUP EXECUTION STRATEGIES
  // ===========================================

  getWalletsForExecution(groupName, strategy = null, maxWallets = null) {
    const groupConfig = this.groupsConfig[groupName];
    if (!groupConfig) {
      throw new Error(`Group '${groupName}' not found`);
    }

    let wallets = this.getWalletsByGroup(groupName)
      .filter(wallet => wallet.status === 'active');

    if (wallets.length === 0) {
      return [];
    }

    const executionStrategy = strategy || groupConfig.strategy;
    const maxToExecute = maxWallets || wallets.length;

    switch (executionStrategy) {
      case 'round-robin':
        // Rotate through wallets based on last execution
        wallets = this.rotateWallets(wallets);
        break;

      case 'priority':
        // Use highest priority wallets first
        wallets = wallets.sort((a, b) => a.priority - b.priority);
        break;

      case 'random':
        // Randomize wallet selection
        wallets = this.shuffleArray([...wallets]);
        break;

      case 'load-balanced':
        // Use wallets with lowest recent activity
        wallets = wallets.sort((a, b) => 
          (a.lastExecuted || 0) - (b.lastExecuted || 0)
        );
        break;

      case 'simultaneous':
        // Use all wallets (no sorting needed)
        break;

      default:
        // Default to priority order
        wallets = wallets.sort((a, b) => a.priority - b.priority);
    }

    return wallets.slice(0, maxToExecute);
  }

  rotateWallets(wallets) {
    const now = Date.now();
    const rotationKey = `lastRotation_${wallets[0]?.group}`;
    const lastRotation = this.getRotationState(rotationKey) || 0;
    
    const rotatedWallets = [...wallets.slice(lastRotation), ...wallets.slice(0, lastRotation)];
    this.setRotationState(rotationKey, (lastRotation + 1) % wallets.length);
    
    return rotatedWallets;
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getRotationState(key) {
    // Simple in-memory rotation state
    if (!this._rotationStates) this._rotationStates = {};
    return this._rotationStates[key];
  }

  setRotationState(key, value) {
    if (!this._rotationStates) this._rotationStates = {};
    this._rotationStates[key] = value;
  }

  // ===========================================
  // UTILITY METHODS
  // ===========================================

  validateGroupName(groupName) {
    if (!groupName || typeof groupName !== 'string') {
      throw new Error('Group name must be a non-empty string');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(groupName)) {
      throw new Error('Group name can only contain letters, numbers, underscores, and hyphens');
    }
    
    if (groupName.length > 50) {
      throw new Error('Group name cannot exceed 50 characters');
    }
    
    return true;
  }

  getGroupSummary() {
    const groups = this.getAllGroups();
    const summary = {
      totalGroups: Object.keys(groups).length,
      totalWallets: this.wallets.length,
      groupBreakdown: {}
    };

    for (const [groupName, groupData] of Object.entries(groups)) {
      summary.groupBreakdown[groupName] = {
        walletCount: groupData.wallets.length,
        totalBalance: groupData.stats.totalBalance,
        status: groupData.config.status,
        strategy: groupData.config.strategy
      };
    }

    return summary;
  }
}

module.exports = { WalletGroupManager };