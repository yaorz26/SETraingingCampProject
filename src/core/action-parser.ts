import { z } from 'zod';

// ---- 动作类型定义 ----

export interface ReadFileAction {
  type: 'read_file';
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface WriteFileAction {
  type: 'write_file';
  path: string;
  content: string;
}

export interface DeleteFileAction {
  type: 'delete_file';
  path: string;
  reason: string;
}

export interface ListDirAction {
  type: 'list_dir';
  path: string;
}

export interface SearchFileAction {
  type: 'search_file';
  pattern: string;
}

export interface GrepAction {
  type: 'grep';
  query: string;
  path?: string;
  includePattern?: string;
}

export interface RunCommandAction {
  type: 'run_command';
  command: string;
  reason: string;
  timeout?: number;
}

export interface RunTestsAction {
  type: 'run_tests';
  command?: string;
}

export interface RunLintAction {
  type: 'run_lint';
  command?: string;
}

export interface RunTypeCheckAction {
  type: 'run_type_check';
  command?: string;
}

export interface FinishAction {
  type: 'finish';
  success: boolean;
  summary: string;
  artifacts?: string[];
}

export interface AskUserAction {
  type: 'ask_user';
  question: string;
  context?: string;
}

export type Action =
  | ReadFileAction
  | WriteFileAction
  | DeleteFileAction
  | ListDirAction
  | SearchFileAction
  | GrepAction
  | RunCommandAction
  | RunTestsAction
  | RunLintAction
  | RunTypeCheckAction
  | FinishAction
  | AskUserAction;

// ---- 相关类型 ----

export interface ActionResult {
  action: Action;
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  duration: number;
}

export interface DriftCheckResult {
  drifting: boolean;
  risk: 'none' | 'low' | 'medium' | 'high';
  reason?: string;
}

export interface FinishResult {
  intercepted: boolean;
  message?: string;
  suggestion?: string;
}

export interface StopDecision {
  should_stop: boolean;
  reason:
    | 'finish_action'
    | 'max_rounds'
    | 'stall_detected'
    | 'global_timeout'
    | 'user_interrupt'
    | 'blocked_no_alternative'
    | 'cost_limit_reached';
  detail: string;
}

// ---- 解析结果 ----

export interface ParseResult {
  success: boolean;
  action?: Action;
  error?: string;
}

// ---- Zod Schemas ----

const pathSchema = z.string().refine((p) => !p.includes('..'), {
  message: 'Path must not contain ".." traversal',
});

const readFileSchema = z.object({
  type: z.literal('read_file'),
  path: pathSchema,
  startLine: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
});

const writeFileSchema = z.object({
  type: z.literal('write_file'),
  path: pathSchema,
  content: z.string(),
});

const deleteFileSchema = z.object({
  type: z.literal('delete_file'),
  path: pathSchema,
  reason: z.string(),
});

const listDirSchema = z.object({
  type: z.literal('list_dir'),
  path: pathSchema,
});

const searchFileSchema = z.object({
  type: z.literal('search_file'),
  pattern: z.string(),
});

const grepSchema = z.object({
  type: z.literal('grep'),
  query: z.string(),
  path: pathSchema.optional(),
  includePattern: z.string().optional(),
});

const runCommandSchema = z.object({
  type: z.literal('run_command'),
  command: z.string(),
  reason: z.string(),
  timeout: z.number().int().positive().optional(),
});

const runTestsSchema = z.object({
  type: z.literal('run_tests'),
  command: z.string().optional(),
});

const runLintSchema = z.object({
  type: z.literal('run_lint'),
  command: z.string().optional(),
});

const runTypeCheckSchema = z.object({
  type: z.literal('run_type_check'),
  command: z.string().optional(),
});

const finishSchema = z.object({
  type: z.literal('finish'),
  success: z.boolean(),
  summary: z.string(),
  artifacts: z.array(z.string()).optional(),
});

const askUserSchema = z.object({
  type: z.literal('ask_user'),
  question: z.string(),
  context: z.string().optional(),
});

const actionSchema = z.discriminatedUnion('type', [
  readFileSchema,
  writeFileSchema,
  deleteFileSchema,
  listDirSchema,
  searchFileSchema,
  grepSchema,
  runCommandSchema,
  runTestsSchema,
  runLintSchema,
  runTypeCheckSchema,
  finishSchema,
  askUserSchema,
]);

// ---- 公共函数 ----

export function parseAction(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: 'Invalid JSON: failed to parse action input' };
  }

  return validateAction(parsed);
}

export function validateAction(action: unknown): ParseResult {
  if (typeof action !== 'object' || action === null) {
    return { success: false, error: 'Action must be a non-null object' };
  }

  const result = actionSchema.safeParse(action);

  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : 'type';
      return `${path}: ${i.message}`;
    });
    return { success: false, error: issues.join('; ') };
  }

  return { success: true, action: result.data as Action };
}
