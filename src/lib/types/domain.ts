// =====================================================================
// VentureIQ domain types
// These mirror the SQL schema in supabase/migrations/0001_init_schema.sql
// and represent the evidence-driven pipeline:
//
//   BusinessIdea -> Hypothesis -> EvidenceRequirement -> Evidence
//     -> EvidenceRelationship -> EvidenceConflict -> EvidenceGap
//     -> ConfidenceScore -> OpportunityScore -> ValidationAction
//     -> ValidationResult -> UserDecision
//
// Zod schemas that validate/parse these shapes (including LLM output)
// live in src/lib/types/schemas.ts. Import the *type*, not a duplicate
// shape, from there via z.infer — these interfaces are the source of
// truth for what a valid object looks like.
// =====================================================================

export type UUID = string;
export type ISODateString = string;

// ---------------------------------------------------------------------
// Business Idea
// ---------------------------------------------------------------------

export interface RawBusinessIdeaInput {
  businessName: string;
  description: string;
  industry?: string;
  country?: string;
  state?: string;
  city?: string;
  targetCustomer?: string;
  problem?: string;
  solution?: string;
  businessModel?: string;
  expectedPricing?: string;
  estimatedInvestment?: string;
  revenueModel?: string;
}

export type StructuringStatus = "pending" | "processing" | "completed" | "failed";
export type PipelineStageStatus = "pending" | "processing" | "completed" | "failed";
export type PlanStatus = "draft" | "pending_approval" | "approved";

/**
 * Output of the Idea Structuring Engine (Phase 4).
 * Always produced from RawBusinessIdeaInput by an LLM call whose output
 * is validated against StructuredBusinessIdeaSchema before it is ever
 * persisted or trusted downstream.
 */
export interface StructuredBusinessIdea {
  industry: string;
  location: {
    country: string;
    state?: string;
    city?: string;
  };
  customerSegment: string;
  problem: string;
  solution: string;
  businessModel: string;
  pricingAssumption: string;
  investmentAssumption: string;
  revenueModel: string;
  keyAssumptions: string[];
}

export interface BusinessIdea {
  id: UUID;
  projectId: UUID;
  raw: RawBusinessIdeaInput;
  structured: StructuredBusinessIdea | null;
  structuringStatus: StructuringStatus;
  structuringModel: string | null;
  structuringError: string | null;
  assumptionsStatus: PipelineStageStatus;
  assumptionsError: string | null;
  hypothesesStatus: PipelineStageStatus;
  hypothesesError: string | null;
  evidenceRequirementsStatus: PipelineStageStatus;
  evidenceRequirementsError: string | null;
  planStatus: PlanStatus;
  planApprovedAt: ISODateString | null;
  shareToken: string | null;
  shareEnabled: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Business Assumption (Phase 3, Step 3)
// Sits between the structured idea and hypotheses: the explicit list of
// things the business plan is relying on being true, each traceable to
// whether the founder stated it or the model inferred it.
// ---------------------------------------------------------------------

export type AssumptionSource = "user_provided" | "ai_inferred";
export type AssumptionStatus = "active" | "removed";

export interface BusinessAssumption {
  id: UUID;
  businessIdeaId: UUID;
  statement: string;
  category: string; // free-text category label, not a fixed enum — assumptions are more varied than hypotheses
  importance: Importance;
  source: AssumptionSource;
  status: AssumptionStatus;
  displayOrder: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Hypothesis (Phase 5)
// ---------------------------------------------------------------------

export type HypothesisCategory =
  | "customer_problem"
  | "market_demand"
  | "willingness_to_pay"
  | "competition"
  | "revenue"
  | "profitability"
  | "scalability"
  | "operations"
  | "regulation"
  | "supply"
  | "technology"
  | "go_to_market";

export type Importance = "low" | "medium" | "high" | "critical";

/**
 * Status is only ever advanced away from "untested" by the Confidence
 * Engine (Phase 12), never directly by the LLM that generated the
 * hypothesis. This is enforced in code (hypothesis.service.ts), not
 * just convention.
 */
export type HypothesisStatus =
  "untested" | "partially_validated" | "validated" | "contradicted" | "inconclusive";

/**
 * How a hypothesis's validation_criteria threshold was set. The model
 * may propose one (e.g. "at least 30% of respondents"), but it must be
 * clearly labeled as proposed, not asserted as researched fact, and the
 * founder can override it — see Step 8's plan review/edit flow.
 */
export type ThresholdType = "ai_proposed" | "user_defined";

export interface Hypothesis {
  id: UUID;
  businessIdeaId: UUID;
  assumptionId: UUID | null;
  statement: string;
  category: HypothesisCategory;
  importance: Importance;
  validationCriteria: string;
  threshold: string | null;
  thresholdType: ThresholdType | null;
  status: HypothesisStatus;
  confidence: number; // 0-100, always derived, never LLM-assigned directly
  displayOrder: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Evidence Requirement (Phase 6)
// ---------------------------------------------------------------------

export type MinimumEvidenceLevel = "low" | "medium" | "high" | "critical";
export type EvidenceRequirementStatus = "open" | "partially_met" | "met";

export interface EvidenceRequirement {
  id: UUID;
  hypothesisId: UUID;
  evidenceType: string; // domain-dependent, e.g. "competitor_pricing", "customer_survey"
  description: string;
  importance: Importance;
  minimumEvidenceLevel: MinimumEvidenceLevel;
  preferredSources: string[];
  status: EvidenceRequirementStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Evidence (Phase 7)
// ---------------------------------------------------------------------

export type SourceType =
  | "customer_feedback"
  | "survey"
  | "interview"
  | "competitor"
  | "market_data"
  | "pricing"
  | "financial"
  | "regulatory"
  | "government"
  | "experiment"
  | "other";

export type SupportDirection = "supports" | "contradicts" | "neutral";

/**
 * Distinguishes real collected evidence from synthetic/demo evidence.
 * The UI must never render "demo" or "mock" evidence without a visible
 * DEMO DATA label — see the evidence workspace in analysis.$id.tsx.
 */
export type DataStatus = "real" | "user_provided" | "demo" | "mock" | "unavailable";

export interface Evidence {
  id: UUID;
  hypothesisId: UUID;
  evidenceRequirementId: UUID | null;

