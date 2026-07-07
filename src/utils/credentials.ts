import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileExists, ensureDir } from './fileops.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

export interface CredentialStoreOptions {
  storeDir: string;
  workspace?: string;
}

interface EncryptedPayload {
  encrypted: string;
  iv: string;
  authTag: string;
}

/**
 * Generate a deterministic encryption key from the store directory path.
 * In production, this should use a proper key management system.
 */
function deriveKey(storeDir: string): Buffer {
  return crypto.scryptSync(storeDir, 'credential-store-salt', KEY_LENGTH);
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 */
function encrypt(plaintext: string, key: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypt a ciphertext string using AES-256-GCM.
 */
function decrypt(payload: EncryptedPayload, key: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encrypted, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}

/**
 * Simple hash of workspace path for file naming.
 */
function hashWorkspace(workspace: string): string {
  return crypto.createHash('sha256').update(workspace).digest('hex').slice(0, 16);
}

/**
 * Secure credential store with encryption at rest and workspace isolation.
 */
export class CredentialStore {
  private storeDir: string;
  private workspace: string | null;
  private key: Buffer;
  private cache: Map<string, string> = new Map();
  private cacheLoaded = false;

  constructor(options: CredentialStoreOptions) {
    this.storeDir = options.storeDir;
    this.workspace = options.workspace ?? null;
    this.key = deriveKey(this.storeDir);
  }

  private getStoreFilePath(): string {
    const workspaceId = this.workspace ? hashWorkspace(this.workspace) : 'default';
    return path.join(this.storeDir, `credentials-${workspaceId}.json`);
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;

    const filePath = this.getStoreFilePath();
    const exists = await fileExists(filePath);
    if (exists) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const entries: Record<string, EncryptedPayload> = JSON.parse(raw);
        for (const [key, payload] of Object.entries(entries)) {
          try {
            const decrypted = decrypt(payload, this.key);
            this.cache.set(key, decrypted);
          } catch {
            // Skip corrupted entries
          }
        }
      } catch {
        // File corrupted, start fresh
      }
    }
    this.cacheLoaded = true;
  }

  private async persistCache(): Promise<void> {
    const filePath = this.getStoreFilePath();
    await ensureDir(this.storeDir);

    const entries: Record<string, EncryptedPayload> = {};
    for (const [key, value] of this.cache.entries()) {
      entries[key] = encrypt(value, this.key);
    }
    await fs.writeFile(filePath, JSON.stringify(entries), 'utf-8');
  }

  /**
   * Store a credential value for the given key.
   */
  async set(key: string, value: string): Promise<void> {
    await this.loadCache();
    this.cache.set(key, value);
    await this.persistCache();
  }

  /**
   * Retrieve a credential value by key, or null if not found.
   */
  async get(key: string): Promise<string | null> {
    await this.loadCache();
    return this.cache.get(key) ?? null;
  }

  /**
   * Delete a credential by key.
   */
  async delete(key: string): Promise<void> {
    await this.loadCache();
    this.cache.delete(key);
    await this.persistCache();
  }

  /**
   * List all stored credential keys.
   */
  async list(): Promise<string[]> {
    await this.loadCache();
    return Array.from(this.cache.keys());
  }
}
