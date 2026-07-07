import { interceptFinish } from '../../../src/core/finish-interceptor.js';

describe('interceptFinish', () => {
  it('should allow finish when all checks pass', () => {
    const result = interceptFinish({
      agentSuccess: true,
      testsPassed: true,
      lintPassed: true,
      typeCheckPassed: true,
      unexpectedFiles: [],
      driftResult: { drifting: false, risk: 'none' },
    });
    expect(result.intercepted).toBe(false);
  });

  it('should intercept when tests fail but agent claims success', () => {
    const result = interceptFinish({
      agentSuccess: true,
      testsPassed: false,
      lintPassed: true,
      typeCheckPassed: true,
      unexpectedFiles: [],
      driftResult: { drifting: false, risk: 'none' },
      testFailures: 3,
    });
    expect(result.intercepted).toBe(true);
    expect(result.message).toContain('3');
    expect(result.message).toContain('Tests');
  });

  it('should intercept when unexpected files modified', () => {
    const result = interceptFinish({
      agentSuccess: true,
      testsPassed: true,
      lintPassed: true,
      typeCheckPassed: true,
      unexpectedFiles: ['src/unrelated.ts', 'config.json'],
      driftResult: { drifting: false, risk: 'none' },
    });
    expect(result.intercepted).toBe(true);
    expect(result.message).toContain('unrelated.ts');
    expect(result.message).toContain('config.json');
  });

  it('should intercept when drift is high', () => {
    const result = interceptFinish({
      agentSuccess: true,
      testsPassed: true,
      lintPassed: true,
      typeCheckPassed: true,
      unexpectedFiles: [],
      driftResult: { drifting: true, risk: 'high', reason: 'Suspicious activity' },
    });
    expect(result.intercepted).toBe(true);
    expect(result.message).toContain('Drift');
  });

  it('should not intercept when agent reports failure', () => {
    const result = interceptFinish({
      agentSuccess: false,
      testsPassed: false,
      lintPassed: false,
      typeCheckPassed: false,
      unexpectedFiles: [],
      driftResult: { drifting: false, risk: 'none' },
    });
    expect(result.intercepted).toBe(false);
  });

  it('should allow finish when drift is low', () => {
    const result = interceptFinish({
      agentSuccess: true,
      testsPassed: true,
      lintPassed: true,
      typeCheckPassed: true,
      unexpectedFiles: [],
      driftResult: { drifting: true, risk: 'low', reason: 'Minor issue' },
    });
    expect(result.intercepted).toBe(false);
    expect(result.suggestion).toContain('Warning');
  });
});
