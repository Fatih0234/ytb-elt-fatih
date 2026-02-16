import { createClient } from "@/lib/supabase/server";

export type UserProfile = {
  user_id: string;
  email: string | null;
  interests: string[];
  onboarding_completed: boolean;
};

type PostgrestErrorLike = { message: string; code?: string };

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("not_authenticated");
  return { supabase, user: data.user };
}

export async function ensureUserSetup() {
  const { supabase, user } = await requireUser();
  const core = supabase.schema("core");

  const { error: profUpsertErr } = await core.from("user_profiles").upsert(
    {
      user_id: user.id,
      email: user.email ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (profUpsertErr) {
    throw new Error(`db_error:user_profiles:${(profUpsertErr as PostgrestErrorLike).message}`);
  }

  const { error: wlUpsertErr } = await core.from("watchlists").upsert(
    {
      watchlist_id: user.id,
      user_id: user.id,
      enabled: true,
      video_types: ["long", "short"],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "watchlist_id" },
  );
  if (wlUpsertErr) {
    throw new Error(`db_error:watchlists:${(wlUpsertErr as PostgrestErrorLike).message}`);
  }

  // Seed default alert rules (safe to re-run).
  const { error: rulesErr } = await core.from("alert_rules").upsert(
    [
      {
        watchlist_id: user.id,
        video_type: "long",
        multiplier: 2.5,
        abs_floor_vph: 5000,
        min_age_minutes: 30,
        max_age_hours: 24,
        updated_at: new Date().toISOString(),
      },
      {
        watchlist_id: user.id,
        video_type: "short",
        multiplier: 3.0,
        abs_floor_vph: 10000,
        min_age_minutes: 15,
        max_age_hours: 12,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "watchlist_id,video_type" },
  );
  if (rulesErr) {
    const code = (rulesErr as PostgrestErrorLike).code || "";
    // If migrations aren't applied yet, allow the app to continue.
    if (code !== "42P01") {
      throw new Error(`db_error:alert_rules:${(rulesErr as PostgrestErrorLike).message}`);
    }
  }

  const { data: prof, error: profSelErr } = await core
    .from("user_profiles")
    .select("user_id,email,interests,onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profSelErr) {
    throw new Error(`db_error:user_profiles_select:${(profSelErr as PostgrestErrorLike).message}`);
  }
  if (!prof) {
    throw new Error("db_error:user_profile_missing");
  }

  return { supabase, user, profile: (prof as UserProfile | null) };
}
