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
        
        // Initialize app
        try {
          await this.initializeApp();
        } catch (initError) {
          console.warn('App initialization failed, continuing with connection:', initError.message);
        }
        
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
      const response = await this.safeFetch(this.buildUrl('/health'), { method: 'GET' }, retries);
      if (response.ok) {
        return await response.json();
      }
      throw new Error(`Health check failed: ${response.status}`);
    } catch (error) {
      throw new Error('API server not available');
    }
  }

  /**
   * Initialize app on server
   */
  async initializeApp(config = {}) {
    try {
      const response = await this.safeFetch(this.buildUrl('/initialize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      return await response.json();
    } catch (error) {
      throw new Error(`Failed to initialize app: ${error.message}`);
    }
  }

  /**
   * Wallet operations
   */
  async createWallet(name, tags = []) {
    const response = await fetch(this.buildUrl('/wallets/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tags })
    });
    return await response.json();
  }

  async importWallet(privateKey, name, tags = []) {
    const response = await fetch(this.buildUrl('/wallets/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privateKey, name, tags })
    });
    return await response.json();
  }

  async getAllWallets() {
    const response = await this.safeFetch(this.buildUrl('/wallets'));
    if (!response.ok) {
      throw new Error(`Failed to get wallets: ${response.status}`);
    }
    return await response.json();
  }

  async getWallet(walletId) {
    const response = await fetch(this.buildUrl(`/wallets/${walletId}`));
    return await response.json();
  }

  /**
   * Trading operations
   */
  async buyToken(walletId, tokenMint, solAmount, options = {}) {
    const response = await fetch(this.buildUrl('/trading/buy'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, solAmount, options })
    });
    return await response.json();
  }

  async sellToken(walletId, tokenMint, tokenAmount, options = {}) {
    const response = await fetch(this.buildUrl('/trading/sell'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, tokenAmount, options })
    });
    return await response.json();
  }

  async swapTokens(walletId, inputMint, outputMint, inputAmount, options = {}) {
    const response = await fetch(this.buildUrl('/trading/swap'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, inputMint, outputMint, inputAmount, options })
    });
    return await response.json();
  }

  async getQuote(inputMint, outputMint, amount, options = {}) {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString()
    });
    const response = await fetch(this.buildUrl(`/trading/quote?${params}`));
    return await response.json();
  }

  async getTokenPrice(tokenMint) {
    const response = await fetch(this.buildUrl(`/trading/price/${tokenMint}`));
    return await response.json();
  }

  /**
   * Token launch
   */
  async launchToken(walletId, metadata, initialBuy = 0, options = {}) {
    const response = await fetch(this.buildUrl('/tokens/launch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, metadata, initialBuy, options })
    });
    return await response.json();
  }

  async createToken(walletId, metadata, options = {}) {
    const response = await fetch(this.buildUrl('/tokens/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, metadata, options })
    });
    return await response.json();
  }

  /**
   * Smart Sell
   */
  async addSmartSellPosition(walletId, tokenMint, entryPrice, amount, options = {}) {
    const response = await fetch(this.buildUrl('/smartsell/add'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, entryPrice, amount, options })
    });
    return await response.json();
  }

  async getSmartSellPositions() {
    const response = await fetch(this.buildUrl('/smartsell/positions'));
    return await response.json();
  }

  async removeSmartSellPosition(walletId, tokenMint) {
    const response = await fetch(this.buildUrl(`/smartsell/positions/${walletId}/${tokenMint}`), {
      method: 'DELETE'
    });
    return await response.json();
  }

  /**
   * Volume Bot
   */
  async startVolumeSession(walletIds, tokenMint, config = {}) {
    const response = await fetch(`${this.baseURL}/api/volumebot/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletIds, tokenMint, config })
    });
    return await response.json();
  }

  async getVolumeSessions() {
    const response = await fetch(`${this.baseURL}/api/volumebot/sessions`);
    return await response.json();
  }

  async stopVolumeSession(sessionId) {
    const response = await fetch(`${this.baseURL}/api/volumebot/stop/${sessionId}`, {
      method: 'POST'
    });
    return await response.json();
  }

  /**
   * Status
   */
  async getStatus() {
    const response = await fetch(this.buildUrl('/status'));
    return await response.json();
  }

  /**
   * PumpFun
   */
  async getPumpFunToken(tokenMint) {
    const response = await fetch(`${this.baseURL}/api/pumpfun/token/${tokenMint}`);
    return await response.json();
  }

  async getTrendingTokens(limit = 20) {
    const response = await fetch(`${this.baseURL}/api/pumpfun/trending?limit=${limit}`);
    return await response.json();
  }

  /**
   * Jupiter
   */
  async getJupiterTokens() {
    const response = await fetch(`${this.baseURL}/api/jupiter/tokens`);
    return await response.json();
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.APIClient = APIClient;
  window.apiClient = new APIClient();
}

