import Image from "next/image";
import { redirect } from "next/navigation";

import { ensureUserSetup } from "@/lib/core";
import { AuthButtons } from "@/components/auth-buttons";
import { Card, Mono, NavLink, Pill } from "@/components/ui";
import { TrackHandleForm, SmallActionForm } from "@/components/action-forms";
import {
  setInterestsAction,
  setDiscordWebhookAction,
  testDiscordWebhookActionState,
  finishOnboardingAction,
  trackHandleAction,
  trackHandleFormAction,
} from "@/app/(authed)/actions";

import suggestions from "@/data/suggested_channels.json";

type SuggestedChannels = {
  interests: Record<
    string,
    {
      label: string;
      hint: string;
      channels: Array<{
        handle: string;
        channel_id: string;
        title: string;
        thumbnail_url: string;
        subscriber_count: number | null;
        video_count: number | null;
      }>;
    }
  >;
};

const SUGGESTIONS = suggestions as unknown as SuggestedChannels;
type InterestKey = keyof typeof SUGGESTIONS.interests;

const INTERESTS: Array<{ key: InterestKey; label: string; hint: string }> =
  Object.entries(SUGGESTIONS.interests).map(([key, v]) => ({
    key: key as InterestKey,
    label: v.label,
    hint: v.hint,
  }));

export default async function OnboardingPage() {
  const { profile } = await ensureUserSetup();
  if (!profile) redirect("/");
  if (profile.onboarding_completed) redirect("/app");

  const selected = new Set((profile.interests || []) as string[]);

  const selectedChannels = INTERESTS.flatMap((i) => {
    if (!selected.has(i.key)) return [];
    const channels = SUGGESTIONS.interests[i.key]?.channels || [];
    return channels.map((c) => ({
      ...c,
      interestKey: i.key,
      interestLabel: i.label,
    }));
  });

  return (
    <div className="min-h-dvh bg-grid">
      <div className="mx-auto max-w-6xl px-6 py-10">
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
                Onboarding
              </div>
              <div className="text-xs text-neutral-500">
                Pick interests, connect Discord, add channels.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NavLink href="/app">Dashboard</NavLink>
            <NavLink href="/settings">Settings</NavLink>
            <div className="ml-2">
              <AuthButtons />
            </div>
          </div>
        </header>

        <main className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 flex flex-col gap-6">
            <Card
              title="1) Choose interests"
              subtitle="Used only for onboarding suggestions. You can change later."
            >
              <form action={setInterestsAction} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 gap-2">
                  {INTERESTS.map((i) => {
                    const checked = selected.has(i.key);
                    return (
                      <label
                        key={i.key}
                        className="flex items-start gap-3 rounded-2xl border px-4 py-3"
                        style={{
                          borderColor: "var(--line)",
                          background: checked
                            ? "color-mix(in oklab, var(--accent) 10%, transparent)"
                            : "color-mix(in oklab, var(--panel) 82%, transparent)",
                        }}
                      >
                        <input
                          type="checkbox"
                          name="interest"
                          value={i.key}
                          defaultChecked={checked}
                          className="mt-1.5"
                        />
                        <div>
                          <div className="text-sm font-semibold tracking-tight">
                            {i.label}
                          </div>
                          <div className="mt-0.5 text-xs text-neutral-500">
                            {i.hint}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-neutral-500">
                    Selected:{" "}
                    <span className="font-mono">
                      {Array.from(selected).join(", ") || "none"}
                    </span>
                  </div>
                  <button className="btn btn--primary" type="submit">
                    Save interests
                  </button>
                </div>
              </form>
            </Card>

            <Card
              title="2) Connect Discord"
              subtitle="Paste your Discord Incoming Webhook URL"
            >
              <div className="flex flex-col gap-3">
                <SmallActionForm action={setDiscordWebhookAction} okText="Saved.">
                  <div className="flex flex-col gap-3">
                    <input
                      name="discord_webhook_url"
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
                        Save webhook
                      </button>
                    </div>
                  </div>
                </SmallActionForm>

                <SmallActionForm action={testDiscordWebhookActionState} okText="Sent.">
                  <button className="btn btn--ghost" type="submit">
                    Send test message
                  </button>
                </SmallActionForm>

                <div className="text-xs text-neutral-500">
                  The pipeline will post alerts here (per user).
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-7 flex flex-col gap-6">
            <Card
              title="3) Add suggested channels"
              subtitle="Curated starter pack (handles only)"
            >
              {selectedChannels.length ? (
                <div className="flex flex-col gap-3">
                  {selectedChannels.map((c) => (
                    <div
                      key={`${c.channel_id}-${c.handle}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border px-3 py-3"
                      style={{
                        borderColor: "var(--line)",
                        background:
                          "color-mix(in oklab, var(--panel) 82%, transparent)",
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="relative h-10 w-10 overflow-hidden rounded-xl border"
                          style={{
                            borderColor: "var(--line)",
                            background: "rgba(255,255,255,0.06)",
                          }}
                        >
                          {c.thumbnail_url ? (
                            <Image
                              src={c.thumbnail_url}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold tracking-tight">
                            {c.title || c.handle}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                            <Mono>{c.handle}</Mono>
                            {c.subscriber_count != null ? (
                              <>
                                <span className="text-neutral-400">·</span>
                                <Pill>
                                  {Intl.NumberFormat().format(
                                    c.subscriber_count,
                                  )}{" "}
                                  subs
                                </Pill>
                              </>
                            ) : null}
                            <span className="text-neutral-400">·</span>
                            <Pill tone="neutral">{c.interestLabel}</Pill>
                          </div>
                        </div>
                      </div>

                      <form action={trackHandleFormAction}>
                        <input type="hidden" name="handle" value={c.handle} />
                        <button className="btn btn--primary" type="submit">
                          Add
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-neutral-500">
                  Pick at least one interest to see suggestions.
                </div>
              )}

              <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--line)" }}>
                <div className="text-xs text-neutral-500">
                  Or add a channel directly (handle-only):
                </div>
                <div className="mt-2">
                  <TrackHandleForm action={trackHandleAction} />
                </div>
              </div>
            </Card>

            <Card
              title="Finish"
              subtitle="You can always come back to settings."
            >
              <form action={finishOnboardingAction} className="flex items-center justify-between gap-4">
                <div className="text-xs text-neutral-500">
                  Once you finish, head to the dashboard and wait for ingestion.
                </div>
                <button className="btn btn--primary" type="submit">
                  Finish onboarding
                </button>
              </form>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
