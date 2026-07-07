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

describe('Demo 3: Five-layer guardrail + drift detection', () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = path.join(os.tmpdir(), `codeharness-demo3-${randomUUID()}`);
    await fs.mkdir(workspaceRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  it('Scenario A: npm test should be safe', () => {
    const result = runGuardrail(
      { type: 'run_command', command: 'npm test', reason: 'run tests' },
      workspaceRoot,
    );
    expect(result.riskLevel).toBe(RiskLevel.SAFE);
    expect(result.passed).toBe(true);
  });

  it('Scenario B: rm -rf should be dangerous and require approval', () => {
    const result = runGuardrail(
      { type: 'run_command', command: 'rm -rf ./node_modules', reason: 'clean' },
      workspaceRoot,
    );
    expect(result.riskLevel).toBe(RiskLevel.DANGEROUS);
    expect(result.requiresApproval).toBe(true);
  });

  it('Scenario C: out-of-bounds path should be fatal', () => {
    const result = runGuardrail({ type: 'read_file', path: '/etc/passwd' }, workspaceRoot);
    expect(result.riskLevel).toBe(RiskLevel.FATAL);
    expect(result.blocked).toBe(true);
  });

  it('Scenario D: session whitelist across same category', () => {
    const cache = new SessionApprovalCache();
    cache.approve(DangerCategory.FILE_DESTRUCTION_WORKSPACE);

    // First rm should be auto-approved via whitelist
    const result1 = runGuardrail(
      { type: 'run_command', command: 'rm ./src/old1.ts', reason: 'clean' },
      workspaceRoot,
      cache,
    );
    expect(result1.requiresApproval).toBe(false);

    // Second rm should also be auto-approved
    const result2 = runGuardrail(
      { type: 'run_command', command: 'rm ./src/old2.ts', reason: 'clean' },
      workspaceRoot,
      cache,
    );
    expect(result2.requiresApproval).toBe(false);
  });

  it('Scenario E: drift detection on unrelated files', () => {
    const detector = new DriftDetector('Add unit tests for UserService');
    const result = detector.check({
      filesModified: ['webpack.config.js', 'package.json'],
      taskKeywords: ['test', 'UserService', 'unit'],
    });
    expect(result.drifting).toBe(true);
    expect(result.risk).toBe('medium');
  });

  it('should complete a full guarded task', async () => {
    const config: AgentConfig = {
      task: 'Add unit tests for UserService',
      workspaceRoot,
      maxRounds: 5,
      globalTimeout: 60000,
      dryRun: false,
      nonInteractive: true,
    };

    const mockLLM = new MockLLMProvider([
      {
        message: {
          role: 'assistant',
          content: 'Reading file',
          toolCalls: [{ id: 'c1', name: 'read_file', arguments: { path: 'user.ts' } }],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Writing tests',
          toolCalls: [
            {
              id: 'c2',
              name: 'write_file',
              arguments: { path: 'user.test.ts', content: '// tests' },
            },
          ],
        },
      },
      {
        message: {
          role: 'assistant',
          content: 'Done',
          toolCalls: [
            { id: 'c3', name: 'finish', arguments: { success: true, summary: 'Tests added' } },
          ],
        },
      },
    ]);

    const chain = new LLMProviderChain([mockLLM]);
    const driftDetector = new DriftDetector(config.task);

    const result = await runAgent(config, chain, driftDetector);
    expect(result.success).toBe(true);
  }, 10000);
});
