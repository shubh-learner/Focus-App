"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AuthForm() {
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="mb-1 text-2xl tracking-tight">Focus</h1>
      <p className="mb-8 text-sm text-muted">Your calm, topic-organized YouTube dashboard.</p>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      <button
        onClick={handleGoogle}
        disabled={loading}
        className="w-full rounded-md border border-line bg-card py-2 text-sm hover:bg-paper disabled:opacity-50"
      >
        {loading ? "Redirecting…" : "Continue with Google"}
      </button>
    </div>
  );
}