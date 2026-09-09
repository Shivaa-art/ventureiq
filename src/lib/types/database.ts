// =====================================================================
// Hand-written Database type for the typed Supabase client.
//
// This mirrors supabase/migrations/0001_init_schema.sql column-for-
// column. When the schema changes, update this file in the same PR.
// (Once a real Supabase project exists, `supabase gen types typescript`
// can regenerate this file from the live schema — this hand-written
// version exists so Phase 1 type-checks without a live project.)
// =====================================================================

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          plan: "free" | "pro" | "enterprise";
          subscription_status: "active" | "past_due" | "canceled" | "trialing";
          subscription_provider: string | null;
          subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]> & {
          id: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          status: "draft" | "analyzing" | "analyzed" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> & {
          user_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      business_ideas: {
        Row: {
          id: string;
          project_id: string;
          raw_business_name: string;
          raw_description: string;
          raw_industry: string | null;
          raw_country: string | null;
          raw_state: string | null;
          raw_city: string | null;
          raw_target_customer: string | null;
          raw_problem: string | null;
          raw_solution: string | null;
          raw_business_model: string | null;
          raw_expected_pricing: string | null;
          raw_estimated_investment: string | null;
          raw_revenue_model: string | null;
          structured: Record<string, unknown> | null;
          structuring_status: "pending" | "processing" | "completed" | "failed";
          structuring_model: string | null;
          structuring_error: string | null;
          assumptions_status: "pending" | "processing" | "completed" | "failed";
          assumptions_error: string | null;
          hypotheses_status: "pending" | "processing" | "completed" | "failed";
          hypotheses_error: string | null;
          evidence_requirements_status: "pending" | "processing" | "completed" | "failed";
          evidence_requirements_error: string | null;
          plan_status: "draft" | "pending_approval" | "approved";
          plan_approved_at: string | null;
          share_token: string | null;
          share_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["business_ideas"]["Row"]> & {
          project_id: string;
          raw_business_name: string;
          raw_description: string;
        };
        Update: Partial<Database["public"]["Tables"]["business_ideas"]["Row"]>;
        Relationships: [];
      };
      business_assumptions: {
        Row: {
          id: string;
          business_idea_id: string;
          statement: string;
          category: string;
          importance: "low" | "medium" | "high" | "critical";
          source: "user_provided" | "ai_inferred";
          status: "active" | "removed";
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["business_assumptions"]["Row"]> & {
          business_idea_id: string;
          statement: string;
          category: string;
          source: "user_provided" | "ai_inferred";
        };
        Update: Partial<Database["public"]["Tables"]["business_assumptions"]["Row"]>;
        Relationships: [];
      };
      hypotheses: {
        Row: {
          id: string;
          business_idea_id: string;
          assumption_id: string | null;
          statement: string;
          category: string;
          importance: "low" | "medium" | "high" | "critical";
          validation_criteria: string;
          threshold: string | null;
          threshold_type: "ai_proposed" | "user_defined" | null;
          status:
            "untested" | "partially_validated" | "validated" | "contradicted" | "inconclusive";
          confidence: number;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["hypotheses"]["Row"]> & {
          business_idea_id: string;
          statement: string;
          category: string;
          validation_criteria: string;
        };
        Update: Partial<Database["public"]["Tables"]["hypotheses"]["Row"]>;
        Relationships: [];
      };
      evidence_requirements: {
        Row: {
          id: string;
          hypothesis_id: string;
          evidence_type: string;
          description: string;
          importance: "low" | "medium" | "high" | "critical";
          minimum_evidence_level: "low" | "medium" | "high" | "critical";
          preferred_sources: string[];
          status: "open" | "partially_met" | "met";
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["evidence_requirements"]["Row"]> & {
          hypothesis_id: string;
          evidence_type: string;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["evidence_requirements"]["Row"]>;
        Relationships: [];
      };
      evidence: {
        Row: {
          id: string;
          hypothesis_id: string;
          evidence_requirement_id: string | null;
          source: string;
          source_type: string;
          source_url: string | null;
          source_title: string | null;
          publication_date: string | null;
          retrieval_date: string;
          summary: string;
          notes: string | null;
          support_direction: "supports" | "contradicts" | "neutral";
          reliability_score: number;
          relevance_score: number;
          recency_score: number;
          independence_score: number;
          confidence_score: number;
          classification_reason: string | null;
          provenance: Record<string, unknown>;
          data_status: "real" | "user_provided" | "demo" | "mock" | "unavailable";
          source_fingerprint: string | null;
          review_status:
            | "pending_review"
            | "accepted"
            | "rejected"
            | "flagged"
            | "source_unavailable"
            | "extraction_failed";
          research_source_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["evidence"]["Row"]> & {
          hypothesis_id: string;
          source: string;
          source_type: string;
          summary: string;
          support_direction: "supports" | "contradicts" | "neutral";
          reliability_score: number;
          relevance_score: number;
          recency_score: number;
          independence_score: number;
          confidence_score: number;
          data_status: "real" | "user_provided" | "demo" | "mock" | "unavailable";
        };
        Update: Partial<Database["public"]["Tables"]["evidence"]["Row"]>;
        Relationships: [];
      };
      evidence_relationships: {
        Row: {
          id: string;
          hypothesis_id: string;
          evidence_id: string;
          related_evidence_id: string | null;
          relationship_type: string;
          classification_confidence: number | null;
          reason: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["evidence_relationships"]["Row"]> & {
          hypothesis_id: string;
          evidence_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["evidence_relationships"]["Row"]>;
        Relationships: [];
      };
      evidence_conflicts: {
        Row: {
          id: string;
          hypothesis_id: string;
          conflict_type: string;
          severity: "low" | "medium" | "high" | "critical";
          description: string;
          supporting_evidence_ids: string[];
          contradicting_evidence_ids: string[];
          status: "open" | "reviewed" | "resolved";
          auto_generated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["evidence_conflicts"]["Row"]> & {
          hypothesis_id: string;
          conflict_type: string;
          severity: "low" | "medium" | "high" | "critical";
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["evidence_conflicts"]["Row"]>;
        Relationships: [];
      };
      evidence_gaps: {
        Row: {
          id: string;
          hypothesis_id: string;
          evidence_requirement_id: string | null;
          gap_type: string;
          severity: "low" | "medium" | "high" | "critical";
          missing_requirement: string;
          importance: "low" | "medium" | "high" | "critical";
          business_impact: string;
          recommended_validation: string;
          status: "open" | "closed";
          auto_generated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["evidence_gaps"]["Row"]> & {
          hypothesis_id: string;
          gap_type: string;
          severity: "low" | "medium" | "high" | "critical";
          missing_requirement: string;
          business_impact: string;
          recommended_validation: string;
        };
        Update: Partial<Database["public"]["Tables"]["evidence_gaps"]["Row"]>;
        Relationships: [];
      };
      confidence_scores: {
        Row: {
          id: string;
          hypothesis_id: string;
          final_confidence: number;
          confidence_level: "very_low" | "low" | "medium" | "high" | "very_high";
          evidence_quality_component: number;
          source_reliability_component: number;
          relevance_component: number;
          recency_component: number;
          independence_component: number;
          supporting_evidence_count: number;
          contradicting_evidence_count: number;
          independent_evidence_count: number;
          evidence_coverage_pct: number;
          gap_penalty_component: number;
          conflict_penalty_component: number;
          formula_version: string;
          weights: Record<string, number>;
          explanation: string;
          supporting_factor_summary: string;
          contradicting_factor_summary: string;
          calculated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["confidence_scores"]["Row"]> & {
          hypothesis_id: string;
          final_confidence: number;
          confidence_level: "very_low" | "low" | "medium" | "high" | "very_high";
          formula_version: string;
          weights: Record<string, number>;
          explanation: string;
          supporting_factor_summary: string;
          contradicting_factor_summary: string;
        };
        Update: Partial<Database["public"]["Tables"]["confidence_scores"]["Row"]>;
        Relationships: [];
      };
      opportunity_scores: {
        Row: {
          id: string;
          business_idea_id: string;
          raw_score: number;
          overall_score: number;
          overall_confidence: number;
          dimensions: Record<string, unknown>;
          formula_version: string;
          weights: Record<string, number>;
          calculated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["opportunity_scores"]["Row"]> & {
          business_idea_id: string;
          raw_score: number;
          overall_score: number;
          overall_confidence: number;
          dimensions: Record<string, unknown>;
          formula_version: string;
          weights: Record<string, number>;
        };
        Update: Partial<Database["public"]["Tables"]["opportunity_scores"]["Row"]>;
        Relationships: [];
      };
      validation_actions: {
        Row: {
          id: string;
          business_idea_id: string;
          hypothesis_id: string | null;
          target_gap_id: string | null;
          action_title: string;
          action_description: string;
          method: string;
          business_impact_score: number;
          evidence_uncertainty_score: number;
          evidence_gap_score: number;
          validation_cost_score: number;
          expected_information_value: number;
          priority_rank: number;
          priority: "critical" | "high" | "medium" | "low";
          estimated_cost: string | null;
          estimated_time: string | null;
          reasoning: string;
          status: "recommended" | "accepted" | "dismissed" | "completed";
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["validation_actions"]["Row"]> & {
          business_idea_id: string;
          action_title: string;
          action_description: string;
          method: string;
          priority: "critical" | "high" | "medium" | "low";
          reasoning: string;
        };
        Update: Partial<Database["public"]["Tables"]["validation_actions"]["Row"]>;
        Relationships: [];
      };
      validation_results: {
        Row: {
          id: string;
          validation_action_id: string;
          outcome_summary: string;
          new_evidence_ids: string[];
          affected_hypothesis_ids: string[];
          recorded_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["validation_results"]["Row"]> & {
          validation_action_id: string;
          outcome_summary: string;
        };
        Update: Partial<Database["public"]["Tables"]["validation_results"]["Row"]>;
        Relationships: [];
      };
      user_decisions: {
        Row: {
          id: string;
          business_idea_id: string;
          user_id: string;
          decision: "proceed" | "validate_further" | "modify_idea" | "reject";
          decision_basis: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["user_decisions"]["Row"]> & {
          business_idea_id: string;
          user_id: string;
          decision: "proceed" | "validate_further" | "modify_idea" | "reject";
        };
        Update: Partial<Database["public"]["Tables"]["user_decisions"]["Row"]>;
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          business_idea_id: string;
          user_id: string;
          snapshot: Record<string, unknown>;
          is_demo: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["reports"]["Row"]> & {
          business_idea_id: string;
          user_id: string;
          snapshot: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["reports"]["Row"]>;
        Relationships: [];
      };
      research_runs: {
        Row: {
          id: string;
          hypothesis_id: string;
          status: "queued" | "running" | "completed" | "partial" | "failed";
          started_at: string | null;
          completed_at: string | null;
          query_count: number;
          source_count: number;
          accepted_evidence_count: number;
          error: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["research_runs"]["Row"]> & {
          hypothesis_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["research_runs"]["Row"]>;
        Relationships: [];
      };
      research_tasks: {
        Row: {
          id: string;
          research_run_id: string;
          hypothesis_id: string;
          evidence_requirement_id: string | null;
          research_question: string;
          status: "pending" | "running" | "completed" | "failed";
          priority: "low" | "medium" | "high" | "critical";
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["research_tasks"]["Row"]> & {
          research_run_id: string;
          hypothesis_id: string;
          research_question: string;
        };
        Update: Partial<Database["public"]["Tables"]["research_tasks"]["Row"]>;
        Relationships: [];
      };
      research_queries: {
        Row: {
          id: string;
          research_task_id: string;
          query: string;
          reason: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["research_queries"]["Row"]> & {
          research_task_id: string;
          query: string;
          reason: string;
        };
        Update: Partial<Database["public"]["Tables"]["research_queries"]["Row"]>;
        Relationships: [];
      };
      research_sources: {
        Row: {
          id: string;
          research_task_id: string;
          research_query_id: string | null;
          source_url: string;
          source_title: string | null;
          domain: string | null;
          publication_date: string | null;
          retrieval_date: string;
          snippet: string | null;
          source_category:
            | "government"
            | "academic"
            | "company_filing"
            | "established_news"
            | "industry_organization"
            | "company_website"
            | "professional_publication"
            | "general_website"
            | "unknown";
          source_fingerprint: string;
          quality_score: number;
          status: "pending" | "retrieved" | "source_unavailable" | "duplicate";
          evidence_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["research_sources"]["Row"]> & {
          research_task_id: string;
          source_url: string;
          source_fingerprint: string;
        };
        Update: Partial<Database["public"]["Tables"]["research_sources"]["Row"]>;
        Relationships: [];
      };
      activity_logs: {
        Row: {
          id: string;
          user_id: string | null;
          project_id: string | null;
          event_type: string;
          entity_type: string | null;
          entity_id: string | null;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["activity_logs"]["Row"]> & {
          event_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["activity_logs"]["Row"]>;
        Relationships: [];
      };
    };
  };
}
