// =====================================================================
// Server-only Supabase client factory.
//
// SECURITY: this file must never be imported from a route component,
// a client-side hook, or anything bundled for the browser. It reads
// SUPABASE_SERVICE_ROLE_KEY, which must NEVER reach the client bundle.
// Everything under src/backend/ is intended to run only inside
// TanStack Start server functions / the server entry (src/server.ts).
//
// The runtime guard below is a deliberate belt-and-suspenders check:
// if this module is ever accidentally pulled into a browser bundle,
// it throws immediately instead of silently leaking a key.
// =====================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

if (typeof window !== "undefined") {
  throw new Error(
    "src/backend/db/client.ts was imported into a browser bundle. " +
      "This module reads server-only secrets and must only be used inside src/backend/.",
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `See .env.example — VentureIQ's server-side pipeline cannot run without it.`,
    );
  }
  return value;
}

let serviceClient: SupabaseClient<Database> | null = null;

/**
 * Service-role client. Bypasses Row Level Security entirely — this is
 * intentional: background pipeline jobs (idea structuring, hypothesis
 * generation, evidence collection, scoring) run as the system, not as
 * a specific authenticated user, and write across multiple users'
 * projects only within a single project's own scope, enforced in
 * application code (repositories always filter/write by an explicit
 * project_id / business_idea_id passed in, never a blanket query).
 *
 * Never expose this client, or the key it wraps, to the browser.
 */
export function getSupabaseServiceClient(): SupabaseClient<Database> {
  if (serviceClient) return serviceClient;

  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  serviceClient = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}

/**
 * Per-request client scoped to the signed-in user's access token, so
 * Postgres RLS policies (auth.uid()) apply exactly as they would for a
 * direct browser call. Use this for server functions that should only
 * ever see what the requesting user is allowed to see — e.g. "list my
 * projects" — rather than routing everything through the service
 * client and re-implementing authorization by hand.
 */
export function getSupabaseUserClient(accessToken: string): SupabaseClient<Database> {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
