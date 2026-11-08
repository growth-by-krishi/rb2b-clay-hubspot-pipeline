import { sha256 } from "./hash.js";
import type { NormalizedVisitor } from "./types.js";

export async function buildIdempotencyKey(visitor: NormalizedVisitor, header?: string | null): Promise<string> {
  const explicit = header?.trim();
  if (explicit) return `header:${explicit.slice(0, 200)}`;
  const material = [
    visitor.email.trim().toLowerCase(),
    visitor.domain.trim().toLowerCase(),
    (visitor.capturedUrl ?? "").trim().toLowerCase(),
    visitor.seenAt.trim(),
    [...visitor.pages].map((page) => page.trim().toLowerCase()).sort().join(","),
  ].join("|");
  const digest = await sha256(material);
  return `auto:${digest.slice(0, 32)}`;
}
