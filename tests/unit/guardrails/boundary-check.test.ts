import { checkPath } from '../../../src/guardrails/boundary-check.js';

describe('checkPath', () => {
  const workspace = '/home/user/project';

  it('should allow path within workspace', () => {
    const result = checkPath('src/file.ts', workspace);
    expect(result.passed).toBe(true);
    expect(result.isWithinWorkspace).toBe(true);
  });

  it('should block path outside workspace', () => {
    const result = checkPath('/etc/passwd', workspace);
    expect(result.passed).toBe(false);
    expect(result.isWithinWorkspace).toBe(false);
    expect(result.isSensitive).toBe(true);
  });

  it('should block ../ traversal escaping workspace', () => {
    const result = checkPath('../../../etc/passwd', workspace);
    expect(result.passed).toBe(false);
    expect(result.isWithinWorkspace).toBe(false);
  });

  it('should block .env file within workspace', () => {
    const result = checkPath('.env', workspace);
    expect(result.passed).toBe(false);
    expect(result.isWithinWorkspace).toBe(true);
    expect(result.isSensitive).toBe(true);
  });

  it('should block *.key files', () => {
    const result = checkPath('secrets/private.key', workspace);
    expect(result.passed).toBe(false);
    expect(result.isSensitive).toBe(true);
  });

  it('should block *secret* files', () => {
    const result = checkPath('config/secret.json', workspace);
    expect(result.passed).toBe(false);
    expect(result.isSensitive).toBe(true);
  });

  it('should handle Windows paths', () => {
    const winWorkspace = 'C:\\Users\\dev\\project';
    const result = checkPath('C:\\Users\\dev\\project\\src\\file.ts', winWorkspace);
    expect(result.passed).toBe(true);
    expect(result.isWithinWorkspace).toBe(true);
  });

  it('should block cross-drive paths on Windows', () => {
    const winWorkspace = 'C:\\Users\\dev\\project';
    const result = checkPath('D:\\other\\file.ts', winWorkspace);
    expect(result.passed).toBe(false);
    expect(result.isWithinWorkspace).toBe(false);
  });
});
