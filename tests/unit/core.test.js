/**
 * Unit Tests for Core Modules
 * Basic tests for SolanaCore, RPCManager, etc.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SolanaCore } from '../../src/core/SolanaCore.js';
import { RPCManager } from '../../src/core/RPCManager.js';

describe('Core Modules', () => {
  describe('SolanaCore', () => {
    let solanaCore;

    beforeEach(async () => {
      solanaCore = new SolanaCore('devnet');
      await solanaCore.initialize();
    });

    afterEach(() => {
      if (solanaCore) {
        solanaCore.destroy();
      }
    });

    it('should initialize SolanaCore', () => {
      expect(solanaCore).toBeDefined();
      expect(solanaCore.isInitialized).toBe(true);
    });

    it('should get connection', () => {
      const connection = solanaCore.getConnection();
      expect(connection).toBeDefined();
    });

    it('should get slot', async () => {
      const slot = await solanaCore.getSlot();
      expect(slot).toBeGreaterThan(0);
    });

    it('should get block height', async () => {
      const blockHeight = await solanaCore.getBlockHeight();
      expect(blockHeight).toBeGreaterThan(0);
    });
  });

  describe('RPCManager', () => {
    let rpcManager;

    beforeEach(async () => {
      rpcManager = new RPCManager('devnet');
      await rpcManager.initialize();
    });

    afterEach(() => {
      if (rpcManager) {
        rpcManager.destroy();
      }
    });

    it('should initialize RPCManager', () => {
      expect(rpcManager).toBeDefined();
      expect(rpcManager.isInitialized).toBe(true);
    });

    it('should have connections', () => {
      expect(rpcManager.connections.length).toBeGreaterThan(0);
    });

    it('should get connection', () => {
      const connection = rpcManager.getConnection();
      expect(connection).toBeDefined();
    });

    it('should get stats', () => {
      const stats = rpcManager.getStats();
      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
    });
  });
});

