/**
 * Transaction Builder
 * Handles building transactions with proper instruction encoding,
 * priority fees, versioned transactions, and Address Lookup Tables
 */

import web3 from '@solana/web3.js';
import { TRANSACTION_CONFIG, PROGRAM_IDS } from '../config/constants.js';
import { loggerManager } from '../utils/logger.js';

const {
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram
} = web3;

const logger = loggerManager.getLogger('TransactionBuilder');

/**
 * Transaction Builder Class
 */
export class TransactionBuilder {
  constructor(connection, config = {}) {
    this.connection = connection;
    this.config = {
      computeUnitLimit: config.computeUnitLimit || TRANSACTION_CONFIG.COMPUTE_UNIT_LIMIT,
      computeUnitPrice: config.computeUnitPrice || TRANSACTION_CONFIG.COMPUTE_UNIT_PRICE,
      priorityFee: config.priorityFee || TRANSACTION_CONFIG.DEFAULT_PRIORITY_FEE,
      useVersionedTransactions: config.useVersionedTransactions !== false, // Default true
      ...config
    };
  }

  /**
   * Build a new transaction
   */
  buildTransaction(options = {}) {
    const useVersioned = options.useVersionedTransactions !== undefined 
      ? options.useVersionedTransactions 
      : this.config.useVersionedTransactions;

    if (useVersioned) {
      return this.buildVersionedTransaction(options);
    } else {
      return this.buildLegacyTransaction(options);
    }
  }

  /**
   * Build legacy transaction
   */
  buildLegacyTransaction(options = {}) {
    const transaction = new Transaction();
    
    // Add recent blockhash if provided
    if (options.recentBlockhash) {
      transaction.recentBlockhash = options.recentBlockhash;
    }

    // Add priority fee (compute budget)
    if (this.config.priorityFee > 0 || options.priorityFee) {
      const priorityFee = options.priorityFee || this.config.priorityFee;
      const computeBudgetIx = this.createComputeBudgetInstruction(priorityFee);
      if (computeBudgetIx) {
        transaction.add(computeBudgetIx);
      }
    }

    // Add compute unit limit if specified
    if (this.config.computeUnitLimit || options.computeUnitLimit) {
      const limit = options.computeUnitLimit || this.config.computeUnitLimit;
      const limitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: limit });
      transaction.add(limitIx);
    }

    // Add compute unit price if specified
    if (this.config.computeUnitPrice || options.computeUnitPrice) {
      const price = options.computeUnitPrice || this.config.computeUnitPrice;
      const priceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price });
      transaction.add(priceIx);
    }

    // Add instructions
    if (options.instructions) {
      options.instructions.forEach(ix => transaction.add(ix));
    }

    // Add fee payer if specified
    if (options.feePayer) {
      transaction.feePayer = options.feePayer instanceof PublicKey 
        ? options.feePayer 
        : new PublicKey(options.feePayer);
    }

    return transaction;
  }

  /**
   * Build versioned transaction
   */
  async buildVersionedTransaction(options = {}) {
    // Get recent blockhash
    let recentBlockhash;
    if (options.recentBlockhash) {
      recentBlockhash = options.recentBlockhash;
    } else {
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('finalized');
      recentBlockhash = blockhash;
    }

    // Build instructions array
    const instructions = [];

    // Add priority fee (compute budget)
    if (this.config.priorityFee > 0 || options.priorityFee) {
      const priorityFee = options.priorityFee || this.config.priorityFee;
      const computeBudgetIx = this.createComputeBudgetInstruction(priorityFee);
      if (computeBudgetIx) {
        instructions.push(computeBudgetIx);
      }
    }

    // Add compute unit limit if specified
    if (this.config.computeUnitLimit || options.computeUnitLimit) {
      const limit = options.computeUnitLimit || this.config.computeUnitLimit;
      const limitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: limit });
      instructions.push(limitIx);
    }

    // Add compute unit price if specified
    if (this.config.computeUnitPrice || options.computeUnitPrice) {
      const price = options.computeUnitPrice || this.config.computeUnitPrice;
      const priceIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price });
      instructions.push(priceIx);
    }

    // Add user instructions
    if (options.instructions) {
      instructions.push(...options.instructions);
    }

    // Build transaction message
    const feePayer = options.feePayer instanceof PublicKey 
      ? options.feePayer 
      : (options.feePayer ? new PublicKey(options.feePayer) : null);

    const messageV0 = new TransactionMessage({
      payerKey: feePayer || PublicKey.default,
      recentBlockhash: recentBlockhash,
      instructions: instructions
    }).compileToV0Message(options.addressLookupTableAccounts || []);

    // Create versioned transaction
    const transaction = new VersionedTransaction(messageV0);

    return transaction;
  }

  /**
   * Create compute budget instruction for priority fee
   */
  createComputeBudgetInstruction(priorityFee) {
    const feeLamports = priorityFee !== undefined ? priorityFee : this.config.priorityFee;

    if (!feeLamports || feeLamports <= 0) {
      return null;
    }

    const microLamports = Math.floor(feeLamports * 1000); // 1 lamport = 1000 microLamports

    return ComputeBudgetProgram.setComputeUnitPrice({
      microLamports
    });
  }

  /**
   * Add instruction to transaction
   */
  addInstruction(transaction, instruction) {
    if (transaction instanceof VersionedTransaction) {
      // For versioned transactions, we need to rebuild
      logger.warn('Cannot add instruction to versioned transaction directly. Rebuild transaction.');
      return transaction;
    } else {
      transaction.add(instruction);
      return transaction;
    }
  }

  /**
   * Sign transaction
   */
  signTransaction(transaction, signers) {
    if (transaction instanceof VersionedTransaction) {
      transaction.sign(signers);
    } else {
      transaction.sign(...signers);
    }
    return transaction;
  }

  /**
   * Serialize transaction
   */
  serializeTransaction(transaction) {
    return transaction.serialize();
  }

  /**
   * Deserialize transaction
   */
  deserializeTransaction(serialized, versioned = true) {
    if (versioned) {
      return VersionedTransaction.deserialize(serialized);
    } else {
      return Transaction.from(serialized);
    }
  }

  /**
   * Estimate transaction size
   */
  estimateTransactionSize(transaction) {
    const serialized = this.serializeTransaction(transaction);
    return serialized.length;
  }

  /**
   * Check if transaction size is valid
   */
  validateTransactionSize(transaction) {
    const size = this.estimateTransactionSize(transaction);
    const maxSize = TRANSACTION_CONFIG.MAX_TRANSACTION_SIZE;
    
    if (size > maxSize) {
      logger.warn(`Transaction size (${size} bytes) exceeds maximum (${maxSize} bytes)`);
      return false;
    }
    
    return true;
  }

  /**
   * Build transfer instruction
   */
  buildTransferInstruction(fromPubkey, toPubkey, amount, payer = null) {
    return SystemProgram.transfer({
      fromPubkey: fromPubkey instanceof PublicKey ? fromPubkey : new PublicKey(fromPubkey),
      toPubkey: toPubkey instanceof PublicKey ? toPubkey : new PublicKey(toPubkey),
      lamports: Math.floor(amount * LAMPORTS_PER_SOL)
    });
  }

  /**
   * Build transaction with transfer
   */
  async buildTransferTransaction(fromPubkey, toPubkey, amount, options = {}) {
    const transferIx = this.buildTransferInstruction(fromPubkey, toPubkey, amount, options.feePayer);
    
    return this.buildTransaction({
      ...options,
      instructions: [transferIx],
      feePayer: options.feePayer || fromPubkey
    });
  }
}

export default TransactionBuilder;

