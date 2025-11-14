/**
 * PumpFun Token Launch
 * Complete token creation and launch on PumpFun
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { loggerManager } from '../../utils/logger.js';
import { ErrorClassifier } from '../../utils/errors.js';

const logger = loggerManager.getLogger('TokenLaunch');
const PUMP_FUN_IPFS_ENDPOINT = 'https://pump.fun/api/ipfs';
const PUMP_PORTAL_ENDPOINT = 'https://pumpportal.fun/api/trade';
const FALLBACK_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
  'base64'
);

export class TokenLaunch {
  constructor(solanaCore, config = {}) {
    this.solanaCore = solanaCore;
    this.connection = solanaCore.getConnection();
    this.config = {
      metadataFallback: config.metadataFallback || null,
      pumpPortal: config.pumpPortal || {},
      maxRetries: config.maxRetries || 3,
      ...config
    };
    this.isInitialized = false;

    this.initialize();
  }

  async initialize() {
    if (this.isInitialized) return;
    logger.info('Initializing Token Launch...');
    this.isInitialized = true;
    logger.info('✅ Token Launch initialized');
  }

  async launchToken(walletKeypair, metadata, initialBuyAmount = 0, options = {}) {
    try {
      logger.info(`Launching token: ${metadata.name} with initial buy: ${initialBuyAmount} SOL`);
      const createResult = await this.createToken(walletKeypair, metadata, {
        ...options,
        initialBuyAmount
      });

      if (!createResult.success) {
        return createResult;
      }

      return {
        ...createResult,
        success: true
      };
    } catch (error) {
      logger.error('Token launch failed:', error);
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      return {
        success: false,
        error: classifiedError.message,
        tokenMint: null,
        signature: null
      };
    }
  }

  async createToken(walletKeypair, metadata, options = {}) {
    try {
      this.validateMetadata(metadata);
      const metadataUri = await this.uploadMetadata(metadata);
      const mintKeypair = Keypair.generate();
      const mintPubkey = mintKeypair.publicKey.toBase58();

      const portalResult = await this.sendPumpPortalCreate({
        walletKeypair,
        mintKeypair,
        metadataUri,
        metadata,
        initialBuyAmount: Number(options.initialBuyAmount || 0),
        pumpPortalOverrides: options.pumpPortal || {}
      });

      logger.info(`✅ Token created: ${mintPubkey}`);
      if (portalResult.signature) {
        logger.info(`Transaction: https://solscan.io/tx/${portalResult.signature}`);
      }

      // Save metadata locally by mint address for future lookups
      if (this.config.metadataFallback && typeof this.config.metadataFallback.saveByMint === 'function') {
        try {
          const metadataJson = {
            name: metadata.name,
            symbol: metadata.symbol,
            description: metadata.description || '',
            image: metadata.image || '',
            twitter: metadata.twitter,
            telegram: metadata.telegram,
            website: metadata.website,
            attributes: [],
            properties: {
              files: [],
              category: 'image'
            }
          };
          this.config.metadataFallback.saveByMint(mintPubkey, metadataJson);
          logger.info(`✅ Saved metadata locally for mint ${mintPubkey}`);
        } catch (saveError) {
          logger.warn(`Failed to save metadata locally for ${mintPubkey}:`, saveError.message);
        }
      }

      return {
        success: true,
        tokenMint: mintPubkey,
        signature: portalResult.signature || null,
        metadataUri,
        transaction: portalResult.raw || null,
        viewOnExplorer: portalResult.signature
          ? `https://solscan.io/tx/${portalResult.signature}`
          : null,
        devBuyExecuted: Number(options.initialBuyAmount || 0) > 0
      };
    } catch (error) {
      logger.error('Token creation failed:', error);
      const classifiedError = ErrorClassifier.classifyTransactionError(error);
      return {
        success: false,
        error: classifiedError.message,
        tokenMint: null,
        signature: null
      };
    }
  }

  async uploadMetadata(metadata) {
    const {
      name,
      symbol,
      description,
      image,
      twitter,
      telegram,
      website,
      metadataUri: providedUri
    } = metadata || {};

    if (providedUri && providedUri.trim().length > 0) {
      logger.info('Using provided metadata URI, skipping upload.');
      return providedUri.trim();
    }

    const metadataJson = {
      name,
      symbol,
      description: description || '',
      image: image || '',
      attributes: [],
      properties: {
        files: [],
        category: 'image'
      }
    };

    if (twitter) metadataJson.twitter = twitter;
    if (telegram) metadataJson.telegram = telegram;
    if (website) metadataJson.website = website;

    try {
      const formData = new FormData();
      const imageBlob = await this.buildImageBlob(image, symbol || name);
      if (imageBlob) {
        formData.append(
          'file',
          imageBlob,
          `${(symbol || name || 'token').replace(/\s+/g, '_')}.png`
        );
      }
      formData.append('name', name || 'Token');
      formData.append('symbol', symbol || 'TOKEN');
      formData.append('description', metadataJson.description || '');
      formData.append('twitter', metadataJson.twitter || '');
      formData.append('telegram', metadataJson.telegram || '');
      formData.append('website', metadataJson.website || '');
      formData.append('showName', 'true');

      const response = await fetch(PUMP_FUN_IPFS_ENDPOINT, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Pump.fun IPFS upload failed (${response.status}): ${text}`);
      }

      const data = await response.json();
      if (data?.metadataUri) {
        logger.info('✅ Metadata uploaded via pump.fun IPFS:', data.metadataUri);
        return data.metadataUri;
      }

      throw new Error('Pump.fun IPFS upload did not return metadataUri');
    } catch (error) {
      logger.error('Failed to upload metadata via PumpFun API:', error.message || error);

      if (this.config.metadataFallback && typeof this.config.metadataFallback.save === 'function') {
        try {
          const fallbackResult = await this.config.metadataFallback.save(metadataJson);
          if (fallbackResult && fallbackResult.uri) {
            logger.warn(`Using fallback metadata host: ${fallbackResult.uri}`);
            return fallbackResult.uri;
          }
        } catch (fallbackError) {
          logger.error('Fallback metadata storage failed:', fallbackError);
        }
      }

      throw new Error(`Metadata upload failed: ${error.message}`);
    }
  }

  async sendPumpPortalCreate({
    walletKeypair,
    mintKeypair,
    metadataUri,
    metadata,
    initialBuyAmount,
    pumpPortalOverrides = {}
  }) {
    const portalConfig = {
      ...this.config.pumpPortal,
      ...pumpPortalOverrides
    };

    const apiKey =
      portalConfig.apiKey ||
      process.env.PUMPPORTAL_API_KEY ||
      process.env.PUMP_PORTAL_API_KEY;

    if (!apiKey) {
      throw new Error('PumpPortal API key not configured. Set PUMPPORTAL_API_KEY environment variable.');
    }

    const body = {
      action: 'create',
      tokenMetadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        uri: metadataUri
      },
      mint: bs58.encode(mintKeypair.secretKey),
      denominatedInSol: 'true',
      amount: Number.isFinite(initialBuyAmount) ? Number(initialBuyAmount) : 0,
      slippage: portalConfig.slippage ?? 10,
      priorityFee: portalConfig.priorityFee ?? 0.0005,
      pool: portalConfig.pool || 'pump'
    };

    if (portalConfig.isMayhemMode === true || portalConfig.isMayhemMode === 'true') {
      body.isMayhemMode = 'true';
    }

    const endpoint = `${PUMP_PORTAL_ENDPOINT}?api-key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const text = await response.text();
    if (!response.ok) {
      let message = response.statusText || 'PumpPortal trade failed';
      try {
        const data = JSON.parse(text);
        message = data?.message || data?.error || message;
      } catch {
        // ignored
      }
      throw new Error(`PumpPortal create failed (${response.status}): ${message}`);
    }

    let data = {};
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      logger.warn('PumpPortal returned non-JSON response:', parseError);
    }

    return {
      signature: data?.signature || null,
      raw: data
    };
  }

  async buildImageBlob(image, label) {
    try {
      if (image && image.startsWith('data:')) {
        const match = image.match(/^data:(.+?);base64,(.+)$/);
        if (match) {
          const mimeType = match[1] || 'image/png';
          const buffer = Buffer.from(match[2], 'base64');
          return new Blob([buffer], { type: mimeType });
        }
      }

      if (image && /^https?:\/\//i.test(image)) {
        const response = await fetch(image);
        if (response.ok) {
          return await response.blob();
        }
      }
    } catch (error) {
      logger.warn(`Failed to build image blob for ${label || 'token'}:`, error);
    }

    return new Blob([FALLBACK_PIXEL], { type: 'image/png' });
  }

  validateMetadata(metadata) {
    if (!metadata.name || metadata.name.trim().length === 0) {
      throw new Error('Token name is required');
    } else if (metadata.name.length > 32) {
      throw new Error('Token name must be 32 characters or fewer');
    }

    if (!metadata.symbol || metadata.symbol.trim().length === 0) {
      throw new Error('Token symbol is required');
    } else if (metadata.symbol.length > 10) {
      throw new Error('Token symbol must be 10 characters or fewer');
    }

    if (metadata.description && metadata.description.length > 1000) {
      throw new Error('Token description must be 1000 characters or fewer');
    }

    return metadata;
  }
}

export default TokenLaunch;

