import { createClient } from "@/lib/supabase/server";

export type UserProfile = {
  user_id: string;
  email: string | null;
  interests: string[];
  onboarding_completed: boolean;
};

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

  await core.from("user_profiles").upsert(
    {
      user_id: user.id,
      email: user.email ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  await core.from("watchlists").upsert(
    {
      watchlist_id: user.id,
      user_id: user.id,
      enabled: true,
      video_types: ["long", "short"],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "watchlist_id" },
  );

  // Optional: if alert_rules exists, seed default rules.
  try {
    await core.from("alert_rules").upsert(
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
  } catch {
    // ignore until migrations applied
  }

  const { data: prof } = await core
    .from("user_profiles")
    .select("user_id,email,interests,onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();

  return { supabase, user, profile: (prof as UserProfile | null) };
}

