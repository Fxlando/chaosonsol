/**
 * PumpFun Helper Utilities
 * Utility functions for PumpFun account derivation and calculations
 * 
 * Note: All actual transaction building is handled by pumpfun-sdk.
 * This file contains only helper utilities for account derivation.
 */

import { 
  PublicKey
} from '@solana/web3.js';
import { PROGRAM_IDS } from '../../config/constants.js';
import { loggerManager } from '../../utils/logger.js';

const logger = loggerManager.getLogger('PumpFunUtilities');

/**
 * PumpFun Program Constants
 */
export const PUMPFUN_PROGRAM_ID = new PublicKey(PROGRAM_IDS.PUMPFUN_PROGRAM);

/**
 * Derive bonding curve PDA
 * 
 * This is used for account lookups and verification.
 * Actual transaction building is handled by pumpfun-sdk.
 */
export async function deriveBondingCurvePDA(tokenMint) {
  try {
    const mintPubkey = tokenMint instanceof PublicKey ? tokenMint : new PublicKey(tokenMint);
    
    // PumpFun bonding curve PDA derivation
    // This is the standard derivation pattern for PumpFun
    const [bondingCurve, bump] = await PublicKey.findProgramAddress(
      [
        Buffer.from('bonding-curve'),
        mintPubkey.toBuffer()
      ],
      PUMPFUN_PROGRAM_ID
    );

    logger.debug('Derived bonding curve PDA', {
      tokenMint: mintPubkey.toString(),
      bondingCurve: bondingCurve.toString(),
      bump: bump
    });

    return { bondingCurve, bump };
  } catch (error) {
    logger.error('Failed to derive bonding curve PDA:', error);
    throw error;
  }
}

/**
 * Export default
 */
export default {
  deriveBondingCurvePDA,
  PUMPFUN_PROGRAM_ID
};
