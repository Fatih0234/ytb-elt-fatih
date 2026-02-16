import { AuthButtons } from "@/components/auth-buttons";
import { createClient } from "@/lib/supabase/server";
import { ensureUserSetup } from "@/lib/core";
import { redirect } from "next/navigation";

export default async function Home({
  searchParams,
}: {
  // Next.js can pass searchParams as a Promise in some runtimes.
  searchParams?: Promise<{ auth_error?: string }> | { auth_error?: string };
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  let setupError: string | null = null;
  if (data.user) {
    // Prevent redirect loops: only redirect if DB setup succeeds.
    try {
      const setup = await ensureUserSetup();
      if (setup.profile?.onboarding_completed) {
        redirect("/app");
      } else {
        redirect("/onboarding");
      }
    } catch (e: unknown) {
      // Signed in, but DB/RLS might be misconfigured. Keep details minimal but actionable.
      const msg =
        typeof e === "object" && e && "message" in e
          ? String((e as { message?: unknown }).message)
          : String(e);
      setupError = msg || "setup_failed";
    }
  }

  const sp = searchParams ? await Promise.resolve(searchParams) : undefined;
  const authError = sp?.auth_error;

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

          {data.user && !authError ? (
            <div className="mt-8 rounded-2xl border px-4 py-3 text-sm"
              style={{
                borderColor: "var(--line)",
                background: "color-mix(in oklab, var(--panel) 86%, transparent)",
              }}
            >
              <div className="font-medium">Signed in, but setup failed.</div>
              <div className="mt-1 text-xs text-[color:var(--muted)]">
                This usually means the Supabase SQL migrations/RLS/RPCs weren’t applied correctly, or the app is pointed
                at the wrong Supabase project.
              </div>
              {setupError ? (
                <div className="mt-2 text-xs text-[color:var(--muted)]">
                  <div>
                    Error:{" "}
                    <span className="font-mono text-[color:var(--fg)]">
                      {setupError}
                    </span>
                  </div>
                  <div className="mt-1">
                    Next check: Supabase Dashboard{" "}
                    {" > "}Settings{" > "}API{" > "}Exposed schemas includes{" "}
                    <span className="font-mono text-[color:var(--fg)]">
                      core
                    </span>
                    .
                  </div>
                </div>
              ) : null}
              <div className="mt-3">
                <AuthButtons />
              </div>
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
