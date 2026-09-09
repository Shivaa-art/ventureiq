// =====================================================================
// Confidence Engine (Phase 5 — confidence-v2).
//
// PRINCIPLE: the final confidence number is ALWAYS computed here, by
// deterministic arithmetic over stored evidence/gap/conflict rows. No
// LLM call exists anywhere in this file. Given the same inputs and the
// same formulaVersion/weights, this function always returns the same
// number — that reproducibility is the point, and it's what lets the
// system answer "why is confidence 68%?" by pointing at these exact
// component values rather than at a model's rationalization.
//
// v2 changes from v1 (Phase 1):
//   - explicit gap and conflict penalty terms, not folded into the
//     contradiction-ratio multiplier
//   - source-fingerprint deduplication before computing supporting/
//     contradicting counts and quality averages (Phase 5, Step 3)
//   - a discrete confidence_level bucket alongside the numeric score
//   - separate supporting/contradicting factor summaries, in addition
//     to the general explanation
// =====================================================================

import type {
  ConfidenceLevel,
  ConfidenceScore,
  ConfidenceWeights,
  Evidence,
  EvidenceConflict,
  EvidenceGap,
  Importance,
} from "@/lib/types/domain";

export const CONFIDENCE_FORMULA_VERSION = "confidence-v2";

export const DEFAULT_CONFIDENCE_WEIGHTS: ConfidenceWeights = {
  evidenceQuality: 0.2,
  sourceReliability: 0.15,
  relevance: 0.1,
  recency: 0.1,
  independence: 0.1,
  coverage: 0.2,
  contradictionPenalty: 0.25, // fraction subtracted per unit of contradiction ratio
  gapPenalty: 0.15, // fraction subtracted per unit of open-gap severity, capped
  conflictPenalty: 0.2, // fraction subtracted per unit of open-conflict severity, capped
};

const IMPORTANCE_RANK: Record<Importance, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Collapses evidence sharing a source fingerprint down to one
 * representative item per group (the highest-classification-confidence
 * one), so three articles syndicating the same press release
 * contribute as one independent data point, not three. Items without a
 * fingerprint are each treated as their own group (nothing to dedupe
 * against). This is a simple, explainable MVP mechanism, not a claim
 * of sophisticated source-relationship modeling.
 */
