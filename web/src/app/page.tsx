import { AuthButtons } from "@/components/auth-buttons";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  searchParams?: { auth_error?: string };
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    redirect("/app");
  }

  const authError = searchParams?.auth_error;

  return (
    <div className="min-h-dvh bg-grid">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <header className="flex items-center justify-between">
          <div className="text-sm tracking-tight text-[color:var(--muted)]">
            YT Watch
          </div>
          <AuthButtons />
        </header>

        <main className="mt-14">
          <div
            className="rounded-[28px] border px-6 py-7 sm:px-8 sm:py-8"
            style={{
              borderColor: "var(--line)",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--panel) 92%, transparent), color-mix(in oklab, var(--panel) 78%, transparent))",
              backdropFilter: "blur(10px)",
            }}
          >
            <h1 className="text-balance text-4xl sm:text-5xl leading-[1.05] font-semibold tracking-tight">
              Track YouTube channels. Get Discord alerts when videos spike.
            </h1>
            <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-[color:var(--muted)]">
              Add channels by{" "}
              <span className="font-mono text-[color:var(--fg)]">@handle</span>.
              The pipeline ingests every 15 minutes and computes velocity spikes
              from stats snapshots.
            </p>
          </div>

          {authError ? (
            <div className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {authError}
            </div>
          ) : null}

          <div className="mt-10 flex items-center gap-3">
            <AuthButtons />
            <div className="text-xs text-[color:var(--muted)]">
              No accounts to manage. Sign in is just to keep your watchlist private.
            </div>
          </div>
        </main>

        <footer className="mt-20 text-xs text-[color:var(--muted)]">
          V1: Google Auth, onboarding, per-user watchlists, per-user Discord webhook.
        </footer>
      </div>
    </div>
  );
}
