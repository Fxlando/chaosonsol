/**
 * Retry Logic System
 * Handles retry strategies for different error types
 */

import { ErrorClassifier } from './errors.js';
import { TRANSACTION_CONFIG } from '../config/constants.js';

/**
 * Retry Configuration
 */
export class RetryConfig {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || TRANSACTION_CONFIG.DEFAULT_RETRIES;
    this.initialDelay = options.initialDelay || 1000;
    this.maxDelay = options.maxDelay || TRANSACTION_CONFIG.MAX_RETRY_DELAY;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.retryableErrors = options.retryableErrors || [];
    this.onRetry = options.onRetry || null;
  }
}

/**
 * Retry Handler
 */
export class RetryHandler {
  constructor(config = {}) {
    this.config = new RetryConfig(config);
  }

  /**
   * Execute function with retry logic
   */
  async execute(fn, context = {}) {
    let lastError;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        const result = await fn();
        return { success: true, result, attempts: attempt + 1 };
      } catch (error) {
        lastError = error;
        attempt++;

        // Check if error is retryable
        if (!ErrorClassifier.isRetryable(error)) {
          return { success: false, error, attempts: attempt };
        }

        // Check if max retries reached
        if (attempt > this.config.maxRetries) {
          return { success: false, error, attempts: attempt };
        }

        // Calculate delay
        const delay = ErrorClassifier.getRetryDelay(error, attempt);
        
        // Call onRetry callback if provided
        if (this.config.onRetry) {
          await this.config.onRetry(error, attempt, delay, context);
        }

        // Wait before retry
        await this.sleep(delay);
      }
    }

    return { success: false, error: lastError, attempts: attempt };
  }

  /**
   * Execute with exponential backoff
   */
  async executeWithExponentialBackoff(fn, context = {}) {
    let lastError;
    let attempt = 0;
    let delay = this.config.initialDelay;

    while (attempt <= this.config.maxRetries) {
      try {
        const result = await fn();
        return { success: true, result, attempts: attempt + 1 };
      } catch (error) {
        lastError = error;
        attempt++;

        if (!ErrorClassifier.isRetryable(error)) {
          return { success: false, error, attempts: attempt };
        }

        if (attempt > this.config.maxRetries) {
          return { success: false, error, attempts: attempt };
        }

        // Exponential backoff
        delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelay);

        if (this.config.onRetry) {
          await this.config.onRetry(error, attempt, delay, context);
        }

        await this.sleep(delay);
      }
    }

    return { success: false, error: lastError, attempts: attempt };
  }

  /**
   * Execute with custom retry strategy
   */
  async executeWithStrategy(fn, strategy, context = {}) {
    let lastError;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        const result = await fn();
        return { success: true, result, attempts: attempt + 1 };
      } catch (error) {
        lastError = error;
        attempt++;

        if (!ErrorClassifier.isRetryable(error)) {
          return { success: false, error, attempts: attempt };
        }

        if (attempt > this.config.maxRetries) {
          return { success: false, error, attempts: attempt };
        }

        // Use custom strategy
        const shouldRetry = strategy ? await strategy(error, attempt, context) : true;
        if (!shouldRetry) {
          return { success: false, error, attempts: attempt };
        }

        const delay = strategy.getDelay ? strategy.getDelay(error, attempt) : ErrorClassifier.getRetryDelay(error, attempt);

        if (this.config.onRetry) {
          await this.config.onRetry(error, attempt, delay, context);
        }

        await this.sleep(delay);
      }
    }

    return { success: false, error: lastError, attempts: attempt };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Default Retry Strategies
 */
export const RetryStrategies = {
  /**
   * Network retry strategy
   */
  network: {
    maxRetries: 5,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  },

  /**
   * RPC retry strategy
   */
  rpc: {
    maxRetries: 3,
    initialDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2
  },

  /**
   * Transaction retry strategy
   */
  transaction: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 1.5
  },

  /**
   * Rate limit retry strategy
   */
  rateLimit: {
    maxRetries: 5,
    initialDelay: 60000, // 1 minute
    maxDelay: 300000, // 5 minutes
    backoffMultiplier: 2
  }
};

export default RetryHandler;

