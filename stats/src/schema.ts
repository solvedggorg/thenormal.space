export type Range = "24h" | "7d" | "30d";

export const RANGES = ["24h", "7d", "30d"] as const;
export const COUNTED_HOSTS = ["thenormal.space", "shop.thenormal.space"] as const;

export function parseRange(raw: string | null | undefined): Range {
  if (raw === "24h" || raw === "7d" || raw === "30d") return raw;
  return "7d";
}

export const STATE_CODES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

export type Snapshot = {
  range: Range;
  generatedAt: string;
  visitors: number;
  pageviews: number;
  series: { t: string; visitors: number; pageviews: number }[];
  pages: { host: string; path: string; views: number }[];
  referrers: { host: string; views: number }[];
  devices: { class: "phone" | "computer" | "other"; views: number }[];
  states: { code: string; views: number }[];
  blocked: { outsideUs: number; vpnTor: number; bots: number };
};
