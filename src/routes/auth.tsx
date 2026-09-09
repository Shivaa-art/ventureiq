import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { SiteFooter } from "@/components/venture/site-footer";
import { requestPasswordReset, signIn, signUp } from "@/backend/auth/session";
import { redirectIfAuthenticated } from "@/lib/auth/require-auth";

type Mode = "signin" | "signup" | "reset";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: redirectIfAuthenticated,
  head: () => ({
    meta: [
      { title: "Sign in — VentureIQ" },
      {
        name: "description",
        content: "Sign in to VentureIQ to validate and track your business ideas.",
      },
      { property: "og:title", content: "Sign in — VentureIQ" },
      { property: "og:description", content: "Access your VentureIQ workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();

  function resetMessages() {
    setError(null);
    setSuccess(null);
  }

  function switchMode(next: Mode) {
    resetMessages();
    setPassword("");
    setConfirmPassword("");
    setMode(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetMessages();
    setLoading(true);

    try {
      if (mode === "reset") {
        const result = await requestPasswordReset({ data: { email } });
        if (result.error) {
          setError(result.error);
        } else {
          setSuccess("If an account exists for that email, a reset link is on its way.");
        }
        return;
      }

      if (mode === "signup") {
        const result = await signUp({ data: { email, password, confirmPassword } });
        if (result.error) {
          setError(result.error);
          return;
        }
        if (!result.user) {
          setSuccess("Account created. Check your email to confirm before signing in.");
          return;
        }
        navigate({ href: redirect || "/dashboard" });
        return;
      }

      // signin
      const result = await signIn({ data: { email, password } });
      if (result.error) {
        setError(result.error);
        return;
      }
      navigate({ href: redirect || "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const heading =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Create your workspace"
        : "Reset your password";
  const subheading =
    mode === "signin"
      ? "Sign in to continue validating."
      : mode === "signup"
        ? "Free forever — 2 reports per month."
        : "We'll email you a link to set a new password.";
  const submitLabel =
    mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="font-mono text-xl font-bold tracking-tighter">
            VENTURE<span className="text-primary">IQ</span>
          </Link>
          <Link
            to="/"
            className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ← Back home
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-6 py-16">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-8">
          <div className="mb-6 font-mono text-[10px] uppercase tracking-widest text-primary">
            {mode === "signin"
              ? "// Access terminal"
              : mode === "signup"
                ? "// Provision account"
                : "// Recover access"}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subheading}</p>

          {error && (
            <div className="mt-6 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 flex-none" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mt-6 flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              <CheckCircle2 className="mt-0.5 size-4 flex-none" />
              <span>{success}</span>
            </div>
          )}

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Email
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-md border border-border bg-input px-4 py-3 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                placeholder="founder@venture.io"
              />
            </label>

            {mode !== "reset" && (
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Password
                </span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="w-full rounded-md border border-border bg-input px-4 py-3 pr-11 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>
            )}

            {mode === "signup" && (
              <label className="block">
                <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Confirm password
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-md border border-border bg-input px-4 py-3 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                  placeholder="••••••••"
                />
              </label>
            )}

            {mode === "signin" && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => switchMode("reset")}
                  className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ boxShadow: "var(--glow-primary)" }}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  {submitLabel}
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" && (
              <>
                New to VentureIQ?{" "}
                <button
                  onClick={() => switchMode("signup")}
                  className="text-primary hover:underline"
                >
                  Create an account
                </button>
              </>
            )}
            {mode === "signup" && (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => switchMode("signin")}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
            {mode === "reset" && (
              <button onClick={() => switchMode("signin")} className="text-primary hover:underline">
                ← Back to sign in
              </button>
            )}
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
