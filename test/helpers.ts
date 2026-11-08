import { createMockAlert } from "../src/adapters/slack.js";
import { createMockCrm } from "../src/adapters/crm.js";
import { createMockEnrichment } from "../src/adapters/enrichment.js";
import { createLogger } from "../src/logger.js";
import type { PipelineDeps } from "../src/pipeline.js";
import { LeadStore } from "../src/store.js";
import type { KvNamespace } from "../src/types.js";

export const silentRetry = { retries: 2, baseDelayMs: 0, factor: 2 };

export function createDeps(store = new LeadStore()): PipelineDeps & {
  alert: ReturnType<typeof createMockAlert>;
  crm: ReturnType<typeof createMockCrm>;
} {
  const alert = createMockAlert();
  const crm = createMockCrm();
  const enrich = createMockEnrichment();
  return {
    store,
    adapters: {
      enrich: (visitor, ctx) => enrich.enrich(visitor, ctx),
      crm: (input, ctx) => crm.upsert(input, ctx),
      alert: (input, ctx) => alert.notify(input, ctx),
    },
    alert,
    crm,
    paceMs: 0,
    retry: silentRetry,
    logger: createLogger(),
    requireSynthetic: true,
  };
}

export function createMemoryKv(): KvNamespace & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async put(key: string, value: string) {
      values.set(key, value);
    },
    async delete(key: string) {
      values.delete(key);
    },
  };
}
