import { createLogger, LogLevel } from '../../../src/utils/logger.js';

describe('createLogger', () => {
  it('should create a logger witfh default level', () => {
    const logger = createLogger({ name: 'test' });
    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');
  });

  it('should create a logger with custom level', () => {
    const logger = createLogger({ name: 'test', level: LogLevel.DEBUG });
    expect(logger.level).toBe('debug');
  });

  it('should create a logger with silent level', () => {
    const logger = createLogger({ name: 'test', level: LogLevel.SILENT });
    expect(logger.level).toBe('silent');
  });
});

describe('LogLevel', () => {
  it('should have correct numeric values', () => {
    expect(LogLevel.TRACE).toBe(10);
    expect(LogLevel.DEBUG).toBe(20);
    expect(LogLevel.INFO).toBe(30);
    expect(LogLevel.WARN).toBe(40);
    expect(LogLevel.ERROR).toBe(50);
    expect(LogLevel.FATAL).toBe(60);
    expect(LogLevel.SILENT).toBe(Infinity);
  });
});
