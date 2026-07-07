import { validateConfig } from '../../../src/config/schema.js';

describe('validateConfig', () => {
  it('should use defaults for empty config', () => {
    const result = validateConfig({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    const config = result.data;
    expect(config.version).toBe(1);
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.model).toBe('gpt-4o');
    expect(config.llm.fallbacks).toEqual([]);
    expect(config.guardrails.enabled).toBe(true);
    expect(config.guardrails.timeoutSeconds).toBe(120);
    expect(config.feedback.testCommand).toBe('npm test');
    expect(config.feedback.lintCommand).toBe('npm run lint');
    expect(config.feedback.typecheckCommand).toBe('npx tsc --noEmit');
    expect(config.feedback.autoFixRounds).toBe(3);
    expect(config.tools.defaultShell).toBe('bash');
    expect(config.tools.commandTimeoutSeconds).toBe(60);
    expect(config.tools.maxOutputBytes).toBe(1048576);
    expect(config.interaction.mode).toBe('interactive');
    expect(config.interaction.dangerPolicy).toBe('ask');
    expect(config.context.maxHistoryRounds).toBe(5);
    expect(config.context.modelContextRatio).toBe(0.8);
  });

  it('should reject invalid provider', () => {
    const result = validateConfig({
      llm: { provider: 'invalid-provider' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative timeout', () => {
    const result = validateConfig({
      guardrails: { timeoutSeconds: -1 },
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid modelContextRatio', () => {
    const result = validateConfig({
      context: { modelContextRatio: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it('should reject ratio below 0', () => {
    const result = validateConfig({
      context: { modelContextRatio: -0.1 },
    });
    expect(result.success).toBe(false);
  });

  it('should accept valid fallbacks', () => {
    const result = validateConfig({
      llm: {
        fallbacks: [
          { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
          { provider: 'ollama', model: 'qwen2.5-coder:14b' },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llm.fallbacks).toHaveLength(2);
    }
  });

  it('should accept valid danger policies', () => {
    const askResult = validateConfig({ interaction: { dangerPolicy: 'ask' } });
    expect(askResult.success).toBe(true);

    const denyResult = validateConfig({ interaction: { dangerPolicy: 'deny' } });
    expect(denyResult.success).toBe(true);

    const skipResult = validateConfig({ interaction: { dangerPolicy: 'skip' } });
    expect(skipResult.success).toBe(true);
  });

  it('should accept openai-compatible provider', () => {
    const result = validateConfig({
      llm: { provider: 'openai-compatible', model: 'qwen2.5-72b' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept customProviders configuration', () => {
    const result = validateConfig({
      llm: {
        provider: 'openai-compatible',
        model: 'qwen2.5-72b',
        customProviders: [
          { name: 'vllm', baseUrl: 'http://localhost:8000/v1', model: 'qwen2.5-72b' },
          { name: 'lmstudio', baseUrl: 'http://localhost:1234/v1', model: 'local-model' },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llm.customProviders).toHaveLength(2);
      expect(result.data.llm.customProviders![0].name).toBe('vllm');
    }
  });

  it('should reject invalid customProvider name', () => {
    const result = validateConfig({
      llm: {
        customProviders: [
          { name: 'invalid name!', baseUrl: 'http://localhost:8000/v1', model: 'test' },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('should accept fallback with openai-compatible and baseUrl', () => {
    const result = validateConfig({
      llm: {
        fallbacks: [
          {
            provider: 'openai-compatible',
            model: 'qwen2.5-14b',
            baseUrl: 'http://10.0.0.6:8000/v1',
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
