/**
 * PumpFun Token Launch
 * Complete token creation and launch on PumpFun
 */

import { 
  PublicKey, 
  Keypair, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import axios from 'axios';
import bs58 from 'bs58';
import { API_ENDPOINTS, PROGRAM_IDS } from '../../config/constants.js';
import { loggerManager } from '../../utils/logger.js';
import { ErrorClassifier } from '../../utils/errors.js';
import TransactionBuilder from '../../core/TransactionBuilder.js';
import AccountManager from '../../core/AccountManager.js';

const logger = loggerManager.getLogger('TokenLaunch');

/**
 * Token Launch Class
 */
export class TokenLaunch {
  constructor(solanaCore, config = {}) {
    this.solanaCore = solanaCore;
    this.connection = solanaCore.getConnection();
    this.config = {
      pumpFunProgramId: PROGRAM_IDS.PUMPFUN_PROGRAM,
      apiBaseUrl: API_ENDPOINTS.PUMPFUN,
      maxRetries: config.maxRetries || 3,
      ...config
    };

    this.transactionBuilder = new TransactionBuilder(this.connection);
    this.accountManager = new AccountManager(this.connection);
    this.isInitialized = false;
    
    this.initialize();
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) return;
    
    logger.info('Initializing Token Launch...');
    this.isInitialized = true;
    logger.info('✅ Token Launch initialized');
  }

  /**
   * Upload metadata to PumpFun
   */
  async uploadMetadata(metadata) {
    try {
      const { name, symbol, description, image, twitter, telegram, website } = metadata;

      // Create metadata JSON
      const metadataJson = {
        name: name,
        symbol: symbol,
        description: description || '',
        image: image || '',
        attributes: [],
        properties: {
          files: [],
          category: 'image'
        }
      };

      // Add optional social links
      if (twitter) metadataJson.twitter = twitter;
      if (telegram) metadataJson.telegram = telegram;
      if (website) metadataJson.website = website;

      // Upload to PumpFun API
      const response = await axios.post(`${this.config.apiBaseUrl}/metadata`, {
        metadata: metadataJson
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.uri) {
        logger.info('✅ Metadata uploaded:', response.data.uri);
        return response.data.uri;
      }

      throw new Error('No URI returned from metadata upload');
    } catch (error) {
      logger.error('Failed to upload metadata:', error);
      throw new Error(`Metadata upload failed: ${error.message}`);
    }
  }

  /**
   * Create and launch token on PumpFun
   */
  async createToken(walletKeypair, metadata, options = {}) {
    try {
      logger.info(`Creating token: ${metadata.name} (${metadata.symbol})`);

      const {
        name,
        symbol,
        description,
        image,
        twitter,
        telegram,
        website
      } = metadata;

      // Step 1: Upload metadata
      logger.info('Step 1: Uploading metadata...');
      const metadataUri = await this.uploadMetadata({
        name,
        symbol,
        description,
        image,
        twitter,
        telegram,
        website
      });

      // Step 2: Generate token mint keypair
      logger.info('Step 2: Generating token mint...');
      const mintKeypair = Keypair.generate();
      const mintPubkey = mintKeypair.publicKey;

      // Step 3: Build create token transaction
      logger.info('Step 3: Building create token transaction...');
      
      // Use pumpfun-sdk if available, otherwise build manually
      let createResult;
      
      try {
        // Use pumpfun-sdk for REAL token creation (on-chain)
        const pumpfunSdk = await import('pumpfun-sdk');
        
        if (pumpfunSdk && pumpfunSdk.pumpFunCreate) {
          logger.info('🚀 Creating REAL token on-chain using pumpfun-sdk...');
          
          const privateKeyBase58 = bs58.encode(walletKeypair.secretKey);
          
          // REAL token creation - this executes on-chain
          createResult = await pumpfunSdk.pumpFunCreate(
            privateKeyBase58,
            name,
            symbol,
            metadataUri,
            {
              rpcUrl: this.connection.rpcEndpoint,
              commitment: 'confirmed',
              trackTx: true
            }
          );

          if (createResult && createResult.signature) {
            logger.info(`✅ REAL token created on-chain: ${mintPubkey.toString()}`);
            logger.info(`Transaction: https://solscan.io/tx/${createResult.signature}`);
            
            return {
              success: true,
              tokenMint: mintPubkey.toString(),
              signature: createResult.signature,
              metadataUri: metadataUri,
              transaction: createResult,
              viewOnExplorer: `https://solscan.io/tx/${createResult.signature}`
            };
          }
        }
      } catch (sdkError) {
        logger.error('REAL token creation failed:', sdkError);
        throw new Error(`Token creation failed: ${sdkError.message}`);
      }

      // If SDK failed, we cannot create tokens without it
      throw new Error('Token creation requires pumpfun-sdk package. Please install: npm install pumpfun-sdk');

    } catch (error) {
      logger.error('Token creation failed:', error);
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      
      return {
        success: false,
        error: classifiedError.message,
        tokenMint: null,
        signature: null
      };
    }
  }

  /**
   * Launch token with initial buy
   */
  async launchToken(walletKeypair, metadata, initialBuyAmount = 0, options = {}) {
    try {
      logger.info(`Launching token: ${metadata.name} with initial buy: ${initialBuyAmount} SOL`);

      // Step 1: Create token
      const createResult = await this.createToken(walletKeypair, metadata, options);

      if (!createResult.success) {
        return createResult;
      }

      const tokenMint = createResult.tokenMint;

      // Step 2: Initial buy if specified
      if (initialBuyAmount > 0) {
        logger.info(`Executing initial buy: ${initialBuyAmount} SOL`);
        
        // Import PumpFunClient for buy operation
        const { PumpFunClient } = await import('./PumpFunClient.js');
        const pumpFunClient = new PumpFunClient(this.solanaCore);
        await pumpFunClient.initialize();

        const buyResult = await pumpFunClient.buyToken(
          walletKeypair,
          tokenMint,
          initialBuyAmount,
          {
            slippage: 5.0, // 5% slippage for initial buy
            source: 'token-launch'
          }
        );

        if (buyResult.success) {
          logger.info(`✅ Initial buy successful: ${buyResult.signature}`);
        } else {
          logger.warn(`Initial buy failed: ${buyResult.error}`);
        }

        return {
          ...createResult,
          initialBuy: buyResult
        };
      }

      return createResult;

    } catch (error) {
      logger.error('Token launch failed:', error);
      return {
        success: false,
        error: error.message,
        tokenMint: null,
        signature: null
      };
    }
  }

  /**
   * Validate token metadata
   */
  validateMetadata(metadata) {
    const errors = [];

    if (!metadata.name || metadata.name.trim().length === 0) {
      errors.push('Token name is required');
    } else if (metadata.name.length > 32) {
      errors.push('Token name must be 32 characters or less');
    }

    if (!metadata.symbol || metadata.symbol.trim().length === 0) {
      errors.push('Token symbol is required');
    } else if (metadata.symbol.length > 10) {
      errors.push('Token symbol must be 10 characters or less');
    }

    if (metadata.description && metadata.description.length > 1000) {
      errors.push('Token description must be 1000 characters or less');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}

export default TokenLaunch;

