import type { LogLevel, LogRecord } from "./types.js";

export type Logger = {
  info: (event: string, fields?: Partial<LogRecord>) => void;
  warn: (event: string, fields?: Partial<LogRecord>) => void;
  error: (event: string, fields?: Partial<LogRecord>) => void;
  records: LogRecord[];
};

export function createLogger(sink?: (record: LogRecord) => void, now: () => Date = () => new Date()): Logger {
  const records: LogRecord[] = [];

  function write(level: LogLevel, event: string, fields: Partial<LogRecord> = {}): void {
    const record: LogRecord = {
      ts: now().toISOString(),
      level,
      event,
      message: fields.message ?? event,
      stage: fields.stage,
      attempt: fields.attempt,
      durationMs: fields.durationMs,
      idempotencyKey: fields.idempotencyKey,
      provider: fields.provider,
    };
    records.push(record);
    sink?.(record);
  }

  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    records,
  };
}

export function consoleSink(record: LogRecord): void {
  console.log(JSON.stringify(record));
}
