import type { Action, ActionResult, ParseResult } from './action-parser.js';
import { parseAction } from './action-parser.js';
import { dispatchAction } from './action-dispatcher.js';
import { shouldStop } from './stop-detector.js';
import type { DriftDetector } from './drift-detector.js';
import { interceptFinish } from './finish-interceptor.js';
import type { LLMProviderChain } from '../llm/provider-chain.js';
import type { Message, ToolDefinition } from '../llm/provider.js';
import { log, LogLevel } from '../cli/output.js';

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the workspace',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          offset: { type: 'number', description: 'Line number to start reading from' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file in the workspace',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file from the workspace',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and directories in a directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to workspace root' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_file',
      description: 'Search for files by glob pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g. **/*.ts)' },
          path: { type: 'string', description: 'Directory to search in' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents using regex',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory to search in' },
          include: { type: 'string', description: 'File pattern filter (e.g. *.ts)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command in the workspace',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description: 'Run the project test suite',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_lint',
      description: 'Run the project linter',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_type_check',
      description: 'Run TypeScript type checking',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: 'Mark the task as complete',
      parameters: {
        type: 'object',
        properties: {
          success: { type: 'boolean', description: 'Whether the task was successful' },
          summary: { type: 'string', description: 'Summary of what was done' },
        },
        required: ['success', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Ask the user a question before proceeding',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask' },
          context: { type: 'string', description: 'Additional context for the question' },
        },
        required: ['question'],
      },
    },
  },
];

export interface AgentConfig {
  task: string;
  workspaceRoot: string;
  maxRounds: number;
  globalTimeout: number;
  dryRun: boolean;
  nonInteractive: boolean;
}

export interface TaskResult {
  success: boolean;
  summary: string;
  exitCode: number;
  rounds: number;
}

