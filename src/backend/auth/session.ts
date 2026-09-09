// =====================================================================
// Auth server functions (Phase 2).
//
// These are the only entry points the frontend uses for authentication.
// Each one runs entirely server-side against the request-scoped
// Supabase SSR client (src/backend/auth/supabase-server-client.ts), so
// session cookies are read/written correctly as part of the same HTTP
// request/response — no separate token-storage dance on the client.
// =====================================================================

import { createServerFn } from "@tanstack/react-start";
import { getSupabaseServerClient } from "@/backend/auth/supabase-server-client";
import { getSupabaseServiceClient } from "@/backend/db/client";
import type { AuthResult, AuthUser } from "@/lib/types/auth";
import { z } from "zod";

const SignUpInputSchema = z
  .object({
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const SignInInputSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

const ResetPasswordInputSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

function toAuthUser(user: {
  id: string;
  email?: string | null;
  created_at?: string | null;
}): AuthUser {
  return { id: user.id, email: user.email ?? "", createdAt: user.created_at ?? null };
}

/**
 * Ensures a public.users profile row exists for a freshly authenticated
 * user. Uses the service-role client deliberately: the public.users
 * table has no INSERT policy for the authenticated role (see
 * migration 0001), because ordinary application code should never be
 * able to fabricate arbitrary profile rows — only this system-owned
 * sync step, right after Supabase Auth itself has confirmed the user's
 * identity, is allowed to create one.
 */
async function ensureUserProfile(user: AuthUser): Promise<void> {
  const service = getSupabaseServiceClient();
  await service.from("users").upsert({ id: user.id, email: user.email }, { onConflict: "id" });
}

export const getServerSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ user: AuthUser | null }> => {
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return { user: user ? toAuthUser(user) : null };
  },
);

/**
 * For use inside OTHER server functions (project/pipeline mutations,
 * etc.) that must verify the caller is authenticated before touching
 * the database — route-level beforeLoad guards protect page navigation,
 * but a server function can be invoked directly, so each mutating
 * function that isn't itself the auth flow re-checks here.
 */
export async function requireServerUser(): Promise<AuthUser> {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated.");
  }
  return toAuthUser(user);
}

export const signUp = createServerFn({ method: "POST" })
  .validator((data: unknown) => SignUpInputSchema.parse(data))
  .handler(async ({ data }): Promise<AuthResult> => {
    const supabase = getSupabaseServerClient();
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    });

    if (error) {
      return { user: null, error: error.message };
    }
    if (!signUpData.user) {
      // Email confirmation is required before a session exists.
      return {
        user: null,
        error: "Check your email to confirm your account before signing in.",
      };
    }

    const user = toAuthUser(signUpData.user);
    await ensureUserProfile(user);
    return { user, error: null };
  });

export const signIn = createServerFn({ method: "POST" })
  .validator((data: unknown) => SignInInputSchema.parse(data))
  .handler(async ({ data }): Promise<AuthResult> => {
    const supabase = getSupabaseServerClient();
    const { data: signInData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      return { user: null, error: error.message };
    }

    const user = toAuthUser(signInData.user);
    await ensureUserProfile(user);
    return { user, error: null };
  });

export const signOut = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ error: string | null }> => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    return { error: error?.message ?? null };
  },
);

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((data: unknown) => ResetPasswordInputSchema.parse(data))
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const supabase = getSupabaseServerClient();
    const siteUrl = process.env.SITE_URL ?? "";
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: siteUrl ? `${siteUrl}/auth?mode=reset` : undefined,
    });
    // Deliberately return success even if the email doesn't exist, to
    // avoid leaking which addresses have accounts.
    return { error: error ? error.message : null };
  });
