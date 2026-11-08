import type { KvNamespace, LeadRecord, LeadSummary } from "./types.js";

const DEFAULT_MAX = 500;

export class LeadStore {
  private leads = new Map<string, LeadRecord>();
  private keys = new Map<string, string>();
  private order: string[] = [];
  private inflight = new Map<string, Promise<LeadRecord>>();
  private hydrated = false;

  constructor(
    private readonly kv?: KvNamespace,
    private readonly max = DEFAULT_MAX,
  ) {}

  async getById(id: string): Promise<LeadRecord | null> {
    const local = this.leads.get(id);
    if (local) return local;
    if (!this.kv) return null;
    const raw = await this.kv.get(`lead:${id}`);
    if (!raw) return null;
    const lead = JSON.parse(raw) as LeadRecord;
    this.remember(lead, false);
    return lead;
  }

  async getByKey(key: string): Promise<LeadRecord | null> {
    const memoryId = this.keys.get(key);
    if (memoryId) {
      const lead = this.leads.get(memoryId);
      if (lead) return lead;
    }
    if (!this.kv) return null;
    const id = await this.kv.get(`idem:${key}`);
    if (!id) return null;
    return this.getById(id);
  }

  async list(limit = 50): Promise<LeadSummary[]> {
    if (this.order.length === 0 && this.kv && !this.hydrated) await this.hydrate(limit);
    const summaries: LeadSummary[] = [];
    for (const id of this.order.slice(0, limit)) {
      const lead = this.leads.get(id);
      if (lead) summaries.push(summarize(lead));
    }
    return summaries;
  }

  async save(lead: LeadRecord): Promise<void> {
    this.remember(lead, true);
    if (!this.kv) return;
    await this.kv.put(`lead:${lead.id}`, JSON.stringify(lead));
    await this.kv.put(`idem:${lead.idempotencyKey}`, lead.id);
    await this.kv.put("recent", JSON.stringify(this.order.slice(0, this.max)));
  }

  /**
   * Collapse concurrent callers onto one in-flight promise.
   * The inflight slot is reserved synchronously after the duplicate read.
   */
  async runIdempotent(
    key: string,
    work: () => Promise<LeadRecord>,
  ): Promise<{ lead: LeadRecord; duplicate: boolean }> {
    const existing = await this.getByKey(key);
    if (existing) return { lead: existing, duplicate: true };

    const pending = this.inflight.get(key);
    if (pending) {
      const lead = await pending;
      return { lead, duplicate: true };
    }

    let resolve!: (lead: LeadRecord) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<LeadRecord>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.inflight.set(key, promise);

    try {
      const lead = await work();
      await this.save(lead);
      resolve(lead);
      return { lead, duplicate: false };
    } catch (error) {
      reject(error);
      throw error;
    } finally {
      this.inflight.delete(key);
    }
  }

  private remember(lead: LeadRecord, front: boolean): void {
    this.leads.set(lead.id, lead);
    this.keys.set(lead.idempotencyKey, lead.id);
    this.order = this.order.filter((id) => id !== lead.id);
    if (front) this.order.unshift(lead.id);
    else this.order.push(lead.id);
    while (this.order.length > this.max) {
      const stale = this.order.pop();
      if (!stale) break;
      const removed = this.leads.get(stale);
      this.leads.delete(stale);
      if (removed) this.keys.delete(removed.idempotencyKey);
    }
  }

  private async hydrate(limit: number): Promise<void> {
    this.hydrated = true;
    if (!this.kv) return;
    const raw = await this.kv.get("recent");
    if (!raw) return;
    const ids = JSON.parse(raw) as string[];
    for (const id of ids.slice(0, limit)) {
      if (!this.leads.has(id)) await this.getById(id);
    }
  }
}

export function summarize(lead: LeadRecord): LeadSummary {
  return {
    id: lead.id,
    createdAt: lead.createdAt,
    name: lead.visitor.fullName,
    email: lead.visitor.email,
    company: lead.visitor.company,
    domain: lead.visitor.domain,
    title: lead.visitor.title,
    score: lead.score.total,
    threshold: lead.score.threshold,
    disposition: lead.disposition,
    qualified: lead.qualified,
    durationMs: lead.durationMs,
  };
}
