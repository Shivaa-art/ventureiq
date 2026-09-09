// =====================================================================
// Server-only Supabase SSR client.
//
// Unlike src/backend/db/client.ts (which uses the service-role key and
// bypasses RLS for background pipeline jobs), this client is scoped to
// the requesting browser's own session via cookies — it reads/writes
// the Supabase auth cookies on the current request/response using
// TanStack Start's request-scoped cookie helpers. Every auth action
// (sign up, sign in, sign out, get current user) goes through this
// client so Postgres RLS (auth.uid()) applies exactly as it would for
// a direct call from the browser.
//
// SECURITY: reads only the anon key (safe-ish, RLS-scoped) — never the
// service-role key. Still server-only because it needs access to the
// request's cookies, which aren't available in the browser bundle in
// the same way.
// =====================================================================

import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/start-server-core/request-response";
import type { Database } from "@/lib/types/database";

if (typeof window !== "undefined") {
  throw new Error(
    "src/backend/auth/supabase-server-client.ts was imported into a browser bundle. " +
      "This module must only be used inside src/backend/.",
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}". See .env.example.`);
  }
  return value;
}

/**
 * Creates a fresh Supabase client for the current request. Per the
 * @supabase/ssr docs, a new client must be created on every server
 * render/request rather than shared/cached — it captures this
 * request's cookies via closures over getCookies/setCookie.
 */
export function getSupabaseServerClient() {
  const url = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        const cookies = getCookies();
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
          });
        }
      },
    },
  });
}
