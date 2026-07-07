import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { fileExists } from '../utils/fileops.js';
import { setCredential } from '../utils/credential.js';
import { log, LogLevel } from './output.js';

export async function runSetupWizard(): Promise<boolean> {
  const configPath = path.join(os.homedir(), '.codeharness', 'config.yaml');
  if (await fileExists(configPath)) {
    return false;
  }

  log("Welcome to CodeHarness! Let's get you set up.", LogLevel.INFO);
  log('This wizard will help you configure your LLM provider and API key.', LogLevel.INFO);

  // The actual interactive wizard would use inquirer
  // For now, create a minimal default config
  const configDir = path.join(os.homedir(), '.codeharness');
  await fs.mkdir(configDir, { recursive: true });

  const defaultConfig = `# CodeHarness Configuration
version: 1

llm:
  provider: openai
  model: gpt-4o
  # To use Anthropic, change provider to 'anthropic' and set api key
  # To use Ollama, change provider to 'ollama'

guardrails:
  enabled: true
  timeout_seconds: 120

feedback:
  test_command: npm test
  lint_command: npm run lint
  typecheck_command: npx tsc --noEmit

interaction:
  mode: interactive
  danger_policy: ask
`;

  await fs.writeFile(configPath, defaultConfig, 'utf-8');

  log('Default configuration created at ~/.codeharness/config.yaml', LogLevel.SUCCESS);
  log('Set your API key with: codeharness key set', LogLevel.INFO);
  log('Quick start: codeharness run "add unit tests for UserService"', LogLevel.INFO);

  return true;
}

export async function setupKey(provider: string, apiKey: string): Promise<void> {
  await setCredential(provider, apiKey);
  log(`API key for ${provider} saved successfully.`, LogLevel.SUCCESS);
}

export async function showKeyStatus(): Promise<void> {
  const providers = ['openai', 'anthropic'];
  for (const provider of providers) {
    const credential = await getCredentialSafe(provider);
    const status = credential ? 'configured' : 'not configured';
    log(`${provider}: ${status}`, LogLevel.INFO);
  }
  log('ollama: no credentials needed', LogLevel.INFO);
}

export async function clearKey(provider: string): Promise<void> {
  await setCredential(provider, '');
  log(`API key for ${provider} cleared.`, LogLevel.SUCCESS);
}

async function getCredentialSafe(provider: string): Promise<string | null> {
  try {
    const { getCredential } = await import('../utils/credential.js');
    return await getCredential(provider);
  } catch {
    return null;
  }
}
