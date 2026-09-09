export type Report = {
  id: string;
  name: string;
  industry: string;
  country: string;
  model: string;
  score: number;
  confidence: number;
  createdAt: string;
  summary: string;
  metrics: { key: string; label: string; value: number; note: string }[];
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  competitors: { name: string; strength: number; note: string }[];
  revenue: { name: string; value: number }[];
  risks: { title: string; level: "LOW" | "MED" | "HIGH"; note: string }[];
  recommendations: string[];
};

export const demoReport: Report = {
  id: "demo",
  name: "SolarLogistics",
  industry: "Clean Energy / Logistics",
  country: "India",
  model: "B2B / SaaS",
  score: 82,
  confidence: 94,
  createdAt: new Date().toISOString(),
  summary:
    "SolarLogistics shows strong market signal in the EMEA and South Asia mid-market. Competitive density is moderate but incumbent product coverage is thin in fleet-electrification workflows. Unit economics look favorable given current CPM benchmarks.",
  metrics: [
    { key: "demand", label: "Market Demand", value: 92, note: "Rising search intent, active procurement RFPs." },
    { key: "competition", label: "Competition", value: 45, note: "Fragmented incumbents, no dominant SaaS player." },
    { key: "pain", label: "Customer Pain", value: 88, note: "Fleet operators report >20% idle time." },
    { key: "profit", label: "Profit Potential", value: 78, note: "Gross margin proxy ~72% on SaaS benchmarks." },
    { key: "scalability", label: "Scalability", value: 85, note: "Cloud-native, low marginal cost per tenant." },
    { key: "investment", label: "Investment Fit", value: 74, note: "Aligned with active climate/logistics theses." },
    { key: "risk", label: "Risk Factor", value: 22, note: "Regulatory tailwind reduces downside." },
    { key: "gov", label: "Gov Support", value: 68, note: "Multiple EV & MSME schemes applicable." },
  ],
  swot: {
    strengths: [
      "Clear ICP: mid-market last-mile operators.",
      "Proprietary route-optimization dataset.",
      "Founder-market fit in logistics ops.",
    ],
    weaknesses: [
      "Long enterprise sales cycles.",
      "Hardware dependency for telemetry.",
      "Nascent brand vs. incumbents.",
    ],
    opportunities: [
      "EU CBAM & India FAME-II subsidies.",
      "Adjacent expansion into cold-chain.",
      "Data-licensing to insurers.",
    ],
    threats: [
      "Incumbents bundling free telematics.",
      "Battery supply-chain volatility.",
      "Policy reversals on EV incentives.",
    ],
  },
  competitors: [
    { name: "FleetOS", strength: 72, note: "Strong in NA, weak on EV workflows." },
    { name: "Routific", strength: 58, note: "SMB tier, limited enterprise." },
    { name: "Onfleet", strength: 66, note: "Mature product, high pricing." },
    { name: "Locus.sh", strength: 61, note: "APAC leader, thin EV telemetry." },
  ],
  revenue: [
    { name: "Q1", value: 12 },
    { name: "Q2", value: 24 },
    { name: "Q3", value: 42 },
    { name: "Q4", value: 71 },
    { name: "Q5", value: 108 },
    { name: "Q6", value: 156 },
  ],
  risks: [
    { title: "Regulatory reversal", level: "MED", note: "Change in EV subsidies could delay adoption." },
    { title: "Hardware supply", level: "MED", note: "Telematics module lead-times remain volatile." },
    { title: "Incumbent bundling", level: "HIGH", note: "TMS vendors may offer free EV modules." },
    { title: "Data privacy", level: "LOW", note: "GDPR/DPDP compliance achievable at build time." },
  ],
  recommendations: [
    "Anchor GTM on 3 lighthouse fleet accounts in EMEA before broad launch.",
    "Build hardware-agnostic ingestion to hedge telematics supply.",
    "Apply to FAME-II & Startup India for non-dilutive capital.",
    "Publish quarterly benchmarks to establish category authority.",
  ],
};

export const demoProjects: Array<Pick<Report, "id" | "name" | "industry" | "model" | "score" | "createdAt">> = [
  { id: "demo", name: "SolarLogistics", industry: "Clean Energy", model: "B2B / SaaS", score: 82, createdAt: "2024-11-08" },
  { id: "eco-01", name: "EcoLogistics AI", industry: "Logistics", model: "B2B / SaaS", score: 94, createdAt: "2024-11-05" },
  { id: "velo-01", name: "VeloVault", industry: "Urban Mobility", model: "Subscription", score: 67, createdAt: "2024-10-28" },
  { id: "quick-01", name: "QuickKnit", industry: "D2C Retail", model: "B2C", score: 41, createdAt: "2024-10-19" },
  { id: "mesa-01", name: "MesaMind", industry: "EdTech", model: "SaaS", score: 76, createdAt: "2024-10-11" },
];

export function scoreTier(n: number): { label: string; color: string } {
  if (n >= 80) return { label: "HIGH POTENTIAL", color: "text-primary" };
  if (n >= 60) return { label: "PROMISING", color: "text-chart-3" };
  if (n >= 40) return { label: "REVIEW", color: "text-chart-4" };
  return { label: "LOW SIGNAL", color: "text-destructive" };
}