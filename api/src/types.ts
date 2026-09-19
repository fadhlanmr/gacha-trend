export interface Metric {
  platform: string; // youtube | reddit | twitch | x | tiktok | instagram (external only)
  post_id: string;
  url: string;
  title: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  published_at: string | null;
}

export interface GameConfig {
  label: string;
  keywords: string[];
  youtube_channel_ids: string[];
  subreddits: string[];
  twitch_game_id: string | null;
  x_handles: string[];
}

export interface Env {
  DB: D1Database;
  YOUTUBE_API_KEY?: string;
  TWITCH_CLIENT_ID?: string;
  TWITCH_CLIENT_SECRET?: string;
  INGEST_TOKEN?: string;
  // "1" / "true" = twitch collector on. Anything else (or unset) = off.
  ENABLE_TWITCH?: string;
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
