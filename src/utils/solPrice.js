/**
 * Real SOL Price Fetcher
 * Gets real-time SOL price from multiple sources
 */

import axios from 'axios';
import { loggerManager } from './logger.js';

const logger = loggerManager.getLogger('SOLPrice');

const JUPITER_PRICE_ENDPOINTS = [
  'https://price.jup.ag/v6/price?ids=SOL',
  'https://price.jup.ag/v4/price?ids=SOL'
];

const SOL_PRICE_KEYS = [
  'SOL',
  'So11111111111111111111111111111111111111112'
];

function extractPriceFromResponse(responseData) {
  if (!responseData || typeof responseData !== 'object') {
    return null;
  }

  const data = responseData.data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  for (const key of SOL_PRICE_KEYS) {
    const entry = data[key];
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    if (entry.price !== undefined) {
      const price = Number(entry.price);
      if (!Number.isNaN(price)) {
        return price;
      }
    }

    if (entry.usd !== undefined) {
      const price = Number(entry.usd);
      if (!Number.isNaN(price)) {
        return price;
      }
    }
  }

  return null;
}

/**
 * Get real SOL price from Jupiter price API
 */
export async function getSOLPriceFromJupiter() {
  let lastError;

  for (const endpoint of JUPITER_PRICE_ENDPOINTS) {
    try {
      const response = await axios.get(endpoint, { timeout: 5000 });
      const price = extractPriceFromResponse(response.data);

      if (price !== null) {
        return price;
      }

      lastError = new Error(`No SOL price in Jupiter response from ${endpoint}`);
    } catch (error) {
      lastError = error;
      logger.warn(`Jupiter price fetch failed from ${endpoint}: ${error.message}`);
    }
  }

  throw lastError || new Error('Unable to fetch SOL price from Jupiter');
}

/**
 * Get real SOL price with fallback
 */
export async function getRealSOLPrice() {
  const price = await getSOLPriceFromJupiter();
  logger.info(`✅ Real SOL price from Jupiter: $${price}`);
  return price;
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

    try {
      this.price = await getRealSOLPrice();
      this.lastUpdate = now;
    } catch (error) {
      logger.error('Failed to refresh SOL price from Jupiter:', error);

      if (this.price !== null) {
        logger.warn('Serving cached SOL price due to refresh failure');
        return this.price;
      }

      throw error;
    }

    return this.price;
  }
}

export const solPriceCache = new SOLPriceCache();

export default {
  getSOLPriceFromJupiter,
  getRealSOLPrice,
  solPriceCache
};

