export type CompanyProfile = {
  domain: string;
  company: string;
  industry: string;
  employeeCount: number;
  employeeRange: string;
  revenueRange: string;
  city: string;
  state: "EX";
};

export const COMPANIES: CompanyProfile[] = [
  { domain: "northwind-retail.example", company: "Northwind Retail", industry: "Retail", employeeCount: 420, employeeRange: "201-500", revenueRange: "$50M-$100M", city: "Sample Harbor", state: "EX" },
  { domain: "pebble-analytics.example", company: "Pebble Analytics", industry: "SaaS", employeeCount: 180, employeeRange: "51-200", revenueRange: "$10M-$25M", city: "Demo Ridge", state: "EX" },
  { domain: "cedar-saas.example", company: "Cedar SaaS", industry: "Software", employeeCount: 60, employeeRange: "51-200", revenueRange: "$5M-$10M", city: "Mockdale", state: "EX" },
  { domain: "cedar-labs.example", company: "Cedar Labs", industry: "Software", employeeCount: 60, employeeRange: "51-200", revenueRange: "$5M-$10M", city: "Mockdale", state: "EX" },
  { domain: "hollow-ventures.example", company: "Hollow Ventures", industry: "Venture Capital", employeeCount: 40, employeeRange: "11-50", revenueRange: "$1M-$5M", city: "Placeholder Falls", state: "EX" },
  { domain: "flaky-systems.example", company: "Flaky Systems", industry: "Software", employeeCount: 400, employeeRange: "201-500", revenueRange: "$25M-$50M", city: "Testport", state: "EX" },
  { domain: "kite-fintech.example", company: "Kite Fintech", industry: "Fintech", employeeCount: 860, employeeRange: "501-1000", revenueRange: "$100M-$250M", city: "Example Springs", state: "EX" },
  { domain: "harbor-goods.example", company: "Harbor Goods", industry: "Ecommerce", employeeCount: 640, employeeRange: "501-1000", revenueRange: "$50M-$100M", city: "Sample Harbor", state: "EX" },
  { domain: "lumen-software.example", company: "Lumen Software", industry: "Software", employeeCount: 80, employeeRange: "51-200", revenueRange: "$10M-$25M", city: "Demo Ridge", state: "EX" },
  { domain: "copper-retail.example", company: "Copper Retail Group", industry: "Retail", employeeCount: 1500, employeeRange: "1001-5000", revenueRange: "$250M-$500M", city: "Fictional Grove", state: "EX" },
  { domain: "brightpath-saas.example", company: "Brightpath SaaS", industry: "SaaS", employeeCount: 300, employeeRange: "201-500", revenueRange: "$25M-$50M", city: "Northwind Bay", state: "EX" },
  { domain: "fieldnote-commerce.example", company: "Fieldnote Commerce", industry: "Ecommerce", employeeCount: 210, employeeRange: "201-500", revenueRange: "$25M-$50M", city: "Sample Harbor", state: "EX" },
  { domain: "northline-it.example", company: "Northline IT", industry: "Information Technology", employeeCount: 540, employeeRange: "501-1000", revenueRange: "$50M-$100M", city: "Testport", state: "EX" },
  { domain: "parcel-fintech.example", company: "Parcel Fintech", industry: "Financial Technology", employeeCount: 95, employeeRange: "51-200", revenueRange: "$10M-$25M", city: "Demo Ridge", state: "EX" },
  { domain: "kindred-market.example", company: "Kindred Market", industry: "Retail", employeeCount: 980, employeeRange: "501-1000", revenueRange: "$100M-$250M", city: "Example Springs", state: "EX" },
  { domain: "city-library.example", company: "City Library Cooperative", industry: "Libraries", employeeCount: 25, employeeRange: "11-50", revenueRange: "$1M-$5M", city: "Placeholder Falls", state: "EX" },
  { domain: "offline-outfitters.example", company: "Offline Outfitters", industry: "Apparel", employeeCount: 30, employeeRange: "11-50", revenueRange: "$1M-$5M", city: "Mockdale", state: "EX" },
  { domain: "campus-boards.example", company: "Campus Boards", industry: "Education", employeeCount: 12, employeeRange: "11-50", revenueRange: "$1M-$5M", city: "Fictional Grove", state: "EX" },
  { domain: "giant-mills.example", company: "Giant Mills Grocery", industry: "Grocery", employeeCount: 18000, employeeRange: "10001+", revenueRange: "$1B+", city: "Northwind Bay", state: "EX" },
  { domain: "tiny-widgets.example", company: "Tiny Widgets", industry: "Consumer Goods", employeeCount: 8, employeeRange: "1-10", revenueRange: "$1M-$5M", city: "Testport", state: "EX" },
];

export const companyByDomain: ReadonlyMap<string, CompanyProfile> = new Map(
  COMPANIES.map((company) => [company.domain, company]),
);
