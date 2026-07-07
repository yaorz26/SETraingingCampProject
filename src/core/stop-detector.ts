import type { Action, StopDecision } from './action-parser.js';

export type { StopDecision };

export interface StopContext {
  currentRound: number;
  maxRounds: number;
  lastAction: Action;
  consecutiveSameDiffs: number;
  startTime: number;
  globalTimeout: number;
  blockedNoAlternative: boolean;
  userInterrupted: boolean;
  costLimitReached: boolean;
}

export function shouldStop(context: StopContext): StopDecision {
  if (context.lastAction.type === 'finish') {
    return {
      should_stop: true,
      reason: 'finish_action',
      detail: context.lastAction.success
        ? 'Task completed successfully'
        : 'Task reported as failed',
    };
  }

  if (context.currentRound >= context.maxRounds) {
    return {
      should_stop: true,
      reason: 'max_rounds',
      detail: `Reached maximum rounds (${context.currentRound}/${context.maxRounds})`,
    };
  }

  if (context.consecutiveSameDiffs >= 3) {
    return {
      should_stop: true,
      reason: 'stall_detected',
      detail: `No progress detected for ${context.consecutiveSameDiffs} consecutive rounds`,
    };
  }

  if (Date.now() - context.startTime > context.globalTimeout) {
    return {
      should_stop: true,
      reason: 'global_timeout',
      detail: `Global timeout of ${context.globalTimeout}ms exceeded`,
    };
  }

  if (context.blockedNoAlternative) {
    return {
      should_stop: true,
      reason: 'blocked_no_alternative',
      detail: 'All actions blocked by guardrails with no alternative',
    };
  }

  if (context.userInterrupted) {
    return {
      should_stop: true,
      reason: 'user_interrupt',
      detail: 'User interrupted the task',
    };
  }

  if (context.costLimitReached) {
    return {
      should_stop: true,
      reason: 'cost_limit_reached',
      detail: 'Cost budget limit reached',
    };
  }

  return {
    should_stop: false,
    reason: 'finish_action',
    detail: '',
  };
}
