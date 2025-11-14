import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_BLUEPRINTS = [];
const DEFAULT_RUNS = [];

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function readJsonFile(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) {
      return JSON.parse(JSON.stringify(fallback));
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return JSON.parse(JSON.stringify(fallback));
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`BlueprintStore: failed to read ${filePath}:`, error.message);
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJsonFile(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function generateId(prefix) {
  if (typeof randomUUID === 'function') {
    return `${prefix}_${randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default class BlueprintStore {
  constructor(options = {}) {
    const dataDir = options.dataDir || path.join(process.cwd(), '.data');
    ensureDirectory(dataDir);

    this.blueprintsPath =
      options.blueprintsPath || path.join(dataDir, 'blueprints.json');
    this.runsPath =
      options.runsPath || path.join(dataDir, 'blueprint-runs.json');

    this.blueprints = readJsonFile(this.blueprintsPath, DEFAULT_BLUEPRINTS);
    this.runs = readJsonFile(this.runsPath, DEFAULT_RUNS);
  }

  listBlueprints() {
    return this.blueprints.map((blueprint) => ({ ...blueprint }));
  }

  getBlueprint(id) {
    return this.blueprints.find((blueprint) => blueprint.id === id) || null;
  }

  upsertBlueprint(payload = {}) {
    const timestamp = Date.now();
    const incoming = { ...payload };
    let target = null;

    if (incoming.id) {
      target = this.blueprints.find((bp) => bp.id === incoming.id) || null;
    }

    if (target) {
      Object.assign(target, incoming, {
        id: target.id,
        updatedAt: timestamp
      });
    } else {
      const id = incoming.id || generateId('bp');
      target = {
        id,
        name: incoming.name || 'Unnamed Blueprint',
        type: incoming.type || 'custom',
        template: incoming.template || incoming.type || 'custom',
        description: incoming.description || '',
        notes: incoming.notes || '',
        status: incoming.status || 'inactive',
        wallets: incoming.wallets || [],
        settings: incoming.settings || {},
        automations: incoming.automations || {},
        createdAt: timestamp,
        updatedAt: timestamp,
        lastRun: null,
        lastRunStatus: null,
        lastRunSummary: null,
        lastRunError: null,
        lastRunId: null,
        stats: incoming.stats || {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          partialRuns: 0,
          successRate: 0,
          totalProfit: 0,
          appliedCount: 0
        }
      };
      this.blueprints.push(target);
    }

    this.#saveBlueprints();
    return { ...target };
  }

  deleteBlueprint(id) {
    const originalLength = this.blueprints.length;
    this.blueprints = this.blueprints.filter((bp) => bp.id !== id);

    if (this.blueprints.length !== originalLength) {
      const beforeRuns = this.runs.length;
      this.runs = this.runs.filter((run) => run.blueprintId !== id);

      this.#saveBlueprints();
      if (this.runs.length !== beforeRuns) {
        this.#saveRuns();
      }
      return true;
    }

    return false;
  }

  createRun(blueprintId, extra = {}) {
    const run = {
      id: extra.id || generateId('run'),
      blueprintId,
      status: extra.status || 'pending',
      requestedAt: extra.requestedAt || Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      operations: [],
      summary: extra.summary || null,
      error: null
    };

    if (extra.requestedBy) {
      run.requestedBy = extra.requestedBy;
    }

    // Keep newest runs at the top
    this.runs.unshift(run);
    this.#saveRuns();
    return { ...run };
  }

  updateRun(runId, patch = {}) {
    const run = this.runs.find((entry) => entry.id === runId);
    if (!run) {
      return null;
    }

    Object.assign(run, patch, {
      updatedAt: Date.now()
    });

    this.#saveRuns();
    return { ...run };
  }

  appendOperation(runId, operation = {}) {
    const run = this.runs.find((entry) => entry.id === runId);
    if (!run) {
      return null;
    }

    const opRecord = {
      id: operation.id || generateId('op'),
      timestamp: operation.timestamp || Date.now(),
      ...operation
    };

    run.operations.push(opRecord);
    run.updatedAt = Date.now();
    this.#saveRuns();
    return { ...opRecord };
  }

  listRuns(blueprintId, limit = 20) {
    return this.runs
      .filter((run) => run.blueprintId === blueprintId)
      .slice(0, limit)
      .map((run) => ({ ...run }));
  }

  getRun(runId) {
    const run = this.runs.find((entry) => entry.id === runId);
    return run ? { ...run } : null;
  }

  markApplied(blueprintId) {
    const blueprint = this.blueprints.find((entry) => entry.id === blueprintId);
    if (!blueprint) {
      return null;
    }

    blueprint.lastApplied = Date.now();
    blueprint.updatedAt = Date.now();
    blueprint.stats = blueprint.stats || {};
    blueprint.stats.appliedCount = (blueprint.stats.appliedCount || 0) + 1;

    this.#saveBlueprints();
    return { ...blueprint };
  }

  #saveBlueprints() {
    writeJsonFile(this.blueprintsPath, this.blueprints);
  }

  #saveRuns() {
    writeJsonFile(this.runsPath, this.runs);
  }
}


