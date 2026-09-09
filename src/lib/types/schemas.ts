// =====================================================================
// Zod schemas for VentureIQ domain objects.
//
// These serve two purposes:
//   1. Runtime validation of ANY output that originates from an LLM
//      call (idea structuring, hypothesis generation, evidence
//      summarization) before it is trusted or persisted.
//   2. Runtime validation of API/server-function inputs coming from
//      the browser.
//
// Rule: an LLM response is never written to the database or returned
// to the client until it has passed the corresponding schema here.
// See src/backend/ai/client.ts (generateStructured) for enforcement.
// =====================================================================

import { z } from "zod";

// ---------------------------------------------------------------------
// Business Idea
// ---------------------------------------------------------------------

export const RawBusinessIdeaInputSchema = z.object({
  businessName: z.string().min(2).max(200),
  description: z.string().min(20).max(4000),
  industry: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  targetCustomer: z.string().max(2000).optional(),
  problem: z.string().max(2000).optional(),
  solution: z.string().max(2000).optional(),
  businessModel: z.string().max(200).optional(),
  expectedPricing: z.string().max(500).optional(),
  estimatedInvestment: z.string().max(200).optional(),
  revenueModel: z.string().max(500).optional(),
});

export const StructuredBusinessIdeaSchema = z.object({
  industry: z.string().min(1).max(200),
  location: z.object({
    country: z.string().min(1).max(100),
    state: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
  }),
  customerSegment: z.string().min(1).max(1000),
  problem: z.string().min(1).max(2000),
  solution: z.string().min(1).max(2000),
  businessModel: z.string().min(1).max(500),
  pricingAssumption: z.string().min(1).max(500),
  investmentAssumption: z.string().min(1).max(500),
  revenueModel: z.string().min(1).max(500),
  // Bounded so the LLM can't return an unbounded wall of "assumptions".
  keyAssumptions: z.array(z.string().min(1).max(500)).min(1).max(12),
});

// ---------------------------------------------------------------------
// Hypothesis (Phase 5)
// ---------------------------------------------------------------------

export const HypothesisCategorySchema = z.enum([
  "customer_problem",
  "market_demand",
  "willingness_to_pay",
  "competition",
  "revenue",
  "profitability",
  "scalability",
  "operations",
  "regulation",
  "supply",
  "technology",
  "go_to_market",
]);

export const ImportanceSchema = z.enum(["low", "medium", "high", "critical"]);

export const HypothesisStatusSchema = z.enum([
  "untested",
  "partially_validated",
  "validated",
  "contradicted",
  "inconclusive",
]);

export const ThresholdTypeSchema = z.enum(["ai_proposed", "user_defined"]);

/**
 * Schema for a single hypothesis as returned by the LLM. Deliberately
 * omits `status` and `confidence` — the LLM does not get to set these.
 * The service layer always sets status = "untested" and confidence = 0
 * for newly generated hypotheses. `threshold` is optional (not every
 * hypothesis needs a numeric bar) but when present must be paired with
 * thresholdType so the UI can label AI-proposed thresholds honestly.
 */
export const GeneratedHypothesisSchema = z
  .object({
    statement: z.string().min(10).max(500),
    category: HypothesisCategorySchema,
    importance: ImportanceSchema,
    validationCriteria: z.string().min(10).max(500),
    threshold: z.string().max(200).nullable().optional(),
    thresholdType: ThresholdTypeSchema.nullable().optional(),
    /** Index into the assumptions array this hypothesis was derived from, for traceability. Omit if not derived from a specific assumption. */
    assumptionIndex: z.number().int().min(0).nullable().optional(),
  })
  .refine((h) => (h.threshold ? h.thresholdType != null : true), {
    message: "thresholdType is required whenever a threshold is provided.",
    path: ["thresholdType"],
  });

export const GeneratedHypothesesSchema = z.object({
  hypotheses: z.array(GeneratedHypothesisSchema).min(1).max(10),
});

// ---------------------------------------------------------------------
// Business Assumption (Phase 3, Step 3)
// ---------------------------------------------------------------------

