import type { Logger } from "./logger.js";

export type RetryOptions = {
  retries: number;
  baseDelayMs: number;
  factor: number;
};

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
  log: Logger,
): Promise<{ value: T; attempts: number }> {
  let lastError: unknown;
  const tries = options.retries + 1;

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const started = Date.now();
    try {
      const value = await fn(attempt);
      if (attempt > 1) {
        log.info("retry.recovered", {
          stage: label,
          attempt,
          durationMs: Date.now() - started,
          provider: label,
          message: `${label} recovered on attempt ${attempt}`,
        });
      }
      return { value, attempts: attempt };
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : "Unknown provider error";
      log.warn("retry.failure", {
        stage: label,
        attempt,
        durationMs: Date.now() - started,
        provider: label,
        message: `${label} failed on attempt ${attempt}: ${message}`,
      });
      if (attempt < tries) {
        const delay = options.baseDelayMs * options.factor ** (attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
