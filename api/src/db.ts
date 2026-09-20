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

// Per-day totals. Dedupes to the latest capture per post per day, so a manual
// collect plus the cron on the same day cannot double-count.
export async function getTrend(db: D1Database, game: string, days: number) {
  const { results } = await db.prepare(
    `WITH latest AS (
       SELECT platform, post_id, substr(captured_at, 1, 10) AS date,
         views, likes, comments, shares, MAX(captured_at) AS captured_at
       FROM snapshots WHERE game = ? AND captured_at >= datetime('now', ?)
       GROUP BY platform, post_id, date
     )
     SELECT date, platform,
       SUM(views) AS views, SUM(likes) AS likes,
       SUM(comments) AS comments, SUM(shares) AS shares,
       COUNT(*) AS posts, MAX(captured_at) AS last_updated
     FROM latest GROUP BY date, platform ORDER BY date ASC`
  ).bind(game, `-${days} days`).all();
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
       FROM snapshots WHERE game = ? AND captured_at >= datetime('now', ?)
       GROUP BY post_id
     )`
  ).bind(game, `-${days} days`).all<{ title: string }>();

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

// Latest capture per post, ranked by views. SQLite: with MAX(captured_at) present,
// the other bare columns come from the row that produced that max.
export async function getTopPosts(db: D1Database, game: string, days: number, limit: number) {
  const { results } = await db.prepare(
    `SELECT platform, post_id, url, title, views, likes, comments, shares, source, published_at,
       MAX(captured_at) AS captured_at
     FROM snapshots WHERE game = ? AND captured_at >= datetime('now', ?)
     GROUP BY platform, post_id ORDER BY views DESC LIMIT ?`
  ).bind(game, `-${days} days`, limit).all();
  return results;
}

// View/like gain per post between its two most recent captures (top movers).
export async function getMovers(db: D1Database, game: string, days: number, limit: number) {
  const { results } = await db.prepare(
    `WITH ranked AS (
       SELECT platform, post_id, url, title, views, likes, captured_at,
         ROW_NUMBER() OVER (PARTITION BY platform, post_id ORDER BY captured_at DESC) AS rn
       FROM snapshots WHERE game = ? AND captured_at >= datetime('now', ?)
     )
     SELECT c.platform, c.post_id, c.url, c.title, c.views, c.likes,
            c.views - p.views AS views_gained,
            c.likes - p.likes AS likes_gained,
            c.captured_at
     FROM ranked c
     JOIN ranked p ON p.platform = c.platform AND p.post_id = c.post_id AND p.rn = 2
     WHERE c.rn = 1
     ORDER BY views_gained DESC LIMIT ?`
  ).bind(game, `-${days} days`, limit).all();
  return results;
}

// Newest published posts, using the latest capture per post.
export async function getLatestUploads(db: D1Database, game: string, days: number, limit: number) {
  const { results } = await db.prepare(
    `WITH ranked AS (
       SELECT platform, post_id, url, title, views, likes, comments, published_at, captured_at,
         ROW_NUMBER() OVER (PARTITION BY platform, post_id ORDER BY captured_at DESC) AS rn
       FROM snapshots WHERE game = ? AND captured_at >= datetime('now', ?)
     )
     SELECT platform, post_id, url, title, views, likes, comments, published_at
     FROM ranked WHERE rn = 1 AND published_at IS NOT NULL
     ORDER BY published_at DESC LIMIT ?`
  ).bind(game, `-${days} days`, limit).all();
  return results;
}
