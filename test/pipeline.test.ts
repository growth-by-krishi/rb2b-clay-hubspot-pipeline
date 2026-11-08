import { describe, expect, it } from "vitest";
import { SEED_VISITORS, toWebhook } from "../src/data/visitors.js";
import { runPipeline } from "../src/pipeline.js";
import { LeadStore } from "../src/store.js";
import { createDeps, createMemoryKv } from "./helpers.js";

const byKey = (key: string) => {
  const visitor = SEED_VISITORS.find((item) => item.key === key);
  if (!visitor) throw new Error(key);
  return visitor;
};

describe("pipeline", () => {
  it("routes a high-intent VP as an MQL and keeps the HubSpot-shaped body", async () => {
    const deps = createDeps();
    const result = await runPipeline(toWebhook(byKey("jane-demo")), deps);
    expect(result.duplicate).toBe(false);
    expect(result.lead.score.total).toBe(96);
    expect(result.lead.disposition).toBe("mql");
    expect(result.lead.alert.skipped).toBe(false);
    expect(result.lead.alert.request?.url).toContain("https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX");
    expect(result.lead.crm?.requests[0]?.url).toBe("https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert");
    const contact = result.lead.crm?.requests[0]?.body as { inputs: Array<{ properties: Record<string, string> }> };
    expect(contact.inputs[0]?.properties.lifecyclestage).toBe("marketingqualifiedlead");
    expect(contact.inputs[0]?.properties.industry).toBe("RETAIL");
    expect(deps.alert.calls).toBe(1);
    expect(deps.crm.calls).toBe(1);
    expect(result.lead.stages.map((stage) => stage.stage)).toEqual(["identify", "enrich", "score", "crm", "alert"]);
  });

  it("keeps a blog-only manager in nurture and skips the alert", async () => {
    const deps = createDeps();
    const result = await runPipeline(toWebhook(byKey("riley-cho")), deps);
    expect(result.lead.score.total).toBe(66);
    expect(result.lead.disposition).toBe("nurture");
    expect(result.lead.alert.skipped).toBe(true);
    expect(result.lead.alert.request).toBeNull();
    expect(deps.alert.calls).toBe(0);
    expect(result.lead.stages.find((stage) => stage.stage === "alert")?.status).toBe("skipped");
  });

  it("qualifies the near-threshold manager and nurtures the same title on a blog", async () => {
    const deps = createDeps();
    const morgan = await runPipeline(toWebhook(byKey("morgan-lee")), deps);
    expect(morgan.lead.score.total).toBe(71);
    expect(morgan.lead.qualified).toBe(true);
  });

  it("falls through the enrichment waterfall when early vendors miss", async () => {
    const deps = createDeps();
    const result = await runPipeline(toWebhook(byKey("chris-nguyen")), deps);
    expect(result.lead.enrichment.attempts.map((attempt) => [attempt.provider, attempt.ok])).toEqual([
      ["clearbit", false],
      ["apollo", false],
      ["peopledata", true],
    ]);
    expect(result.lead.enrichment.profile.industry).toBe("Venture Capital");
    expect(result.lead.score.total).toBe(23);
    expect(result.lead.disposition).toBe("nurture");
    expect(deps.alert.calls).toBe(0);
  });

  it("retries a flaky vendor once and still qualifies", async () => {
    const deps = createDeps();
    const result = await runPipeline(toWebhook(byKey("quinn-adler")), deps);
    expect(result.lead.enrichment.attempts).toHaveLength(1);
    expect(result.lead.enrichment.attempts[0]).toMatchObject({ provider: "clearbit", ok: true, attempts: 2 });
    expect(result.lead.score.total).toBe(79);
    expect(result.lead.disposition).toBe("mql");
    expect(deps.alert.calls).toBe(1);
  });

  it("still scores a visitor when every vendor is down", async () => {
    const deps = createDeps();
    const result = await runPipeline(toWebhook(byKey("pat-kim")), deps);
    expect(result.lead.enrichment.attempts.every((attempt) => attempt.ok === false)).toBe(true);
    expect(result.lead.enrichment.profile.industry).toBeNull();
    expect(result.lead.disposition).toBe("nurture");
    expect(result.lead.crm?.contactId).toMatch(/^demo_contact_/);
  });

  it("does not create a second lead or a second alert when the webhook is retried", async () => {
    const deps = createDeps();
    const payload = toWebhook(byKey("jane-demo"));
    const first = await runPipeline(payload, deps);
    const second = await runPipeline(payload, deps);
    expect(second.duplicate).toBe(true);
    expect(second.lead.id).toBe(first.lead.id);
    expect(deps.alert.calls).toBe(1);
    expect(deps.crm.calls).toBe(1);
    expect(await deps.store.list()).toHaveLength(1);
  });

  it("collapses concurrent deliveries of the same webhook", async () => {
    const deps = createDeps();
    let started = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = deps.adapters.enrich;
    deps.adapters.enrich = async (visitor, ctx) => {
      started += 1;
      await gate;
      return original(visitor, ctx);
    };
    const payload = toWebhook(byKey("lena-ortiz"));
    const pending = Promise.all([runPipeline(payload, deps), runPipeline(payload, deps)]);
    for (let i = 0; i < 40 && started < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toBe(1);
    release();
    const [first, second] = await pending;
    expect([first.duplicate, second.duplicate].filter(Boolean)).toHaveLength(1);
    expect(first.lead.id).toBe(second.lead.id);
    expect(deps.alert.calls).toBe(1);
  });

  it("honors an explicit idempotency key", async () => {
    const deps = createDeps();
    const first = await runPipeline(toWebhook(byKey("maya-chen")), { ...deps, idempotencyHeader: "demo-key-1" });
    const changed = { ...toWebhook(byKey("maya-chen")), "Seen At": "2026-05-01T00:00:00.000Z" };
    const second = await runPipeline(changed, { ...deps, idempotencyHeader: "demo-key-1" });
    expect(second.duplicate).toBe(true);
    expect(second.lead.id).toBe(first.lead.id);
  });

  it("rehydrates a lead from KV in a fresh store", async () => {
    const kv = createMemoryKv();
    const firstStore = new LeadStore(kv);
    const deps = createDeps(firstStore);
    const created = await runPipeline(toWebhook(byKey("samir-adeyemi")), deps);
    const revived = new LeadStore(kv);
    const again = await runPipeline(toWebhook(byKey("samir-adeyemi")), createDeps(revived));
    expect(again.duplicate).toBe(true);
    expect(again.lead.id).toBe(created.lead.id);
    expect((await revived.list()).map((lead) => lead.id)).toContain(created.lead.id);
  });

  it("forgets idempotency only after the retention cap", async () => {
    const store = new LeadStore(undefined, 1);
    const deps = createDeps(store);
    const first = await runPipeline(toWebhook(byKey("nina-kapoor")), deps);
    await runPipeline(toWebhook(byKey("jonah-ellis")), deps);
    const replay = await runPipeline(toWebhook(byKey("nina-kapoor")), deps);
    expect(replay.duplicate).toBe(false);
    expect(replay.lead.id).not.toBe(first.lead.id);
    expect(await store.list()).toHaveLength(1);
  });
});
