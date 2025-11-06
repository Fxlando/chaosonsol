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
      // Production - use Netlify functions
      this.baseURL = '/.netlify/functions/api';
    }
    
    this.socket = null;
    this.isConnected = false;
  }

  /**
   * Initialize connection
   */
  async initialize() {
    try {
      // Check if API server is available
      const health = await this.health();
      if (health.status === 'ok') {
        this.isConnected = true;
        console.log('✅ Connected to API server');
        
        // Initialize app
        await this.initializeApp();
        
        return true;
      }
      return false;
    } catch (error) {
      console.warn('API server not available, using local mode:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Health check
   */
  async health() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      return await response.json();
    } catch (error) {
      throw new Error('API server not available');
    }
  }

  /**
   * Initialize app on server
   */
  async initializeApp(config = {}) {
    try {
      const response = await fetch(`${this.baseURL}/api/initialize`, {
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
    const response = await fetch(`${this.baseURL}/api/wallets/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tags })
    });
    return await response.json();
  }

  async importWallet(privateKey, name, tags = []) {
    const response = await fetch(`${this.baseURL}/api/wallets/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privateKey, name, tags })
    });
    return await response.json();
  }

  async getAllWallets() {
    const response = await fetch(`${this.baseURL}/api/wallets`);
    return await response.json();
  }

  async getWallet(walletId) {
    const response = await fetch(`${this.baseURL}/api/wallets/${walletId}`);
    return await response.json();
  }

  /**
   * Trading operations
   */
  async buyToken(walletId, tokenMint, solAmount, options = {}) {
    const response = await fetch(`${this.baseURL}/api/trading/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, solAmount, options })
    });
    return await response.json();
  }

  async sellToken(walletId, tokenMint, tokenAmount, options = {}) {
    const response = await fetch(`${this.baseURL}/api/trading/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, tokenAmount, options })
    });
    return await response.json();
  }

  async swapTokens(walletId, inputMint, outputMint, inputAmount, options = {}) {
    const response = await fetch(`${this.baseURL}/api/trading/swap`, {
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
    const response = await fetch(`${this.baseURL}/api/trading/quote?${params}`);
    return await response.json();
  }

  async getTokenPrice(tokenMint) {
    const response = await fetch(`${this.baseURL}/api/trading/price/${tokenMint}`);
    return await response.json();
  }

  /**
   * Token launch
   */
  async launchToken(walletId, metadata, initialBuy = 0, options = {}) {
    const response = await fetch(`${this.baseURL}/api/tokens/launch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, metadata, initialBuy, options })
    });
    return await response.json();
  }

  async createToken(walletId, metadata, options = {}) {
    const response = await fetch(`${this.baseURL}/api/tokens/create`, {
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
    const response = await fetch(`${this.baseURL}/api/smartsell/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletId, tokenMint, entryPrice, amount, options })
    });
    return await response.json();
  }

  async getSmartSellPositions() {
    const response = await fetch(`${this.baseURL}/api/smartsell/positions`);
    return await response.json();
  }

  async removeSmartSellPosition(walletId, tokenMint) {
    const response = await fetch(`${this.baseURL}/api/smartsell/positions/${walletId}/${tokenMint}`, {
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
    const response = await fetch(`${this.baseURL}/api/status`);
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

export default APIClient;