export const AssumptionSourceSchema = z.enum(["user_provided", "ai_inferred"]);

export const GeneratedAssumptionSchema = z.object({
  statement: z.string().min(10).max(500),
  category: z.string().min(2).max(100),
  importance: ImportanceSchema,
  // The extractor only ever produces inferred assumptions; user-provided
  // ones (if any) come from explicit form input, not this schema.
  source: z.literal("ai_inferred"),
});

export const GeneratedAssumptionsSchema = z.object({
  assumptions: z.array(GeneratedAssumptionSchema).min(1).max(8),
});

// ---------------------------------------------------------------------
// Evidence Requirement (Phase 6)
// ---------------------------------------------------------------------

export const MinimumEvidenceLevelSchema = z.enum(["low", "medium", "high", "critical"]);

export const GeneratedEvidenceRequirementSchema = z.object({
  evidenceType: z.string().min(2).max(100),
  description: z.string().min(10).max(500),
  importance: ImportanceSchema,
  minimumEvidenceLevel: MinimumEvidenceLevelSchema,
  preferredSources: z.array(z.string().min(1).max(100)).max(10),
});

export const GeneratedEvidenceRequirementsSchema = z.object({
  hypothesisId: z.string().uuid(),
  requirements: z.array(GeneratedEvidenceRequirementSchema).min(1).max(8),
});

// ---------------------------------------------------------------------
// Evidence (Phase 7)
// ---------------------------------------------------------------------

export const SourceTypeSchema = z.enum([
  "customer_feedback",
  "survey",
  "interview",
  "competitor",
  "market_data",
  "pricing",
  "financial",
  "regulatory",
  "government",
  "experiment",
  "other",
]);

export const SupportDirectionSchema = z.enum(["supports", "contradicts", "neutral"]);

export const DataStatusSchema = z.enum(["real", "user_provided", "demo", "mock", "unavailable"]);

export const EvidenceReviewStatusSchema = z.enum([
  "pending_review",
  "accepted",
  "rejected",
  "flagged",
  "source_unavailable",
  "extraction_failed",
]);

export const SourceCategorySchema = z.enum([
  "government",
  "academic",
  "company_filing",
  "established_news",
  "industry_organization",
  "company_website",
  "professional_publication",
  "general_website",
  "unknown",
]);

export const EvidenceProvenanceSchema = z.object({
  providerId: z.string().min(1).max(100),
  providerVersion: z.string().max(50).optional(),
  query: z.string().max(500).optional(),
  rawRef: z.string().max(500).optional(),
  collectedBy: z.enum(["system", "user"]).optional(),
});

const score0to100 = z.number().min(0).max(100);

export const EvidenceItemSchema = z.object({
  hypothesisId: z.string().uuid(),
  evidenceRequirementId: z.string().uuid().nullable().optional(),

  source: z.string().min(1).max(300),
  sourceType: SourceTypeSchema,
  sourceUrl: z.string().url().nullable().optional(),
  sourceTitle: z.string().max(300).nullable().optional(),
  publicationDate: z.string().nullable().optional(),

  summary: z.string().min(10).max(1000),
  notes: z.string().max(2000).nullable().optional(),
  supportDirection: SupportDirectionSchema,

  reliabilityScore: score0to100,
  relevanceScore: score0to100,
  recencyScore: score0to100,
  independenceScore: score0to100,
  confidenceScore: score0to100,
  classificationReason: z.string().max(1000).nullable().optional(),

  provenance: EvidenceProvenanceSchema,
  dataStatus: DataStatusSchema,
  sourceFingerprint: z.string().max(300).nullable().optional(),
  reviewStatus: EvidenceReviewStatusSchema.optional(),
  researchSourceId: z.string().uuid().nullable().optional(),
});

/**
 * User-submitted evidence form input (Phase 4, Step 2). The founder
 * chooses the support direction themselves — this is NOT run through
 * the LLM classifier; their label is authoritative and stored as-is.
 * Deterministic quality scores are still computed by application code
 * (see evidence-quality.ts), never invented by the founder or an LLM.
 */
