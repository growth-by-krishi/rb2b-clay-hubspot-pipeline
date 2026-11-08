import { companyByDomain } from "./companies.js";

export type SeedVisitor = {
  key: string;
  sample: boolean;
  story: string;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  company: string;
  domain: string;
  includeFirmographics: boolean;
  pages: string[];
  seenAt: string;
  referrer: string;
};

const site = "https://acme-loyalty.example";

export const SEED_VISITORS: SeedVisitor[] = [
  person("jane-demo", true, "Opened pricing and a demo path", "Jane", "Demo", "VP of Growth", "northwind-retail.example", true, ["/pricing", "/demo", "/customers"], "2026-04-15T15:01:00.000Z"),
  person("priya-shah", true, "CMO. The first enrichment source omits headcount", "Priya", "Shah", "Chief Marketing Officer", "pebble-analytics.example", false, ["/demo", "/pricing"], "2026-04-15T15:02:00.000Z"),
  person("morgan-lee", true, "Manager who viewed the product page and a blog post", "Morgan", "Lee", "Marketing Manager", "cedar-saas.example", true, ["/blog", "/product"], "2026-04-15T15:03:00.000Z"),
  person("riley-cho", true, "Same seniority, blog only", "Riley", "Cho", "Marketing Manager", "cedar-labs.example", true, ["/blog"], "2026-04-15T15:04:00.000Z"),
  person("chris-nguyen", true, "Intern. Early vendors miss and the last one fills the profile", "Chris", "Nguyen", "Marketing Intern", "hollow-ventures.example", false, ["/blog", "/careers"], "2026-04-15T15:05:00.000Z"),
  person("quinn-adler", true, "Director on pricing. The first vendor times out once", "Quinn", "Adler", "Director of Partnerships", "flaky-systems.example", true, ["/pricing"], "2026-04-15T15:06:00.000Z"),
  person("andre-silva", false, "Head of demand across pricing, integrations, and customers", "Andre", "Silva", "Head of Demand Generation", "kite-fintech.example", true, ["/pricing", "/integrations", "/case-studies"], "2026-04-15T15:07:00.000Z"),
  person("lena-ortiz", false, "Ecommerce director on pricing and product", "Lena", "Ortiz", "Director of Ecommerce", "harbor-goods.example", true, ["/pricing", "/product"], "2026-04-15T15:08:00.000Z"),
  person("samir-adeyemi", false, "Founder who opened demo and signup", "Samir", "Adeyemi", "Founder", "lumen-software.example", true, ["/demo", "/signup"], "2026-04-15T15:09:00.000Z"),
  person("nina-kapoor", false, "VP Sales on the contact page", "Nina", "Kapoor", "VP Sales", "copper-retail.example", true, ["/contact", "/customers"], "2026-04-15T15:10:00.000Z"),
  person("jonah-ellis", false, "CRO with a demo request and pricing", "Jonah", "Ellis", "Chief Revenue Officer", "brightpath-saas.example", true, ["/book-demo", "/pricing"], "2026-04-15T15:11:00.000Z"),
  person("maya-chen", false, "Growth director who landed on pricing", "Maya", "Chen", "Director of Growth", "fieldnote-commerce.example", true, ["/pricing"], "2026-04-15T15:12:00.000Z"),
  person("owen-blake", false, "Head of marketing, light page trail", "Owen", "Blake", "Head of Marketing", "northline-it.example", true, ["/demo", "/platform"], "2026-04-15T15:13:00.000Z"),
  person("ruth-keller", false, "CMO on get-started and pricing", "Ruth", "Keller", "CMO", "parcel-fintech.example", true, ["/get-started", "/pricing"], "2026-04-15T15:14:00.000Z"),
  person("theo-march", false, "Specialist who only opened the about page", "Theo", "March", "Ecommerce Specialist", "kindred-market.example", true, ["/about"], "2026-04-15T15:15:00.000Z"),
  person("elena-voss", false, "Office manager at a library cooperative", "Elena", "Voss", "Office Manager", "city-library.example", true, ["/about"], "2026-04-15T15:16:00.000Z"),
  person("pat-kim", false, "Every enrichment vendor is down", "Pat", "Kim", "Content Specialist", "offline-outfitters.example", false, ["/blog"], "2026-04-15T15:17:00.000Z"),
  person("jamie-okonkwo", false, "Student on the careers page", "Jamie", "Okonkwo", "Student Ambassador", "campus-boards.example", true, ["/careers"], "2026-04-15T15:18:00.000Z"),
  person("robin-shah", false, "Coordinator at an enterprise grocer", "Robin", "Shah", "HR Coordinator", "giant-mills.example", true, ["/about", "/blog"], "2026-04-15T15:19:00.000Z"),
  person("alex-moreau", false, "Manager at a tiny consumer-goods shop", "Alex", "Moreau", "Marketing Manager", "tiny-widgets.example", true, ["/product"], "2026-04-15T15:20:00.000Z"),
];

function person(
  key: string,
  sample: boolean,
  story: string,
  firstName: string,
  lastName: string,
  title: string,
  domain: string,
  includeFirmographics: boolean,
  pages: string[],
  seenAt: string,
): SeedVisitor {
  const profile = companyByDomain.get(domain);
  if (!profile) throw new Error(`Missing company profile for ${domain}`);
  return {
    key,
    sample,
    story,
    firstName,
    lastName,
    email: `${firstName}.${lastName}`.toLowerCase().replace(/\s+/g, "") + "@example.com",
    title,
    company: profile.company,
    domain,
    includeFirmographics,
    pages,
    seenAt,
    referrer: `${site}/campaigns/spring-demo`,
  };
}

export function sampleVisitors(): SeedVisitor[] {
  return SEED_VISITORS.filter((visitor) => visitor.sample);
}

export function toWebhook(visitor: SeedVisitor): Record<string, unknown> {
  const profile = companyByDomain.get(visitor.domain);
  const payload: Record<string, unknown> = {
    "LinkedIn URL": `https://www.linkedin.com/in/example-${slug(visitor.firstName)}-${slug(visitor.lastName)}`,
    "First Name": visitor.firstName,
    "Last Name": visitor.lastName,
    Title: visitor.title,
    "Company Name": visitor.company,
    "Business Email": visitor.email,
    Website: `https://${visitor.domain}`,
    City: profile?.city ?? "Sample Harbor",
    State: "EX",
    "Seen At": visitor.seenAt,
    Referrer: visitor.referrer,
    "Captured URL": `${site}${visitor.pages[0] ?? "/"}`,
    pages: visitor.pages,
    Tags: "synthetic-demo",
  };
  if (visitor.includeFirmographics && profile) {
    payload.Industry = profile.industry;
    payload["Employee Count"] = profile.employeeRange;
  }
  return payload;
}

export function toDemoBody(visitor: SeedVisitor): Record<string, unknown> {
  const profile = companyByDomain.get(visitor.domain);
  return {
    firstName: visitor.firstName,
    lastName: visitor.lastName,
    email: visitor.email,
    company: visitor.company,
    domain: visitor.domain,
    title: visitor.title,
    pages: visitor.pages,
    seenAt: visitor.seenAt,
    industry: visitor.includeFirmographics ? profile?.industry : undefined,
    employeeCount: visitor.includeFirmographics ? profile?.employeeCount : undefined,
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
