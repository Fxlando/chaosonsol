/**
 * Solana Core
 * Main Solana connection and transaction management
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  TransactionMessage,
  TransactionInstruction
} from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import RPCManager from './RPCManager.js';
import { ErrorClassifier } from '../utils/errors.js';
import { RetryHandler } from '../utils/retry.js';
import { loggerManager } from '../utils/logger.js';
import { TRANSACTION_CONFIG } from '../config/constants.js';

const logger = loggerManager.getLogger('SolanaCore');

/**
 * Solana Core Class
 */
export class SolanaCore {
  constructor(network = 'mainnet-beta', config = {}) {
    this.network = network;
    this.config = {
      commitment: config.commitment || 'confirmed',
      defaultSlippage: config.defaultSlippage || TRANSACTION_CONFIG.DEFAULT_SLIPPAGE,
      priorityFee: config.priorityFee || TRANSACTION_CONFIG.DEFAULT_PRIORITY_FEE,
      maxRetries: config.maxRetries || TRANSACTION_CONFIG.DEFAULT_RETRIES,
      timeout: config.timeout || TRANSACTION_CONFIG.DEFAULT_TIMEOUT,
      ...config
    };

    this.rpcManager = new RPCManager(network, config.rpc);
    this.retryHandler = new RetryHandler({
      maxRetries: this.config.maxRetries
    });
    this.isInitialized = false;
  }

  /**
   * Initialize
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('SolanaCore already initialized');
      return;
    }

    logger.info('Initializing SolanaCore...');
    await this.rpcManager.initialize();
    this.isInitialized = true;
    logger.info('SolanaCore initialized');
  }

  /**
   * Get connection
   */
  getConnection() {
    if (!this.isInitialized) {
      throw new Error('SolanaCore not initialized');
    }
    return this.rpcManager.getConnection();
  }

  /**
   * Execute transaction
   */
  async executeTransaction(transaction, signers, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SolanaCore not initialized');
    }

    const maxRetries = options.maxRetries || this.config.maxRetries;
    const commitment = options.commitment || this.config.commitment;
    const skipPreflight = options.skipPreflight || false;

    return this.retryHandler.execute(async () => {
      const connection = this.getConnection();
      
      try {
        // Add priority fee if specified
        if (this.config.priorityFee > 0 && transaction instanceof Transaction) {
          // Priority fee would be added via compute budget instruction
          // This is handled in transaction building
        }

        // Send transaction
        const signature = await connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight,
            maxRetries: 3,
            preflightCommitment: commitment
          }
        );

        logger.info(`Transaction sent: ${signature}`);

        // Confirm transaction
        const confirmation = await connection.confirmTransaction(
          signature,
          commitment
        );

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        logger.info(`Transaction confirmed: ${signature}`);
        return {
          success: true,
          signature,
          slot: confirmation.context.slot
        };
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyTransactionError(error, null);
        throw classifiedError;
      }
    });
  }

  /**
   * Execute versioned transaction
   */
  async executeVersionedTransaction(transaction, signers, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SolanaCore not initialized');
    }

    const commitment = options.commitment || this.config.commitment;
    const skipPreflight = options.skipPreflight || false;

    return this.retryHandler.execute(async () => {
      const connection = this.getConnection();
      
      try {
        // Send versioned transaction
        const signature = await connection.sendTransaction(transaction, {
          skipPreflight,
          maxRetries: 3,
          preflightCommitment: commitment
        });

        logger.info(`Versioned transaction sent: ${signature}`);

        // Confirm transaction
        const confirmation = await connection.confirmTransaction(
          signature,
          commitment
        );

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        logger.info(`Versioned transaction confirmed: ${signature}`);
        return {
          success: true,
          signature,
          slot: confirmation.context.slot
        };
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyTransactionError(error, null);
        throw classifiedError;
      }
    });
  }

  /**
   * Get balance
   */
  async getBalance(publicKey) {
    return this.rpcManager.executeRequest(async (connection) => {
      const pubkey = publicKey instanceof PublicKey ? publicKey : new PublicKey(publicKey);
      const balance = await connection.getBalance(pubkey);
      return balance / LAMPORTS_PER_SOL;
    });
  }

  /**
   * Get token balance
   */
  async getTokenBalance(walletAddress, tokenMint) {
    return this.rpcManager.executeRequest(async (connection) => {
      const walletPubkey = walletAddress instanceof PublicKey ? walletAddress : new PublicKey(walletAddress);
      const mintPubkey = tokenMint instanceof PublicKey ? tokenMint : new PublicKey(tokenMint);
      
      const tokenAccount = await getAssociatedTokenAddress(mintPubkey, walletPubkey);
      
      try {
        const accountInfo = await connection.getTokenAccountBalance(tokenAccount);
        return accountInfo.value.uiAmount || 0;
      } catch (error) {
        // Token account doesn't exist
        return 0;
      }
    });
  }

  /**
   * Get recent blockhash
   */
  async getRecentBlockhash() {
    return this.rpcManager.executeRequest(async (connection) => {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      return { blockhash, lastValidBlockHeight };
    });
  }

  /**
   * Get account info
   */
  async getAccountInfo(publicKey) {
    return this.rpcManager.executeRequest(async (connection) => {
      const pubkey = publicKey instanceof PublicKey ? publicKey : new PublicKey(publicKey);
      return await connection.getAccountInfo(pubkey);
    });
  }

  /**
   * Get transaction
   */
  async getTransaction(signature, options = {}) {
    return this.rpcManager.executeRequest(async (connection) => {
      return await connection.getTransaction(signature, options);
    });
  }

  /**
   * Get slot
   */
  async getSlot() {
    return this.rpcManager.executeRequest(async (connection) => {
      return await connection.getSlot();
    });
  }

  /**
   * Get block height
   */
  async getBlockHeight() {
    return this.rpcManager.executeRequest(async (connection) => {
      return await connection.getBlockHeight();
    });
  }

  /**
   * Get version
   */
  async getVersion() {
    return this.rpcManager.executeRequest(async (connection) => {
      return await connection.getVersion();
    });
  }

  /**
   * Get RPC stats
   */
  getRPCStats() {
    return this.rpcManager.getStats();
  }

  /**
   * Cleanup
   */
  destroy() {
    this.rpcManager.destroy();
    this.isInitialized = false;
    logger.info('SolanaCore destroyed');
  }
}

export default SolanaCore;

