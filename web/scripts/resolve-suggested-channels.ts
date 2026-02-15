import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

type Seed = {
  interests: Record<
    string,
    { label: string; hint?: string; handles: string[] }
  >;
};

type YTThumbnail = { url?: string };
type YTThumbnails = {
  high?: YTThumbnail;
  medium?: YTThumbnail;
  default?: YTThumbnail;
};
type YTChannelSnippet = { title?: string; thumbnails?: YTThumbnails };
type YTChannelStatistics = {
  subscriberCount?: string;
  videoCount?: string;
};
type YTChannelItem = {
  id?: string;
  snippet?: YTChannelSnippet;
  statistics?: YTChannelStatistics;
};
type YTChannelsListResponse = { items?: YTChannelItem[] };

type ResolvedChannel = {
  handle: string;
  channel_id: string;
  title: string;
  thumbnail_url: string;
  subscriber_count: number | null;
  video_count: number | null;
};

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function normalizeHandle(raw: string): string {
  const s = (raw || "").trim();
  if (!s.startsWith("@")) return "";
  const handle = s.slice(1);
  if (!/^[A-Za-z0-9_.-]{3,}$/.test(handle)) return "";
  return handle;
}

async function resolveHandle(rawHandle: string): Promise<ResolvedChannel | null> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;

  const key = requiredEnv("YOUTUBE_API_KEY");
  const url = new URL("https://youtube.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.append("part", "statistics");
  url.searchParams.set("forHandle", handle);
  url.searchParams.set("key", key);

  const resp = await fetch(url.toString(), { cache: "no-store" });
  if (!resp.ok) {
    throw new Error(`YouTube API error ${resp.status}`);
  }
  const data = (await resp.json()) as YTChannelsListResponse;
  const item = (data.items || [])[0];
  if (!item) return null;

  const snippet = item.snippet || {};
  const stats = item.statistics || {};
  const thumbs = snippet.thumbnails || {};
  const thumbnail_url =
    thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || "";

  const title = String(snippet.title || "");
  const channel_id = String(item.id || "");
  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  if (!channel_id || !title) return null;

  return {
    handle: `@${handle}`,
    channel_id,
    title,
    thumbnail_url,
    subscriber_count: toNum(stats.subscriberCount),
    video_count: toNum(stats.videoCount),
  };
}

async function main() {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const seedPath = path.join(repoRoot, "config", "suggested_channels_seed.yml");
  const outPath = path.join(
    repoRoot,
    "web",
    "src",
    "data",
    "suggested_channels.json",
  );

  const seedRaw = fs.readFileSync(seedPath, "utf8");
  const seed = YAML.parse(seedRaw) as Seed;
  if (!seed?.interests || typeof seed.interests !== "object") {
    throw new Error("Invalid seed file: missing interests");
  }

  const out: {
    interests: Record<
      string,
      { label: string; hint: string; channels: ResolvedChannel[] }
    >;
  } = { interests: {} };

  for (const [key, cfg] of Object.entries(seed.interests)) {
    const handles = Array.from(new Set((cfg.handles || []).map(String)));
    const channels: ResolvedChannel[] = [];
    for (const h of handles) {
      const r = await resolveHandle(h);
      if (!r) {
        throw new Error(`Handle not found or invalid: ${h} (interest=${key})`);
      }
      channels.push(r);
      // Friendly throttling for interactive quota keys.
      await new Promise((r) => setTimeout(r, 120));
    }
    out.interests[key] = {
      label: cfg.label,
      hint: cfg.hint || "",
      channels,
    };
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  process.stdout.write(
    `Wrote ${outPath} (${Object.keys(out.interests).length} interests)\n`,
  );
}

main().catch((e) => {
  // Keep output short; CI will show full stack when needed.
  console.error(String(e?.message || e));
  process.exit(1);
});
