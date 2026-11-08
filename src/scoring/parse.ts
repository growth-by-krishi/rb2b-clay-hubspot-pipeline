export function parseEmployeeCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value !== "string") return null;
  const text = value
    .trim()
    .toLowerCase()
    .replace(/employees?|people/g, "")
    .replace(/,/g, "")
    .trim();
  if (!text) return null;

  const plus = text.match(/^(\d+(?:\.\d+)?)(k)?\+$/);
  if (plus) return scale(plus[1], plus[2]);

  const range = text.match(/^(\d+(?:\.\d+)?)(k)?\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)(k)?$/);
  if (range) {
    const low = scale(range[1], range[2]);
    const high = scale(range[3], range[4]);
    return Math.round((low + high) / 2);
  }

  const single = text.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (single) return scale(single[1], single[2]);
  return null;
}

function scale(num: string, suffix: string | undefined): number {
  const value = Number(num);
  return Math.round(suffix ? value * 1000 : value);
}

export function normalizePath(input: string): string {
  let path = input.trim();
  if (!path) return "/";
  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      path = new URL(path).pathname;
    }
  } catch {
    // Keep the raw path when the URL cannot be parsed.
  }
  path = path.split("?")[0]?.split("#")[0] ?? path;
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path.toLowerCase();
}

export function normalizeDomain(value: string | null | undefined): string {
  if (!value) return "";
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.split("/")[0] ?? domain;
  domain = domain.replace(/^www\./, "").replace(/\.$/, "");
  return domain;
}

export function domainFromWebsiteOrEmail(website: string | null, email: string | null, explicit?: string | null): string {
  const direct = normalizeDomain(explicit);
  if (direct) return direct;
  const fromSite = normalizeDomain(website);
  if (fromSite) return fromSite;
  const host = email?.split("@")[1];
  return normalizeDomain(host ?? "");
}
