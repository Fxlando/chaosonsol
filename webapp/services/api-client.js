/**
 * API Client for Webapp
 * Connects the webapp frontend to the new API server
 */

class APIClient {
  constructor(baseURL = null) {
    // Auto-detect API base URL
    if (baseURL) {
      this.baseURL = baseURL;
    } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      this.baseURL = 'http://localhost:3000';
    } else {
      // Production - use Netlify functions (relative path uses current protocol)
      this.baseURL = '/.netlify/functions/api';
    }
    
    this.socket = null;
    this.isConnected = false;
  }

  buildUrl(path) {
    if (!path.startsWith('/')) {
      path = `/${path}`;
    }
    return `${this.baseURL}${path}`;
  }

  /**
   * Safe fetch with SSL error retry logic
   */
  async safeFetch(url, options = {}, retries = 2) {
    // Ensure HTTPS for production URLs
    let fullUrl = url;
    if (url.startsWith('/') && window.location.protocol === 'https:') {
      fullUrl = `${window.location.protocol}//${window.location.host}${url}`;
    }
    
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(fullUrl, {
          ...options,
          cache: 'no-cache',
          credentials: 'same-origin'
        });
        return response;
      } catch (error) {
        // Check if it's an SSL or network error
        const isSslError = error.message.includes('SSL') || 
                          error.message.includes('ERR_SSL') ||
                          error.message.includes('network') ||
                          error.message.includes('Failed to fetch');
        
        if (isSslError && i < retries) {
          // Exponential backoff: wait 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
          console.warn(`Retrying request after SSL error (attempt ${i + 2}/${retries + 1})...`);
          continue;
        }
        throw error;
      }
    }
  }

  async request(path, options = {}, retries = 2) {
    const response = await this.safeFetch(this.buildUrl(path), options, retries);
    let data;

    try {
      data = await response.json();
    } catch (error) {
      data = { success: response.ok };
    }

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.defineProperty(data, '_httpStatus', {
        value: response.status,
        enumerable: false
      });

      if (!Object.prototype.hasOwnProperty.call(data, 'success')) {
        data.success = response.ok;
      }
    }

    return data;
  }

  /**
   * Initialize connection with SSL error handling
   */
  async initialize() {
    try {
      // Ensure we're using HTTPS in production
      if (window.location.protocol === 'https:' && this.baseURL.startsWith('/')) {
        // Already using relative path, which will use current protocol
        console.log('✅ Using HTTPS for API calls');
      }
      
      // Check if API server is available with retry
      const health = await this.health(3);
      if (health.status === 'ok') {
        this.isConnected = true;
        console.log('✅ Connected to API server');
        
        return true;
      }
      return false;
    } catch (error) {
      // Check if it's an SSL error
      if (error.message.includes('SSL') || error.message.includes('ERR_SSL')) {
        console.error('SSL Error detected. This may be a temporary issue. Retrying...');
        // Wait and retry once more
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          const health = await this.health(1);
          if (health.status === 'ok') {
            this.isConnected = true;
            console.log('✅ Connected to API server after SSL retry');
            return true;
          }
        } catch (retryError) {
          console.error('SSL Error persists:', retryError.message);
        }
      }
      console.warn('API server not available, using local mode:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Health check with retry logic for SSL errors
   */
  async health(retries = 3) {
    try {
      return await this.request('/health', {}, retries);
    } catch (error) {
      throw new Error('API server not available');
    }
  }

  /**
   * Initialize app on server
   */
  async initializeApp(config = {}) {
    try {
      return await this.request('/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
    } catch (error) {
      throw new Error(`Failed to initialize app: ${error.message}`);
    }
  }

  /**
   * Wallet operations
   */
  async createWallet(name, tags = []) {
    return await this.request('/wallets/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tags })
    });
  }

  async importWallet(privateKey, name, tags = []) {
    return await this.request('/wallets/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privateKey, name, tags })
    });
  }

  async getAllWallets() {
    return await this.request('/wallets');
  }

  async getWallet(walletId) {
    return await this.request(`/wallets/${walletId}`);
  }

  /**
   * Trading operations
   */
  async buyToken(walletId, tokenMint, solAmount, options = {}) {
    return await this.request('/trading/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, solAmount, options })
    });
  }

  async sellToken(walletId, tokenMint, tokenAmount, options = {}) {
    return await this.request('/trading/sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, tokenAmount, options })
    });
  }

  async swapTokens(walletId, inputMint, outputMint, inputAmount, options = {}) {
    return await this.request('/trading/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, inputMint, outputMint, inputAmount, options })
    });
  }

  async tagWallets(payload) {
    return await this.request('/tagging/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  async getQuote(inputMint, outputMint, amount, options = {}) {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString()
    });
    return await this.request(`/trading/quote?${params.toString()}`);
  }

  async getTokenPrice(tokenMint) {
    return await this.request(`/trading/price/${tokenMint}`);
  }

  /**
   * Token launch
   */
  async launchToken(walletId, metadata, initialBuy = 0, options = {}) {
    return await this.request('/tokens/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, metadata, initialBuy, options })
    });
  }

  async createToken(walletId, metadata, options = {}) {
    return await this.request('/tokens/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, metadata, options })
    });
  }

  async copyToken(walletId, sourceMint, options = {}) {
    return await this.request('/tokens/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, sourceMint, options })
    });
  }

  async importToken(tokenMint, options = {}) {
    return await this.request('/tokens/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenMint, options })
    });
  }

  /**
   * Smart Sell
   */
  async addSmartSellPosition(walletId, tokenMint, entryPrice, amount, options = {}) {
    return await this.request('/smartsell/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, entryPrice, amount, options })
    });
  }

  async getSmartSellPositions() {
    return await this.request('/smartsell/positions');
  }

  async removeSmartSellPosition(walletId, tokenMint) {
    return await this.request(`/smartsell/positions/${walletId}/${tokenMint}`, {
      method: 'DELETE'
    });
  }

  /**
   * Volume Bot
   */
  async startVolumeSession(walletIds, tokenMint, config = {}) {
    return await this.request('/volumebot/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletIds, tokenMint, config })
    });
  }

  async getVolumeSessions() {
    return await this.request('/volumebot/sessions');
  }

  async stopVolumeSession(sessionId) {
    return await this.request(`/volumebot/stop/${sessionId}`, {
      method: 'POST'
    });
  }

  /**
   * Status
   */
  async getStatus() {
    return await this.request('/status');
  }

  /**
   * PumpFun
   */
  async getPumpFunToken(tokenMint) {
    return await this.request(`/pumpfun/token/${tokenMint}`);
  }

  async getTrendingTokens(limit = 20) {
    return await this.request(`/pumpfun/trending?limit=${limit}`);
  }

  /**
   * Jupiter
   */
  async getJupiterTokens() {
    return await this.request('/jupiter/tokens');
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.APIClient = APIClient;
  window.apiClient = new APIClient();
}