export const UserEvidenceInputSchema = z.object({
  hypothesisId: z.string().uuid(),
  evidenceRequirementId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(300),
  description: z.string().min(10).max(1000),
  source: z.string().min(1).max(300),
  sourceUrl: z.string().url().nullable().optional(),
  evidenceType: SourceTypeSchema,
  publicationDate: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  supportDirection: SupportDirectionSchema,
});

/**
 * Output of evidenceClassifier (Phase 4, Step 5). The model determines
 * classification + reason + confidence; it NEVER outputs the
 * deterministic quality scores (reliability/relevance/recency/
 * independence) — those come from evidence-quality.ts.
 */
export const EvidenceClassificationSchema = z.object({
  classification: SupportDirectionSchema,
  reason: z.string().min(10).max(500),
  confidence: score0to100,
});

// ---------------------------------------------------------------------
// Evidence Conflict Detection (Phase 10)
// ---------------------------------------------------------------------

export const ConflictTypeSchema = z.enum([
  "direct_contradiction",
  "source_disagreement",
  "temporal_shift",
  "magnitude_mismatch",
]);

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const ConflictStatusSchema = z.enum(["open", "reviewed", "resolved"]);

export const DetectedConflictSchema = z.object({
  hypothesisId: z.string().uuid(),
  conflictType: ConflictTypeSchema,
  severity: SeveritySchema,
  description: z.string().min(10).max(1000),
  supportingEvidenceIds: z.array(z.string().uuid()).min(1),
  contradictingEvidenceIds: z.array(z.string().uuid()).min(1),
});

// ---------------------------------------------------------------------
// Evidence Gap Detection (Phase 11)
// ---------------------------------------------------------------------

export const GapTypeSchema = z.enum([
  "no_evidence",
  "insufficient_evidence",
  "low_quality_evidence",
  "contradictory_evidence",
]);

export const DetectedGapSchema = z.object({
  hypothesisId: z.string().uuid(),
  evidenceRequirementId: z.string().uuid().nullable().optional(),
  gapType: GapTypeSchema,
  severity: SeveritySchema,
  missingRequirement: z.string().min(5).max(500),
  importance: ImportanceSchema,
  businessImpact: z.string().min(5).max(1000),
  recommendedValidation: z.string().min(5).max(1000),
});

// ---------------------------------------------------------------------
// Confidence Engine (Phase 12)
// Note: this schema validates the STORED result of a deterministic
// calculation (see confidence-engine.ts), not an LLM response — there
// is deliberately no "LLM sets final_confidence" path anywhere.
// ---------------------------------------------------------------------

export const ConfidenceWeightsSchema = z.object({
  evidenceQuality: z.number().min(0).max(1),
  sourceReliability: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  recency: z.number().min(0).max(1),
  independence: z.number().min(0).max(1),
  coverage: z.number().min(0).max(1),
  contradictionPenalty: z.number().min(0).max(1),
});

export const ConfidenceScoreSchema = z.object({
  hypothesisId: z.string().uuid(),
  finalConfidence: score0to100,
  evidenceQualityComponent: score0to100,
  sourceReliabilityComponent: score0to100,
  relevanceComponent: score0to100,
  recencyComponent: score0to100,
  independenceComponent: score0to100,
  supportingEvidenceCount: z.number().int().min(0),
  contradictingEvidenceCount: z.number().int().min(0),
  evidenceCoveragePct: score0to100,
  formulaVersion: z.string().min(1),
  weights: ConfidenceWeightsSchema,
  explanation: z.string().min(1),
});

// ---------------------------------------------------------------------
// Opportunity Score (Phase 13)
// ---------------------------------------------------------------------

export const OpportunityDimensionKeySchema = z.enum([
  "market_demand",
  "customer_pain",
  "competition",
  "revenue_potential",
  "profitability",
  "scalability",
  "investment_feasibility",
  "operational_complexity",
  "market_timing",
  "regulatory_risk",
  "government_support",
]);

