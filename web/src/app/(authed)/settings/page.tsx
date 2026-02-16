import { redirect } from "next/navigation";

import { ensureUserSetup } from "@/lib/core";
import { AuthButtons } from "@/components/auth-buttons";
import { Card, Mono, NavLink, Pill } from "@/components/ui";
import { SmallActionForm } from "@/components/action-forms";
import {
  setDiscordWebhookAction,
  testDiscordWebhookActionState,
  setAlertPresetAction,
} from "@/app/(authed)/actions";

export default async function SettingsPage() {
  let profile;
  let supabase;
  let user;
  try {
    const setup = await ensureUserSetup();
    profile = setup.profile;
    supabase = setup.supabase;
    user = setup.user;
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e && "message" in e
        ? String((e as { message?: unknown }).message)
        : String(e);
    return (
      <div className="min-h-dvh bg-grid">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Card
            title="Settings setup error"
            subtitle="Signed in, but the app could not load your settings."
          >
            <div
              className="rounded-xl border px-4 py-3 font-mono text-xs"
              style={{
                borderColor: "var(--line)",
                background: "color-mix(in oklab, var(--panel) 85%, transparent)",
              }}
            >
              {msg}
            </div>
            <div className="mt-5">
              <AuthButtons />
            </div>
          </Card>
        </div>
      </div>
    );
  }
  if (!profile) redirect("/");
  if (!profile.onboarding_completed) redirect("/onboarding");

  const core = supabase.schema("core");
  const { data: wl } = await core
    .from("watchlists")
    .select("discord_webhook_url")
    .eq("watchlist_id", user.id)
    .maybeSingle();

  const webhook = String(
    (wl as { discord_webhook_url?: string | null } | null)?.discord_webhook_url ||
      "",
  );

  return (
    <div className="min-h-dvh bg-grid">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-2xl border grid place-items-center"
              style={{
                borderColor: "var(--line)",
                background: "color-mix(in oklab, var(--panel) 80%, transparent)",
              }}
            >
              <span className="text-sm font-semibold">YT</span>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">
                Settings
              </div>
              <div className="text-xs text-neutral-500">
                Discord + alert sensitivity.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NavLink href="/app">Dashboard</NavLink>
            <NavLink href="/settings" active>
              Settings
            </NavLink>
            <div className="ml-2">
              <AuthButtons />
            </div>
          </div>
        </header>

        <main className="mt-8 flex flex-col gap-6">
          <Card
            title="Discord webhook"
            subtitle="Where alerts will be delivered for your watchlist"
          >
            <div className="flex flex-col gap-3">
              <SmallActionForm action={setDiscordWebhookAction} okText="Saved.">
                <div className="flex flex-col gap-3">
                  <input
                    name="discord_webhook_url"
                    defaultValue={webhook}
                    placeholder="https://discord.com/api/webhooks/…"
                    spellCheck={false}
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                    style={{
                      borderColor: "var(--line)",
                      background:
                        "color-mix(in oklab, var(--panel) 85%, transparent)",
                    }}
                  />
                  <div className="flex items-center justify-end gap-3">
                    <button className="btn btn--primary" type="submit">
                      Save
                    </button>
                  </div>
                </div>
              </SmallActionForm>

              <SmallActionForm
                action={testDiscordWebhookActionState}
                okText="Sent."
              >
                <button className="btn btn--ghost" type="submit">
                  Send test message
                </button>
              </SmallActionForm>

              <div className="text-xs text-neutral-500">
                Stored in <Mono>core.watchlists.discord_webhook_url</Mono>.
              </div>
            </div>
          </Card>

          <Card
            title="Alert sensitivity"
            subtitle="Presets write per-video-type rules (long vs short)"
          >
            <SmallActionForm action={setAlertPresetAction} okText="Saved.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  {
                    id: "conservative",
                    title: "Conservative",
                    desc: "Fewer pings. High floor + high multiplier.",
                    pill: <Pill tone="neutral">quiet</Pill>,
                  },
                  {
                    id: "default",
                    title: "Default",
                    desc: "Balanced thresholds.",
                    pill: <Pill tone="good">recommended</Pill>,
                  },
                  {
                    id: "aggressive",
                    title: "Aggressive",
                    desc: "More pings. Lower floor + lower multiplier.",
                    pill: <Pill tone="warn">noisy</Pill>,
                  },
                ].map((p) => (
                  <label
                    key={p.id}
                    className="rounded-2xl border px-4 py-3"
                    style={{
                      borderColor: "var(--line)",
                      background:
                        "color-mix(in oklab, var(--panel) 82%, transparent)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold tracking-tight">
                        {p.title}
                      </div>
                      {p.pill}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {p.desc}
                    </div>
                    <div className="mt-3">
                      <input
                        type="radio"
                        name="preset"
                        value={p.id}
                        defaultChecked={p.id === "default"}
                      />{" "}
                      <span className="text-xs text-neutral-600">
                        Select
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-end">
                <button className="btn btn--primary" type="submit">
                  Apply preset
                </button>
              </div>
            </SmallActionForm>

            <div className="mt-4 text-xs text-neutral-500">
              Stored in <Mono>core.alert_rules</Mono> and read by Airflow.
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}
