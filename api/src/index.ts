import { Hono } from "hono";
import { collectAll, getChannelMeta, getGame, listGames } from "./collectors";
import { getBuzz, getLatestUploads, getMovers, getTopPosts, getTrend, saveMetrics } from "./db";
import { Env, Metric, num } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/games", (c) => {
  const games = listGames();
  const labels = Object.fromEntries(games.map((g) => [g, getGame(g)?.label ?? g]));
  return c.json({ games, labels });
});

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

// Biggest gainers/losers between the two most recent captures.
app.get("/api/movers", async (c) => {
  const game = c.req.query("game") ?? "genshin-impact";
  const days = Math.min(num(c.req.query("days")) || 30, 90);
  const limit = Math.min(num(c.req.query("limit")) || 30, 100);
  if (!getGame(game)) return c.json({ error: "unknown game" }, 404);
  const rows = await getMovers(c.env.DB, game, days, limit);
  return c.json({ game, days, rows });
});

// Newest uploads.
app.get("/api/latest", async (c) => {
  const game = c.req.query("game") ?? "genshin-impact";
  const days = Math.min(num(c.req.query("days")) || 30, 90);
  const limit = Math.min(num(c.req.query("limit")) || 5, 20);
  if (!getGame(game)) return c.json({ error: "unknown game" }, 404);
  const rows = await getLatestUploads(c.env.DB, game, days, limit);
  return c.json({ game, days, rows });
});

// Game identity: configured keywords + YouTube channel stats (cached 6h).
app.get("/api/game", async (c) => {
  const game = c.req.query("game") ?? "genshin-impact";
  const cfg = getGame(game);
  if (!cfg) return c.json({ error: "unknown game" }, 404);
  const key = new Request(`https://gacha-trend.internal/game/${game}`);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const channels = await getChannelMeta(cfg, c.env);
  const res = new Response(
    JSON.stringify({ game, label: cfg.label, keywords: cfg.keywords, channels }),
    { headers: { "content-type": "application/json", "cache-control": "max-age=21600" } }
  );
  c.executionCtx.waitUntil(caches.default.put(key, res.clone()));
  return res;
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

// Manual trigger (cron does this automatically). Spends YouTube quota, so it
// takes the same bearer token as /api/ingest.
// POST /api/collect?game=genshin-impact  Header: Authorization: Bearer <INGEST_TOKEN>
app.post("/api/collect", async (c) => {
  if (!c.env.INGEST_TOKEN) return c.json({ error: "server missing INGEST_TOKEN" }, 500);
  if (c.req.header("authorization") !== `Bearer ${c.env.INGEST_TOKEN}`)
    return c.json({ error: "unauthorized" }, 401);
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
