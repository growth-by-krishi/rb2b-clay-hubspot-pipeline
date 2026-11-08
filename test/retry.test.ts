import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logger.js";
import { withRetry } from "../src/retry.js";

describe("retries", () => {
  it("backs off and then returns the successful attempt", async () => {
    const log = createLogger();
    let tries = 0;
    const result = await withRetry(
      "clearbit",
      async (attempt) => {
        tries += 1;
        if (attempt < 3) throw new Error("Synthetic timeout");
        return "ok";
      },
      { retries: 2, baseDelayMs: 0, factor: 2 },
      log,
    );
    expect(result).toEqual({ value: "ok", attempts: 3 });
    expect(tries).toBe(3);
    expect(log.records.filter((record) => record.event === "retry.failure")).toHaveLength(2);
    expect(log.records.some((record) => record.event === "retry.recovered")).toBe(true);
  });

  it("throws after the final attempt", async () => {
    const log = createLogger();
    await expect(
      withRetry("apollo", async () => { throw new Error("Synthetic provider outage"); }, { retries: 2, baseDelayMs: 0, factor: 2 }, log),
    ).rejects.toThrow(/outage/);
    expect(log.records.filter((record) => record.level === "warn")).toHaveLength(3);
  });
});
