import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { runAgent, type AgentConfig } from '../../src/core/agent-loop.js';
import { MockLLMProvider } from '../../src/llm/mock-provider.js';
import { LLMProviderChain } from '../../src/llm/provider-chain.js';
import { DriftDetector } from '../../src/core/drift-detector.js';
import { MemoryManager } from '../../src/memory/memory-store.js';
import { CostTracker } from '../../src/utils/cost-tracker.js';

describe('E2E Integration Test', () => {
  let workspaceRoot: string;

  const config: AgentConfig = {
    task: 'Add unit tests for UserService',
    workspaceRoot: '',
    maxRounds: 10,
    globalTimeout: 60000,
    dryRun: false,
    nonInteractive: true,
  };

  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `codeharness-e2e-${randomUUID()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
    config.workspaceRoot = workspaceRoot;
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('should complete a full multi-round task', async () => {
    const mockLLM = new MockLLMProvider([
      {
        message: {
          role: 'assistant',
          content: 'Exploring',
          toolCalls: [{ id: 'c1', name: 'read_file', arguments: { path: 'user.ts' } }],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Writing',
          toolCalls: [
            {
              id: 'c2',
              name: 'write_file',
              arguments: {
                path: 'user.test.ts',
                content: 'test("user service", () => { expect(true).toBe(true) })',
              },
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Testing',
          toolCalls: [{ id: 'c3', name: 'run_tests', arguments: { command: 'echo "PASS"' } }],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Done',
          toolCalls: [
            {
              id: 'c4',
              name: 'finish',
              arguments: { success: true, summary: 'Tests added and passed' },
            },
          ],
        },
      },
    ]);

    const chain = new LLMProviderChain([mockLLM]);
    const driftDetector = new DriftDetector(config.task);
    const memoryManager = new MemoryManager(workspaceRoot);
    const costTracker = new CostTracker();

    const result = await runAgent(config, chain, driftDetector);
    expect(result.success).toBe(true);
    expect(result.rounds).toBe(4);
    expect(result.exitCode).toBe(0);

    // Verify memory
    await memoryManager.updateTaskHistory(config.task, result.success ? 'success' : 'failed');
    const memory = await memoryManager.load();
    expect(memory.tasks).toHaveLength(1);
    expect(memory.tasks[0].description).toBe(config.task);

    // Verify cost tracking
    costTracker.recordUsage('gpt-4o', 1000, 500);
    expect(costTracker.getTotalInputTokens()).toBe(1000);
    expect(costTracker.getTotalOutputTokens()).toBe(500);
  }, 15000);

  it('should handle finish interception', async () => {
    // Agent claims success but file doesn't exist - finish should still be intercepted
    const mockLLM = new MockLLMProvider([
      {
        message: {
          role: 'assistant',
          content: 'Done without doing anything',
          toolCalls: [{ id: 'c1', name: 'finish', arguments: { success: true, summary: 'Done' } }],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Actually doing work',
          toolCalls: [
            { id: 'c2', name: 'write_file', arguments: { path: 'result.txt', content: 'done' } },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Really done',
          toolCalls: [{ id: 'c3', name: 'finish', arguments: { success: true, summary: 'Done' } }],
        },
      },
    ]);

    const chain = new LLMProviderChain([mockLLM]);
    const driftDetector = new DriftDetector(config.task);

    const result = await runAgent({ ...config, maxRounds: 5 }, chain, driftDetector);
    expect(result.success).toBe(true);
  }, 15000);
});
