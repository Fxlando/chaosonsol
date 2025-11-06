/**
 * Real SOL Price Fetcher
 * Gets real-time SOL price from multiple sources
 */

import axios from 'axios';
import { loggerManager } from './logger.js';

const logger = loggerManager.getLogger('SOLPrice');

/**
 * Get real SOL price from CoinGecko
 */
export async function getSOLPriceFromCoinGecko() {
  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { timeout: 5000 }
    );
    
    if (response.data && response.data.solana && response.data.solana.usd) {
      return response.data.solana.usd;
    }
    throw new Error('Invalid response from CoinGecko');
  } catch (error) {
    logger.warn('CoinGecko price fetch failed:', error.message);
    throw error;
  }
}

/**
 * Get real SOL price from Coinbase
 */
export async function getSOLPriceFromCoinbase() {
  try {
    const response = await axios.get(
      'https://api.coinbase.com/v2/exchange-rates?currency=SOL',
      { timeout: 5000 }
    );
    
    if (response.data && response.data.data && response.data.data.rates && response.data.data.rates.USD) {
      return parseFloat(response.data.data.rates.USD);
    }
    throw new Error('Invalid response from Coinbase');
  } catch (error) {
    logger.warn('Coinbase price fetch failed:', error.message);
    throw error;
  }
}

/**
 * Get real SOL price with fallback
 */
export async function getRealSOLPrice() {
  try {
    // Try CoinGecko first
    try {
      const price = await getSOLPriceFromCoinGecko();
      logger.info(`✅ Real SOL price from CoinGecko: $${price}`);
      return price;
    } catch (error) {
      // Fallback to Coinbase
      const price = await getSOLPriceFromCoinbase();
      logger.info(`✅ Real SOL price from Coinbase: $${price}`);
      return price;
    }
  } catch (error) {
    logger.error('All SOL price sources failed:', error);
    // Last resort fallback (should rarely happen)
    logger.warn('Using fallback SOL price: $180');
    return 180;
  }
}

/**
 * SOL Price Cache
 */
class SOLPriceCache {
  constructor() {
    this.price = null;
    this.lastUpdate = null;
    this.cacheDuration = 60000; // 1 minute
  }

  async getPrice(forceRefresh = false) {
    const now = Date.now();
    
    if (!forceRefresh && this.price && this.lastUpdate && (now - this.lastUpdate) < this.cacheDuration) {
      return this.price;
    }

    this.price = await getRealSOLPrice();
    this.lastUpdate = now;
    return this.price;
  }
}

export const solPriceCache = new SOLPriceCache();

export default {
  getSOLPriceFromCoinGecko,
  getSOLPriceFromCoinbase,
  getRealSOLPrice,
  solPriceCache
};

