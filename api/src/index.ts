import { Hono } from "hono";
import { collectAll, getGame, listGames } from "./collectors";
import { getBuzz, getTopPosts, getTrend, saveMetrics } from "./db";
import { Env, Metric, num } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/games", (c) => c.json({ games: listGames() }));

// Trend: aggregated views/likes/comments per day per platform.
// Query: /api/trend?game=genshin-impact&days=7
app.get("/api/trend", async (c) => {
  const game = c.req.query("game") ?? "genshin-impact";
  const days = Math.min(num(c.req.query("days")) || 7, 90);
  const cfg = getGame(game);
  if (!cfg) return c.json({ error: "unknown game" }, 404);
  const [rows, buzz] = await Promise.all([
    getTrend(c.env.DB, game, days),
    getBuzz(c.env.DB, game, days, cfg.keywords),
  ]);
  return c.json({ game, days, rows, buzz });
});

// Top posts (latest capture per post), ranked by views.
// Query: /api/posts?game=genshin-impact&days=7&limit=10
app.get("/api/posts", async (c) => {
  const game = c.req.query("game") ?? "genshin-impact";
  const days = Math.min(num(c.req.query("days")) || 7, 90);
  const limit = Math.min(num(c.req.query("limit")) || 10, 50);
  if (!getGame(game)) return c.json({ error: "unknown game" }, 404);
  const rows = await getTopPosts(c.env.DB, game, days, limit);
  return c.json({ game, days, rows });
});

// External ingest for homelab crawler. No Cloudflare crawl for tiktok/ig.
// POST /api/ingest?game=genshin-impact  Header: Authorization: Bearer <INGEST_TOKEN>
// Body: single Metric or Metric[]
app.post("/api/ingest", async (c) => {
  if (!c.env.INGEST_TOKEN) return c.json({ error: "server missing INGEST_TOKEN" }, 500);
  if (c.req.header("authorization") !== `Bearer ${c.env.INGEST_TOKEN}`)
    return c.json({ error: "unauthorized" }, 401);
  const game = c.req.query("game") ?? "genshin-impact";
  if (!getGame(game)) return c.json({ error: "unknown game" }, 404);
  const body = await c.req.json().catch(() => null);
  const arr: Metric[] = Array.isArray(body) ? body : body ? [body] : [];
  if (arr.length === 0 || arr.length > 500) return c.json({ error: "expected 1..500 metrics" }, 400);
  for (const m of arr) {
    if (!m.platform || !m.post_id) return c.json({ error: "each metric needs platform + post_id" }, 400);
    m.views = num(m.views); m.likes = num(m.likes);
    m.comments = num(m.comments); m.shares = num(m.shares);
    m.url = String(m.url ?? ""); m.title = String(m.title ?? "");
  }
  const n = await saveMetrics(c.env.DB, game, "external", arr);
  return c.json({ ok: true, saved: n });
});

// Manual trigger (cron does this automatically).
// POST /api/collect?game=genshin-impact
app.post("/api/collect", async (c) => {
  const game = c.req.query("game") ?? "genshin-impact";
  if (!getGame(game)) return c.json({ error: "unknown game" }, 404);
  const { metrics, counts } = await collectAll(game, c.env);
  const n = await saveMetrics(c.env.DB, game, "cloudflare", metrics);
  return c.json({ ok: true, saved: n, counts });
});

export default {
  fetch: app.fetch,
  // Cron: collect official channels for every game in games.json.
  async scheduled(_e: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    for (const slug of listGames()) {
      try {
        const { metrics } = await collectAll(slug, env);
        await saveMetrics(env.DB, slug, "cloudflare", metrics);
      } catch (e) { console.error(slug, e); }
    }
  },
};
