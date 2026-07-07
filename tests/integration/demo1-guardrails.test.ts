import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { runAgent, type AgentConfig } from '../../src/core/agent-loop.js';
import { MockLLMProvider } from '../../src/llm/mock-provider.js';
import { LLMProviderChain } from '../../src/llm/provider-chain.js';
import { DriftDetector } from '../../src/core/drift-detector.js';
import { runGuardrail } from '../../src/guardrails/pipeline.js';
import { SessionApprovalCache } from '../../src/guardrails/hitl.js';
import { DangerCategory } from '../../src/guardrails/pattern-registry.js';
import { RiskLevel } from '../../src/guardrails/guardrail.js';

describe('Demo 1: Guardrail intercepts dangerous action', () => {
  let workspaceRoot: string;

  const baseConfig: AgentConfig = {
    task: 'Clean up temporary files',
    workspaceRoot: '',
    maxRounds: 5,
    globalTimeout: 60000,
    dryRun: false,
    nonInteractive: true,
  };

  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `codeharness-demo1-${randomUUID()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
    baseConfig.workspaceRoot = workspaceRoot;
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('should intercept rm -rf command via guardrail', () => {
    // Verify that the guardrail detects the dangerous command
    const result = runGuardrail(
      { type: 'run_command', command: 'rm -rf /tmp/project-cache', reason: 'clean up' },
      workspaceRoot,
    );
    expect(result.riskLevel).toBe(RiskLevel.DANGEROUS);
    expect(result.requiresApproval).toBe(true);
    expect(result.blocked).toBe(false);
  });

  it('should auto-approve whitelisted dangerous commands', () => {
    const cache = new SessionApprovalCache();
    cache.approve(DangerCategory.FILE_DESTRUCTION);
    cache.approve(DangerCategory.FILE_DESTRUCTION_WORKSPACE);

    const result = runGuardrail(
      { type: 'run_command', command: 'rm -rf /tmp/project-cache', reason: 'clean up' },
      workspaceRoot,
      cache,
    );
    expect(result.requiresApproval).toBe(false);
  });

  it('should complete task with guardrail approval', async () => {
    const mockLLM = new MockLLMProvider([
      {
        message: {
          role: 'assistant',
          content: 'Cleaning up',
          toolCalls: [
            {
              id: 'c1',
              name: 'run_command',
              arguments: { command: 'echo "cleanup done"', reason: 'clean' },
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Done',
          toolCalls: [
            {
              id: 'c2',
              name: 'finish',
              arguments: { success: true, summary: 'Cleanup completed' },
            },
          ],
        },
      },
    ]);

    const chain = new LLMProviderChain([mockLLM]);
    const driftDetector = new DriftDetector(baseConfig.task);

    const result = await runAgent(baseConfig, chain, driftDetector);
    expect(result.success).toBe(true);
  }, 10000);
});
