/**
 * Error Handling System
 * Comprehensive error classification and handling
 */

import { ERROR_CODES } from '../config/constants.js';

/**
 * Base Error Class
 */
export class SolanaAppError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'SolanaAppError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * Network Errors
 */
export class NetworkError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.NETWORK_ERROR, details);
    this.name = 'NetworkError';
  }
}

export class RPCError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.RPC_ERROR, details);
    this.name = 'RPCError';
  }
}

export class RateLimitError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.RATE_LIMIT_ERROR, details);
    this.name = 'RateLimitError';
    this.retryAfter = details.retryAfter || 60000; // Default 1 minute
  }
}

/**
 * Transaction Errors
 */
export class TransactionError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.TRANSACTION_ERROR, details);
    this.name = 'TransactionError';
    this.signature = details.signature;
    this.err = details.err;
  }
}

export class InsufficientBalanceError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.INSUFFICIENT_BALANCE, details);
    this.name = 'InsufficientBalanceError';
    this.required = details.required;
    this.available = details.available;
  }
}

export class SlippageExceededError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.SLIPPAGE_EXCEEDED, details);
    this.name = 'SlippageExceededError';
    this.expected = details.expected;
    this.actual = details.actual;
    this.slippage = details.slippage;
  }
}

export class TransactionExpiredError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.TRANSACTION_EXPIRED, details);
    this.name = 'TransactionExpiredError';
    this.blockHeight = details.blockHeight;
  }
}

export class TransactionFailedError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.TRANSACTION_FAILED, details);
    this.name = 'TransactionFailedError';
    this.signature = details.signature;
    this.err = details.err;
  }
}

/**
 * Account Errors
 */
export class InvalidAccountError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.INVALID_ACCOUNT, details);
    this.name = 'InvalidAccountError';
    this.account = details.account;
  }
}

export class InvalidTokenError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.INVALID_TOKEN, details);
    this.name = 'InvalidTokenError';
    this.token = details.token;
  }
}

export class InvalidAmountError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.INVALID_AMOUNT, details);
    this.name = 'InvalidAmountError';
    this.amount = details.amount;
  }
}

/**
 * Program Errors
 */
export class ProgramError extends SolanaAppError {
  constructor(message, details = {}) {
    super(message, ERROR_CODES.PROGRAM_ERROR, details);
    this.name = 'ProgramError';
    this.programId = details.programId;
    this.instruction = details.instruction;
  }
}

/**
 * Error Classifier
 */
export class ErrorClassifier {
  /**
   * Classify an error from Solana RPC
   */
  static classifyRPCError(error) {
    const message = error.message || String(error);
    const code = error.code;

    // Network errors
    if (message.includes('ECONNREFUSED') || 
        message.includes('ETIMEDOUT') ||
        message.includes('Network request failed')) {
      return new NetworkError('Network connection failed', { originalError: error });
    }

    // Rate limit errors
    if (code === 429 || message.includes('rate limit') || message.includes('too many')) {
      return new RateLimitError('Rate limit exceeded', { 
        originalError: error,
        retryAfter: error.retryAfter || 60000
      });
    }

    // RPC errors
    if (code === -32603 || message.includes('Internal JSON-RPC')) {
      return new RPCError('RPC error occurred', { originalError: error });
    }

    return new RPCError('Unknown RPC error', { originalError: error });
  }

  /**
   * Classify a transaction error
   */
  static classifyTransactionError(error, signature = null) {
    const message = error.message || String(error);
    const err = error.err || error;

    // Transaction failed
    if (err || message.includes('Transaction failed')) {
      return new TransactionFailedError('Transaction failed', {
        signature,
        err,
        originalError: error
      });
    }

    // Insufficient balance
    if (message.includes('insufficient') || message.includes('0x1')) {
      return new InsufficientBalanceError('Insufficient balance', {
        originalError: error
      });
    }

    // Slippage exceeded
    if (message.includes('slippage') || message.includes('0x2a')) {
      return new SlippageExceededError('Slippage exceeded', {
        originalError: error
      });
    }

    // Transaction expired
    if (message.includes('expired') || message.includes('block height')) {
      return new TransactionExpiredError('Transaction expired', {
        originalError: error
      });
    }

    return new TransactionError('Transaction error', {
      signature,
      err,
      originalError: error
    });
  }

  /**
   * Classify a program error
   */
  static classifyProgramError(error, programId = null, instruction = null) {
    return new ProgramError('Program error', {
      programId,
      instruction,
      originalError: error
    });
  }

  /**
   * Check if error is retryable
   */
  static isRetryable(error) {
    if (error instanceof NetworkError) return true;
    if (error instanceof RPCError) return true;
    if (error instanceof RateLimitError) return true;
    if (error instanceof TransactionExpiredError) return true;
    
    if (error instanceof TransactionError) {
      // Some transaction errors are retryable
      const message = error.message.toLowerCase();
      return message.includes('expired') || 
             message.includes('timeout') ||
             message.includes('blockheight');
    }

    return false;
  }

  /**
   * Get retry delay for error
   */
  static getRetryDelay(error, attempt = 1) {
    if (error instanceof RateLimitError) {
      return error.retryAfter;
    }

    if (error instanceof NetworkError) {
      return Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
    }

    if (error instanceof TransactionExpiredError) {
      return 1000; // 1 second for expired transactions
    }

    return Math.min(1000 * attempt, 5000); // Linear backoff, max 5s
  }
}

export default {
  SolanaAppError,
  NetworkError,
  RPCError,
  RateLimitError,
  TransactionError,
  InsufficientBalanceError,
  SlippageExceededError,
  TransactionExpiredError,
  TransactionFailedError,
  InvalidAccountError,
  InvalidTokenError,
  InvalidAmountError,
  ProgramError,
  ErrorClassifier
};

