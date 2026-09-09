// =====================================================================
// requireAuth — shared beforeLoad guard for protected routes.
//
// Deliberately self-contained: it calls the getServerSession server
// function itself and returns { user } as this route's own context,
// rather than depending on root-level context propagation. That keeps
// it correct under `tsc --noEmit` without needing the TanStack Router
// codegen (routeTree.gen.ts) to be regenerated for every route file
// touched — each route's own beforeLoad return type is inferred
// locally by TypeScript regardless of the parent chain.
//
// Enforced server-side: getServerSession reads the actual Supabase
// session from cookies on the request, so this is a real redirect
// backed by an authoritative check, not a client-side-only visibility
// toggle.
// =====================================================================

import { redirect } from "@tanstack/react-router";
import { getServerSession } from "@/backend/auth/session";
import type { AuthUser } from "@/lib/types/auth";

export async function requireAuth({
  location,
}: {
  location: { href: string };
}): Promise<{ user: AuthUser }> {
  const { user } = await getServerSession();
  if (!user) {
    throw redirect({ href: `/auth?redirect=${encodeURIComponent(location.href)}` });
  }
  return { user };
}

/**
 * Inverse guard for /auth itself: if the visitor already has a valid
 * session, sitting on the sign-in form is pointless — send them
 * straight to the dashboard (or wherever they were headed).
 */
export async function redirectIfAuthenticated({
  search,
}: {
  search: { redirect?: string };
}): Promise<{ user: AuthUser | null }> {
  const { user } = await getServerSession();
  if (user) {
    throw redirect({ href: search.redirect || "/dashboard" });
  }
  return { user: null };
}
