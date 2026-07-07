export enum DangerCategory {
  FILE_DESTRUCTION = 'file_destruction',
  FILE_DESTRUCTION_WORKSPACE = 'file_destruction_workspace',
  GIT_DESTRUCTIVE = 'git_destructive',
  GIT_REWRITE_HISTORY = 'git_rewrite_history',
  PUBLISH = 'publish',
  ARBITRARY_CODE = 'arbitrary_code',
  DATABASE_DESTRUCTIVE = 'database_destructive',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
}

export interface PatternDefinition {
  name: string;
  pattern: RegExp;
  category: DangerCategory;
  description: string;
}

export interface MatchResult {
  pattern: string;
  category: DangerCategory;
  description: string;
  matched: string;
}

const DEFAULT_PATTERNS: PatternDefinition[] = [
  {
    name: 'unix-rm-rf',
    pattern: /\brm\s+.*-rf?\b/i,
    category: DangerCategory.FILE_DESTRUCTION,
    description: 'Recursive file deletion',
  },
  {
    name: 'win-del-f-s',
    pattern: /\bdel\s+.*\/[fs]\b/i,
    category: DangerCategory.FILE_DESTRUCTION,
    description: 'Windows forceful file deletion',
  },
  {
    name: 'rmdir-s',
    pattern: /\brmdir\s+.*\/s\b/i,
    category: DangerCategory.FILE_DESTRUCTION,
    description: 'Windows recursive directory removal',
  },
  {
    name: 'rm-workspace',
    pattern: /\brm\s+.*\.\//i,
    category: DangerCategory.FILE_DESTRUCTION_WORKSPACE,
    description: 'File deletion within workspace',
  },
  {
    name: 'git-push-force',
    pattern: /\bgit\s+push\s+.*(--force|-f)\b/i,
    category: DangerCategory.GIT_DESTRUCTIVE,
    description: 'Force push to remote',
  },
  {
    name: 'git-push-delete',
    pattern: /\bgit\s+push\s+.*--delete\b/i,
    category: DangerCategory.GIT_DESTRUCTIVE,
    description: 'Delete remote branch',
  },
  {
    name: 'git-reset-hard',
    pattern: /\bgit\s+reset\s+--hard\b/i,
    category: DangerCategory.GIT_DESTRUCTIVE,
    description: 'Hard reset of git history',
  },
  {
    name: 'git-clean',
    pattern: /\bgit\s+clean\s+-f[dx]?\b/i,
    category: DangerCategory.GIT_DESTRUCTIVE,
    description: 'Force clean working directory',
  },
  {
    name: 'git-rebase',
    pattern: /\bgit\s+rebase\s+-i\b/i,
    category: DangerCategory.GIT_REWRITE_HISTORY,
    description: 'Interactive rebase',
  },
  {
    name: 'git-amend',
    pattern: /\bgit\s+commit\s+.*--amend\b/i,
    category: DangerCategory.GIT_REWRITE_HISTORY,
    description: 'Amend git commit',
  },
  {
    name: 'npm-publish',
    pattern: /\bnpm\s+publish\b/i,
    category: DangerCategory.PUBLISH,
    description: 'Publish npm package',
  },
  {
    name: 'docker-push',
    pattern: /\bdocker\s+push\b/i,
    category: DangerCategory.PUBLISH,
    description: 'Push Docker image',
  },
  {
    name: 'curl-pipe-bash',
    pattern: /\bcurl\s+.*\|\s*(ba)?sh\b/i,
    category: DangerCategory.ARBITRARY_CODE,
    description: 'Download and execute script',
  },
  {
    name: 'wget-pipe',
    pattern: /\bwget\s+.*\|\s*(ba)?sh\b/i,
    category: DangerCategory.ARBITRARY_CODE,
    description: 'Download and execute script via wget',
  },
  {
    name: 'eval-exec',
    pattern: /\beval\s+/i,
    category: DangerCategory.ARBITRARY_CODE,
    description: 'Evaluate arbitrary code',
  },
  {
    name: 'drop-table',
    pattern: /\bDROP\s+TABLE\b/i,
    category: DangerCategory.DATABASE_DESTRUCTIVE,
    description: 'Drop database table',
  },
  {
    name: 'delete-from',
    pattern: /\bDELETE\s+FROM\b/i,
    category: DangerCategory.DATABASE_DESTRUCTIVE,
    description: 'Delete database records',
  },
  {
    name: 'truncate-table',
    pattern: /\bTRUNCATE\s+(TABLE\s+)?/i,
    category: DangerCategory.DATABASE_DESTRUCTIVE,
    description: 'Truncate database table',
  },
  {
    name: 'sudo',
    pattern: /\bsudo\s+/i,
    category: DangerCategory.PRIVILEGE_ESCALATION,
    description: 'Privilege escalation via sudo',
  },
  {
    name: 'chmod-777',
    pattern: /\bchmod\s+.*777\b/i,
    category: DangerCategory.PRIVILEGE_ESCALATION,
    description: 'Overly permissive file permissions',
  },
  {
    name: 'chown',
    pattern: /\bchown\s+/i,
    category: DangerCategory.PRIVILEGE_ESCALATION,
    description: 'Change file ownership',
  },
];

export function detectDangerousPatterns(
  command: string,
  customPatterns: PatternDefinition[] = [],
): MatchResult[] {
  const allPatterns = [...DEFAULT_PATTERNS, ...customPatterns];
  const results: MatchResult[] = [];

  for (const def of allPatterns) {
    const match = command.match(def.pattern);
    if (match) {
      results.push({
        pattern: def.name,
        category: def.category,
        description: def.description,
        matched: match[0],
      });
    }
  }

  return results;
}
