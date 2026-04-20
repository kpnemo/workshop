// packages/admin-panel/src/pages/LoginPage.tsx
import { useState } from "react";
import { useAuth } from "../hooks/use-auth.js";
import { ApiError } from "../lib/api.js";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You do not have access to the admin panel.");
      } else if (err instanceof ApiError && err.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError("Unexpected error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <form onSubmit={onSubmit} className="w-full max-w-sm bg-surface border border-border rounded-lg p-6 space-y-4">
        <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
        <label className="block space-y-1">
          <span className="text-sm text-muted">Email</span>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-muted">Password</span>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
        </label>
        {error && <div role="alert" className="text-sm text-red-400">{error}</div>}
        <button type="submit" disabled={submitting}
          className="w-full bg-primary text-primary-foreground rounded px-3 py-2 font-medium disabled:opacity-50">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
