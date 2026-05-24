import { type Logger, pino } from 'pino';

export function createLogger(level: string, pretty = process.stdout.isTTY): Logger {
  return pino({
    level,
    base: { app: 'a2a' },
    transport: pretty
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,app' },
        }
      : undefined,
  });
}

export type { Logger };
