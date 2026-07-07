import { CredentialStore } from './credentials.js';
import os from 'os';
import path from 'path';

let store: CredentialStore | null = null;

function getStore(): CredentialStore {
  if (!store) {
    store = new CredentialStore({
      storeDir: path.join(os.homedir(), '.codeharness', 'credentials'),
    });
  }
  return store;
}

/**
 * Get a credential for the given provider.
 * Key format: codeharness/<provider>
 */
export async function getCredential(provider: string): Promise<string | null> {
  return getStore().get(`codeharness/${provider}`);
}

/**
 * Set a credential for the given provider.
 */
export async function setCredential(provider: string, key: string): Promise<void> {
  return getStore().set(`codeharness/${provider}`, key);
}

/**
 * Delete a credential for the given provider.
 */
export async function deleteCredential(provider: string): Promise<void> {
  return getStore().delete(`codeharness/${provider}`);
}

/**
 * Check if a credential exists for the given provider.
 */
export async function hasCredential(provider: string): Promise<boolean> {
  const value = await getCredential(provider);
  return value !== null;
}
