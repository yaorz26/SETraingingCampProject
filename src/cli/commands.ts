import { Command } from 'commander';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
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
import type { CustomProviderConfig } from '../config/schema.js';
import { checkNodeVersion } from '../utils/version-check.js';
import {
  createConversation,
  saveConversation,
  loadConversation,
  listConversations,
  deleteConversation,
  exportConversation,
  importConversation,
  renameConversation,
  type Conversation,
  type ConversationMessage,
} from './conversation-store.js';

function createProvider(
  provider: string,
  model: string,
  baseUrl?: string,
  customProviders?: CustomProviderConfig[],
): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider({ model, baseURL: baseUrl });
    case 'anthropic':
      return new AnthropicProvider({ model, baseURL: baseUrl });
    case 'ollama':
      return new OllamaProvider({ model, baseURL: baseUrl });
    case 'openai-compatible':
      if (baseUrl) {
        return new OpenAIProvider({
          model,
          baseURL: baseUrl,
          credentialKey: 'openai-compatible',
        });
      }
      if (customProviders && customProviders.length > 0) {
        const matched = customProviders.find((cp) => cp.model === model);
        if (matched) {
          return new OpenAIProvider({
            model: matched.model,
            baseURL: matched.baseUrl,
            contextWindow: matched.contextWindow,
            apiKey: matched.apiKey,
            credentialKey: `custom-${matched.name}`,
          });
        }
      }
      throw new Error(
        'openai-compatible provider requires --base-url or a matching entry in customProviders',
      );
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

