import Image from "next/image";
import { redirect } from "next/navigation";

import { ensureUserSetup } from "@/lib/core";
import { AuthButtons } from "@/components/auth-buttons";
import { Card, Mono, NavLink, Pill } from "@/components/ui";
import { TrackHandleForm } from "@/components/action-forms";
import {
  trackHandleAction,
  untrackChannelAction,
} from "@/app/(authed)/actions";

type ChannelStatusRow = {
  channel_id: string;
  title: string | null;
  handle: string | null;
  thumbnail_url: string | null;
  subscriber_count: number | null;
  last_snapshot_at: string | null;
  videos_count: number | null;
};

type TopMoverRow = {
  video_id: string;
  title: string | null;
  channel_id: string;
  channel_title: string | null;
  video_type: string | null;
  pulled_at_now: string | null;
  views_now: number | null;
  views_per_hour: number | null;
  published_at: string | null;
};

type RecentAlertRow = {
  sent_at: string;
  channel_id: string;
  channel_title: string | null;
  video_id: string;
  video_title: string | null;
  rule_type: string;
};

async function rpcOrEmpty<T>(
  fn: () => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  try {
    const { data, error } = await fn();
    if (error) return [];
    return (data || []) as T[];
  } catch {
    return [];
  }
}

export default async function AppPage() {
  let supabase: Awaited<ReturnType<typeof ensureUserSetup>>["supabase"];
  let profile: Awaited<ReturnType<typeof ensureUserSetup>>["profile"];
  try {
    const setup = await ensureUserSetup();
    supabase = setup.supabase;
    profile = setup.profile;
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e && "message" in e
        ? String((e as { message?: unknown }).message)
        : String(e);
    return (
      <div className="min-h-dvh bg-grid">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <Card
            title="App setup error"
            subtitle="You are signed in, but the app could not read/write its tables."
          >
            <div className="text-sm">
              <div className="text-[color:var(--muted)]">
                Error:
              </div>
              <div className="mt-2 rounded-xl border px-4 py-3 font-mono text-xs"
                style={{ borderColor: "var(--line)", background: "color-mix(in oklab, var(--panel) 85%, transparent)" }}
              >
                {msg}
              </div>
              <div className="mt-4 text-xs text-[color:var(--muted)]">
                Check that the Supabase migrations in <Mono>/supabase/migrations</Mono> were pushed to the same project
                your <Mono>NEXT_PUBLIC_SUPABASE_URL</Mono> points to.
              </div>
              <div className="mt-5">
                <AuthButtons />
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!profile) {
    redirect("/");
  }
  if (!profile.onboarding_completed) redirect("/onboarding");

  const core = supabase.schema("core");

  const tracked = await rpcOrEmpty<ChannelStatusRow>(() =>
    core.rpc("get_tracked_channels_status"),
  );
  const movers = await rpcOrEmpty<TopMoverRow>(() =>
    core.rpc("get_top_movers", { limit_rows: 20 }),
  );
  const recentAlerts = await rpcOrEmpty<RecentAlertRow>(() =>
    core.rpc("get_recent_alerts", { limit_rows: 20 }),
  );

  return (
    <div className="min-h-dvh bg-grid">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl border grid place-items-center"
              style={{ borderColor: "var(--line)", background: "color-mix(in oklab, var(--panel) 80%, transparent)" }}
            >
              <span className="text-sm font-semibold">YT</span>
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">
                YT Watch
              </div>
              <div className="text-xs text-neutral-500">
                Velocity spikes. Discord alerts. Every 15 minutes.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NavLink href="/app" active>
              Dashboard
            </NavLink>
            <NavLink href="/settings">Settings</NavLink>
            <div className="ml-2">
              <AuthButtons />
            </div>
          </div>
        </header>

        <main className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 flex flex-col gap-6">
            <Card
              title="Add a channel"
              subtitle="Handle-only. Example: @MrBeast"
            >
              <TrackHandleForm action={trackHandleAction} />
              <div className="mt-4 text-xs text-neutral-500">
                Tip: keep it exact. This does <span className="font-mono">channels.list(forHandle=...)</span>, not search.
              </div>
            </Card>

            <Card
              title="Tracked channels"
              subtitle={
                tracked.length
                  ? `${tracked.length} channel${tracked.length === 1 ? "" : "s"}`
                  : "No channels yet"
              }
            >
              {tracked.length ? (
                <div className="flex flex-col gap-3">
                  {tracked.map((c) => (
                    <div
                      key={c.channel_id}
                      className="flex items-center justify-between gap-4 rounded-2xl border px-3 py-3"
                      style={{
                        borderColor: "var(--line)",
                        background:
                          "color-mix(in oklab, var(--panel) 82%, transparent)",
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative h-10 w-10 overflow-hidden rounded-xl border"
                          style={{ borderColor: "var(--line)", background: "rgba(255,255,255,0.06)" }}
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
                            {c.title || "Untitled"}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                            {c.handle ? <Mono>{c.handle}</Mono> : null}
                            <span className="text-neutral-400">·</span>
                            <Mono>{c.channel_id}</Mono>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {c.subscriber_count != null ? (
                              <Pill tone="neutral">
                                {Intl.NumberFormat().format(c.subscriber_count)} subs
                              </Pill>
                            ) : null}
                            {c.videos_count != null ? (
                              <Pill tone="neutral">
                                {Intl.NumberFormat().format(c.videos_count)} videos
                              </Pill>
                            ) : null}
                            {c.last_snapshot_at ? (
                              <Pill tone="good">ingesting</Pill>
                            ) : (
                              <Pill tone="warn">no snapshots yet</Pill>
                            )}
                          </div>
                        </div>
                      </div>

                      <form action={untrackChannelAction}>
                        <input
                          type="hidden"
                          name="channel_id"
                          value={c.channel_id}
                        />
                        <button className="btn btn--ghost" type="submit">
                          Remove
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-neutral-500">
                  Add your first channel above.
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-7 flex flex-col gap-6">
            <Card
              title="Top movers"
              subtitle="Highest views/hour from the latest two snapshots"
            >
              {movers.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500">
                        <th className="pb-2">Video</th>
                        <th className="pb-2">Channel</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Views/h</th>
                        <th className="pb-2">Views</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movers.map((m) => (
                        <tr key={m.video_id} className="border-t" style={{ borderColor: "var(--line)" }}>
                          <td className="py-2 pr-4">
                            <a
                              href={`https://www.youtube.com/watch?v=${m.video_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block max-w-[360px] truncate font-medium hover:underline"
                            >
                              {m.title || m.video_id}
                            </a>
                            <div className="mt-0.5 text-xs text-neutral-500">
                              <Mono>{m.video_id}</Mono>
                            </div>
                          </td>
                          <td className="py-2 pr-4">
                            <div className="truncate max-w-[220px]">
                              {m.channel_title || m.channel_id}
                            </div>
                            <div className="mt-0.5 text-xs text-neutral-500">
                              <Mono>{m.channel_id}</Mono>
                            </div>
                          </td>
                          <td className="py-2 pr-4">
                            <Pill tone="neutral">{m.video_type || "?"}</Pill>
                          </td>
                          <td className="py-2 pr-4 tabular-nums">
                            {m.views_per_hour != null
                              ? Intl.NumberFormat().format(Math.round(m.views_per_hour))
                              : "—"}
                          </td>
                          <td className="py-2 tabular-nums">
                            {m.views_now != null
                              ? Intl.NumberFormat().format(m.views_now)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-neutral-500">
                  No movers yet. Wait for ingestion to create snapshots.
                </div>
              )}
            </Card>

            <Card title="Recent alerts" subtitle="Deduped by alerts_sent">
              {recentAlerts.length ? (
                <div className="flex flex-col gap-2">
                  {recentAlerts.map((a) => (
                    <div
                      key={`${a.sent_at}-${a.video_id}`}
                      className="rounded-2xl border px-4 py-3"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <div className="text-sm font-medium">
                        {a.channel_title || a.channel_id}:{" "}
                        <a
                          className="hover:underline"
                          href={`https://www.youtube.com/watch?v=${a.video_id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.video_title || a.video_id}
                        </a>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
                        <Pill tone="neutral">{a.rule_type}</Pill>
                        <span className="text-neutral-400">·</span>
                        <Mono>{new Date(a.sent_at).toISOString()}</Mono>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-neutral-500">
                  No alerts sent yet.
                </div>
              )}
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
