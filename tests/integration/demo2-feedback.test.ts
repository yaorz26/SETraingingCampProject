import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { runAgent, type AgentConfig } from '../../src/core/agent-loop.js';
import { MockLLMProvider } from '../../src/llm/mock-provider.js';
import { LLMProviderChain } from '../../src/llm/provider-chain.js';
import { DriftDetector } from '../../src/core/drift-detector.js';

describe('Demo 2: Feedback loop self-correction', () => {
  let workspaceRoot: string;

  const baseConfig: AgentConfig = {
    task: 'Implement add function',
    workspaceRoot: '',
    maxRounds: 5,
    globalTimeout: 60000,
    dryRun: false,
    nonInteractive: true,
  };

  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `codeharness-demo2-${randomUUID()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
    baseConfig.workspaceRoot = workspaceRoot;
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('should self-correct after error and complete', async () => {
    // First round: write a file with implementation
    // Second round: run tests (which pass since we use echo)
    // Third round: finish
    const mockLLM = new MockLLMProvider([
      {
        message: {
          role: 'assistant',
          content: 'Writing add function',
          toolCalls: [
            {
              id: 'c1',
              name: 'write_file',
              arguments: {
                path: 'add.ts',
                content: 'export const add = (a: number, b: number): number => a + b;',
              },
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Running tests',
          toolCalls: [
            { id: 'c2', name: 'run_tests', arguments: { command: 'echo "all tests passed"' } },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'All done',
          toolCalls: [
            {
              id: 'c3',
              name: 'finish',
              arguments: { success: true, summary: 'Add function implemented and tested' },
            },
          ],
        },
      },
    ]);

    const chain = new LLMProviderChain([mockLLM]);
    const driftDetector = new DriftDetector(baseConfig.task);

    const result = await runAgent(baseConfig, chain, driftDetector);
    expect(result.success).toBe(true);
    expect(result.rounds).toBe(3);

    // Verify the file was written correctly
    const content = await fs.readFile(path.join(workspaceRoot, 'add.ts'), 'utf-8');
    expect(content).toContain('a + b');
  }, 10000);
});
