"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureUserSetup } from "@/lib/core";
import { resolveChannelByHandle } from "@/lib/youtube";
import { sendDiscordWebhook } from "@/lib/discord";

export type ActionResult = { ok: true } | { ok: false; message: string };

function ok(): ActionResult {
  return { ok: true };
}

function fail(message: string): ActionResult {
  return { ok: false, message };
}

export async function setInterestsAction(formData: FormData): Promise<void> {
  const interests = formData.getAll("interest").map(String);
  const { supabase, user } = await ensureUserSetup();
  const core = supabase.schema("core");

  const { error } = await core
    .from("user_profiles")
    .update({ interests, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) {
    // Keep onboarding resilient; surface errors later via server logs.
    return;
  }

  revalidatePath("/onboarding");
  revalidatePath("/app");
}

export async function setDiscordWebhookAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const webhook = String(formData.get("discord_webhook_url") || "").trim();
  const { supabase, user } = await ensureUserSetup();
  const core = supabase.schema("core");

  const { error } = await core
    .from("watchlists")
    .update({
      discord_webhook_url: webhook,
      updated_at: new Date().toISOString(),
    })
    .eq("watchlist_id", user.id);
  if (error) return fail(error.message);

  revalidatePath("/onboarding");
  revalidatePath("/settings");
  return ok();
}

export async function testDiscordWebhookAction(): Promise<ActionResult> {
  try {
    const { supabase, user } = await ensureUserSetup();
    const core = supabase.schema("core");
    const { data: wl, error } = await core
      .from("watchlists")
      .select("discord_webhook_url")
      .eq("watchlist_id", user.id)
      .maybeSingle();
    if (error) return fail(error.message);

    const webhook = String(
      (wl as { discord_webhook_url?: string | null } | null)?.discord_webhook_url ||
        "",
    ).trim();
    if (!webhook) return fail("Missing Discord webhook URL");
    await sendDiscordWebhook(webhook, "yt-watch: webhook test OK");
    return ok();
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e && "message" in e
        ? String((e as { message?: unknown }).message)
        : String(e);
    return fail(msg);
  }
}

export async function testDiscordWebhookActionState(
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  void _prev;
  void _formData;
  return testDiscordWebhookAction();
}

export async function finishOnboardingAction(): Promise<void> {
  const { supabase, user } = await ensureUserSetup();
  const core = supabase.schema("core");

  await core
    .from("user_profiles")
    .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  revalidatePath("/onboarding");
  revalidatePath("/app");
  redirect("/app");
}

export async function trackHandleAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return trackHandleImpl(formData);
}

export async function trackHandleFormAction(formData: FormData): Promise<void> {
  await trackHandleImpl(formData);
  revalidatePath("/app");
  revalidatePath("/onboarding");
}

async function trackHandleImpl(formData: FormData): Promise<ActionResult> {
  const handle = String(formData.get("handle") || "").trim();
  let resolved;
  try {
    resolved = await resolveChannelByHandle(handle);
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e && "message" in e
        ? String((e as { message?: unknown }).message)
        : String(e);
    return fail(msg);
  }
  if (!resolved) return fail("No channel found for that @handle");

  const { supabase, user } = await ensureUserSetup();
  const core = supabase.schema("core");

  const { error: upsertErr } = await core.from("channels").upsert(
    {
      channel_id: resolved.channel_id,
      title: resolved.title,
      uploads_playlist_id: resolved.uploads_playlist_id,
      handle: resolved.handle,
      thumbnail_url: resolved.thumbnail_url,
      subscriber_count: resolved.subscriber_count,
      video_count: resolved.video_count,
      view_count: resolved.view_count,
      last_resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_id" },
  );
  if (upsertErr) return fail(upsertErr.message);

  const { error: mapErr } = await core.from("watchlist_channels").upsert(
    { watchlist_id: user.id, channel_id: resolved.channel_id },
    { onConflict: "watchlist_id,channel_id" },
  );
  if (mapErr) return fail(mapErr.message);

  revalidatePath("/app");
  revalidatePath("/onboarding");
  return ok();
}

export async function untrackChannelAction(formData: FormData): Promise<void> {
  const channelId = String(formData.get("channel_id") || "");
  const { supabase, user } = await ensureUserSetup();
  const core = supabase.schema("core");

  await core
    .from("watchlist_channels")
    .delete()
    .eq("watchlist_id", user.id)
    .eq("channel_id", channelId);

  revalidatePath("/app");
}

export async function setAlertPresetAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const preset = String(formData.get("preset") || "default");
  const { supabase, user } = await ensureUserSetup();
  const core = supabase.schema("core");

  const presets: Record<
    string,
    { long: { floor: number; mult: number }; short: { floor: number; mult: number } }
  > = {
    conservative: { long: { floor: 8000, mult: 3.0 }, short: { floor: 15000, mult: 3.5 } },
    default: { long: { floor: 5000, mult: 2.5 }, short: { floor: 10000, mult: 3.0 } },
    aggressive: { long: { floor: 1500, mult: 1.6 }, short: { floor: 2500, mult: 1.8 } },
  };

  const p = presets[preset] ?? presets.default;

  const { error } = await core.from("alert_rules").upsert(
    [
      {
        watchlist_id: user.id,
        video_type: "long",
        multiplier: p.long.mult,
        abs_floor_vph: p.long.floor,
        min_age_minutes: 30,
        max_age_hours: 24,
        updated_at: new Date().toISOString(),
      },
      {
        watchlist_id: user.id,
        video_type: "short",
        multiplier: p.short.mult,
        abs_floor_vph: p.short.floor,
        min_age_minutes: 15,
        max_age_hours: 12,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "watchlist_id,video_type" },
  );
  if (error) return fail(error.message);

  revalidatePath("/settings");
  return ok();
}
