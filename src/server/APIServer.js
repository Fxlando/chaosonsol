/**
 * Production API Server
 * Express server that uses the new backend modules
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { App } from '../App.js';
import { loggerManager } from '../utils/logger.js';

const logger = loggerManager.getLogger('APIServer');

/**
 * API Server Class
 */
export class APIServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 3000,
      network: config.network || process.env.NETWORK || 'mainnet-beta',
      cors: config.cors !== false,
      ...config
    };

    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketServer(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.chaosApp = null; // Chaos Bot App instance
    this.isInitialized = false;
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Setup middleware
   */
  setupMiddleware() {
    // CORS
    if (this.config.cors) {
      this.app.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }));
    }

    // JSON parser
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        network: this.config.network
      });
    });

    // Initialize app
    this.app.post('/api/initialize', async (req, res) => {
      try {
        if (!this.chaosApp) {
          this.chaosApp = new App({
            network: this.config.network,
            ...req.body.config
          });
          await this.chaosApp.initialize();
        }
        
        const status = this.chaosApp.getStatus();
        res.json({ success: true, status });
      } catch (error) {
        logger.error('Initialize failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Wallet routes
    this.app.post('/api/wallets/create', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { name, tags } = req.body;
        const result = this.chaosApp.createWallet(name || null, tags || []);
        res.json(result);
      } catch (error) {
        logger.error('Create wallet failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/wallets/import', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { privateKey, name, tags } = req.body;
        const result = this.chaosApp.importWallet(privateKey, name || null, tags || []);
        res.json(result);
      } catch (error) {
        logger.error('Import wallet failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/wallets', async (req, res) => {
      try {
        await this.ensureInitialized();
        const wallets = await this.chaosApp.getAllWalletsWithBalances();
        res.json({ success: true, wallets });
      } catch (error) {
        logger.error('Get wallets failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/wallets/:walletId', async (req, res) => {
      try {
        await this.ensureInitialized();
        const wallet = this.chaosApp.walletManager.getWallet(req.params.walletId);
        if (wallet) {
          const balance = await this.chaosApp.walletManager.getWalletBalance(req.params.walletId);
          res.json({ success: true, wallet: { ...wallet, ...balance } });
        } else {
          res.status(404).json({ success: false, error: 'Wallet not found' });
        }
      } catch (error) {
        logger.error('Get wallet failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Trading routes
    this.app.post('/api/trading/buy', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { walletId, tokenMint, solAmount, options } = req.body;
        const result = await this.chaosApp.buyToken(walletId, tokenMint, solAmount, options || {});
        this.emitToClients('trade', { type: 'buy', result });
        res.json(result);
      } catch (error) {
        logger.error('Buy token failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/trading/sell', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { walletId, tokenMint, tokenAmount, options } = req.body;
        const result = await this.chaosApp.sellToken(walletId, tokenMint, tokenAmount, options || {});
        this.emitToClients('trade', { type: 'sell', result });
        res.json(result);
      } catch (error) {
        logger.error('Sell token failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/tagging/run', async (req, res) => {
      try {
        await this.ensureInitialized();
        const result = await this.chaosApp.tagWallets(req.body || {});
        this.emitToClients('tagging', result);
        res.json(result);
      } catch (error) {
        logger.error('Tagging workflow failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/trading/swap', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { walletId, inputMint, outputMint, inputAmount, options } = req.body;
        const result = await this.chaosApp.tradingEngine.swapTokens(
          walletId,
          inputMint,
          outputMint,
          inputAmount,
          options || {}
        );
        this.emitToClients('trade', { type: 'swap', result });
        res.json(result);
      } catch (error) {
        logger.error('Swap failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/trading/quote', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { inputMint, outputMint, amount } = req.query;
        const result = await this.chaosApp.getQuote(inputMint, outputMint, parseInt(amount), {});
        res.json(result);
      } catch (error) {
        logger.error('Get quote failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/trading/price/:tokenMint', async (req, res) => {
      try {
        await this.ensureInitialized();
        const result = await this.chaosApp.getTokenPrice(req.params.tokenMint);
        res.json(result);
      } catch (error) {
        logger.error('Get price failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Token launch routes
    this.app.post('/api/tokens/launch', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { walletId, metadata, initialBuy, options } = req.body;
        const result = await this.chaosApp.launchToken(
          walletId,
          metadata,
          initialBuy || 0,
          options || {}
        );
        this.emitToClients('token-launch', { result });
        res.json(result);
      } catch (error) {
        logger.error('Launch token failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/tokens/create', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { walletId, metadata, options } = req.body;
        const result = await this.chaosApp.createToken(walletId, metadata, options || {});
        res.json(result);
      } catch (error) {
        logger.error('Create token failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Smart Sell routes
    this.app.post('/api/smartsell/add', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { walletId, tokenMint, entryPrice, amount, options } = req.body;
        const result = await this.chaosApp.addSmartSellPosition(
          walletId,
          tokenMint,
          entryPrice,
          amount,
          options || {}
        );
        res.json(result);
      } catch (error) {
        logger.error('Add Smart Sell failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/smartsell/positions', async (req, res) => {
      try {
        await this.ensureInitialized();
        const positions = this.chaosApp.smartSell.getPositions();
        res.json({ success: true, positions });
      } catch (error) {
        logger.error('Get Smart Sell positions failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.delete('/api/smartsell/positions/:walletId/:tokenMint', async (req, res) => {
      try {
        await this.ensureInitialized();
        const result = this.chaosApp.smartSell.removePosition(
          req.params.walletId,
          req.params.tokenMint
        );
        res.json(result);
      } catch (error) {
        logger.error('Remove Smart Sell position failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Volume Bot routes
    this.app.post('/api/volumebot/start', async (req, res) => {
      try {
        await this.ensureInitialized();
        const { walletIds, tokenMint, config } = req.body;
        const result = await this.chaosApp.startVolumeSession(walletIds, tokenMint, config || {});
        res.json(result);
      } catch (error) {
        logger.error('Start volume session failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/volumebot/sessions', async (req, res) => {
      try {
        await this.ensureInitialized();
        const sessions = this.chaosApp.volumeBot.getAllSessions();
        res.json({ success: true, sessions });
      } catch (error) {
        logger.error('Get volume sessions failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/volumebot/stop/:sessionId', async (req, res) => {
      try {
        await this.ensureInitialized();
        const result = this.chaosApp.volumeBot.stopSession(req.params.sessionId);
        res.json(result);
      } catch (error) {
        logger.error('Stop volume session failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Status routes
    this.app.get('/api/status', async (req, res) => {
      try {
        await this.ensureInitialized();
        const status = this.chaosApp.getStatus();
        const rpcStats = this.chaosApp.getRPCStats();
        res.json({ success: true, status, rpcStats });
      } catch (error) {
        logger.error('Get status failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // PumpFun routes
    this.app.get('/api/pumpfun/token/:tokenMint', async (req, res) => {
      try {
        await this.ensureInitialized();
        const result = await this.chaosApp.tradingEngine.pumpFun.getTokenInfo(req.params.tokenMint);
        res.json(result);
      } catch (error) {
        logger.error('Get PumpFun token info failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/pumpfun/trending', async (req, res) => {
      try {
        await this.ensureInitialized();
        const limit = parseInt(req.query.limit) || 20;
        const result = await this.chaosApp.tradingEngine.pumpFun.getTrendingTokens(limit);
        res.json(result);
      } catch (error) {
        logger.error('Get trending tokens failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Jupiter routes
    this.app.get('/api/jupiter/tokens', async (req, res) => {
      try {
        await this.ensureInitialized();
        const result = await this.chaosApp.tradingEngine.jupiter.getTokenList();
        res.json(result);
      } catch (error) {
        logger.error('Get Jupiter tokens failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      logger.error('API Error:', err);
      res.status(500).json({ 
        success: false, 
        error: err.message || 'Internal server error' 
      });
    });
  }

  /**
   * Setup WebSocket
   */
  setupWebSocket() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected:', socket.id);

      socket.on('disconnect', () => {
        logger.info('Client disconnected:', socket.id);
      });

      socket.on('subscribe', (channel) => {
        socket.join(channel);
        logger.info(`Client ${socket.id} subscribed to ${channel}`);
      });

      socket.on('unsubscribe', (channel) => {
        socket.leave(channel);
        logger.info(`Client ${socket.id} unsubscribed from ${channel}`);
      });
    });
  }

  /**
   * Emit to all connected clients
   */
  emitToClients(event, data) {
    this.io.emit(event, data);
  }

  /**
   * Ensure app is initialized
   */
  async ensureInitialized() {
    if (!this.chaosApp) {
      this.chaosApp = new App({
        network: this.config.network
      });
      await this.chaosApp.initialize();
    }
  }

  /**
   * Start server
   */
  async start() {
    try {
      // Initialize Chaos App
      await this.ensureInitialized();

      // Start HTTP server
      this.server.listen(this.config.port, () => {
        logger.info(`🚀 API Server running on port ${this.config.port}`);
        logger.info(`📡 Network: ${this.config.network}`);
        logger.info(`🌐 API Base: http://localhost:${this.config.port}/api`);
        logger.info(`✅ Server ready for connections`);
      });
    } catch (error) {
      logger.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop server
   */
  async stop() {
    if (this.chaosApp) {
      this.chaosApp.destroy();
    }
    this.server.close();
    logger.info('API Server stopped');
  }
}

export default APIServer;

