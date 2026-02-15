"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthState =
  | { kind: "loading" }
  | { kind: "anon" }
  | { kind: "authed"; email: string | null };

export function AuthButtons() {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const email = data.session?.user?.email ?? null;
      setState(data.session ? { kind: "authed", email } : { kind: "anon" });
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email ?? null;
      setState(session ? { kind: "authed", email } : { kind: "anon" });
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }, [supabase]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    await supabase.auth.signOut();
    window.location.href = "/";
  }, [supabase]);

  if (state.kind === "loading") {
    return <div className="text-xs text-neutral-500">Loading…</div>;
  }

  if (state.kind === "anon") {
    return (
      <button className="btn btn--primary" onClick={signIn} type="button">
        Sign in with Google
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="hidden sm:block text-xs text-neutral-500">
        {state.email ?? "Signed in"}
      </div>
      <button className="btn btn--ghost" onClick={signOut} type="button">
        Sign out
      </button>
    </div>
  );
}

