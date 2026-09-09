// =====================================================================
// Minimal API-layer server function (Phase 1).
//
// Not wired into any route yet — Phase 16 is where existing routes get
// connected to real server functions. This file exists purely to prove
// the server-function -> service -> repository -> Supabase chain
// actually type-checks and runs end to end before frontend work begins.
// =====================================================================

import { createServerFn } from "@tanstack/react-start";

export const getPipelineHealth = createServerFn({ method: "GET" }).handler(async () => {
  const requiredEnv = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
  ];
  const missing = requiredEnv.filter((key) => !process.env[key]);

  return {
    ok: missing.length === 0,
    missingEnvVars: missing,
    checkedAt: new Date().toISOString(),
  };
});