  source: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  sourceTitle: string | null;
  publicationDate: string | null; // date-only
  retrievalDate: ISODateString;

  summary: string;
  notes: string | null; // free-form founder notes, distinct from the evidence's own summary
  supportDirection: SupportDirection;

  reliabilityScore: number; // 0-100, deterministic (see evidence-quality.ts)
  relevanceScore: number; // 0-100, deterministic
  recencyScore: number; // 0-100, deterministic
  independenceScore: number; // 0-100, deterministic
  confidenceScore: number; // 0-100 — the CLASSIFIER's confidence in supportDirection, not an overall quality score
  classificationReason: string | null; // why the classifier (or the founder, for user-provided evidence) chose this supportDirection

  provenance: EvidenceProvenance;
  dataStatus: DataStatus;
  /**
   * Deterministic fingerprint identifying the underlying source (Phase
   * 5, Step 3) — e.g. derived from the URL's domain + path, or a
   * normalized source name when no URL exists. Evidence items sharing
   * a fingerprint are treated as non-independent by the confidence
   * engine (see confidence-engine.ts), so three articles syndicating
   * the same press release don't count as three independent data
   * points.
   */
  sourceFingerprint: string | null;

  /**
   * Human-review gate for externally-researched evidence (Phase 6,
   * Step 11). Demo/user-provided evidence defaults to "accepted"
   * (unchanged from Phase 4); real, externally-researched evidence is
   * always created as "pending_review" and only participates in
   * gap/conflict/confidence calculations once explicitly accepted —
   * see EvidenceCollectionService/ConflictGapRepository's
   * isCountedEvidence checks.
   */
  reviewStatus: EvidenceReviewStatus;
  /** The research_sources row this evidence was extracted from, if any. */
  researchSourceId: UUID | null;

