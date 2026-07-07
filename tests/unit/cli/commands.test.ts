import { createProgram } from '../../../src/cli/commands.js';

describe('CLI commands', () => {
  it('should display help with no arguments', () => {
    const program = createProgram();
    const output = program.helpInformation();
    expect(output).toContain('codeharness');
    expect(output).toContain('run');
    expect(output).toContain('init');
    expect(output).toContain('setup');
    expect(output).toContain('key');
    expect(output).toContain('provider');
    expect(output).toContain('chat');
    expect(output).toContain('config');
  });

  it('should include version information', () => {
    const program = createProgram();
    expect(program.version()).toBe('1.0.0');
  });
});
