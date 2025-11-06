/**
 * Wallet Manager
 * Handles wallet operations, creation, import, and management
 */

import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { loggerManager } from '../utils/logger.js';
import { InvalidAccountError } from '../utils/errors.js';

const logger = loggerManager.getLogger('WalletManager');

/**
 * Wallet Manager Class
 */
export class WalletManager {
  constructor(solanaCore, storage = null) {
    this.solanaCore = solanaCore;
    this.connection = solanaCore.getConnection();
    this.storage = storage || this.defaultStorage();
    this.wallets = new Map();
    this.isInitialized = false;
    
    this.initialize();
  }

  /**
   * Default storage (localStorage for browser, memory for Node.js)
   */
  defaultStorage() {
    if (typeof window !== 'undefined' && window.localStorage) {
      return {
        get: (key) => {
          try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
          } catch (error) {
            return null;
          }
        },
        set: (key, value) => {
          try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
          } catch (error) {
            logger.error('Failed to save to localStorage:', error);
            return false;
          }
        },
        remove: (key) => {
          try {
            localStorage.removeItem(key);
            return true;
          } catch (error) {
            return false;
          }
        }
      };
    } else {
      // Node.js memory storage
      const memory = new Map();
      return {
        get: (key) => memory.get(key) || null,
        set: (key, value) => {
          memory.set(key, value);
          return true;
        },
        remove: (key) => {
          memory.delete(key);
          return true;
        }
      };
    }
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info('Initializing Wallet Manager...');
    
    // Load saved wallets
    await this.loadWallets();
    
    this.isInitialized = true;
    logger.info(`✅ Wallet Manager initialized with ${this.wallets.size} wallets`);
  }

  /**
   * Create new wallet
   */
  createWallet(name = null, tags = []) {
    try {
      const keypair = Keypair.generate();
      
      const wallet = {
        id: this.generateId(),
        name: name || `Wallet ${this.wallets.size + 1}`,
        publicKey: keypair.publicKey.toString(),
        privateKey: Array.from(keypair.secretKey),
        tags: tags,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };

      this.wallets.set(wallet.id, wallet);
      this.saveWallets();
      
      logger.info(`✅ Created wallet: ${wallet.name} (${wallet.publicKey})`);
      
      return {
        success: true,
        wallet: {
          id: wallet.id,
          name: wallet.name,
          publicKey: wallet.publicKey,
          tags: wallet.tags
          // Never return private key
        }
      };
    } catch (error) {
      logger.error('Failed to create wallet:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Import wallet from private key
   */
  importWallet(privateKey, name = null, tags = []) {
    try {
      let secretKey;
      
      // Handle different private key formats
      if (Array.isArray(privateKey)) {
        secretKey = new Uint8Array(privateKey);
      } else if (typeof privateKey === 'string') {
        try {
          // Try JSON array
          secretKey = new Uint8Array(JSON.parse(privateKey));
        } catch (e) {
          // Try base58
          const bs58 = require('bs58');
          secretKey = bs58.decode(privateKey);
        }
      } else if (privateKey instanceof Uint8Array) {
        secretKey = privateKey;
      } else {
        throw new Error('Invalid private key format');
      }

      // Validate key length (Solana keys are 64 bytes)
      if (secretKey.length !== 64) {
        throw new Error('Invalid private key length');
      }

      const keypair = Keypair.fromSecretKey(secretKey);
      
      const wallet = {
        id: this.generateId(),
        name: name || `Wallet ${this.wallets.size + 1}`,
        publicKey: keypair.publicKey.toString(),
        privateKey: Array.from(keypair.secretKey),
        tags: tags,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };

      // Check if wallet already exists
      for (const [id, existing] of this.wallets) {
        if (existing.publicKey === wallet.publicKey) {
          logger.warn(`Wallet already exists: ${wallet.publicKey}`);
          return {
            success: false,
            error: 'Wallet already exists',
            wallet: {
              id: existing.id,
              name: existing.name,
              publicKey: existing.publicKey
            }
          };
        }
      }

      this.wallets.set(wallet.id, wallet);
      this.saveWallets();
      
      logger.info(`✅ Imported wallet: ${wallet.name} (${wallet.publicKey})`);
      
      return {
        success: true,
        wallet: {
          id: wallet.id,
          name: wallet.name,
          publicKey: wallet.publicKey,
          tags: wallet.tags
        }
      };
    } catch (error) {
      logger.error('Failed to import wallet:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get wallet by ID
   */
  getWallet(walletId) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return null;
    }

    // Return wallet without private key
    return {
      id: wallet.id,
      name: wallet.name,
      publicKey: wallet.publicKey,
      tags: wallet.tags,
      createdAt: wallet.createdAt,
      lastUsed: wallet.lastUsed
    };
  }

  /**
   * Get wallet keypair (for signing)
   */
  getWalletKeypair(walletId) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      throw new InvalidAccountError('Wallet not found', { walletId });
    }

    const secretKey = new Uint8Array(wallet.privateKey);
    return Keypair.fromSecretKey(secretKey);
  }

  /**
   * Get wallet by public key
   */
  getWalletByPublicKey(publicKey) {
    for (const [id, wallet] of this.wallets) {
      if (wallet.publicKey === publicKey) {
        return this.getWallet(id);
      }
    }
    return null;
  }

  /**
   * Get all wallets
   */
  getAllWallets() {
    const wallets = [];
    for (const [id, wallet] of this.wallets) {
      wallets.push(this.getWallet(id));
    }
    return wallets;
  }

  /**
   * Update wallet name
   */
  updateWalletName(walletId, name) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    wallet.name = name;
    wallet.lastUsed = new Date().toISOString();
    this.saveWallets();
    
    logger.info(`✅ Updated wallet name: ${wallet.name}`);
    
    return { success: true, wallet: this.getWallet(walletId) };
  }

  /**
   * Update wallet tags
   */
  updateWalletTags(walletId, tags) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    wallet.tags = tags;
    wallet.lastUsed = new Date().toISOString();
    this.saveWallets();
    
    return { success: true, wallet: this.getWallet(walletId) };
  }

  /**
   * Delete wallet
   */
  deleteWallet(walletId) {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    this.wallets.delete(walletId);
    this.saveWallets();
    
    logger.info(`✅ Deleted wallet: ${wallet.name}`);
    
    return { success: true };
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(walletId) {
    try {
      const wallet = this.wallets.get(walletId);
      if (!wallet) {
        return { success: false, error: 'Wallet not found' };
      }

      const balance = await this.solanaCore.getBalance(wallet.publicKey);
      
      return {
        success: true,
        balance: balance,
        usdValue: 0 // Calculated with real SOL price
      };
    } catch (error) {
      logger.error('Failed to get wallet balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all wallets with balances
   */
  async getAllWalletsWithBalances() {
    const wallets = this.getAllWallets();
    const walletsWithBalances = await Promise.all(
      wallets.map(async (wallet) => {
        const balance = await this.getWalletBalance(wallet.id);
        return {
          ...wallet,
          balance: balance.success ? balance.balance : 0,
          usdValue: balance.success ? balance.usdValue : 0
        };
      })
    );
    return walletsWithBalances;
  }

  /**
   * Load wallets from storage
   */
  async loadWallets() {
    try {
      const saved = this.storage.get('chaosbot_wallets');
      if (saved && Array.isArray(saved)) {
        saved.forEach(wallet => {
          this.wallets.set(wallet.id, wallet);
        });
        logger.info(`Loaded ${saved.length} wallets from storage`);
      }
    } catch (error) {
      logger.error('Failed to load wallets:', error);
    }
  }

  /**
   * Save wallets to storage
   */
  saveWallets() {
    try {
      const wallets = Array.from(this.wallets.values());
      this.storage.set('chaosbot_wallets', wallets);
      logger.debug(`Saved ${wallets.length} wallets to storage`);
    } catch (error) {
      logger.error('Failed to save wallets:', error);
    }
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default WalletManager;

