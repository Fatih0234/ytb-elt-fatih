export type ResolvedChannel = {
  channel_id: string;
  title: string;
  thumbnail_url: string;
  handle: string | null;
  uploads_playlist_id: string;
  subscriber_count: number | null;
  video_count: number | null;
  view_count: number | null;
};

type YTThumbnail = { url?: string };
type YTThumbnails = {
  high?: YTThumbnail;
  medium?: YTThumbnail;
  default?: YTThumbnail;
};
type YTChannelSnippet = {
  title?: string;
  thumbnails?: YTThumbnails;
  customUrl?: string;
};
type YTChannelContentDetails = {
  relatedPlaylists?: { uploads?: string };
};
type YTChannelStatistics = {
  subscriberCount?: string;
  videoCount?: string;
  viewCount?: string;
};
type YTChannelItem = {
  id?: string;
  snippet?: YTChannelSnippet;
  contentDetails?: YTChannelContentDetails;
  statistics?: YTChannelStatistics;
};
type YTChannelsListResponse = { items?: YTChannelItem[] };

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function normalizeHandle(raw: string): string {
  const s = (raw || "").trim();
  if (!s.startsWith("@")) return "";
  const handle = s.slice(1);
  if (!/^[A-Za-z0-9_.-]{3,}$/.test(handle)) return "";
  return handle;
}

export async function resolveChannelByHandle(
  rawHandle: string,
): Promise<ResolvedChannel | null> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;

  const key = requiredEnv("YOUTUBE_API_KEY");
  const url = new URL("https://youtube.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet");
  url.searchParams.append("part", "contentDetails");
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
  const uploads = item?.contentDetails?.relatedPlaylists?.uploads;

  const thumbs = snippet.thumbnails || {};
  const thumbnail_url =
    thumbs?.high?.url || thumbs?.medium?.url || thumbs?.default?.url || "";

  const channel_id: string = item.id || "";
  const title: string = snippet.title || "";
  const customUrl: string | undefined = snippet.customUrl || undefined;
  const handleDisplay = customUrl
    ? customUrl.startsWith("@")
      ? customUrl
      : `@${customUrl}`
    : `@${handle}`;

  const toNum = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  if (!channel_id || !title || !uploads) return null;

  return {
    channel_id,
    title,
    thumbnail_url,
    handle: handleDisplay,
    uploads_playlist_id: uploads,
    subscriber_count: toNum(stats.subscriberCount),
    video_count: toNum(stats.videoCount),
    view_count: toNum(stats.viewCount),
  };
}
