import games from "./games.json";
import { Env, GameConfig, Metric, num } from "./types";

export const getGame = (slug: string): GameConfig | null =>
  (games as Record<string, GameConfig>)[slug] ?? null;

export const listGames = (): string[] => Object.keys(games);

// --- YouTube (free Data API v3). Needs YOUTUBE_API_KEY. ---
async function collectYouTube(game: GameConfig, env: Env): Promise<Metric[]> {
  if (!env.YOUTUBE_API_KEY || game.youtube_channel_ids.length === 0) return [];
  const out: Metric[] = [];
  for (const ch of game.youtube_channel_ids) {
    // Latest videos (1 call per channel, cheap on quota)
    const s = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${ch}&maxResults=10&order=date&type=video&key=${env.YOUTUBE_API_KEY}`
    );
    if (!s.ok) continue;
    const j = (await s.json()) as any;
    const ids = (j.items ?? []).map((i: any) => i.id?.videoId).filter(Boolean);
    if (ids.length === 0) continue;
    const v = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${env.YOUTUBE_API_KEY}`
    );
    if (!v.ok) continue;
    const vj = (await v.json()) as any;
    for (const it of vj.items ?? []) {
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
  }
  return out;
}

// --- Reddit (free public JSON, no key). ---
async function collectReddit(game: GameConfig): Promise<Metric[]> {
  const out: Metric[] = [];
  for (const sub of game.subreddits) {
    const r = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=20`, {
      headers: { "User-Agent": "gacha-trend/0.1 (cloudflare worker)" },
    });
    if (!r.ok) continue;
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
  const flag = (env.ENABLE_TWITCH ?? "").toLowerCase();
  if (flag !== "1" && flag !== "true") return [];
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET || !game.twitch_game_id) return [];
  const t = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.TWITCH_CLIENT_ID,
      client_secret: env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!t.ok) return [];
  const { access_token } = (await t.json()) as any;
  const r = await fetch(
    `https://api.twitch.tv/helix/streams?game_id=${game.twitch_game_id}&first=20`,
    { headers: { "Client-ID": env.TWITCH_CLIENT_ID, Authorization: `Bearer ${access_token}` } }
  );
  if (!r.ok) return [];
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

// --- X (ingest-only. No paid API per project rule; all free Cloudflare-side
// endpoints are dead as of 2026-09: api.fxtwitter.com user timeline returns
// "post doesn't exist", api.vxtwitter.com 404s, syndication timeline is empty.
// Push X numbers from homelab via POST /api/ingest with "platform":"x".) ---
async function collectX(_game: GameConfig): Promise<Metric[]> {
  return [];
}

export interface CollectResult { source: string; metrics: Metric[]; counts: Record<string, number> }

export async function collectAll(slug: string, env: Env): Promise<CollectResult> {
  const game = getGame(slug);
  if (!game) return { source: "cloudflare", metrics: [], counts: {} };
  const [yt, rd, tw, x] = await Promise.all([
    collectYouTube(game, env), collectReddit(game), collectTwitch(game, env), collectX(game),
  ]);
  const counts = { youtube: yt.length, reddit: rd.length, twitch: tw.length, x: x.length };
  return { source: "cloudflare", metrics: [...yt, ...rd, ...tw, ...x], counts };
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
