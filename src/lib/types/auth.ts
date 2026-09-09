// =====================================================================
// Auth-related types shared between server functions and route
// components. Deliberately minimal — only what the UI needs to render,
// never the full Supabase user object (which can carry more than we
// want to serialize to the client).
// =====================================================================

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string | null;
}

export interface AuthResult {
  user: AuthUser | null;
  error: string | null;
}
