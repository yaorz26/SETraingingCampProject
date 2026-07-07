import { z } from 'zod';

const fallbackSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'ollama']),
  model: z.string().min(1),
});

const llmSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'ollama']),
  model: z.string(),
  baseUrl: z.string().optional(),
  fallbacks: z.array(fallbackSchema),
});

const workspaceSchema = z.object({
  root: z.string(),
});

const guardrailsSchema = z.object({
  enabled: z.boolean(),
  additionalPatterns: z.array(z.string()),
  timeoutSeconds: z.number().int().min(1),
  excludeDirs: z.array(z.string()),
});

const feedbackSchema = z.object({
  testCommand: z.string(),
  lintCommand: z.string(),
  typecheckCommand: z.string(),
  buildCommand: z.string().optional(),
  autoFixRounds: z.number().int().min(0),
});

const toolsSchema = z.object({
  defaultShell: z.string(),
  commandTimeoutSeconds: z.number().int().min(1),
  maxOutputBytes: z.number().int().min(1),
});

const interactionSchema = z.object({
  mode: z.enum(['interactive', 'non-interactive']),
  dangerPolicy: z.enum(['ask', 'deny', 'skip']),
});

const contextSchema = z.object({
  maxHistoryRounds: z.number().int().min(1),
  modelContextRatio: z.number().min(0).max(1),
});

export const configSchema = z.object({
  version: z.number().optional(),
  llm: llmSchema.partial().optional(),
  workspace: workspaceSchema.partial().optional(),
  guardrails: guardrailsSchema.partial().optional(),
  feedback: feedbackSchema.partial().optional(),
  tools: toolsSchema.partial().optional(),
  interaction: interactionSchema.partial().optional(),
  context: contextSchema.partial().optional(),
});

export interface Config {
  version: number;
  llm: {
    provider: string;
    model: string;
    baseUrl?: string;
    fallbacks: Array<{ provider: string; model: string }>;
  };
  workspace: { root: string };
  guardrails: {
    enabled: boolean;
    additionalPatterns: string[];
    timeoutSeconds: number;
    excludeDirs: string[];
  };
  feedback: {
    testCommand: string;
    lintCommand: string;
    typecheckCommand: string;
    buildCommand?: string;
    autoFixRounds: number;
  };
  tools: {
    defaultShell: string;
    commandTimeoutSeconds: number;
    maxOutputBytes: number;
  };
  interaction: {
    mode: string;
    dangerPolicy: string;
  };
  context: {
    maxHistoryRounds: number;
    modelContextRatio: number;
  };
}

const DEFAULT_CONFIG: Config = {
  version: 1,
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    fallbacks: [],
  },
  workspace: { root: '.' },
  guardrails: {
    enabled: true,
    additionalPatterns: [],
    timeoutSeconds: 120,
    excludeDirs: [],
  },
  feedback: {
    testCommand: 'npm test',
    lintCommand: 'npm run lint',
    typecheckCommand: 'npx tsc --noEmit',
    autoFixRounds: 3,
  },
  tools: {
    defaultShell: 'bash',
    commandTimeoutSeconds: 60,
    maxOutputBytes: 1048576,
  },
  interaction: {
    mode: 'interactive',
    dangerPolicy: 'ask',
  },
  context: {
    maxHistoryRounds: 5,
    modelContextRatio: 0.8,
  },
};

export function validateConfig(
  data: unknown,
): { success: true; data: Config } | { success: false; error: z.ZodError } {
  const result = configSchema.safeParse(data ?? {});
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, data: mergeDefaults(result.data) };
}

function mergeDefaults(partial: z.infer<typeof configSchema>): Config {
  return {
    version: partial.version ?? DEFAULT_CONFIG.version,
    llm: {
      provider: partial.llm?.provider ?? DEFAULT_CONFIG.llm.provider,
      model: partial.llm?.model ?? DEFAULT_CONFIG.llm.model,
      baseUrl: partial.llm?.baseUrl,
      fallbacks: partial.llm?.fallbacks ?? DEFAULT_CONFIG.llm.fallbacks,
    },
    workspace: {
      root: partial.workspace?.root ?? DEFAULT_CONFIG.workspace.root,
    },
    guardrails: {
      enabled: partial.guardrails?.enabled ?? DEFAULT_CONFIG.guardrails.enabled,
      additionalPatterns:
        partial.guardrails?.additionalPatterns ?? DEFAULT_CONFIG.guardrails.additionalPatterns,
      timeoutSeconds:
        partial.guardrails?.timeoutSeconds ?? DEFAULT_CONFIG.guardrails.timeoutSeconds,
      excludeDirs: partial.guardrails?.excludeDirs ?? DEFAULT_CONFIG.guardrails.excludeDirs,
    },
    feedback: {
      testCommand: partial.feedback?.testCommand ?? DEFAULT_CONFIG.feedback.testCommand,
      lintCommand: partial.feedback?.lintCommand ?? DEFAULT_CONFIG.feedback.lintCommand,
      typecheckCommand:
        partial.feedback?.typecheckCommand ?? DEFAULT_CONFIG.feedback.typecheckCommand,
      buildCommand: partial.feedback?.buildCommand,
      autoFixRounds: partial.feedback?.autoFixRounds ?? DEFAULT_CONFIG.feedback.autoFixRounds,
    },
    tools: {
      defaultShell: partial.tools?.defaultShell ?? DEFAULT_CONFIG.tools.defaultShell,
      commandTimeoutSeconds:
        partial.tools?.commandTimeoutSeconds ?? DEFAULT_CONFIG.tools.commandTimeoutSeconds,
      maxOutputBytes: partial.tools?.maxOutputBytes ?? DEFAULT_CONFIG.tools.maxOutputBytes,
    },
    interaction: {
      mode: partial.interaction?.mode ?? DEFAULT_CONFIG.interaction.mode,
      dangerPolicy: partial.interaction?.dangerPolicy ?? DEFAULT_CONFIG.interaction.dangerPolicy,
    },
    context: {
      maxHistoryRounds:
        partial.context?.maxHistoryRounds ?? DEFAULT_CONFIG.context.maxHistoryRounds,
      modelContextRatio:
        partial.context?.modelContextRatio ?? DEFAULT_CONFIG.context.modelContextRatio,
    },
  };
}