  createdAt: ISODateString;
}

export type EvidenceReviewStatus =
  | "pending_review"
  | "accepted"
  | "rejected"
  | "flagged"
  | "source_unavailable"
  | "extraction_failed";

/**
 * How a piece of evidence was actually obtained. Every evidence row
 * must carry this so results are traceable back to a provider + query.
 */
export interface EvidenceProvenance {
  providerId: string; // e.g. "demo-provider", "user-provider", "web-search-provider"
  providerVersion?: string;
  query?: string;
  rawRef?: string; // pointer to raw payload if stored elsewhere
  collectedBy?: "system" | "user";
}

// ---------------------------------------------------------------------
// Evidence Relationship Graph (Phase 9)
// ---------------------------------------------------------------------

export type EvidenceRelationshipType =
  | "supports_hypothesis"
  | "contradicts_hypothesis"
  | "neutral_to_hypothesis"
  | "corroborates_evidence"
  | "duplicates_evidence"
  | "supersedes_evidence";

export interface EvidenceRelationship {
  id: UUID;
  hypothesisId: UUID;
  evidenceId: UUID;
  relatedEvidenceId: UUID | null;
  relationshipType: EvidenceRelationshipType;
  classificationConfidence: number | null; // 0-100
  reason: string | null;
  createdAt: ISODateString;
}

export interface EvidenceCoverage {
  hypothesisId: UUID;
  supportingCount: number;
  contradictingCount: number;
  neutralCount: number;
  coveragePct: number; // met requirements / total requirements, 0-100
}

// ---------------------------------------------------------------------
// Evidence Conflict Detection (Phase 10)
// ---------------------------------------------------------------------

export type ConflictType =
  "direct_contradiction" | "source_disagreement" | "temporal_shift" | "magnitude_mismatch";

export type Severity = "low" | "medium" | "high" | "critical";
export type ConflictStatus = "open" | "reviewed" | "resolved";

export interface EvidenceConflict {
  id: UUID;
  hypothesisId: UUID;
  conflictType: ConflictType;
  severity: Severity;
  description: string;
  supportingEvidenceIds: UUID[];
  contradictingEvidenceIds: UUID[];
  status: ConflictStatus;
  autoGenerated: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Evidence Gap Detection (Phase 11)
// ---------------------------------------------------------------------

export type GapType =
  "no_evidence" | "insufficient_evidence" | "low_quality_evidence" | "contradictory_evidence";

export type GapStatus = "open" | "closed";

export interface EvidenceGap {
  id: UUID;
  hypothesisId: UUID;
  evidenceRequirementId: UUID | null;
  gapType: GapType;
  severity: Severity;
  missingRequirement: string;
  importance: Importance;
  businessImpact: string;
  recommendedValidation: string;
  status: GapStatus;
  autoGenerated: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Confidence Engine (Phase 12)
// Deterministic, decomposed, reproducible. The LLM never assigns the
// final number — see src/backend/scoring/confidence-engine.ts.
// ---------------------------------------------------------------------

export interface ConfidenceWeights {
  evidenceQuality: number;
  sourceReliability: number;
  relevance: number;
  recency: number;
  independence: number;
  coverage: number;
  contradictionPenalty: number;
  gapPenalty: number;
  conflictPenalty: number;
}

export type ConfidenceLevel = "very_low" | "low" | "medium" | "high" | "very_high";

export interface ConfidenceScore {
  id: UUID;
  hypothesisId: UUID;
  finalConfidence: number; // 0-100
  confidenceLevel: ConfidenceLevel;

  evidenceQualityComponent: number;
  sourceReliabilityComponent: number;
  relevanceComponent: number;
  recencyComponent: number;
  independenceComponent: number;
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  independentEvidenceCount: number; // after source-fingerprint dedup
  evidenceCoveragePct: number;
  gapPenaltyComponent: number;
  conflictPenaltyComponent: number;

  formulaVersion: string;
  weights: ConfidenceWeights;
  explanation: string; // deterministically generated, not free-form LLM prose
  supportingFactorSummary: string;
  contradictingFactorSummary: string;

  calculatedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Opportunity Score (Phase 13)
// ---------------------------------------------------------------------

export type OpportunityDimensionKey =
  | "market_demand"
  | "customer_pain"
  | "competition"
  | "revenue_potential"
  | "profitability"
  | "scalability"
  | "investment_feasibility"
  | "operational_complexity"
  | "market_timing"
  | "regulatory_risk"
  | "government_support";

export interface OpportunityDimensionScore {
  applicable: boolean; // false => NOT_APPLICABLE; excluded from aggregation entirely
  score: number; // 0-100
  confidence: number; // 0-100
  reasoning: string;
  limitation: string | null; // what's missing/weak about the evidence behind this dimension, if anything
  supportingEvidenceIds: UUID[];
  contradictingEvidenceIds: UUID[];
  recommendation: string;
}

export type OpportunityDimensions = Record<OpportunityDimensionKey, OpportunityDimensionScore>;

export interface OpportunityScore {
  id: UUID;
  businessIdeaId: UUID;
  /** RAW_SCORE: weighted dimension scores only, ignoring how confident each dimension's evidence is. */
  rawScore: number; // 0-100
  /** CONFIDENCE_ADJUSTED_SCORE: same weighting, but each dimension's contribution is scaled by its own confidence. */
  overallScore: number; // 0-100
  overallConfidence: number; // 0-100
  dimensions: OpportunityDimensions;
  formulaVersion: string;
  weights: Record<OpportunityDimensionKey, number>;
  calculatedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Adaptive Validation Engine (Phase 14)
// ---------------------------------------------------------------------

export type ValidationActionStatus = "recommended" | "accepted" | "dismissed" | "completed";
export type ValidationPriority = "critical" | "high" | "medium" | "low";

export interface ValidationAction {
  id: UUID;
  businessIdeaId: UUID;
  hypothesisId: UUID | null;
  targetGapId: UUID | null;

  actionTitle: string;
  actionDescription: string;
  method: string; // e.g. "pricing_experiment", "customer_interview", "landing_page_test"

  businessImpactScore: number;
  evidenceUncertaintyScore: number;
  evidenceGapScore: number;
  validationCostScore: number;
  expectedInformationValue: number; // ranking composite, deterministic
  priorityRank: number;
  priority: ValidationPriority;
  estimatedCost: string | null; // short human-readable label, e.g. "Low", "$500-2000"
  estimatedTime: string | null; // short human-readable label, e.g. "1-2 weeks"

