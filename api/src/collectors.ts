import games from "./games.json";
import { Env, GameConfig, Metric, num } from "./types";
import { getTrackedYouTubeIds } from "./db";

export const getGame = (slug: string): GameConfig | null =>
  (games as Record<string, GameConfig>)[slug] ?? null;

export const listGames = (): string[] => Object.keys(games);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

// Feature flags are plain strings ("1" / "true" turns a collector on).
const flagOn = (v: string | undefined): boolean => {
  const s = (v ?? "").toLowerCase();
  return s === "1" || s === "true";
};

// --- YouTube (free Data API v3). Needs YOUTUBE_API_KEY. ---
async function collectYouTube(slug: string, game: GameConfig, env: Env, report: (message: string) => void): Promise<Metric[]> {
  if (game.youtube_channel_ids.length === 0) return [];
  if (!env.YOUTUBE_API_KEY) throw new Error("YouTube: YOUTUBE_API_KEY is missing");
  const ids = new Set(await getTrackedYouTubeIds(env.DB, slug));
  const cutoff = new Date(Date.now() - 90 * 864e5).toISOString();
  const api = async (resource: string, params: Record<string, string>) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    url.search = new URLSearchParams({ ...params, key: env.YOUTUBE_API_KEY! }).toString();
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) {
      const error = await r.json().catch(() => null) as any;
      throw new Error(`YouTube ${resource}: HTTP ${r.status} (${error?.error?.errors?.[0]?.reason ?? "request failed"})`);
    }
    return await r.json() as any;
  };
  // The uploads playlist is chronological, includes Shorts, and costs one quota
  // unit per page. search.list costs 100 units and can omit/delay uploads.
  for (const ch of game.youtube_channel_ids) {
    try {
      const channel = await api("channels", { part: "contentDetails", id: ch });
      const playlist = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!playlist) throw new Error(`YouTube channel ${ch}: uploads playlist missing`);
      let pageToken = "";
      do {
        const page = await api("playlistItems", {
          part: "contentDetails", playlistId: playlist, maxResults: "50", ...(pageToken ? { pageToken } : {}),
        });
        let reachedCutoff = false;
        for (const it of page.items ?? []) {
          const detail = it.contentDetails;
          if (!detail?.videoId) continue;
          if (detail.videoPublishedAt && detail.videoPublishedAt < cutoff) {
            reachedCutoff = true;
            continue;
          }
          ids.add(detail.videoId);
        }
        pageToken = reachedCutoff ? "" : (page.nextPageToken ?? "");
      } while (pageToken);
    } catch (e) {
      report(e instanceof Error ? e.message : "YouTube discovery failed");
    }
  }
  const out: Metric[] = [];
  const videoIds = [...ids];
  for (let offset = 0; offset < videoIds.length; offset += 50) {
    try {
      const vj = await api("videos", { part: "snippet,statistics", id: videoIds.slice(offset, offset + 50).join(",") });
      for (const it of vj.items ?? []) {
        // Deleted/private videos have no statistics; do not write a false zero.
        if (it.statistics?.viewCount === undefined) continue;
        out.push({
          platform: "youtube",
          post_id: it.id,
          url: `https://youtu.be/${it.id}`,
          title: it.snippet?.title ?? "",
          views: num(it.statistics?.viewCount),
          likes: num(it.statistics?.likeCount),
          comments: num(it.statistics?.commentCount),
          shares: 0, // API has no shares
          published_at: it.snippet?.publishedAt ?? null,
        });
      }
    } catch (e) {
      report(e instanceof Error ? e.message : "YouTube video refresh failed");
    }
  }
  return out;
}

// --- Reddit (free public JSON, no key). ---
async function collectReddit(game: GameConfig): Promise<Metric[]> {
  const out: Metric[] = [];
  for (const sub of game.subreddits) {
    const r = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=20`, {
      headers: { "User-Agent": "gacha-trend/0.1 (cloudflare worker)" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`Reddit r/${sub}: HTTP ${r.status}`);
    const j = (await r.json()) as any;
    for (const c of j.data?.children ?? []) {
      const d = c.data;
      out.push({
        platform: "reddit",
        post_id: d.id,
        url: `https://reddit.com${d.permalink}`,
        title: d.title ?? "",
        views: num(d.view_count),
        likes: num(d.score),
        comments: num(d.num_comments),
        shares: 0,
        published_at: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : null,
      });
    }
  }
  return out;
}

