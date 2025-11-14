import { randomUUID } from 'node:crypto';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function generateId(prefix) {
  if (typeof randomUUID === 'function') {
    return `${prefix}_${randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default class BlueprintExecutor {
  constructor({ store, loadBackend }) {
    this.store = store;
    this.loadBackend = loadBackend;
    this.queue = [];
    this.processing = false;
  }

  enqueue(job) {
    this.queue.push(job);
    this.#processQueue();
  }

  async #processQueue() {
    if (this.processing) {
      return;
    }

    const nextJob = this.queue.shift();
    if (!nextJob) {
      return;
    }

    this.processing = true;
    try {
      await this.#executeJob(nextJob);
    } catch (error) {
      console.error('BlueprintExecutor: job failed', error);
      this.store.updateRun(nextJob.runId, {
        status: 'failed',
        completedAt: Date.now(),
        error: error.message || 'Unknown execution error'
      });
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        setImmediate(() => this.#processQueue());
      }
    }
  }

  async #executeJob(job) {
    const { blueprint, runId } = job;
    this.store.updateRun(runId, {
      status: 'running',
      startedAt: Date.now()
    });

    const backend = await this.loadBackend();
    const walletManager = backend.walletManager;
    const tradingEngine = backend.tradingEngine;

    const summary = {
      type: blueprint.type,
      totalOperations: 0,
      success: 0,
      failed: 0
    };

    try {
      switch (blueprint.type) {
        case 'sniper':
          await this.#executeSniper({
            blueprint,
            runId,
            walletManager,
            tradingEngine,
            summary
          });
          break;
        case 'volume':
          await this.#executeVolume({
            blueprint,
            runId,
            backend,
            walletManager,
            summary
          });
          break;
        default:
          throw new Error(`Unsupported blueprint type: ${blueprint.type}`);
      }

      const status =
        summary.failed > 0
          ? summary.success > 0
            ? 'partial'
            : 'failed'
          : 'success';

      const completedAt = Date.now();
      this.store.updateRun(runId, {
        status,
        completedAt,
        summary
      });
      this.#updateBlueprintAfterRun(blueprint, status, summary, runId, completedAt);
    } catch (error) {
      console.error('BlueprintExecutor: execution error', error);
      summary.error = error.message;
      const completedAt = Date.now();
      this.store.updateRun(runId, {
        status: 'failed',
        completedAt,
        summary,
        error: error.message
      });
      this.#updateBlueprintAfterRun(blueprint, 'failed', summary, runId, completedAt);
    }
  }

  #resolveWalletIds(blueprint, walletManager) {
    const allWallets =
      typeof walletManager.getAllWallets === 'function'
        ? walletManager.getAllWallets()
        : [];
    const allIds = allWallets.map((wallet) => wallet.id).filter(Boolean);

    const selector =
      blueprint.settings?.walletSelector ||
      blueprint.walletSelector ||
      blueprint.selector ||
      {};

    let ids = [];

    const collect = (values) => {
      if (Array.isArray(values)) {
        ids.push(
          ...values
            .filter(Boolean)
            .map((value) => value.toString())
        );
      }
    };

    collect(blueprint.settings?.walletIds);
    collect(blueprint.walletIds);
    collect(blueprint.wallets);
    collect(selector.walletIds);

    ids = Array.from(
      new Set(
        ids.map((value) => value.toString().toLowerCase())
      )
    );

    if (!ids.length) {
      if (selector.mode === 'all') {
        return allIds;
      }
      return allIds.length ? [allIds[0]] : [];
    }

    const validIds = new Set(allIds.map((id) => id.toLowerCase()));
    const resolved = ids
      .map((id) => allIds.find((candidate) => candidate.toLowerCase() === id))
      .filter(Boolean);

    if (!resolved.length && allIds.length) {
      return [allIds[0]];
    }

    return resolved;
  }

  async #executeSniper({
    blueprint,
    runId,
    walletManager,
    tradingEngine,
    summary
  }) {
    const settings = blueprint.settings || {};
    const tokenMint =
      settings.tokenMint || settings.mint || settings.targetMint;
    const buyAmount = Number(settings.buyAmount || settings.amount);

    if (!tokenMint) {
      throw new Error('Sniper blueprint missing tokenMint');
    }
    if (!Number.isFinite(buyAmount) || buyAmount <= 0) {
      throw new Error('Sniper blueprint missing buyAmount');
    }

    const walletIds = this.#resolveWalletIds(blueprint, walletManager);
    if (!walletIds.length) {
      throw new Error('No wallets available for blueprint execution');
    }

    for (const walletId of walletIds) {
      const operation = {
        id: generateId('op'),
        walletId,
        action: 'buy',
        params: {
          tokenMint,
          solAmount: buyAmount,
          slippage: settings.slippage,
          priorityFee: settings.priorityFee
        },
        startedAt: Date.now()
      };

      try {
        const result = await tradingEngine.buyToken(
          walletId,
          tokenMint,
          buyAmount,
          {
            slippage: settings.slippage,
            priorityFee: settings.priorityFee,
            source: 'blueprint-sniper'
          }
        );

        operation.completedAt = Date.now();
        operation.success = result?.success !== false;
        operation.signature = result?.signature || null;
        operation.result = result || null;
        summary.totalOperations += 1;
        if (operation.success) {
          summary.success += 1;
        } else {
          summary.failed += 1;
        }
      } catch (error) {
        operation.completedAt = Date.now();
        operation.success = false;
        operation.error = error.message;
        summary.totalOperations += 1;
        summary.failed += 1;
      }

      this.store.appendOperation(runId, operation);

      const throttleMs = Number(settings?.throttleMs) || 0;
      if (throttleMs > 0) {
        await delay(throttleMs);
      }
    }
  }

  async #executeVolume({
    blueprint,
    runId,
    backend,
    walletManager,
    summary
  }) {
    const settings = blueprint.settings || {};
    const tokenMint = settings.tokenMint || settings.mint;

    if (!tokenMint) {
      throw new Error('Volume blueprint missing tokenMint');
    }

    const walletIds = this.#resolveWalletIds(blueprint, walletManager);
    if (!walletIds.length) {
      throw new Error('No wallets available for volume blueprint');
    }

    const config = { ...settings };
    delete config.tokenMint;
    delete config.walletIds;
    delete config.walletSelector;

    const operation = {
      id: generateId('op'),
      action: 'volume-session',
      walletIds,
      params: config,
      startedAt: Date.now()
    };

    try {
      const result = await backend.startVolumeSession(
        walletIds,
        tokenMint,
        config
      );
      operation.completedAt = Date.now();
      operation.success = result?.success !== false;
      operation.result = result || null;
      summary.totalOperations += 1;
      if (operation.success) {
        summary.success += 1;
      } else {
        summary.failed += 1;
      }
    } catch (error) {
      operation.completedAt = Date.now();
      operation.success = false;
      operation.error = error.message;
      summary.totalOperations += 1;
      summary.failed += 1;
    }

    this.store.appendOperation(runId, operation);
  }

  #updateBlueprintAfterRun(blueprint, status, summary, runId, completedAt) {
    try {
      const stored =
        this.store.getBlueprint(blueprint.id) || blueprint || {};
      const stats = { ...(stored.stats || {}) };

      const increment = (field, condition) => {
        stats[field] = (stats[field] || 0) + (condition ? 1 : 0);
      };

      increment('successfulRuns', status === 'success');
      increment('failedRuns', status === 'failed');
      increment('partialRuns', status === 'partial');

      stats.totalRuns =
        (stats.successfulRuns || 0) +
        (stats.failedRuns || 0) +
        (stats.partialRuns || 0);

      if (stats.totalRuns > 0) {
        stats.successRate = Math.round(
          ((stats.successfulRuns || 0) / stats.totalRuns) * 100
        );
      } else {
        stats.successRate = 0;
      }

      const updatedBlueprint = {
        ...stored,
        lastRun: completedAt,
        lastRunStatus: status,
        lastRunSummary: summary,
        lastRunError: summary?.error || null,
        lastRunId: runId,
        stats
      };

      this.store.upsertBlueprint(updatedBlueprint);
    } catch (error) {
      console.warn('BlueprintExecutor: failed to update blueprint stats', error);
    }
  }
}
