/**
 * Real SOL Price Fetcher
 * Gets real-time SOL price from multiple sources
 */

import axios from 'axios';
import { loggerManager } from './logger.js';

const logger = loggerManager.getLogger('SOLPrice');

const PRICE_PROVIDERS = [
  {
    name: 'Coinbase',
    fetch: async () => {
      const response = await axios.get('https://api.coinbase.com/v2/exchange-rates?currency=SOL', {
        timeout: 5000
      });

      const price = Number(response?.data?.data?.rates?.USD);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error('Coinbase payload missing SOL/USD rate');
      }

      return price;
    }
  },
  {
    name: 'CoinGecko',
    fetch: async () => {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
        timeout: 5000
      });

      const price = Number(response?.data?.solana?.usd);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error('CoinGecko payload missing SOL/USD rate');
      }

      return price;
    }
  }
];

export async function getSOLPriceFromJupiter() {
  let lastError = null;

  for (const provider of PRICE_PROVIDERS) {
    try {
      const price = await provider.fetch();
      logger.info(`✅ Real SOL price from ${provider.name}: $${price}`);
      return price;
    } catch (error) {
      lastError = error;
      logger.warn(`${provider.name} price fetch failed: ${error.message}`);
    }
  }

  throw lastError || new Error('All SOL price providers failed');
}

export async function getSOLPriceFromCoinbase() {
  return PRICE_PROVIDERS[0].fetch();
}

/**
 * Get real SOL price with fallback
 */
export async function getRealSOLPrice() {
  try {
    return await getSOLPriceFromJupiter();
  } catch (error) {
    logger.error('Failed to fetch SOL price from all providers:', error.message);
    throw error;
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

    try {
      this.price = await getRealSOLPrice();
      this.lastUpdate = now;
    } catch (error) {
      logger.error('Failed to refresh SOL price from providers:', error);

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
  getSOLPriceFromCoinbase,
  getRealSOLPrice,
  solPriceCache
};