  reasoning: string; // explicit "why this action, why now"
  status: ValidationActionStatus;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ValidationResult {
  id: UUID;
  validationActionId: UUID;
  outcomeSummary: string;
  newEvidenceIds: UUID[];
  affectedHypothesisIds: UUID[];
  recordedAt: ISODateString;
}

// ---------------------------------------------------------------------
// Human Decision (Phase 15)
// ---------------------------------------------------------------------

export type Decision = "proceed" | "validate_further" | "modify_idea" | "reject";

export interface UserDecision {
  id: UUID;
  businessIdeaId: UUID;
  userId: UUID;
  decision: Decision;
  decisionBasis: string | null; // what the decision was grounded in, distinct from free-form notes
  notes: string | null;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------
// Project-level confidence & critical uncertainty (Phase 5) — computed
// on demand, not persisted as their own tables; always derived fresh
// from the latest confidence_scores/evidence_gaps/evidence_conflicts
// rows so they can never drift out of sync with the underlying data.
// ---------------------------------------------------------------------

export interface ProjectConfidenceSummary {
  overallConfidence: number; // 0-100, importance-weighted across hypotheses
  criticalHypothesisConfidence: number | null; // 0-100, average across only "critical" importance hypotheses; null if none
  evidenceCoveragePct: number; // 0-100, importance-weighted average coverage
  weakestCriticalHypothesisId: UUID | null;
  formulaVersion: string;
}

export interface CriticalUncertainty {
  hypothesisId: UUID;
  statement: string;
  importance: Importance;
  confidence: number;
  evidenceCoveragePct: number;
  uncertaintyScore: number; // 0-100, higher = more urgent
  reason: string;
}

// ---------------------------------------------------------------------
// External Evidence Research Engine (Phase 6)
// ---------------------------------------------------------------------

export type ResearchRunStatus = "queued" | "running" | "completed" | "partial" | "failed";
export type ResearchTaskStatus = "pending" | "running" | "completed" | "failed";
export type ResearchSourceStatus = "pending" | "retrieved" | "source_unavailable" | "duplicate";

/**
 * Authority-tier category for a retrieved source (Phase 6, Step 5) —
 * deliberately a distinct axis from Evidence.sourceType (which
 * describes the KIND of evidence — "survey", "pricing" — not the
 * publisher's authority). Named source_category in code/DB to avoid
 * confusion with evidence.source_type.
 */
export type SourceCategory =
  | "government"
  | "academic"
  | "company_filing"
  | "established_news"
  | "industry_organization"
  | "company_website"
  | "professional_publication"
  | "general_website"
  | "unknown";

export interface ResearchRun {
  id: UUID;
  hypothesisId: UUID;
  status: ResearchRunStatus;
  startedAt: ISODateString | null;
  completedAt: ISODateString | null;
  queryCount: number;
  sourceCount: number;
  acceptedEvidenceCount: number;
  error: string | null;
  createdAt: ISODateString;
}

export interface ResearchTask {
  id: UUID;
  researchRunId: UUID;
  hypothesisId: UUID;
  evidenceRequirementId: UUID | null;
  researchQuestion: string;
  status: ResearchTaskStatus;
  priority: Importance;
  error: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ResearchQuery {
  id: UUID;
  researchTaskId: UUID;
  query: string;
  reason: string;
  createdAt: ISODateString;
}

export interface ResearchSource {
  id: UUID;
  researchTaskId: UUID;
  researchQueryId: UUID | null;
  sourceUrl: string;
  sourceTitle: string | null;
  domain: string | null;
  publicationDate: string | null;
  retrievalDate: ISODateString;
  snippet: string | null;
  sourceCategory: SourceCategory;
  sourceFingerprint: string;
  qualityScore: number;
  status: ResearchSourceStatus;
  evidenceId: UUID | null;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------
// Project / Report envelopes
// ---------------------------------------------------------------------

export type ProjectStatus = "draft" | "analyzing" | "analyzed" | "archived";

export interface Project {
  id: UUID;
  userId: UUID;
  name: string;
  status: ProjectStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * The fully assembled report payload — this is what report.$id.tsx
 * renders once connected (Phase 16). Every AI-generated conclusion in
 * here must be traceable to evidence IDs or explicitly labeled as an
 * inference; see docs/evidence-engine.md once written (Phase "patent
 * docs").
 */
export interface ScoreHistoryPoint {
  calculatedAt: ISODateString;
  overallConfidence: number | null; // project-level, importance-weighted; null if not computable at that point
  opportunityScore: number | null; // overallScore (confidence-adjusted)
  evidenceCoveragePct: number | null;
}

export type PlanTier = "free" | "pro" | "enterprise";

export interface UsageLimits {
  projects: number | null; // null = unlimited
  researchRunsPerMonth: number | null;
}

export interface UsageSnapshot {
  plan: PlanTier;
  limits: UsageLimits;
  current: {
    projects: number;
    researchRuns: number;
    researchSources: number;
    validationActionsRecorded: number;
  };
  remaining: {
    projects: number | null;
    researchRunsThisMonth: number | null;
  };
}

export interface UserProfile {
  id: UUID;
  email: string;
  fullName: string | null;
  plan: PlanTier;
  subscriptionStatus: "active" | "past_due" | "canceled" | "trialing";
  subscriptionProvider: string | null;
  subscriptionId: string | null;
  createdAt: ISODateString;
}

/**
 * A richer, presentation-facing project status than the stored
 * `projects.status` column — always DERIVED from the underlying
 * pipeline/plan/evidence/decision state at read time
 * (see project-status.ts), never stored, so it can never drift out of
 * sync with the data that actually defines it.
 */
export type DerivedProjectStatus =
  | "draft"
  | "validation_plan"
  | "researching"
  | "review"
  | "ready_for_decision"
  | "completed"
  | "failed";

export interface ReportSnapshot {
  businessIdea: BusinessIdea;
  assumptions: BusinessAssumption[];
  hypotheses: Hypothesis[];
  evidenceByHypothesis: Record<UUID, Evidence[]>;
  evidenceRequirementsByHypothesis: Record<UUID, EvidenceRequirement[]>;
  coverageByHypothesis: Record<UUID, EvidenceCoverage>;
  conflicts: EvidenceConflict[];
  gaps: EvidenceGap[];
  confidenceScores: ConfidenceScore[];
  opportunityScore: OpportunityScore | null;
  projectConfidence: ProjectConfidenceSummary | null;
  criticalUncertainties: CriticalUncertainty[];
  validationActions: ValidationAction[];
  scoreHistory: ScoreHistoryPoint[];
  researchRunsCount: number;
  researchSourcesCount: number;
  decision: UserDecision | null;
  derivedStatus: DerivedProjectStatus;
  isDemo: boolean;
}
