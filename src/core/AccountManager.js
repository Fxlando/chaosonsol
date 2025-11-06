/**
 * Account Manager
 * Handles account state management, validation, and operations
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { loggerManager } from '../utils/logger.js';
import { InvalidAccountError } from '../utils/errors.js';

const logger = loggerManager.getLogger('AccountManager');

/**
 * Account Manager Class
 */
export class AccountManager {
  constructor(connection) {
    this.connection = connection;
  }

  /**
   * Get account info
   */
  async getAccountInfo(publicKey) {
    try {
      const pubkey = publicKey instanceof PublicKey ? publicKey : new PublicKey(publicKey);
      return await this.connection.getAccountInfo(pubkey);
    } catch (error) {
      logger.error('Failed to get account info:', error);
      throw new InvalidAccountError('Failed to get account info', { 
        account: publicKey,
        error: error.message 
      });
    }
  }

  /**
   * Check if account exists
   */
  async accountExists(publicKey) {
    try {
      const accountInfo = await this.getAccountInfo(publicKey);
      return accountInfo !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(publicKey) {
    try {
      const pubkey = publicKey instanceof PublicKey ? publicKey : new PublicKey(publicKey);
      const balance = await this.connection.getBalance(pubkey);
      return balance;
    } catch (error) {
      logger.error('Failed to get account balance:', error);
      throw new InvalidAccountError('Failed to get account balance', { 
        account: publicKey,
        error: error.message 
      });
    }
  }

  /**
   * Get associated token address
   */
  async getAssociatedTokenAddress(tokenMint, owner, allowOwnerOffCurve = false) {
    try {
      const mintPubkey = tokenMint instanceof PublicKey ? tokenMint : new PublicKey(tokenMint);
      const ownerPubkey = owner instanceof PublicKey ? owner : new PublicKey(owner);
      
      return await getAssociatedTokenAddress(
        mintPubkey,
        ownerPubkey,
        allowOwnerOffCurve
      );
    } catch (error) {
      logger.error('Failed to get associated token address:', error);
      throw new InvalidAccountError('Failed to get associated token address', { 
        tokenMint,
        owner,
        error: error.message 
      });
    }
  }

  /**
   * Check if token account exists
   */
  async tokenAccountExists(tokenMint, owner) {
    try {
      const tokenAccount = await this.getAssociatedTokenAddress(tokenMint, owner);
      const accountInfo = await this.getAccountInfo(tokenAccount);
      return accountInfo !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get token account info
   */
  async getTokenAccountInfo(tokenMint, owner) {
    try {
      const tokenAccount = await this.getAssociatedTokenAddress(tokenMint, owner);
      return await getAccount(this.connection, tokenAccount);
    } catch (error) {
      logger.error('Failed to get token account info:', error);
      throw new InvalidAccountError('Failed to get token account info', { 
        tokenMint,
        owner,
        error: error.message 
      });
    }
  }

  /**
   * Get token account balance
   */
  async getTokenAccountBalance(tokenMint, owner) {
    try {
      const tokenAccount = await this.getAssociatedTokenAddress(tokenMint, owner);
      const balance = await this.connection.getTokenAccountBalance(tokenAccount);
      return balance.value;
    } catch (error) {
      logger.error('Failed to get token account balance:', error);
      // Return zero balance if account doesn't exist
      return {
        amount: '0',
        decimals: 0,
        uiAmount: 0,
        uiAmountString: '0'
      };
    }
  }

  /**
   * Create associated token account instruction
   */
  async createAssociatedTokenAccountInstruction(
    payer,
    owner,
    tokenMint
  ) {
    try {
      const payerPubkey = payer instanceof PublicKey ? payer : new PublicKey(payer);
      const ownerPubkey = owner instanceof PublicKey ? owner : new PublicKey(owner);
      const mintPubkey = tokenMint instanceof PublicKey ? tokenMint : new PublicKey(tokenMint);

      const tokenAccount = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);

      return createAssociatedTokenAccountInstruction(
        payerPubkey,
        tokenAccount,
        ownerPubkey,
        mintPubkey
      );
    } catch (error) {
      logger.error('Failed to create associated token account instruction:', error);
      throw new InvalidAccountError('Failed to create associated token account instruction', { 
        payer,
        owner,
        tokenMint,
        error: error.message 
      });
    }
  }

  /**
   * Get all token accounts for owner
   */
  async getAllTokenAccounts(owner) {
    try {
      const ownerPubkey = owner instanceof PublicKey ? owner : new PublicKey(owner);
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        ownerPubkey,
        { programId: TOKEN_PROGRAM_ID }
      );

      return tokenAccounts.value.map(account => ({
        pubkey: account.pubkey.toString(),
        mint: account.account.data.parsed.info.mint,
        owner: account.account.data.parsed.info.owner,
        amount: account.account.data.parsed.info.tokenAmount.amount,
        decimals: account.account.data.parsed.info.tokenAmount.decimals,
        uiAmount: account.account.data.parsed.info.tokenAmount.uiAmount,
        uiAmountString: account.account.data.parsed.info.tokenAmount.uiAmountString
      }));
    } catch (error) {
      logger.error('Failed to get all token accounts:', error);
      throw new InvalidAccountError('Failed to get all token accounts', { 
        owner,
        error: error.message 
      });
    }
  }

  /**
   * Validate public key
   */
  isValidPublicKey(publicKey) {
    try {
      const pubkey = publicKey instanceof PublicKey ? publicKey : new PublicKey(publicKey);
      return PublicKey.isOnCurve(pubkey);
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate account has sufficient balance
   */
  async hasSufficientBalance(publicKey, requiredAmount) {
    try {
      const balance = await this.getAccountBalance(publicKey);
      return balance >= requiredAmount;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate token account has sufficient balance
   */
  async hasSufficientTokenBalance(tokenMint, owner, requiredAmount) {
    try {
      const balance = await this.getTokenAccountBalance(tokenMint, owner);
      return BigInt(balance.amount) >= BigInt(requiredAmount);
    } catch (error) {
      return false;
    }
  }
}

export default AccountManager;

