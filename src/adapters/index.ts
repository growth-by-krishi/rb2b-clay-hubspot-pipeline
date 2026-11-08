import { withRetry } from "../retry.js";
import type { FetchLike } from "./crm.js";
import { createMockCrm, executeHubSpotUpsert } from "./crm.js";
import type { AdapterContext } from "./enrichment.js";
import { createMockEnrichment } from "./enrichment.js";
import { executeApollo, executeClearbit, executePdl } from "./live-enrichment.js";
import { createMockAlert, postSlackWebhook } from "./slack.js";
import type { AlertResult, CrmResult, EnrichmentResult, Env, NormalizedVisitor } from "../types.js";
import { EMPTY_PROFILE } from "../types.js";
import type { AlertInput } from "./slack.js";
import type { CrmInput } from "./crm.js";

export type Adapters = {
  enrich: (visitor: NormalizedVisitor, ctx: AdapterContext) => Promise<EnrichmentResult>;
  crm: (input: CrmInput, ctx: AdapterContext) => Promise<CrmResult>;
  alert: (input: AlertInput, ctx: AdapterContext) => Promise<AlertResult>;
};

export function createAdapters(env: Env = {}, fetchImpl: FetchLike = fetch): Adapters {
  const live = env.ADAPTERS === "live";
  const mockEnrich = createMockEnrichment();
  const mockCrm = createMockCrm();
  const mockAlert = createMockAlert();

  return {
    enrich: async (visitor, ctx) => {
      if (!live) return mockEnrich.enrich(visitor, ctx);
      return liveEnrich(visitor, env, fetchImpl, ctx);
    },
    crm: async (input, ctx) => {
      if (live && env.HUBSPOT_TOKEN) return executeHubSpotUpsert(input, env.HUBSPOT_TOKEN, fetchImpl);
      if (live && !env.HUBSPOT_TOKEN) {
        ctx.log.warn("crm.mock-fallback", { stage: "crm", message: "ADAPTERS=live but HUBSPOT_TOKEN is empty. Using the mock." });
      }
      return mockCrm.upsert(input, ctx);
    },
    alert: async (input, ctx) => {
      if (live && env.SLACK_WEBHOOK_URL) return postSlackWebhook(input, env.SLACK_WEBHOOK_URL, fetchImpl);
      if (live && !env.SLACK_WEBHOOK_URL) {
        ctx.log.warn("alert.mock-fallback", { stage: "alert", message: "ADAPTERS=live but SLACK_WEBHOOK_URL is empty. Using the mock card." });
      }
      return mockAlert.notify(input, ctx);
    },
  };
}

async function liveEnrich(visitor: NormalizedVisitor, env: Env, fetchImpl: FetchLike, ctx: AdapterContext): Promise<EnrichmentResult> {
  const profile = { ...EMPTY_PROFILE };
  const attempts: EnrichmentResult["attempts"] = [];
  const steps: Array<{ name: "clearbit" | "apollo" | "peopledata"; label: string; key?: string; run: () => Promise<Partial<typeof profile>> }> = [
    { name: "clearbit", label: "Clearbit", key: env.CLEARBIT_KEY, run: () => executeClearbit(visitor, env.CLEARBIT_KEY ?? "", fetchImpl) },
    { name: "apollo", label: "Apollo", key: env.APOLLO_API_KEY, run: () => executeApollo(visitor, env.APOLLO_API_KEY ?? "", fetchImpl) },
    { name: "peopledata", label: "People Data Labs", key: env.PDL_API_KEY, run: () => executePdl(visitor, env.PDL_API_KEY ?? "", fetchImpl) },
  ];

  let filledBy: EnrichmentResult["filledBy"] = null;
  for (const step of steps) {
    if (profile.industry && profile.employeeCount != null) break;
    if (!step.key) {
      attempts.push({ provider: step.name, label: step.label, ok: false, attempts: 0, durationMs: 0, error: "API key is not set", fields: {} });
      continue;
    }
    const started = Date.now();
    try {
      const result = await withRetry(step.name, () => step.run(), ctx.retry, ctx.log);
      const fields = result.value;
      Object.assign(profile, stripNulls(fields));
      if (!filledBy && Object.values(fields).some((value) => value != null)) filledBy = step.name;
      attempts.push({ provider: step.name, label: step.label, ok: true, attempts: result.attempts, durationMs: Date.now() - started, fields, raw: { live: true } });
    } catch (error) {
      attempts.push({
        provider: step.name,
        label: step.label,
        ok: false,
        attempts: ctx.retry.retries + 1,
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Lookup failed",
        fields: {},
      });
      ctx.log.warn("enrich.live-fallback", { stage: "enrich", provider: step.name, message: `${step.label} failed. Falling through.` });
    }
  }
  return { profile, attempts, filledBy };
}

function stripNulls(fields: Partial<typeof EMPTY_PROFILE>): Partial<typeof EMPTY_PROFILE> {
  const next: Partial<typeof EMPTY_PROFILE> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value != null) (next as Record<string, unknown>)[key] = value;
  }
  return next;
}
