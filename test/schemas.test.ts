import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { SEED_VISITORS, toWebhook } from "../src/data/visitors.js";
import { runPipeline } from "../src/pipeline.js";
import { createDeps } from "./helpers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function load(name: string) {
  return JSON.parse(readFileSync(join(root, "schemas", name), "utf8"));
}

describe("schemas", () => {
  it("validates the webhook, the lead, the score, and the vendor bodies", async () => {
    const webhook = load("rb2b-webhook.schema.json");
    const visitor = load("normalized-visitor.schema.json");
    const enrichment = load("enrichment.schema.json");
    const score = load("icp-score.schema.json");
    const hubspot = load("hubspot-contact-upsert.schema.json");
    const slack = load("slack-alert.schema.json");
    const lead = load("lead.schema.json");
    const jane = SEED_VISITORS.find((item) => item.key === "jane-demo");
    if (!jane) throw new Error("missing jane");
    const payload = toWebhook(jane);
    expect(ajv.validate(webhook, payload)).toBe(true);
    const result = await runPipeline(payload, createDeps());
    expect(ajv.validate(visitor, result.lead.visitor)).toBe(true);
    expect(ajv.validate(enrichment, result.lead.enrichment)).toBe(true);
    expect(ajv.validate(score, result.lead.score)).toBe(true);
    expect(ajv.validate(lead, result.lead)).toBe(true);
    expect(ajv.validate(hubspot, result.lead.crm?.requests[0]?.body)).toBe(true);
    expect(ajv.validate(slack, result.lead.alert.request?.body)).toBe(true);
  });
});
