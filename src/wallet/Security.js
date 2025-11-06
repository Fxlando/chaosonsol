/**
 * Security Utilities
 * Handles encryption, key management, and security features
 */

import { loggerManager } from '../utils/logger.js';

const logger = loggerManager.getLogger('Security');

/**
 * Security Class
 */
export class Security {
  constructor() {
    this.isInitialized = false;
    this.initialize();
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) return;
    
    // Check for crypto APIs
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      this.crypto = window.crypto.subtle;
      this.useWebCrypto = true;
    } else if (typeof crypto !== 'undefined' && crypto.subtle) {
      this.crypto = crypto.subtle;
      this.useWebCrypto = true;
    } else {
      // Fallback for Node.js (would need crypto module)
      this.useWebCrypto = false;
      logger.warn('Web Crypto API not available, using fallback encryption');
    }
    
    this.isInitialized = true;
    logger.info('✅ Security initialized');
  }

  /**
   * Generate encryption key
   */
  async generateKey() {
    if (!this.useWebCrypto) {
      throw new Error('Web Crypto API not available');
    }

    try {
      const key = await this.crypto.generateKey(
        {
          name: 'AES-GCM',
          length: 256
        },
        true,
        ['encrypt', 'decrypt']
      );

      return key;
    } catch (error) {
      logger.error('Failed to generate encryption key:', error);
      throw error;
    }
  }

  /**
   * Derive key from password (PBKDF2)
   */
  async deriveKeyFromPassword(password, salt) {
    if (!this.useWebCrypto) {
      throw new Error('Web Crypto API not available');
    }

    try {
      const encoder = new TextEncoder();
      const passwordKey = await this.crypto.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const key = await this.crypto.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        passwordKey,
        {
          name: 'AES-GCM',
          length: 256
        },
        false,
        ['encrypt', 'decrypt']
      );

      return key;
    } catch (error) {
      logger.error('Failed to derive key from password:', error);
      throw error;
    }
  }

  /**
   * Encrypt data
   */
  async encrypt(data, key) {
    if (!this.useWebCrypto) {
      // Fallback: return base64 encoded (not secure, but better than plaintext)
      logger.warn('Using fallback encryption (not secure)');
      return {
        encrypted: btoa(JSON.stringify(data)),
        iv: null,
        method: 'base64'
      };
    }

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(JSON.stringify(data));
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const encrypted = await this.crypto.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        dataBuffer
      );

      return {
        encrypted: Array.from(new Uint8Array(encrypted)),
        iv: Array.from(iv),
        method: 'AES-GCM'
      };
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(encryptedData, key) {
    if (encryptedData.method === 'base64') {
      // Fallback decryption
      try {
        return JSON.parse(atob(encryptedData.encrypted));
      } catch (error) {
        throw new Error('Decryption failed');
      }
    }

    if (!this.useWebCrypto) {
      throw new Error('Web Crypto API not available');
    }

    try {
      const encryptedBuffer = new Uint8Array(encryptedData.encrypted);
      const iv = new Uint8Array(encryptedData.iv);
      
      const decrypted = await this.crypto.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encryptedBuffer
      );

      const decoder = new TextDecoder();
      const decryptedText = decoder.decode(decrypted);
      
      return JSON.parse(decryptedText);
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw error;
    }
  }

  /**
   * Hash data (SHA-256)
   */
  async hash(data) {
    if (!this.useWebCrypto) {
      // Fallback: simple hash (not secure)
      logger.warn('Using fallback hashing (not secure)');
      return btoa(data).substring(0, 32);
    }

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      
      const hashBuffer = await this.crypto.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (error) {
      logger.error('Hashing failed:', error);
      throw error;
    }
  }

  /**
   * Generate random bytes
   */
  generateRandomBytes(length) {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return crypto.getRandomValues(new Uint8Array(length));
    } else {
      // Fallback for Node.js
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return bytes;
    }
  }

  /**
   * Generate salt
   */
  generateSalt(length = 16) {
    return Array.from(this.generateRandomBytes(length));
  }

  /**
   * Validate private key format
   */
  validatePrivateKey(privateKey) {
    try {
      let secretKey;
      
      if (Array.isArray(privateKey)) {
        secretKey = new Uint8Array(privateKey);
      } else if (typeof privateKey === 'string') {
        try {
          secretKey = new Uint8Array(JSON.parse(privateKey));
        } catch (e) {
          const bs58 = require('bs58');
          secretKey = bs58.decode(privateKey);
        }
      } else if (privateKey instanceof Uint8Array) {
        secretKey = privateKey;
      } else {
        return false;
      }

      // Solana private keys are 64 bytes
      return secretKey.length === 64;
    } catch (error) {
      return false;
    }
  }

  /**
   * Sanitize input (prevent XSS)
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim();
  }

  /**
   * Validate public key format
   */
  validatePublicKey(publicKey) {
    try {
      if (typeof publicKey !== 'string') {
        return false;
      }

      // Solana public keys are base58 encoded, 32-44 characters
      if (publicKey.length < 32 || publicKey.length > 44) {
        return false;
      }

      // Check if it's valid base58
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
      return base58Regex.test(publicKey);
    } catch (error) {
      return false;
    }
  }

  /**
   * Secure storage wrapper (encrypts before storing)
   */
  async secureStorage(key, value, password = null) {
    try {
      let encryptionKey;
      
      if (password) {
        const salt = this.generateSalt();
        encryptionKey = await this.deriveKeyFromPassword(password, new Uint8Array(salt));
        const encrypted = await this.encrypt(value, encryptionKey);
        
        return {
          encrypted: encrypted,
          salt: Array.from(salt),
          method: 'password'
        };
      } else {
        // Use generated key (would need to be stored securely)
        encryptionKey = await this.generateKey();
        const encrypted = await this.encrypt(value, encryptionKey);
        
        return {
          encrypted: encrypted,
          method: 'key'
        };
      }
    } catch (error) {
      logger.error('Secure storage failed:', error);
      throw error;
    }
  }

  /**
   * Secure retrieval (decrypts after retrieving)
   */
  async secureRetrieval(storedData, password = null, key = null) {
    try {
      let decryptionKey;
      
      if (storedData.method === 'password' && password) {
        decryptionKey = await this.deriveKeyFromPassword(
          password,
          new Uint8Array(storedData.salt)
        );
      } else if (storedData.method === 'key' && key) {
        decryptionKey = key;
      } else {
        throw new Error('Invalid decryption method or missing credentials');
      }

      return await this.decrypt(storedData.encrypted, decryptionKey);
    } catch (error) {
      logger.error('Secure retrieval failed:', error);
      throw error;
    }
  }
}

export default Security;

