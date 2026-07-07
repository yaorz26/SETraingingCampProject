import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { randomUUID } from 'crypto';
import { loadConfig, mergeConfigs, type LoadConfigInput } from '../../../src/config/loader.js';
import type { Config } from '../../../src/config/schema.js';

describe('loadConfig', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `codeharness-config-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should use defaults when no config files exist', async () => {
    const input: LoadConfigInput = {
      workspaceRoot: testDir,
    };
    const config = await loadConfig(input);
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.model).toBe('gpt-4o');
    expect(config.guardrails.enabled).toBe(true);
  });

  it('should load project config file', async () => {
    const yaml = `
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514
`;
    await fs.writeFile(path.join(testDir, '.codeharness.yaml'), yaml);

    const config = await loadConfig({ workspaceRoot: testDir });
    expect(config.llm.provider).toBe('anthropic');
    expect(config.llm.model).toBe('claude-sonnet-4-20250514');
  });

  it('should load .codeharness.yml as fallback', async () => {
    const yaml = 'llm:\n  provider: ollama\n  model: qwen2.5-coder:14b';
    await fs.writeFile(path.join(testDir, '.codeharness.yml'), yaml);

    const config = await loadConfig({ workspaceRoot: testDir });
    expect(config.llm.provider).toBe('ollama');
  });
});

describe('mergeConfigs', () => {
  const base: Partial<Config> = {
    version: 1,
    llm: {
      provider: 'openai' as const,
      model: 'gpt-4o',
      fallbacks: [],
    },
    guardrails: {
      enabled: true,
      additionalPatterns: [],
      timeoutSeconds: 120,
      excludeDirs: [],
    },
    feedback: {
      testCommand: 'npm test',
      lintCommand: 'npm run lint',
      typecheckCommand: 'npx tsc --noEmit',
      autoFixRounds: 3,
    },
    tools: {
      defaultShell: 'bash',
      commandTimeoutSeconds: 60,
      maxOutputBytes: 1048576,
    },
    interaction: {
      mode: 'interactive' as const,
      dangerPolicy: 'ask' as const,
    },
    context: {
      maxHistoryRounds: 5,
      modelContextRatio: 0.8,
    },
  };

  it('should override with higher priority config', () => {
    const override: Partial<Config> = {
      llm: {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-20250514',
        fallbacks: [],
      },
    };
    const merged = mergeConfigs(base, override);
    expect(merged.llm.provider).toBe('anthropic');
    expect(merged.llm.model).toBe('claude-sonnet-4-20250514');
  });

  it('should replace arrays entirely', () => {
    const override: Partial<Config> = {
      llm: {
        provider: 'openai' as const,
        model: 'gpt-4o',
        fallbacks: [{ provider: 'ollama' as const, model: 'qwen' }],
      },
    };
    const merged = mergeConfigs(base, override);
    expect(merged.llm.fallbacks).toHaveLength(1);
    expect(merged.llm.fallbacks[0].provider).toBe('ollama');
  });
});
