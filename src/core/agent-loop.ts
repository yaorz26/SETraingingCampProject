import type { Action, ActionResult, ParseResult } from './action-parser.js';
import { parseAction } from './action-parser.js';
import { dispatchAction } from './action-dispatcher.js';
import { shouldStop } from './stop-detector.js';
import type { DriftDetector } from './drift-detector.js';
import { interceptFinish } from './finish-interceptor.js';
import type { LLMProviderChain } from '../llm/provider-chain.js';
import type { Message } from '../llm/provider.js';

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
    content: `Your task: ${config.task}\nWork in workspace: ${config.workspaceRoot}`,
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    round++;

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
      response = await llmChain.chat(history);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      return {
        success: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        summary: `LLM error: ${err.message}`,
        exitCode: 2,
        rounds: round,
      };
    }

    // Add assistant response to history
    history.push(response.message);

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
          response = await llmChain.chat(history);
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
    } catch (err: any) {
      execResult = {
        action,
        success: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        error: err.message,
        duration: 0,
      };
    }

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
