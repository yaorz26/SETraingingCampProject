import { buildContext, type BuildContextInput } from '../../../src/core/context-builder.js';

describe('buildContext', () => {
  const input: BuildContextInput = {
    task: 'Add unit tests for UserService',
    workspaceRoot: '/home/user/project',
    history: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ],
    currentRound: 3,
    memorySummary: 'Previous tasks: fixed login bug',
    contextWindow: 128000,
  };

  it('should include system prompt with tools', () => {
    const messages = buildContext(input);
    expect(messages.length).toBeGreaterThan(0);
    const systemMsg = messages[0];
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('CodeHarness');
    expect(systemMsg.content).toContain('read_file');
    expect(systemMsg.content).toContain('write_file');
    expect(systemMsg.content).toContain('finish');
    expect(systemMsg.content).toContain('Behavior Rules');
  });

  it('should include original task description', () => {
    const messages = buildContext(input);
    const systemMsg = messages[0].content ?? '';
    expect(systemMsg).toContain('Add unit tests for UserService');
  });

  it('should include workspace information', () => {
    const messages = buildContext(input);
    const systemMsg = messages[0].content ?? '';
    expect(systemMsg).toContain('/home/user/project');
  });

  it('should include memory summary', () => {
    const messages = buildContext(input);
    const systemMsg = messages[0].content ?? '';
    expect(systemMsg).toContain('Previous tasks');
  });

  it('should include round number', () => {
    const messages = buildContext(input);
    const systemMsg = messages[0].content ?? '';
    expect(systemMsg).toContain('Round 3');
  });

  it('should include history messages', () => {
    const messages = buildContext(input);
    const historyMsgs = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    expect(historyMsgs.length).toBeGreaterThanOrEqual(2);
  });
});
