import { createAdapters, type Adapters } from "./adapters/index.js";
import { assertSyntheticVisitor, normalizeVisitor, SyntheticDataError } from "./adapters/visitor.js";
import type { CrmInput } from "./adapters/crm.js";
import type { AdapterContext } from "./adapters/enrichment.js";
import { skippedAlert } from "./adapters/slack.js";
import { createId } from "./hash.js";
import { buildIdempotencyKey } from "./idempotency.js";
import { createLogger, type Logger } from "./logger.js";
import { sleep, type RetryOptions } from "./retry.js";
import { resolveConfig, type IcpConfig } from "./scoring/config.js";
import { scoreIcp } from "./scoring/icp.js";
import { LeadStore } from "./store.js";
import type { Env, LeadRecord, PipelineEvent, StageName, StageTrace } from "./types.js";

export type PipelineDeps = {
  store: LeadStore;
  adapters: Adapters;
  config?: Partial<IcpConfig>;
  paceMs?: number;
  retry?: RetryOptions;
  logger?: Logger;
  now?: () => Date;
  idempotencyHeader?: string | null;
  onEvent?: (event: PipelineEvent) => void;
  requireSynthetic?: boolean;
};

const DEFAULT_RETRY: RetryOptions = { retries: 2, baseDelayMs: 40, factor: 2 };

export async function runPipeline(raw: unknown, deps: PipelineDeps): Promise<{ duplicate: boolean; lead: LeadRecord }> {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? createLogger();
  const requireSynthetic = deps.requireSynthetic !== false;
  const visitor = normalizeVisitor(raw, now());
  if (requireSynthetic) assertSyntheticVisitor(visitor);
  const idempotencyKey = await buildIdempotencyKey(visitor, deps.idempotencyHeader);

  return deps.store.runIdempotent(idempotencyKey, async () => {
    const config = resolveConfig(deps.config);
    const paceMs = deps.paceMs ?? 0;
    const ctx: AdapterContext = { log: logger, paceMs, retry: deps.retry ?? DEFAULT_RETRY };
    const startedAll = Date.now();
    const id = createId("lead");
    const createdAt = now().toISOString();
    const stages: StageTrace[] = [];

    const identified = await stage(deps, logger, "identify", { webhook: raw }, visitor, async () => visitor);

    const enrichment = await stage(
      deps,
      logger,
      "enrich",
      { email: visitor.email, domain: visitor.domain, company: visitor.company },
      null,
      () => deps.adapters.enrich(visitor, ctx),
    );

    const scoreInput = {
      industry: enrichment.profile.industry ?? visitor.industry,
      title: visitor.title,
      employeeCount: enrichment.profile.employeeCount ?? visitor.employeeCount,
      pages: visitor.pages,
    };
    const score = await stage(deps, logger, "score", scoreInput, null, async () => scoreIcp(scoreInput, config));

    const crmInput: CrmInput = { leadId: id, visitor, score, enrichment };
    const crm = await stage(
      deps,
      logger,
      "crm",
      { email: visitor.email, company: visitor.company, disposition: score.disposition, score: score.total },
      null,
      () => deps.adapters.crm(crmInput, ctx),
    );

    const alert = await stage(
      deps,
      logger,
      "alert",
      { email: visitor.email, disposition: score.disposition, score: score.total },
      null,
      async () => {
        if (!score.qualified) return skippedAlert(score);
        return deps.adapters.alert({ leadId: id, visitor, score, crm }, ctx);
      },
    );

    const lead: LeadRecord = {
      id,
      idempotencyKey,
      synthetic: true,
      createdAt,
      visitor: identified,
      enrichment,
      score,
      crm,
      alert,
      stages,
      logs: logger.records.slice(-50),
      qualified: score.qualified,
      disposition: score.disposition,
      durationMs: Date.now() - startedAll,
    };
    logger.info("pipeline.complete", {
      message: `${visitor.fullName} scored ${score.total} and routed to ${score.disposition}`,
      idempotencyKey,
      durationMs: lead.durationMs,
    });
    lead.logs = logger.records.slice(-50);
    deps.onEvent?.({ type: "lead", duplicate: false, lead });
    return lead;

    async function stage<T>(
      pipeline: PipelineDeps,
      log: Logger,
      name: StageName,
      input: unknown,
      preset: T | null,
      work: () => Promise<T>,
    ): Promise<T> {
      if ((pipeline.paceMs ?? 0) > 0) await sleep(Math.min(pipeline.paceMs ?? 0, 280));
      const startedAt = now().toISOString();
      const started = Date.now();
      pipeline.onEvent?.({ type: "stage", phase: "start", stage: name, at: startedAt });
      log.info("stage.start", { stage: name, message: `${name} started`, idempotencyKey });
      try {
        const output = preset ?? (await work());
        const trace: StageTrace = {
          stage: name,
          status: name === "alert" && isSkipped(output) ? "skipped" : "ok",
          startedAt,
          durationMs: Date.now() - started,
          input,
          output,
        };
        stages.push(trace);
        log.info("stage.done", { stage: name, message: `${name} finished`, durationMs: trace.durationMs, idempotencyKey });
        pipeline.onEvent?.({
          type: "stage",
          phase: "done",
          stage: name,
          status: trace.status,
          at: now().toISOString(),
          durationMs: trace.durationMs,
          input,
          output,
        });
        return output;
      } catch (error) {
        const trace: StageTrace = {
          stage: name,
          status: "error",
          startedAt,
          durationMs: Date.now() - started,
          input,
          output: { error: error instanceof Error ? error.message : "Stage failed" },
        };
        stages.push(trace);
        pipeline.onEvent?.({
          type: "stage",
          phase: "done",
          stage: name,
          status: "error",
          at: now().toISOString(),
          durationMs: trace.durationMs,
          input,
          output: trace.output,
        });
        throw error;
      }
    }
  }).then((result) => {
    if (result.duplicate) {
      logger.info("idempotency.hit", {
        message: "Duplicate webhook ignored. No second CRM write and no second alert.",
        idempotencyKey,
      });
      deps.onEvent?.({ type: "duplicate", lead: result.lead });
    }
    return result;
  });
}

function isSkipped(output: unknown): boolean {
  return Boolean(output && typeof output === "object" && "skipped" in output && (output as { skipped?: boolean }).skipped);
}

export function pipelineDepsFromEnv(env: Env, store: LeadStore, extras: Partial<PipelineDeps> = {}): PipelineDeps {
  const threshold = Number(env.ICP_THRESHOLD);
  const pace = Number(env.DEMO_PACE_MS);
  return {
    store,
    adapters: createAdapters(env),
    config: Number.isFinite(threshold) ? { threshold } : undefined,
    paceMs: Number.isFinite(pace) ? pace : 220,
    retry: DEFAULT_RETRY,
    requireSynthetic: true,
    ...extras,
  };
}

export { SyntheticDataError };