function resolveProvider(
  options: Record<string, unknown>,
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<{
  provider: string;
  model: string;
  baseUrl: string | undefined;
  chain: LLMProviderChain;
}> {
  const provider = (options.provider as string) ?? config.llm.provider;
  const model = (options.model as string) ?? config.llm.model;
  const baseUrl = (options.baseUrl as string) ?? config.llm.baseUrl;

  const primaryProvider = createProvider(provider, model, baseUrl, config.llm.customProviders);
  const fallbacks = config.llm.fallbacks.map((f) =>
    createProvider(f.provider, f.model, f.baseUrl, config.llm.customProviders),
  );
  const chain = new LLMProviderChain([primaryProvider, ...fallbacks]);

  return { provider, model, baseUrl, chain };
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
    .option('--base-url <url>', 'Override base URL (for openai-compatible)')
    .action(async (task: string, options: Record<string, unknown>) => {
      try {
        checkNodeVersion();
        setVerbose(options.verbose === true);
        setNonInteractive(options.nonInteractive === true);

        const cwd = process.cwd();
        const config = await loadConfig({ workspaceRoot: cwd });
        const { provider, model, chain } = await resolveProvider(options, config);

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

        log(
          result.success ? 'SUCCESS' : 'FAILED',
          result.success ? LogLevel.SUCCESS : LogLevel.ERROR,
        );
        log(`Rounds: ${result.rounds}, Exit code: ${result.exitCode}`, LogLevel.INFO);
        if (result.summary) {
          log(result.summary, LogLevel.INFO);
        }

        await memoryManager.updateTaskHistory(task, result.success ? 'success' : 'failed');

        process.exit(result.exitCode);
      } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
        process.exit(1);
      }
    });

  // ── chat 交互对话模式 ──

  const SYSTEM_PROMPT =
    'You are a helpful AI assistant. Respond concisely and directly in the same language the user uses.';

  program
    .command('chat')
    .description('Start interactive chat mode (type exit/quit to leave)')
    .option('--model <model>', 'Override model')
    .option('--provider <provider>', 'Override provider')
    .option('--base-url <url>', 'Override base URL')
    .option('--list', 'List all saved conversations')
    .option('--resume <id>', 'Resume a saved conversation')
    .option('--delete <id>', 'Delete a saved conversation')
    .option('--export <id>', 'Export a conversation (use --output to specify file)')
    .option('--output <path>', 'Output file path for export')
    .option('--import <path>', 'Import a conversation from file')
    .option('--rename <id> <title>', 'Rename a conversation (use with --title)')
    .option('--title <title>', 'New title for rename')
    .action(async (options: Record<string, unknown>) => {
      try {
        checkNodeVersion();

        // ── CLI conversation management (no interactive loop) ──
        if (options.list) {
          const convs = await listConversations();
          if (convs.length === 0) {
            log('No saved conversations.', LogLevel.INFO);
          } else {
            log('Saved conversations:', LogLevel.INFO);
            for (const c of convs) {
              const msgCount = c.messages.filter((m) => m.role !== 'system').length;
              log(
                `  ${c.id}  ${c.title}  (${msgCount} messages, ${c.updatedAt.slice(0, 10)})`,
                LogLevel.INFO,
              );
            }
          }
          process.exit(0);
        }

        if (options.delete) {
          const deleteId = options.delete as string;
          const ok = await deleteConversation(deleteId);
          log(
            ok ? `Conversation ${deleteId} deleted.` : 'Not found.',
            ok ? LogLevel.SUCCESS : LogLevel.WARNING,
          );
          process.exit(0);
        }

        if (options.export) {
          const exportId = options.export as string;
          const outputPath = (options.output as string) ?? `${exportId}.json`;
          const ok = await exportConversation(exportId, outputPath);
          log(
            ok ? `Exported to ${outputPath}` : 'Conversation not found.',
            ok ? LogLevel.SUCCESS : LogLevel.WARNING,
          );
          process.exit(0);
        }

        if (options.import) {
          const importPath = options.import as string;
          const conv = await importConversation(importPath);
          log(
            conv ? `Imported as ${conv.id}` : 'Import failed.',
            conv ? LogLevel.SUCCESS : LogLevel.ERROR,
          );
          process.exit(0);
        }

        if (options.rename && options.title) {
          const renameId = options.rename as string;
          const ok = await renameConversation(renameId, options.title as string);
          log(
            ok ? `Conversation ${renameId} renamed.` : 'Not found.',
            ok ? LogLevel.SUCCESS : LogLevel.WARNING,
          );
          process.exit(0);
        }

        // ── Interactive chat mode ──
        setVerbose(false);
        const cwd = process.cwd();
        const config = await loadConfig({ workspaceRoot: cwd });
        const { provider, model, chain } = await resolveProvider(options, config);

        // Resume existing conversation or create new one
        let conversation: Conversation;
        if (options.resume) {
          const resumeId = options.resume as string;
          const loaded = await loadConversation(resumeId);
          if (!loaded) {
            log(`Conversation ${resumeId} not found. Starting new.`, LogLevel.WARNING);
            conversation = await createConversation();
          } else {
            conversation = loaded;
            log(`Resumed conversation: ${conversation.title}`, LogLevel.SUCCESS);
          }
        } else {
          conversation = await createConversation();
        }

        const messages: ConversationMessage[] = conversation.messages;
        if (messages.length === 0 || messages[0].role !== 'system') {
          messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
        }

        log(`Chat mode - Provider: ${provider}, Model: ${model}`, LogLevel.SUCCESS);
        log(`Session: ${conversation.id}`, LogLevel.INFO);
        log(
          'Commands: /new /list /save /clear /rename /export /history | exit/quit to leave',
          LogLevel.INFO,
        );
        log('', LogLevel.INFO);

        const readline = await import('node:readline');
        const rl = readline.createInterface({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          input: process.stdin as any,
          output: process.stdout,
        });

        const askQuestion = (): Promise<string> =>
          new Promise((resolve) => {
            rl.question('> ', (answer) => {
              resolve(answer.trim());
            });
          });

        const exitChat = async () => {
          await saveConversation(conversation);
          log(`Conversation saved: ${conversation.id}`, LogLevel.SUCCESS);
          log('Goodbye!', LogLevel.SUCCESS);
          rl.close();
          process.exit(0);
        };

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const input = await askQuestion();
          if (input === 'exit' || input === 'quit') {
            await exitChat();
          }

          // ── Slash commands ──
          if (input.startsWith('/')) {
            const parts = input.split(/\s+/);
            const cmd = parts[0].toLowerCase();

            if (cmd === '/new') {
              await saveConversation(conversation);
              conversation = await createConversation();
              conversation.messages = [{ role: 'system', content: SYSTEM_PROMPT }];
              messages.length = 0;
              messages.push(...conversation.messages);
              log('New conversation started.', LogLevel.SUCCESS);
              continue;
            }

            if (cmd === '/list') {
              const convs = await listConversations();
              if (convs.length === 0) {
                log('No saved conversations.', LogLevel.INFO);
              } else {
                log('Conversations:', LogLevel.INFO);
                for (const c of convs) {
                  const marker = c.id === conversation.id ? ' *' : '  ';
                  const msgCount = c.messages.filter((m) => m.role !== 'system').length;
                  log(`${marker} ${c.id}  ${c.title}  (${msgCount} msgs)`, LogLevel.INFO);
                }
                log('* = current session', LogLevel.INFO);
              }
              continue;
            }

            if (cmd === '/save') {
              // Sync messages to conversation
              conversation.messages = [...messages];
              await saveConversation(conversation);
              log(`Saved: ${conversation.id}`, LogLevel.SUCCESS);
              continue;
            }

            if (cmd === '/clear') {
              messages.length = 0;
              messages.push({ role: 'system', content: SYSTEM_PROMPT });
              log('Context cleared.', LogLevel.SUCCESS);
              continue;
            }

            if (cmd === '/export') {
              const filePath = parts[1] ?? `conversation-${conversation.id}.json`;
              conversation.messages = [...messages];
              await exportConversation(conversation.id, filePath);
              log(`Exported to ${filePath}`, LogLevel.SUCCESS);
              continue;
            }

            if (cmd === '/history') {
              log('--- Conversation History ---', LogLevel.INFO);
              for (const m of messages) {
                if (m.role === 'system') continue;
                const prefix = m.role === 'user' ? 'You' : 'AI';
                log(`[${prefix}] ${m.content.slice(0, 200)}`, LogLevel.INFO);
              }
              log('--- End ---', LogLevel.INFO);
              continue;
            }

            if (cmd === '/help') {
              log('Commands:', LogLevel.INFO);
              log('  /new      Start a new conversation', LogLevel.INFO);
              log('  /list     List all conversations', LogLevel.INFO);
              log('  /save     Save current conversation', LogLevel.INFO);
              log('  /clear    Clear current context', LogLevel.INFO);
              log('  /rename   Rename current conversation', LogLevel.INFO);
              log('  /export   Export conversation to file', LogLevel.INFO);
              log('  /history  Show conversation history', LogLevel.INFO);
              log('  /help     Show this help', LogLevel.INFO);
              log('  exit/quit Leave chat mode', LogLevel.INFO);
              continue;
            }

            if (cmd === '/rename') {
              const newTitle = parts.slice(1).join(' ');
              if (!newTitle) {
                log('Usage: /rename <new title>', LogLevel.WARNING);
                continue;
              }
              conversation.title = newTitle;
              await saveConversation(conversation);
              log(`Renamed to: ${newTitle}`, LogLevel.SUCCESS);
              continue;
            }

            log(`Unknown command: ${cmd}. Type /help for available commands.`, LogLevel.WARNING);
            continue;
          }

          if (input === '') continue;

          messages.push({ role: 'user', content: input });

          try {
            const response = await chain.chat(messages);
            const reply = response.message.content || '(no response)';
            messages.push({ role: 'assistant', content: reply });
            log(reply, LogLevel.SUCCESS);
            log('', LogLevel.INFO);
            // Auto-save after each exchange
            conversation.messages = [...messages];
            // Auto-generate title from first user message using LLM
            if (!conversation.title || conversation.title.startsWith('Conversation ')) {
              const firstUserMsg = messages.find((m) => m.role === 'user');
              if (firstUserMsg) {
                try {
                  const titleResponse = await chain.chat([
                    {
                      role: 'system',
                      content:
                        'Generate a short title (max 30 chars) for a conversation that starts with this message. Reply with ONLY the title, no quotes or explanation.',
                    },
                    { role: 'user', content: firstUserMsg.content },
                  ]);
                  const generated = (titleResponse.message.content || '').trim().slice(0, 50);
                  if (generated) {
                    conversation.title = generated;
                  } else {
                    conversation.title = firstUserMsg.content.slice(0, 50);
                  }
                } catch {
                  conversation.title = firstUserMsg.content.slice(0, 50);
                }
              }
            }
            await saveConversation(conversation);
          } catch (err: unknown) {
            log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
            messages.pop();
          }
        }
      } catch (err: unknown) {
        log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
        process.exit(1);
      }
    });

  // ── config 命令 ──

  const configCommand = program.command('config').description('Manage default configuration');

  configCommand
    .command('set <key> <value>')
    .description('Set a config value (provider, model, baseUrl)')
    .action(async (key: string, value: string) => {
      try {
        const validKeys = ['provider', 'model', 'baseUrl'];
        if (!validKeys.includes(key)) {
          log(`Invalid config key: ${key}. Valid keys: ${validKeys.join(', ')}`, LogLevel.ERROR);
          return;
        }

        const configDir = path.join(os.homedir(), '.codeharness');
        await fs.mkdir(configDir, { recursive: true });
        const configPath = path.join(configDir, 'config.yaml');

        let content = '';
        try {
          content = await fs.readFile(configPath, 'utf-8');
        } catch {
          // file doesn't exist yet
        }

        const lines = content.split('\n');
        const llmStart = lines.findIndex((l) => /^\s*llm:/.test(l));

        if (llmStart < 0) {
          // No llm section, create one
          lines.push('llm:', `  ${key}: ${value}`);
        } else {
          // Find the key under llm section
          const keyIdx = lines.findIndex(
            (l, i) => i > llmStart && new RegExp(`^\\s+${key}:`).test(l),
          );

          if (keyIdx >= 0) {
            lines[keyIdx] = `  ${key}: ${value}`;
          } else {
            // Insert after the last llm property
            let insertIdx = llmStart + 1;
            while (
              insertIdx < lines.length &&
              (lines[insertIdx].startsWith('  ') || lines[insertIdx].trim() === '')
            ) {
              if (
                lines[insertIdx].trim() === '' &&
                insertIdx + 1 < lines.length &&
                !lines[insertIdx + 1].startsWith('  ')
              ) {
                insertIdx++;
                break;
              }
              insertIdx++;
            }
            lines.splice(insertIdx, 0, `  ${key}: ${value}`);
          }
        }

        await fs.writeFile(configPath, lines.join('\n'), 'utf-8');
        log(`Config ${key} set to ${value}`, LogLevel.SUCCESS);
      } catch (err: unknown) {
        log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
      }
    });

  configCommand
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      try {
        const cwd = process.cwd();
        const config = await loadConfig({ workspaceRoot: cwd });
        log(`provider: ${config.llm.provider}`, LogLevel.INFO);
        log(`model: ${config.llm.model}`, LogLevel.INFO);
        if (config.llm.baseUrl) {
          log(`baseUrl: ${config.llm.baseUrl}`, LogLevel.INFO);
        }
        if (config.llm.customProviders && config.llm.customProviders.length > 0) {
          log(`customProviders: ${config.llm.customProviders.length} registered`, LogLevel.INFO);
        }
      } catch (err: unknown) {
        log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
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

  // ── provider 子命令 ──

  const providerCommand = program
    .command('provider')
    .description('Manage custom OpenAI-compatible providers');

  providerCommand
    .command('list')
    .description('List all registered custom providers')
    .action(async () => {
      try {
        const cwd = process.cwd();
        const config = await loadConfig({ workspaceRoot: cwd });
        const customProviders = config.llm.customProviders ?? [];

        if (customProviders.length === 0) {
          log('No custom providers registered.', LogLevel.INFO);
          log(
            'Use `codeharness provider add <name> --base-url <url> --model <model>` to add one.',
            LogLevel.INFO,
          );
          return;
        }

        log('Custom providers:', LogLevel.INFO);
        for (const cp of customProviders) {
          log(`  ${cp.name}`, LogLevel.INFO);
          log(`    baseUrl: ${cp.baseUrl}`, LogLevel.INFO);
          log(`    model: ${cp.model}`, LogLevel.INFO);
          if (cp.contextWindow) {
            log(`    contextWindow: ${cp.contextWindow}`, LogLevel.INFO);
          }
        }
      } catch (err: unknown) {
        log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
      }
    });

  providerCommand
    .command('add <name>')
    .description('Add a custom OpenAI-compatible provider')
    .requiredOption('--base-url <url>', 'Base URL of the API endpoint')
    .requiredOption('--model <model>', 'Model name')
    .option('--context-window <number>', 'Context window size', parseInt)
    .action(
      async (name: string, options: { baseUrl: string; model: string; contextWindow?: number }) => {
        try {
          const cwd = process.cwd();
          const config = await loadConfig({ workspaceRoot: cwd });

          const customProviders = config.llm.customProviders ?? [];
          const existing = customProviders.findIndex((cp) => cp.name === name);

          const newProvider: CustomProviderConfig = {
            name,
            baseUrl: options.baseUrl,
            model: options.model,
          };
          if (options.contextWindow) {
            newProvider.contextWindow = options.contextWindow;
          }

          if (existing >= 0) {
            customProviders[existing] = newProvider;
            log(`Provider '${name}' updated.`, LogLevel.SUCCESS);
          } else {
            customProviders.push(newProvider);
            log(`Provider '${name}' added.`, LogLevel.SUCCESS);
          }

          config.llm.customProviders = customProviders;
          await writeConfig(cwd, { llm: { customProviders } });
        } catch (err: unknown) {
          log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
        }
      },
    );

  providerCommand
    .command('remove <name>')
    .description('Remove a custom provider')
    .action(async (name: string) => {
      try {
        const cwd = process.cwd();
        const config = await loadConfig({ workspaceRoot: cwd });

        const customProviders = config.llm.customProviders ?? [];
        const idx = customProviders.findIndex((cp) => cp.name === name);
        if (idx < 0) {
          log(`Provider '${name}' not found.`, LogLevel.WARNING);
          return;
        }

        customProviders.splice(idx, 1);
        const updated = customProviders.length > 0 ? customProviders : undefined;
        await writeConfig(cwd, { llm: { customProviders: updated } });
        log(`Provider '${name}' removed.`, LogLevel.SUCCESS);
      } catch (err: unknown) {
        log(`Error: ${(err as Error).message}`, LogLevel.ERROR);
      }
    });

  return program;
}

