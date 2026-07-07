import { checkVersion, checkNodeVersion } from '../../../src/utils/version-check.js';

describe('checkNodeVersion', () => {
  it('should not throw with current Node.js version', () => {
    expect(() => checkNodeVersion()).not.toThrow();
  });
});

describe('checkVersion', () => {
  it('should return false for same version', () => {
    expect(checkVersion('1.0.0', '1.0.0')).toBe(false);
  });

  it('should return true when newer version available', () => {
    expect(checkVersion('1.0.0', '2.0.0')).toBe(true);
  });

  it('should return false when current is newer', () => {
    expect(checkVersion('2.0.0', '1.0.0')).toBe(false);
  });

  it('should handle patch version bump', () => {
    expect(checkVersion('1.0.0', '1.0.1')).toBe(true);
  });

  it('should handle minor version bump', () => {
    expect(checkVersion('1.0.0', '1.1.0')).toBe(true);
  });
});
