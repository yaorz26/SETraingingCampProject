import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { runAgent, type AgentConfig } from '../../../src/core/agent-loop.js';
import { MockLLMProvider } from '../../../src/llm/mock-provider.js';
import type { LLMProvider } from '../../../src/llm/provider.js';
import { LLMProviderChain } from '../../../src/llm/provider-chain.js';
import { DriftDetector } from '../../../src/core/drift-detector.js';

describe('runAgent', () => {
  let workspaceRoot: string;

  const baseConfig: AgentConfig = {
    task: 'Add unit tests for UserService',
    workspaceRoot: '',
    maxRounds: 10,
    globalTimeout: 60000,
    dryRun: false,
    nonInteractive: true,
  };

  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `codeharness-agent-${randomUUID()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
    baseConfig.workspaceRoot = workspaceRoot;
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  function createChain(provider: LLMProvider): LLMProviderChain {
    return new LLMProviderChain([provider]);
  }

  it('should complete when LLM returns finish action', async () => {
    const mockLLM = new MockLLMProvider([
      {
        message: {
          role: 'assistant',
          content: 'Done',
          toolCalls: [
            {
              id: 'call_1',
              name: 'finish',
              arguments: { success: true, summary: 'Task completed' },
            },
          ],
        },
      },
    ]);

    const chain = createChain(mockLLM);
    const driftDetector = new DriftDetector(baseConfig.task);

    const result = await runAgent(baseConfig, chain, driftDetector);
    expect(result.success).toBe(true);
    expect(result.rounds).toBe(1);
    expect(result.exitCode).toBe(0);
  }, 10000);

  it('should complete multi-round workflow', async () => {
    const mockLLM = new MockLLMProvider([
      {
        message: {
          role: 'assistant',
          content: 'Reading file',
          toolCalls: [{ id: 'call_1', name: 'read_file', arguments: { path: 'test.txt' } }],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Writing tests',
          toolCalls: [
            {
              id: 'call_2',
              name: 'write_file',
              arguments: { path: 'test.txt', content: 'test content' },
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'All done',
          toolCalls: [
            { id: 'call_3', name: 'finish', arguments: { success: true, summary: 'Tests added' } },
          ],
        },
      },
    ]);

    const chain = createChain(mockLLM);
    const driftDetector = new DriftDetector(baseConfig.task);

    const result = await runAgent(baseConfig, chain, driftDetector);
    expect(result.success).toBe(true);
    expect(result.rounds).toBe(3);
  }, 10000);

  it('should stop at max rounds', async () => {
    const mockLLM = new MockLLMProvider(
      Array.from({ length: 5 }, () => ({
        message: {
          role: 'assistant' as const,
          content: 'Trying...',
          toolCalls: [{ id: 'call_x', name: 'read_file', arguments: { path: 'x.txt' } }],
        },
      })),
    );

    const chain = createChain(mockLLM);
    const driftDetector = new DriftDetector(baseConfig.task);

    const result = await runAgent({ ...baseConfig, maxRounds: 3 }, chain, driftDetector);
    expect(result.success).toBe(false);
    expect(result.rounds).toBe(3);
    expect(result.exitCode).not.toBe(0);
  }, 10000);

  it('should handle parse error and retry', async () => {
    const mockLLM = new MockLLMProvider([
      { message: { role: 'assistant', content: 'Invalid action' } },
      {
        message: {
          role: 'assistant',
          content: 'Done',
          toolCalls: [
            { id: 'call_1', name: 'finish', arguments: { success: true, summary: 'Done' } },
          ],
        },
      },
    ]);

    const chain = createChain(mockLLM);
    const driftDetector = new DriftDetector(baseConfig.task);

    const result = await runAgent(baseConfig, chain, driftDetector);
    expect(result.success).toBe(true);
    expect(result.rounds).toBe(2);
  }, 10000);
});
