// =====================================================================
// Deterministic severity mapping, shared by gap detection and conflict
// detection (Phase 4, Steps 9 & 10).
//
// PRINCIPLE: "do not treat every missing requirement as critical" —
// severity is a function of how important the underlying hypothesis
// and requirement are, not a flat default. No LLM involved.
// =====================================================================

import type { Importance, Severity } from "@/lib/types/domain";

const IMPORTANCE_RANK: Record<Importance, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const SEVERITY_BY_RANK: Severity[] = ["low", "medium", "high", "critical"];

/**
 * Combines a hypothesis's importance with (optionally) a specific
 * requirement's importance, taking the higher of the two — a gap in a
 * low-importance requirement under a critical hypothesis still matters
 * somewhat, but a gap in a critical requirement should never be
 * diluted just because other parts of the hypothesis are less
 * important.
 */
export function severityFromImportance(
  hypothesisImportance: Importance,
  requirementImportance?: Importance,
): Severity {
  const rank = requirementImportance
    ? Math.max(IMPORTANCE_RANK[hypothesisImportance], IMPORTANCE_RANK[requirementImportance])
    : IMPORTANCE_RANK[hypothesisImportance];
  return SEVERITY_BY_RANK[rank];
}
