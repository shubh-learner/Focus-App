import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Regular server client — respects the logged-in user's RLS permissions.
// Use this in API routes / server components that act "as the user".
export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // called from a Server Component; middleware refreshes the session instead
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // ignore, see above
          }
        },
      },
    }
  );
}

// Admin client — bypasses RLS using the service role key.
// ONLY use this server-side, and only for trusted system tasks
// (writing to the shared `channels` / `videos` cache from the cron route).
// NEVER import this file into client components.
import { createClient as createRawClient } from "@supabase/supabase-js";

export function createAdminSupabase() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
