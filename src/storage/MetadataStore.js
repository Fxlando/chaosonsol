import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export default class MetadataStore {
  constructor(options = {}) {
    const { storageDir, baseUrl } = options;

    if (!storageDir) {
      throw new Error('MetadataStore requires a storageDir');
    }

    this.storageDir = storageDir;
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');

    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  generateId() {
    if (crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
  }

  getFilePath(id) {
    return path.join(this.storageDir, `${id}.json`);
  }

  save(metadata) {
    const id = this.generateId();
    const filePath = this.getFilePath(id);

    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');

    return {
      id,
      uri: this.baseUrl ? `${this.baseUrl}/metadata/${id}` : null
    };
  }

  get(id) {
    if (!id) return null;
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      console.error(`Failed to read metadata ${id}:`, error);
      return null;
    }
  }

  saveByMint(mint, metadata) {
    if (!mint) {
      throw new Error('Mint address is required');
    }
    const filePath = path.join(this.storageDir, `mint_${mint}.json`);
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
    return {
      id: mint,
      uri: this.baseUrl ? `${this.baseUrl}/metadata/mint_${mint}` : null
    };
  }

  getByMint(mint) {
    if (!mint) return null;
    const filePath = path.join(this.storageDir, `mint_${mint}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      console.error(`Failed to read metadata for mint ${mint}:`, error);
      return null;
    }
  }

  list() {
    const entries = [];
    const files = fs.readdirSync(this.storageDir, { withFileTypes: true });
    files.forEach((dirent) => {
      if (!dirent.isFile()) return;
      if (!dirent.name.endsWith('.json')) return;
      const id = dirent.name.replace(/\.json$/, '');
      entries.push({
        id,
        uri: this.baseUrl ? `${this.baseUrl}/metadata/${id}` : null
      });
    });
    return entries;
  }
}

