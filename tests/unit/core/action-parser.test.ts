import {
  parseAction,
  validateAction,
  type ReadFileAction,
  type WriteFileAction,
  type DeleteFileAction,
  type ListDirAction,
  type SearchFileAction,
  type GrepAction,
  type RunCommandAction,
  type RunTestsAction,
  type RunLintAction,
  type RunTypeCheckAction,
  type FinishAction,
  type AskUserAction,
} from '../../../src/core/action-parser.js';

describe('parseAction', () => {
  it('should parse read_file action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'read_file',
        path: 'src/user.ts',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as ReadFileAction;
    expect(action.type).toBe('read_file');
    expect(action.path).toBe('src/user.ts');
  });

  it('should parse read_file with startLine/endLine', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'read_file',
        path: 'src/user.ts',
        startLine: 10,
        endLine: 50,
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as ReadFileAction;
    expect(action.startLine).toBe(10);
    expect(action.endLine).toBe(50);
  });

  it('should parse write_file action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'write_file',
        path: 'src/user.ts',
        content: 'console.log("hello");',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as WriteFileAction;
    expect(action.type).toBe('write_file');
    expect(action.path).toBe('src/user.ts');
    expect(action.content).toBe('console.log("hello");');
  });

  it('should parse delete_file action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'delete_file',
        path: 'src/old.ts',
        reason: 'No longer needed',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as DeleteFileAction;
    expect(action.type).toBe('delete_file');
    expect(action.reason).toBe('No longer needed');
  });

  it('should parse list_dir action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'list_dir',
        path: 'src',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as ListDirAction;
    expect(action.type).toBe('list_dir');
    expect(action.path).toBe('src');
  });

  it('should parse search_file action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'search_file',
        pattern: 'src/**/*.ts',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as SearchFileAction;
    expect(action.type).toBe('search_file');
    expect(action.pattern).toBe('src/**/*.ts');
  });

  it('should parse grep action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'grep',
        query: 'function getUser',
        path: 'src',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as GrepAction;
    expect(action.type).toBe('grep');
    expect(action.query).toBe('function getUser');
    expect(action.path).toBe('src');
  });

  it('should parse run_command action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'run_command',
        command: 'npm install',
        reason: 'Install dependencies',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as RunCommandAction;
    expect(action.type).toBe('run_command');
    expect(action.command).toBe('npm install');
  });

  it('should parse run_tests action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'run_tests',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as RunTestsAction;
    expect(action.type).toBe('run_tests');
  });

  it('should parse run_lint action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'run_lint',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as RunLintAction;
    expect(action.type).toBe('run_lint');
  });

  it('should parse run_type_check action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'run_type_check',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as RunTypeCheckAction;
    expect(action.type).toBe('run_type_check');
  });

  it('should parse finish action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'finish',
        success: true,
        summary: 'Task completed',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as FinishAction;
    expect(action.type).toBe('finish');
    expect(action.success).toBe(true);
    expect(action.summary).toBe('Task completed');
  });

  it('should parse ask_user action', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'ask_user',
        question: 'Which library should I use?',
        context: 'Need to choose between lodash and ramda',
      }),
    );
    expect(result.success).toBe(true);
    const action = result.action! as AskUserAction;
    expect(action.type).toBe('ask_user');
    expect(action.question).toBe('Which library should I use?');
  });

  it('should fail on missing type field', () => {
    const result = parseAction(
      JSON.stringify({
        path: 'src/file.ts',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('type');
  });

  it('should fail on unknown action type', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'unknown_action',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('discriminator');
  });

  it('should fail on invalid JSON', () => {
    const result = parseAction('not valid json');
    expect(result.success).toBe(false);
    expect(result.error).toContain('JSON');
  });

  it('should fail on write_file missing content', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'write_file',
        path: 'src/file.ts',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('content');
  });

  it('should fail on path with ../ traversal', () => {
    const result = parseAction(
      JSON.stringify({
        type: 'read_file',
        path: '../../../etc/passwd',
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('path');
  });
});

describe('validateAction', () => {
  it('should validate a correct action object', () => {
    const result = validateAction({
      type: 'read_file',
      path: 'src/file.ts',
    });
    expect(result.success).toBe(true);
    expect(result.action).toBeDefined();
  });

  it('should reject non-object input', () => {
    const result = validateAction('not an object');
    expect(result.success).toBe(false);
  });

  it('should reject null input', () => {
    const result = validateAction(null);
    expect(result.success).toBe(false);
  });

  it('should reject action missing required fields', () => {
    const result = validateAction({
      type: 'run_command',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('command');
  });
});