async function writeConfig(
  workspaceRoot: string,
  config: { llm: { customProviders?: CustomProviderConfig[] } },
): Promise<void> {
  const configDir = path.join(os.homedir(), '.codeharness');
  await fs.mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, 'config.yaml');

  let content = '';
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch {
    // file doesn't exist yet
  }

  const lines = content.split('\n');

  // Find the llm: section and its indentation
  const llmStart = lines.findIndex((l) => /^\s*llm:/.test(l));
  const existingCustom = lines.findIndex((l) => /^\s+customProviders:/.test(l));

  // Remove existing customProviders block (indented under llm)
  if (existingCustom >= 0) {
    let end = existingCustom + 1;
    while (end < lines.length && (/^\s{4,}/.test(lines[end]) || lines[end].trim() === '')) {
      if (lines[end].trim() === '' && end + 1 < lines.length && !/^\s{4,}/.test(lines[end + 1])) {
        break;
      }
      end++;
    }
    lines.splice(existingCustom, end - existingCustom);
  }

  // Build customProviders block (indented under llm)
  if (config.llm.customProviders && config.llm.customProviders.length > 0) {
    const block: string[] = [];
    block.push('  customProviders:');
    for (const cp of config.llm.customProviders) {
      block.push(`    - name: ${cp.name}`);
      block.push(`      baseUrl: ${cp.baseUrl}`);
      block.push(`      model: ${cp.model}`);
      if (cp.contextWindow) {
        block.push(`      contextWindow: ${cp.contextWindow}`);
      }
    }

    if (llmStart >= 0) {
      // Insert at the end of llm block
      let insertIdx = llmStart + 1;
      while (
        insertIdx < lines.length &&
        (lines[insertIdx].startsWith('  ') || lines[insertIdx].trim() === '')
      ) {
        if (
          lines[insertIdx].trim() === '' &&
          insertIdx + 1 < lines.length &&
          !lines[insertIdx + 1].startsWith('  ')
        ) {
          insertIdx++;
          break;
        }
        insertIdx++;
      }
      lines.splice(insertIdx, 0, ...block, '');
    } else {
      lines.push('llm:', ...block, '');
    }
  }

  await fs.writeFile(configPath, lines.join('\n'), 'utf-8');
}
