import { DriftDetector } from '../../../src/core/drift-detector.js';

describe('DriftDetector', () => {
  const originalTask = 'Add unit tests for UserService';
  let detector: DriftDetector;

  beforeEach(() => {
    detector = new DriftDetector(originalTask);
  });

  describe('check', () => {
    it('should return no drift for normal operation', () => {
      const result = detector.check({
        filesModified: ['src/services/user.service.ts', 'src/services/user.service.test.ts'],
        taskKeywords: ['test', 'UserService', 'unit'],
      });
      expect(result.drifting).toBe(false);
      expect(result.risk).toBe('none');
    });

    it('should detect file count explosion as high risk', () => {
      const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`);
      const result = detector.check({
        filesModified: files,
        taskKeywords: ['test', 'UserService'],
      });
      expect(result.drifting).toBe(true);
      expect(result.risk).toBe('high');
    });

    it('should detect unrelated file modification as low risk', () => {
      const result = detector.check({
        filesModified: ['src/components/Header.tsx', 'src/assets/logo.png'],
        taskKeywords: ['test', 'UserService', 'unit'],
      });
      expect(result.drifting).toBe(true);
      expect(result.risk).toBe('low');
    });

    it('should detect config file modification as medium risk', () => {
      const result = detector.check({
        filesModified: ['package.json', 'tsconfig.json'],
        taskKeywords: ['test', 'UserService', 'unit'],
      });
      expect(result.drifting).toBe(true);
      expect(result.risk).toBe('medium');
    });

    it('should not drift when task is about config', () => {
      const configDetector = new DriftDetector('Update webpack config');
      const result = configDetector.check({
        filesModified: ['webpack.config.js'],
        taskKeywords: ['webpack', 'config', 'update'],
      });
      expect(result.drifting).toBe(false);
    });
  });
});
