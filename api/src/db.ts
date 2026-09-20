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
    `INSERT INTO snapshots (game, platform, post_id, url, title, views, likes, comments, shares, source, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const batch = metrics.map((m) =>
    stmt.bind(
      game, m.platform, m.post_id, m.url, m.title.slice(0, 500),
      m.views, m.likes, m.comments, m.shares, source, now
    )
  );
  await db.batch(batch);
  return metrics.length;
}

// Rollup computed on read (YAGNI: no second table).
export async function getTrend(db: D1Database, game: string, days: number) {
  const { results } = await db.prepare(
    `SELECT substr(captured_at, 1, 10) AS date, platform,
       SUM(views) AS views, SUM(likes) AS likes,
       SUM(comments) AS comments, SUM(shares) AS shares,
       COUNT(*) AS posts, MAX(captured_at) AS last_updated
     FROM snapshots WHERE game = ? AND captured_at >= datetime('now', ?)
     GROUP BY date, platform ORDER BY date ASC`
  ).bind(game, `-${days} days`).all();
  return results;
}

export async function getBuzz(db: D1Database, game: string, days: number, keywords: string[]) {
  // KISS word buzz: count keyword hits in titles from last N days.
  const { results } = await db.prepare(
    `SELECT title FROM snapshots WHERE game = ? AND captured_at >= datetime('now', ?)`
  ).bind(game, `-${days} days`).all<{ title: string }>();
  const counts: Record<string, number> = {};
  for (const k of keywords) counts[k.toLowerCase()] = 0;
  for (const r of results ?? []) {
    const t = (r.title ?? "").toLowerCase();
    for (const k of keywords) if (t.includes(k.toLowerCase())) counts[k.toLowerCase()]++;
  }
  return { samples: results?.length ?? 0, counts };
}

// Latest capture per post, ranked by views. SQLite: with MAX(captured_at) present,
// the other bare columns come from the row that produced that max.
export async function getTopPosts(db: D1Database, game: string, days: number, limit: number) {
  const { results } = await db.prepare(
    `SELECT platform, post_id, url, title, views, likes, comments, shares, source,
       MAX(captured_at) AS captured_at
     FROM snapshots WHERE game = ? AND captured_at >= datetime('now', ?)
     GROUP BY platform, post_id ORDER BY views DESC LIMIT ?`
  ).bind(game, `-${days} days`, limit).all();
  return results;
}