export const OpportunityDimensionScoreSchema = z.object({
  score: score0to100,
  confidence: score0to100,
  reasoning: z.string().min(1).max(1000),
  supportingEvidenceIds: z.array(z.string().uuid()),
  contradictingEvidenceIds: z.array(z.string().uuid()),
  recommendation: z.string().min(1).max(500),
});

export const OpportunityDimensionsSchema = z.record(
  OpportunityDimensionKeySchema,
  OpportunityDimensionScoreSchema,
);

export const OpportunityScoreSchema = z.object({
  businessIdeaId: z.string().uuid(),
  overallScore: score0to100,
  overallConfidence: score0to100,
  dimensions: OpportunityDimensionsSchema,
  formulaVersion: z.string().min(1),
  weights: z.record(OpportunityDimensionKeySchema, z.number().min(0).max(1)),
});

// ---------------------------------------------------------------------
// Adaptive Validation Engine (Phase 14)
// ---------------------------------------------------------------------

export const ValidationPrioritySchema = z.enum(["critical", "high", "medium", "low"]);

export const ValidationActionCandidateSchema = z.object({
  businessIdeaId: z.string().uuid(),
  hypothesisId: z.string().uuid().nullable().optional(),
  targetGapId: z.string().uuid().nullable().optional(),
  actionTitle: z.string().min(5).max(200),
  actionDescription: z.string().min(10).max(1000),
  method: z.string().min(2).max(100),
  businessImpactScore: score0to100,
  evidenceUncertaintyScore: score0to100,
  evidenceGapScore: score0to100,
  validationCostScore: score0to100,
  estimatedCost: z.string().max(100).nullable().optional(),
  estimatedTime: z.string().max(100).nullable().optional(),
  reasoning: z.string().min(10).max(1000),
});

// ---------------------------------------------------------------------
// Human Decision (Phase 15)
// ---------------------------------------------------------------------

export const DecisionSchema = z.enum(["proceed", "validate_further", "modify_idea", "reject"]);

export const UserDecisionInputSchema = z.object({
  businessIdeaId: z.string().uuid(),
  decision: DecisionSchema,
  decisionBasis: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------
// Project creation input (Phase 3 form)
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// External Evidence Research Engine (Phase 6)
// ---------------------------------------------------------------------

/**
 * Output of the research-question/query-generation LLM call
 * (research-planner.service.ts). The LLM proposes candidate queries;
 * the application persists whichever ones it actually executes,
 * alongside the model's stated reason for each — the query text itself
 * is never treated as evidence.
 */
export const GeneratedResearchQuerySchema = z.object({
  query: z.string().min(3).max(300),
  reason: z.string().min(5).max(300),
});

export const GeneratedResearchPlanSchema = z.object({
  researchQuestion: z.string().min(10).max(500),
  queries: z.array(GeneratedResearchQuerySchema).min(1).max(3),
});

/**
 * Output of external-evidence-extractor.service.ts. Grounded strictly
 * in ONE retrieved source: `claim` is the source's own stated fact,
 * `supportingText` is the actual excerpt it came from — the model must
 * not extrapolate beyond what the source says (Phase 6, Step 8). No
 * URL, title, or date fields here: those come from the already-
 * retrieved source record, never re-asserted (and thus never
 * fabricatable) by this extraction step.
 */
export const ExternalEvidenceExtractionSchema = z.object({
  sourceUrl: z.string().url(),
  claim: z.string().min(5).max(500),
  supportingText: z.string().min(5).max(1000),
  relevance: score0to100,
  supportDirection: SupportDirectionSchema,
  reason: z.string().min(5).max(500),
});

export const ExternalResearchResultSchema = z.object({
  extractions: z.array(ExternalEvidenceExtractionSchema).max(8),
});

export const EvidenceReviewDecisionSchema = z.enum(["accepted", "rejected", "flagged"]);

export const CreateProjectInputSchema = z.object({
  name: z.string().min(2).max(200),
  idea: RawBusinessIdeaInputSchema,
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
