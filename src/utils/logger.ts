import pino, { Logger, LoggerOptions } from 'pino';

/**
 * Log level enum matching Pino's numeric levels.
 */
export enum LogLevel {
  TRACE = 10,
  DEBUG = 20,
  INFO = 30,
  WARN = 40,
  ERROR = 50,
  FATAL = 60,
  SILENT = Infinity,
}

export interface LoggerConfig {
  name: string;
  level?: LogLevel;
  prettyPrint?: boolean;
}

/**
 * Create a pino logger instance with structured logging.
 * @param config - Logger configuration
 * @returns Configured pino Logger instance
 */
export function createLogger(config: LoggerConfig): Logger {
  const options: LoggerOptions = {
    name: config.name,
    level: pino.levels.labels[config.level ?? LogLevel.INFO] ?? 'info',
  };

  if (config.prettyPrint) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  return pino(options);
}