export async function runAgent(
  config: AgentConfig,
  llmChain: LLMProviderChain,
  driftDetector: DriftDetector,
): Promise<TaskResult> {
  const startTime = Date.now();
  let round = 0;
  let consecutiveSameDiffs = 0;
  let lastDiffs: string[] = [];
  const history: Message[] = [];

  // Inject original task
  history.push({
    role: 'system',
    content: `You are a coding agent. You MUST use the provided tools to complete tasks. 
Rules:
1. Use tools immediately - do NOT chat or ask questions unless absolutely necessary
2. When the task is done, call finish with success=true and a brief summary
3. If the task is just a greeting or simple question, respond with tool calls (like list_dir to understand context) then finish quickly
4. Keep responses concise - your text content will be shown to the user as your thinking process
5. Work in workspace: ${config.workspaceRoot}

Task: ${config.task}`,
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    round++;
    log(`→ 第${round}轮/${config.maxRounds}`, LogLevel.INFO);

    // Stop check
    if (round > 1) {
      const stopDecision = shouldStop({
        currentRound: round - 1,
        maxRounds: config.maxRounds,
        lastAction: history[history.length - 1]?.toolCalls?.[0]
          ? ({ type: 'read_file', path: 'dummy' } as Action)
          : ({ type: 'read_file', path: 'dummy' } as Action),
        consecutiveSameDiffs,
        startTime,
        globalTimeout: config.globalTimeout,
        blockedNoAlternative: false,
        userInterrupted: false,
        costLimitReached: false,
      });

      if (stopDecision.should_stop) {
        return {
          success: false,
          summary: stopDecision.detail,
          exitCode: 1,
          rounds: round - 1,
        };
      }
    }

    // Call LLM
    let response;
    try {
      response = await llmChain.chat(history, { tools: TOOLS });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      log(`LLM error: ${error.message}`, LogLevel.ERROR);
      return {
        success: false,
        summary: `LLM error: ${error.message}`,
        exitCode: 2,
        rounds: round,
      };
    }

    // Add assistant response to history
    history.push(response.message);

    // Log the LLM's response
    if (response.message.content) {
      log(`  ${response.message.content.substring(0, 200)}`, LogLevel.INFO);
    }
    if (response.message.toolCalls && response.message.toolCalls.length > 0) {
      const tc = response.message.toolCalls[0];
      log(`  → ${tc.name}(${JSON.stringify(tc.arguments).substring(0, 100)})`, LogLevel.INFO);
    }

    // Parse action from tool calls
    let parseResult: ParseResult = { success: false, error: 'No tool calls in response' };
    let parseRetries = 0;

    if (response.message.toolCalls && response.message.toolCalls.length > 0) {
      const tc = response.message.toolCalls[0];
      const actionJson = JSON.stringify({
        type: tc.name,
        ...tc.arguments,
      });

      parseResult = parseAction(actionJson);
      if (!parseResult.success) {
        parseRetries = 1;
      }

      for (let retry = 0; retry < 2 && !parseResult.success; retry++) {
        history.push({
          role: 'user',
          content: `Parse error: ${parseResult.error}. Please fix the action format.`,
        });
        try {
          response = await llmChain.chat(history, { tools: TOOLS });
          history.push(response.message);
          if (response.message.toolCalls?.[0]) {
            const retryTc = response.message.toolCalls[0];
            const retryJson = JSON.stringify({
              type: retryTc.name,
              ...retryTc.arguments,
            });
            parseResult = parseAction(retryJson);
            if (!parseResult.success) {
              parseRetries++;
            }
          } else {
            parseRetries++;
          }
        } catch {
          parseRetries++;
          break;
        }
      }
    }

    if (!parseResult.success) {
      history.push({
        role: 'user',
        content: `Action parse failed: ${parseResult.error}. Please provide a valid action with tool calls.`,
      });

      // Retry: call LLM again for the next round
      if (round < config.maxRounds) {
        continue;
      }

      return {
        success: false,
        summary: `Action parse failed after ${parseRetries} retries: ${parseResult.error}`,
        exitCode: 3,
        rounds: round,
      };
    }

    const action = parseResult.action!;

    // Drift detection
    const filesModified =
      action.type === 'write_file' || action.type === 'delete_file'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          [(action as any).path]
        : [];
    const driftResult = driftDetector.check({
      filesModified,
      taskKeywords: config.task.split(/\s+/),
    });

    if (driftResult.risk === 'high') {
      return {
        success: false,
        summary: `Drift detected: ${driftResult.reason}`,
        exitCode: 4,
        rounds: round,
      };
    }

    // Execute action
    let execResult: ActionResult;
    try {
      execResult = await dispatchAction(action, config.workspaceRoot);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      execResult = {
        action,
        success: false,
        error: error.message,
        duration: 0,
      };
    }

    const actionLabel =
      action.type === 'run_command'
        ? `shell: ${(action as { command: string }).command}`
        : `${action.type} ${(action as { path?: string }).path ?? ''}`;
    log(
      execResult.success
        ? `✓ ${actionLabel} (${execResult.duration}ms)`
        : `✗ ${actionLabel} (${execResult.duration}ms) - ${execResult.error}`,
      execResult.success ? LogLevel.SUCCESS : LogLevel.ERROR,
    );

    // Add execution result to history
    history.push({
      role: 'tool',
      content: execResult.success ? (execResult.output ?? 'Success') : `Error: ${execResult.error}`,
      toolCallId: response.message.toolCalls?.[0]?.id ?? 'unknown',
    });

    // Finish interception
    if (action.type === 'finish') {
      const finishResult = interceptFinish({
        agentSuccess: action.success,
        testsPassed: execResult.success,
        lintPassed: true,
        typeCheckPassed: true,
        unexpectedFiles: [],
        driftResult,
      });

      if (finishResult.intercepted) {
        history.push({
          role: 'user',
          content: `${finishResult.message}\n${finishResult.suggestion ?? ''}`,
        });
        continue;
      }

      return {
        success: action.success,
        summary: action.summary,
        exitCode: action.success ? 0 : 1,
        rounds: round,
      };
    }

    // Diff tracking
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const currentDiffs = filesModified.length > 0 ? filesModified : [];
    if (
      currentDiffs.length > 0 &&
      lastDiffs.length > 0 &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      arraysEqual(currentDiffs, lastDiffs)
    ) {
      consecutiveSameDiffs++;
    } else {
      consecutiveSameDiffs = 0;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    lastDiffs = currentDiffs;
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
