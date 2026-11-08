import type { AdapterContext } from "./enrichment.js";
import type { AlertResult, CrmResult, HttpRequestSpec, NormalizedVisitor, ScoreResult } from "../types.js";

export type AlertInput = {
  leadId: string;
  visitor: NormalizedVisitor;
  score: ScoreResult;
  crm: CrmResult;
};

/** Documented shape only. This is not a credential. */
export const SLACK_WEBHOOK_PLACEHOLDER =
  "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX";

export type SlackPayload = {
  text: string;
  blocks: unknown[];
};

export function buildSlackPayload(input: AlertInput): SlackPayload {
  const scoreLine = `${input.score.total} / threshold ${input.score.threshold}`;
  return {
    text: `New MQL: ${input.visitor.fullName} at ${input.visitor.company} (score ${input.score.total})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `New MQL · score ${input.score.total}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Visitor*\n${input.visitor.fullName}` },
          { type: "mrkdwn", text: `*Company*\n${input.visitor.company}` },
          { type: "mrkdwn", text: `*Title*\n${input.visitor.title || "Unknown"}` },
          { type: "mrkdwn", text: `*Score*\n${scoreLine}` },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Pages*\n${input.visitor.pages.join(", ") || "None"}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View demo contact" },
            url: `https://crm.example/contacts/${input.crm.contactId}`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "Synthetic demo alert. The webhook stub did not post this to Slack." },
        ],
      },
    ],
  };
}

export function buildSlackRequest(webhookUrl: string, payload: SlackPayload): HttpRequestSpec {
  return {
    method: "POST",
    url: webhookUrl,
    headers: { "Content-Type": "application/json" },
    body: payload,
  };
}

export function skippedAlert(score: ScoreResult): AlertResult {
  return {
    adapter: "none",
    simulated: true,
    delivered: false,
    skipped: true,
    reason: `Score ${score.total} stays in nurture. Threshold is ${score.threshold}. No alert is sent.`,
    request: null,
  };
}

export function createMockAlert() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async notify(input: AlertInput, ctx: AdapterContext): Promise<AlertResult> {
      calls += 1;
      const payload = buildSlackPayload(input);
      ctx.log.info("alert.mock", {
        stage: "alert",
        message: "Slack card built in-process. Webhook stub was not called.",
      });
      return {
        adapter: "mock",
        simulated: true,
        delivered: true,
        skipped: false,
        reason: "MQL cleared the threshold. The card is simulated in this demo.",
        request: buildSlackRequest(SLACK_WEBHOOK_PLACEHOLDER, payload),
      };
    },
  };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Production Slack incoming-webhook stub.
 * Unused unless ADAPTERS=live and SLACK_WEBHOOK_URL is set. No URL ships with this repo.
 */
export async function postSlackWebhook(
  input: AlertInput,
  webhookUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<AlertResult> {
  if (!webhookUrl.trim()) throw new Error("SLACK_WEBHOOK_URL is not set");
  const payload = buildSlackPayload(input);
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Slack webhook failed (${response.status})`);
  return {
    adapter: "slack",
    simulated: false,
    delivered: true,
    skipped: false,
    reason: "Delivered to the configured Slack webhook.",
    request: buildSlackRequest(SLACK_WEBHOOK_PLACEHOLDER, payload),
  };
}
