import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { CredentialStore } from '../../../src/utils/credentials.js';

describe('CredentialStore', () => {
  let tmpDir: string;
  let store: CredentialStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'creds-test-'));
    store = new CredentialStore({ storeDir: tmpDir });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('set and get', () => {
    it('should store and retrieve a credential', async () => {
      await store.set('test-key', 'test-value');
      const value = await store.get('test-key');
      expect(value).toBe('test-value');
    });

    it('should return null for non-existent key', async () => {
      const value = await store.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should overwrite existing credential', async () => {
      await store.set('key', 'value1');
      await store.set('key', 'value2');
      const value = await store.get('key');
      expect(value).toBe('value2');
    });
  });

  describe('delete', () => {
    it('should delete an existing credential', async () => {
      await store.set('key', 'value');
      await store.delete('key');
      const value = await store.get('key');
      expect(value).toBeNull();
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(store.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('list', () => {
    it('should list all keys', async () => {
      await store.set('key1', 'value1');
      await store.set('key2', 'value2');
      const keys = await store.list();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toHaveLength(2);
    });

    it('should return empty array when no credentials', async () => {
      const keys = await store.list();
      expect(keys).toEqual([]);
    });
  });

  describe('encryption', () => {
    it('should encrypt data at rest', async () => {
      await store.set('secret', 'sensitive-data');
      // Read the raw file to verify it's encrypted
      const files = await fs.readdir(tmpDir);
      const dataFile = files.find((f) => f.endsWith('.json'));
      expect(dataFile).toBeTruthy();

      const rawContent = await fs.readFile(path.join(tmpDir, dataFile!), 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(rawContent);
      // Encrypted data should not contain the plaintext value
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const entry = Object.values(parsed)[0] as Record<string, string>;
      expect(entry.encrypted).not.toContain('sensitive-data');
      expect(entry.encrypted).toBeTruthy();
      expect(entry.iv).toBeTruthy();
      expect(entry.authTag).toBeTruthy();
    });
  });

  describe('workspace isolation', () => {
    it('should isolate credentials by workspace', async () => {
      const storeA = new CredentialStore({ storeDir: tmpDir, workspace: '/project/a' });
      const storeB = new CredentialStore({ storeDir: tmpDir, workspace: '/project/b' });

      await storeA.set('key', 'valueA');
      await storeB.set('key', 'valueB');

      // Each workspace should have its own value
      const valueA = await storeA.get('key');
      const valueB = await storeB.get('key');
      expect(valueA).toBe('valueA');
      expect(valueB).toBe('valueB');
    });
  });
});
