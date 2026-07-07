import { Command } from 'commander';
import { runSetupWizard, setupKey, showKeyStatus, clearKey } from './setup-wizard.js';
import { log, LogLevel, setVerbose, setNonInteractive } from './output.js';
import { loadConfig } from '../config/loader.js';
import { runAgent } from '../core/agent-loop.js';
import { LLMProviderChain } from '../llm/provider-chain.js';
import { OpenAIProvider } from '../llm/adapters/openai.js';
import { AnthropicProvider } from '../llm/adapters/anthropic.js';
import { OllamaProvider } from '../llm/adapters/ollama.js';
import { DriftDetector } from '../core/drift-detector.js';
import { MemoryManager } from '../memory/memory-store.js';
import type { LLMProvider } from '../llm/provider.js';
import { checkNodeVersion } from '../utils/version-check.js';

function createProvider(provider: string, model: string, baseUrl?: string): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider({ model, baseURL: baseUrl });
    case 'anthropic':
      return new AnthropicProvider({ model, baseURL: baseUrl });
    case 'ollama':
      return new OllamaProvider({ model, baseURL: baseUrl });
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function createProgram(): Command {
  const program = new Command();

  program.name('codeharness').description('AI Coding Agent Harness').version('1.0.0');

  program
    .command('run <task>')
    .description('Run a coding task')
    .option('--dry-run', 'Preview mode, no changes made')
    .option('--verbose', 'Enable verbose output')
    .option('--non-interactive', 'Non-interactive mode')
    .option('--max-cost <dollars>', 'Maximum cost budget')
    .option('--model <model>', 'Override model')
    .option('--provider <provider>', 'Override provider')
    .action(async (task: string, options: Record<string, unknown>) => {
      try {
        checkNodeVersion();
        setVerbose(options.verbose === true);
        setNonInteractive(options.nonInteractive === true);

        const cwd = process.cwd();
        const config = await loadConfig({ workspaceRoot: cwd });

        const provider = (options.provider as string) ?? config.llm.provider;
        const model = (options.model as string) ?? config.llm.model;

        const primaryProvider = createProvider(provider, model, config.llm.baseUrl);
        const fallbacks = config.llm.fallbacks.map((f) => createProvider(f.provider, f.model));

        const chain = new LLMProviderChain([primaryProvider, ...fallbacks]);
        const driftDetector = new DriftDetector(task);
        const memoryManager = new MemoryManager(cwd);

        log(`Starting task: ${task}`, LogLevel.INFO);
        log(`Provider: ${provider}, Model: ${model}`, LogLevel.INFO);

        const result = await runAgent(
          {
            task,
            workspaceRoot: cwd,
            maxRounds: config.context.maxHistoryRounds * 2,
            globalTimeout: 600000,
            dryRun: options.dryRun === true,
            nonInteractive: options.nonInteractive === true,
          },
          chain,
          driftDetector,
        );

        await memoryManager.updateTaskHistory(task, result.success ? 'success' : 'failed');

        process.exit(result.exitCode);
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
        process.exit(1);
      }
    });

  program
    .command('init')
    .description('Initialize CodeHarness configuration')
    .action(async () => {
      await runSetupWizard();
    });

  program
    .command('setup')
    .description('Re-run setup wizard')
    .action(async () => {
      await runSetupWizard();
    });

  const keyCommand = program.command('key').description('Manage API keys');

  keyCommand
    .command('status')
    .description('Show API key status')
    .action(async () => {
      await showKeyStatus();
    });

  keyCommand
    .command('set <provider>')
    .description('Set API key for a provider')
    .action(async (provider: string) => {
      const readline = await import('node:readline');
      const rl = readline.createInterface({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        input: process.stdin as any,
        output: process.stderr,
      });
      const apiKey = await new Promise<string>((resolve) => {
        rl.question('Enter API key: ', (answer) => {
          rl.close();
          resolve(answer);
        });
      });
      await setupKey(provider, apiKey);
    });

  keyCommand
    .command('clear <provider>')
    .description('Clear API key for a provider')
    .action(async (provider: string) => {
      await clearKey(provider);
    });

  return program;
}
