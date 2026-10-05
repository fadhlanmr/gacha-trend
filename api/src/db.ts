import { Metric } from "./types";

export async function saveMetrics(
  db: D1Database,
  game: string,
  source: string,
  metrics: Metric[]
): Promise<number> {
  if (metrics.length === 0) return 0;
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO snapshots (game, platform, post_id, url, title, views, likes, comments, shares, source, published_at, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const batch = metrics.map((m) =>
    stmt.bind(
      game, m.platform, m.post_id, m.url, m.title.slice(0, 500),
      m.views, m.likes, m.comments, m.shares, source, m.published_at ?? null, now
    )
  );
  await db.batch(batch);
  return metrics.length;
}

// Refresh known videos even after they leave the channel's latest uploads.
export async function getTrackedYouTubeIds(db: D1Database, game: string): Promise<string[]> {
  const { results } = await db.prepare(
    `SELECT DISTINCT post_id FROM snapshots WHERE game = ? AND platform = 'youtube'`
  ).bind(game).all<{ post_id: string }>();
  return results.map((r) => r.post_id);
}

export const windowModifier = (days: number) => `-${days - 1} days`;

// Last N UTC calendar days, including today. Keep one pre-window baseline per
// post and compare the SAME post across captures. Feed turnover is not growth.
// Totals carry forward last-known counts when a post disappears from a feed.
// A first capture of an old post has unknown prior growth; only a post published
// inside this window can start from zero. Negative corrections remain visible.
export async function getTrend(db: D1Database, game: string, days: number) {
  const { results } = await db.prepare(
    `WITH bounds AS (SELECT date('now', ?) AS start),
     ranked AS (
       SELECT *, substr(captured_at, 1, 10) AS date,
         ROW_NUMBER() OVER (
           PARTITION BY platform, post_id,
             CASE WHEN captured_at < (SELECT start FROM bounds) THEN 'baseline'
                  ELSE substr(captured_at, 1, 10) END
           ORDER BY captured_at DESC, id DESC
         ) AS rn
       FROM snapshots WHERE game = ?
     ), daily AS (SELECT * FROM ranked WHERE rn = 1),
     changes AS (
       SELECT *,
         LAG(views) OVER w AS prev_views, LAG(likes) OVER w AS prev_likes,
         LAG(comments) OVER w AS prev_comments, LAG(shares) OVER w AS prev_shares
       FROM daily
       WINDOW w AS (PARTITION BY platform, post_id ORDER BY captured_at, id)
     ), baseline AS (
       SELECT platform, SUM(views) AS views, SUM(likes) AS likes,
         SUM(comments) AS comments, SUM(shares) AS shares, COUNT(*) AS posts
       FROM daily WHERE date < (SELECT start FROM bounds) GROUP BY platform
     ), coverage AS (
       SELECT platform, COUNT(*) AS window_posts,
         SUM(CASE WHEN prev_views IS NULL AND
           (published_at IS NULL OR substr(published_at, 1, 10) < (SELECT start FROM bounds))
           THEN 1 ELSE 0 END) AS unbaselined_posts
       FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY platform, post_id ORDER BY captured_at, id) AS first_in_window
             FROM changes WHERE date >= (SELECT start FROM bounds))
       WHERE first_in_window = 1 GROUP BY platform
     ), deltas AS (
       SELECT date, platform, MAX(captured_at) AS last_updated,
         SUM(views - COALESCE(prev_views, 0)) AS views_delta,
         SUM(likes - COALESCE(prev_likes, 0)) AS likes_delta,
         SUM(comments - COALESCE(prev_comments, 0)) AS comments_delta,
         SUM(shares - COALESCE(prev_shares, 0)) AS shares_delta,
         SUM(CASE WHEN prev_views IS NULL THEN 1 ELSE 0 END) AS new_posts,
         SUM(CASE WHEN prev_views IS NOT NULL THEN views - prev_views
                  WHEN substr(published_at, 1, 10) >= (SELECT start FROM bounds) THEN views ELSE 0 END) AS views_gained,
         SUM(CASE WHEN prev_likes IS NOT NULL THEN likes - prev_likes
                  WHEN substr(published_at, 1, 10) >= (SELECT start FROM bounds) THEN likes ELSE 0 END) AS likes_gained,
         SUM(CASE WHEN prev_comments IS NOT NULL THEN comments - prev_comments
                  WHEN substr(published_at, 1, 10) >= (SELECT start FROM bounds) THEN comments ELSE 0 END) AS comments_gained,
         SUM(CASE WHEN prev_shares IS NOT NULL THEN shares - prev_shares
                  WHEN substr(published_at, 1, 10) >= (SELECT start FROM bounds) THEN shares ELSE 0 END) AS shares_gained
       FROM changes WHERE date >= (SELECT start FROM bounds) GROUP BY date, platform
     )
     SELECT d.date, d.platform, d.last_updated,
       COALESCE(b.views, 0) + SUM(d.views_delta) OVER w AS views,
       COALESCE(b.likes, 0) + SUM(d.likes_delta) OVER w AS likes,
       COALESCE(b.comments, 0) + SUM(d.comments_delta) OVER w AS comments,
       COALESCE(b.shares, 0) + SUM(d.shares_delta) OVER w AS shares,
       COALESCE(b.posts, 0) + SUM(d.new_posts) OVER w AS posts,
       d.views_gained, d.likes_gained, d.comments_gained, d.shares_gained,
       c.window_posts, c.unbaselined_posts
     FROM deltas d LEFT JOIN baseline b ON b.platform = d.platform
     JOIN coverage c ON c.platform = d.platform
     WINDOW w AS (PARTITION BY d.platform ORDER BY d.date ROWS UNBOUNDED PRECEDING)
     ORDER BY d.date, d.platform`
  ).bind(windowModifier(days), game).all();
  return results;
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

// Titles punctuate inconsistently ("Honkai: Star Rail" vs "Honkai Star Rail"),
// so compare on letters/digits/# only. Keeps the hashtag marker meaningful.
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}#\s]+/gu, "").replace(/\s+/g, " ").trim();

// Keyword counts + auto-discovered hashtags, deduped by post so repeated
// collections do not inflate the numbers.
export async function getBuzz(db: D1Database, game: string, days: number, keywords: string[], limit = 10) {
  const { results } = await db.prepare(
    `SELECT title FROM (
       SELECT post_id, title, MAX(captured_at) AS captured_at
       FROM snapshots WHERE game = ? AND captured_at >= date('now', ?)
       GROUP BY platform, post_id
     )`
  ).bind(game, windowModifier(days)).all<{ title: string }>();

  const counts: Record<string, number> = {};
  const keyed = keywords
    .map((display) => ({ display, key: norm(display) }))
    .filter((k) => k.key.length > 0);
  for (const k of keyed) counts[k.display] = 0;

  const terms: Record<string, number> = {};
  for (const r of results ?? []) {
    const title = r.title ?? "";
    const nTitle = norm(title);
    for (const k of keyed) if (nTitle.includes(k.key)) counts[k.display]++;
    for (const m of title.matchAll(HASHTAG)) {
      const tag = m[0].toLowerCase();
      terms[tag] = (terms[tag] ?? 0) + 1;
    }
  }

  const top = Object.entries(terms).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return { samples: results?.length ?? 0, counts, terms: Object.fromEntries(top) };
}

// Latest capture per post, ranked by views then likes, keeping the top `limit`
// per platform. Per-platform ranking means the dashboard can filter by platform
// client-side without another round trip (X posts have 0 views and would
// otherwise never outrank YouTube).
export async function getTopPosts(db: D1Database, game: string, days: number, limit: number) {
  const { results } = await db.prepare(
    `WITH latest AS (
       SELECT platform, post_id, url, title, views, likes, comments, shares, source, published_at,
         MAX(captured_at) AS captured_at
       FROM snapshots WHERE game = ? AND captured_at >= date('now', ?)
       GROUP BY platform, post_id
     ), ranked AS (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY platform ORDER BY views DESC, likes DESC) AS rn
       FROM latest
     )
     SELECT platform, post_id, url, title, views, likes, comments, shares, source, published_at, captured_at
     FROM ranked WHERE rn <= ? ORDER BY views DESC, likes DESC`
  ).bind(game, windowModifier(days), limit).all();
  return results;
}

// View/like gain per post between its two most recent captures (top movers).
export async function getMovers(db: D1Database, game: string, days: number, limit: number) {
  const { results } = await db.prepare(
    `WITH ranked AS (
       SELECT platform, post_id, url, title, views, likes, captured_at,
         ROW_NUMBER() OVER (PARTITION BY platform, post_id ORDER BY captured_at DESC) AS rn
        FROM snapshots WHERE game = ? AND captured_at >= date('now', ?)
     )
     SELECT c.platform, c.post_id, c.url, c.title, c.views, c.likes,
            c.views - p.views AS views_gained,
            c.likes - p.likes AS likes_gained,
            c.captured_at
     FROM ranked c
     JOIN ranked p ON p.platform = c.platform AND p.post_id = c.post_id AND p.rn = 2
     WHERE c.rn = 1
     ORDER BY views_gained DESC LIMIT ?`
  ).bind(game, windowModifier(days), limit).all();
  return results;
}

// Newest published posts, using the latest capture per post.
export async function getLatestUploads(db: D1Database, game: string, days: number, limit: number) {
  const { results } = await db.prepare(
    `WITH ranked AS (
       SELECT platform, post_id, url, title, views, likes, comments, published_at, captured_at,
         ROW_NUMBER() OVER (PARTITION BY platform, post_id ORDER BY captured_at DESC) AS rn
        FROM snapshots WHERE game = ? AND captured_at >= date('now', ?)
     )
     SELECT platform, post_id, url, title, views, likes, comments, published_at
     FROM ranked WHERE rn = 1 AND published_at IS NOT NULL
     ORDER BY published_at DESC LIMIT ?`
  ).bind(game, windowModifier(days), limit).all();
  return results;
}