function deduplicateByIndependence(evidence: Evidence[]): Evidence[] {
  const groups = new Map<string, Evidence[]>();
  let ungroupedIndex = 0;
  for (const item of evidence) {
    const key = item.sourceFingerprint ?? `__ungrouped_${ungroupedIndex++}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map(
    (group) => group.sort((a, b) => b.confidenceScore - a.confidenceScore)[0],
  );
}

export interface ComputeConfidenceInput {
  hypothesisId: string;
  hypothesisImportance: Importance;
  evidence: Evidence[];
  evidenceCoveragePct: number; // from EvidenceRepository.getCoverage
  openGaps: EvidenceGap[];
  openConflicts: EvidenceConflict[];
  weights?: ConfidenceWeights;
}

export function confidenceLevelFromScore(score: number): ConfidenceLevel {
  if (score < 20) return "very_low";
  if (score < 40) return "low";
  if (score < 60) return "medium";
  if (score < 80) return "high";
  return "very_high";
}

/**
 * Computes a hypothesis's confidence score deterministically from its
 * evidence, open gaps, and open conflicts. Demo/mock evidence
 * (dataStatus "demo" | "mock") is excluded from the calculation
 * entirely — it can populate the UI for illustration, but it must
 * never move a real confidence number.
 */
export function computeConfidenceScore(
  input: ComputeConfidenceInput,
): Omit<ConfidenceScore, "id" | "calculatedAt"> {
  const weights = input.weights ?? DEFAULT_CONFIDENCE_WEIGHTS;
  // Phase 6: externally-researched evidence only counts once it has
  // cleared human review — a pending-review source must not move a
  // real confidence number.
  const realEvidence = input.evidence.filter(
    (e) =>
      (e.dataStatus === "real" || e.dataStatus === "user_provided") &&
      e.reviewStatus === "accepted",
  );
  const independentEvidence = deduplicateByIndependence(realEvidence);

  const supporting = independentEvidence.filter((e) => e.supportDirection === "supports");
  const contradicting = independentEvidence.filter((e) => e.supportDirection === "contradicts");

  const evidenceQualityComponent = average(independentEvidence.map((e) => e.confidenceScore));
  const sourceReliabilityComponent = average(independentEvidence.map((e) => e.reliabilityScore));
  const relevanceComponent = average(independentEvidence.map((e) => e.relevanceScore));
  const recencyComponent = average(independentEvidence.map((e) => e.recencyScore));
  const independenceComponent = average(independentEvidence.map((e) => e.independenceScore));

  const weightedQuality =
    evidenceQualityComponent * weights.evidenceQuality +
    sourceReliabilityComponent * weights.sourceReliability +
    relevanceComponent * weights.relevance +
    recencyComponent * weights.recency +
    independenceComponent * weights.independence;

  const coverageContribution = input.evidenceCoveragePct * weights.coverage;

  const baseScore = weightedQuality + coverageContribution;

  // Contradiction penalty: proportional to how much of the independent
  // evidence pool contradicts the hypothesis.
  const totalDirectional = supporting.length + contradicting.length;
  const contradictionRatio = totalDirectional === 0 ? 0 : contradicting.length / totalDirectional;
  const contradictionPenaltyAmount = baseScore * contradictionRatio * weights.contradictionPenalty;

  // Gap penalty: scaled by open-gap severity (weighted toward
  // high/critical gaps) relative to the hypothesis's own importance —
  // a critical hypothesis with unresolved gaps loses more than a
  // low-importance one, since the gap matters more to the business.
  const gapSeverityScore = severityWeightedScore(input.openGaps.map((g) => g.severity));
  const gapPenaltyAmount =
    100 * gapSeverityScore * weights.gapPenalty * IMPORTANCE_RANK[input.hypothesisImportance];

  // Conflict penalty: unresolved conflicts are a direct signal of
  // unreliable ground truth, penalized independent of the contradiction
  // ratio above (which only reflects raw evidence counts, not whether
  // the disagreement has been reviewed).
  const conflictSeverityScore = severityWeightedScore(input.openConflicts.map((c) => c.severity));
  const conflictPenaltyAmount = 100 * conflictSeverityScore * weights.conflictPenalty;

  const rawScore =
    baseScore - contradictionPenaltyAmount - gapPenaltyAmount - conflictPenaltyAmount;
  const finalConfidence = Math.max(0, Math.min(100, Math.round(rawScore * 100) / 100));
  const confidenceLevel = confidenceLevelFromScore(finalConfidence);

  const explanation = buildExplanation({
    finalConfidence,
    confidenceLevel,
    supportingCount: supporting.length,
    contradictingCount: contradicting.length,
    evidenceCoveragePct: input.evidenceCoveragePct,
    evidenceQualityComponent,
    sourceReliabilityComponent,
    contradictionRatio,
    openGapCount: input.openGaps.length,
    openConflictCount: input.openConflicts.length,
  });

  return {
    hypothesisId: input.hypothesisId,
    finalConfidence,
    confidenceLevel,
    evidenceQualityComponent,
    sourceReliabilityComponent,
    relevanceComponent,
    recencyComponent,
    independenceComponent,
    supportingEvidenceCount: supporting.length,
    contradictingEvidenceCount: contradicting.length,
    independentEvidenceCount: independentEvidence.length,
    evidenceCoveragePct: input.evidenceCoveragePct,
    gapPenaltyComponent: Math.round(gapPenaltyAmount * 100) / 100,
    conflictPenaltyComponent: Math.round(conflictPenaltyAmount * 100) / 100,
    formulaVersion: CONFIDENCE_FORMULA_VERSION,
    weights,
    explanation,
    supportingFactorSummary: buildSupportingFactorSummary(
      supporting,
      evidenceQualityComponent,
      input.evidenceCoveragePct,
    ),
    contradictingFactorSummary: buildContradictingFactorSummary(
      contradicting,
      input.openGaps,
      input.openConflicts,
    ),
  };
}

/** Maps severities to weights and returns the max-normalized average severity across the given list (0 if empty). */
function severityWeightedScore(severities: Array<"low" | "medium" | "high" | "critical">): number {
  if (severities.length === 0) return 0;
  const rank: Record<string, number> = { low: 0.25, medium: 0.5, high: 0.75, critical: 1 };
  // Diminishing returns for many gaps/conflicts of the same severity
  // (the first critical gap matters far more than the fifth) — take the
  // max severity plus a small increment per additional item, capped at 1.
  const maxSeverity = Math.max(...severities.map((s) => rank[s]));
  const extra = Math.min(0.2, (severities.length - 1) * 0.03);
  return Math.min(1, maxSeverity + extra);
}

function buildExplanation(parts: {
  finalConfidence: number;
  confidenceLevel: ConfidenceLevel;
  supportingCount: number;
  contradictingCount: number;
  evidenceCoveragePct: number;
  evidenceQualityComponent: number;
  sourceReliabilityComponent: number;
  contradictionRatio: number;
  openGapCount: number;
  openConflictCount: number;
}): string {
  const segments = [
    `Confidence is ${parts.finalConfidence}% (${parts.confidenceLevel.replace("_", " ")}), based on ` +
      `${parts.supportingCount} independent supporting and ${parts.contradictingCount} independent ` +
      `contradicting evidence item(s), after deduplicating items from the same underlying source.`,
    `Average evidence quality: ${parts.evidenceQualityComponent.toFixed(1)}/100; ` +
      `average source reliability: ${parts.sourceReliabilityComponent.toFixed(1)}/100.`,
    `Evidence requirement coverage: ${parts.evidenceCoveragePct}%.`,
  ];
  if (parts.contradictionRatio > 0) {
    segments.push(
      `${Math.round(parts.contradictionRatio * 100)}% of directional evidence contradicts this hypothesis.`,
    );
  }
  if (parts.openGapCount > 0) {
    segments.push(`${parts.openGapCount} open evidence gap(s) reduce the score.`);
  }
  if (parts.openConflictCount > 0) {
    segments.push(`${parts.openConflictCount} open evidence conflict(s) reduce the score.`);
  }
  return segments.join(" ");
}

function buildSupportingFactorSummary(
  supporting: Evidence[],
  avgQuality: number,
  coveragePct: number,
): string {
  if (supporting.length === 0) return "No independent supporting evidence yet.";
  const parts = [`${supporting.length} independent supporting item(s)`];
  if (avgQuality >= 70) parts.push("high average evidence quality");
  else if (avgQuality >= 40) parts.push("moderate average evidence quality");
  if (coveragePct >= 70) parts.push("strong evidence requirement coverage");
  else if (coveragePct >= 40) parts.push("partial evidence requirement coverage");
  return `+ ${parts.join("; + ")}.`;
}

function buildContradictingFactorSummary(
  contradicting: Evidence[],
  openGaps: EvidenceGap[],
  openConflicts: EvidenceConflict[],
): string {
  const parts: string[] = [];
  if (contradicting.length > 0)
    parts.push(`${contradicting.length} independent contradicting item(s)`);
  const criticalGaps = openGaps.filter((g) => g.severity === "critical" || g.severity === "high");
  if (criticalGaps.length > 0) parts.push(`${criticalGaps.length} high/critical evidence gap(s)`);
  else if (openGaps.length > 0) parts.push(`${openGaps.length} open evidence gap(s)`);
  if (openConflicts.length > 0)
    parts.push(`${openConflicts.length} unresolved evidence conflict(s)`);
  if (parts.length === 0) return "No significant negative factors.";
  return `- ${parts.join("; - ")}.`;
}

/**
 * Maps a numeric confidence + evidence balance to a hypothesis status.
 * This is the ONLY place hypothesis.status is derived — never set
 * directly by an LLM call. Thresholds are intentionally conservative:
 * a hypothesis needs both a reasonable confidence AND a lack of
 * significant contradiction to be marked validated. High confidence
 * alone is never sufficient — see Phase 5, Step 4: confidence and
 * validation status are deliberately kept as separate concepts.
 */
export function deriveHypothesisStatus(
  score: Omit<ConfidenceScore, "id" | "calculatedAt">,
): "untested" | "partially_validated" | "validated" | "contradicted" | "inconclusive" {
  const { finalConfidence, supportingEvidenceCount, contradictingEvidenceCount } = score;

  if (supportingEvidenceCount === 0 && contradictingEvidenceCount === 0) return "untested";
  if (contradictingEvidenceCount > supportingEvidenceCount && finalConfidence < 40)
    return "contradicted";
  if (finalConfidence >= 75) return "validated";
  if (finalConfidence >= 45) return "partially_validated";
  return "inconclusive";
}