// --- Twitch (OFF by default. Helix needs a free dev.twitch.tv app; there is
// no official keyless endpoint, so keyless Cloudflare crawl is not offered.
// Alternative: push twitch numbers from homelab via POST /api/ingest.) ---
async function collectTwitch(game: GameConfig, env: Env): Promise<Metric[]> {
  if (!flagOn(env.ENABLE_TWITCH)) return [];
  if (!game.twitch_game_id) return [];
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) throw new Error("Twitch enabled but credentials are missing");
  const t = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!t.ok) throw new Error(`Twitch authentication: HTTP ${t.status}`);
  const { access_token } = (await t.json()) as any;
  const r = await fetch(
    `https://api.twitch.tv/helix/streams?game_id=${game.twitch_game_id}&first=20`,
    { headers: { "Client-ID": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(20000) }
  );
  if (!r.ok) throw new Error(`Twitch streams: HTTP ${r.status}`);
  const j = (await r.json()) as any;
  return (j.data ?? []).map((s: any) => ({
    platform: "twitch",
    post_id: s.id,
    url: `https://twitch.tv/${s.user_login}`,
    title: s.title ?? "",
    views: num(s.viewer_count), // live viewers
    likes: 0,
    comments: 0,
    shares: 0,
    published_at: s.started_at ?? null,
  }));
}

// --- X (keyless syndication timeline. No API key, no paid tier.) ---
// Unofficial and can break, hence ENABLE_X. X exposes no impressions through
// this endpoint, so views stay 0 and the dashboard shows likes for X instead.
// One request per handle returns the latest ~20 posts, thread replies included.
async function collectX(game: GameConfig, env: Env, report: (message: string) => void): Promise<Metric[]> {
  if (!flagOn(env.ENABLE_X) || game.x_handles.length === 0) return [];
  const byId = new Map<string, Metric>();
  for (const handle of game.x_handles) {
    try {
      const r = await fetch(
        `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`,
        { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) }
      );
      if (!r.ok) throw new Error(`X @${handle}: HTTP ${r.status}`);
      const html = await r.text();
      const raw = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
      if (!raw) throw new Error(`X @${handle}: timeline data missing`);
      const entries = JSON.parse(raw)?.props?.pageProps?.timeline?.entries;
      if (!Array.isArray(entries)) throw new Error(`X @${handle}: invalid timeline data`);
      for (const entry of entries) {
        const tw = entry?.content?.tweet;
        if (!tw?.id_str) continue;
        byId.set(tw.id_str, {
          platform: "x",
          post_id: tw.id_str,
          url: `https://x.com${tw.permalink ?? `/${handle}/status/${tw.id_str}`}`,
          title: tw.full_text ?? "",
          views: 0, // not exposed by syndication
          likes: num(tw.favorite_count),
          comments: num(tw.reply_count),
          shares: num(tw.retweet_count) + num(tw.quote_count),
          published_at: tw.created_at ? new Date(tw.created_at).toISOString() : null,
        });
      }
    } catch (e) {
      report(e instanceof Error ? e.message : `X @${handle}: collection failed`);
    }
  }
  return [...byId.values()];
}

export interface CollectResult { source: string; metrics: Metric[]; counts: Record<string, number>; errors: Record<string, string> }

export async function collectAll(slug: string, env: Env): Promise<CollectResult> {
  const game = getGame(slug);
  if (!game) return { source: "cloudflare", metrics: [], counts: {}, errors: {} };
  const errors: Record<string, string> = {};
  const report = (platform: string) => (message: string) => {
    errors[platform] = errors[platform] ? `${errors[platform]}; ${message}` : message;
  };
  // A failed source must not discard the successful sources in this run.
  const results = await Promise.allSettled([
    collectYouTube(slug, game, env, report("youtube")), collectReddit(game), collectTwitch(game, env), collectX(game, env, report("x")),
  ]);
  const platforms = ["youtube", "reddit", "twitch", "x"];
  const counts: Record<string, number> = {};
  const metrics: Metric[] = [];
  results.forEach((result, i) => {
    const platform = platforms[i];
    counts[platform] = result.status === "fulfilled" ? result.value.length : 0;
    if (result.status === "fulfilled") metrics.push(...result.value);
    else errors[platform] = result.reason instanceof Error ? result.reason.message : "Collection failed";
  });
  return { source: "cloudflare", metrics, counts, errors };
}

export interface ChannelMeta {
  id: string; title: string; avatar: string;
  subscribers: number; videos: number; views: number; url: string;
}

// Channel-level stats for the game hero (1 quota unit per channel).
export async function getChannelMeta(game: GameConfig, env: Env): Promise<ChannelMeta[]> {
  if (!env.YOUTUBE_API_KEY || game.youtube_channel_ids.length === 0) return [];
  const out: ChannelMeta[] = [];
  for (const id of game.youtube_channel_ids) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${id}&key=${env.YOUTUBE_API_KEY}`
      );
      if (!r.ok) continue;
      const it = ((await r.json()) as any).items?.[0];
      if (!it) continue;
      const th = it.snippet?.thumbnails ?? {};
      out.push({
        id,
        title: it.snippet?.title ?? id,
        avatar: th.high?.url ?? th.medium?.url ?? th.default?.url ?? "",
        subscribers: num(it.statistics?.subscriberCount),
        videos: num(it.statistics?.videoCount),
        views: num(it.statistics?.viewCount),
        url: `https://youtube.com/channel/${id}`,
      });
    } catch { /* best-effort */ }
  }
  return out;
}
