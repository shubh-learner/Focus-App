"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthForm() {
  const supabase = createClient();
  const router = useRouter();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const { error } =
      mode === "sign_in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (mode === "sign_up") {
      setNotice("Check your email to confirm your account, then sign in.");
      setMode("sign_in");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-1 text-2xl tracking-tight">Focus</h1>
      <p className="mb-8 text-sm text-muted">Your calm, topic-organized YouTube dashboard.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {notice && <p className="text-sm text-accent">{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-ink py-2 text-sm text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        onClick={handleGoogle}
        className="mt-3 w-full rounded-md border border-line bg-card py-2 text-sm hover:bg-paper"
      >
        Continue with Google
      </button>

      <button
        onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
        className="mt-6 text-xs text-muted underline decoration-line underline-offset-4 hover:text-ink"
      >
        {mode === "sign_in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
