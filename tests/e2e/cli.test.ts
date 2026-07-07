import { createProgram } from '../../src/cli/commands.js';

describe('CLI E2E tests', () => {
  it('should display help with run command', () => {
    const program = createProgram();
    const output = program.helpInformation();
    expect(output).toContain('run');
    expect(output).toContain('init');
    expect(output).toContain('key');
    expect(output).toContain('setup');
  });

  it('should have version info', () => {
    const program = createProgram();
    expect(program.version()).toBeTruthy();
  });

  it('should have run command with options', () => {
    const program = createProgram();
    const runCmd = program.commands.find((c) => c.name() === 'run');
    expect(runCmd).toBeDefined();
    expect(runCmd?.options.some((o) => o.long === '--dry-run')).toBe(true);
  });
});
