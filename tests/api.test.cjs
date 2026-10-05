const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTS, database, day } = require("./helpers.cjs");
const { getTrend, getBuzz, getTopPosts } = loadTS("api/src/db.ts");
const { collectAll } = loadTS("api/src/collectors.ts");

test("window growth uses per-post baselines and never subtracts a missing post", async () => {
  const fixture = database();
  const { add, db, sql } = fixture;
  add({ post: "a", captured: day(-15), views: 100 });
  add({ post: "a", captured: day(-10), views: 160 });
  add({ post: "a", captured: day(-5), views: 200 });
  add({ post: "a", captured: day(-2), views: 230 });
  add({ post: "a", captured: day(-2, "18"), views: 240 });
  add({ post: "a", captured: day(0), views: 250 });
  // Same timestamp: the newest inserted row wins, not an arbitrary MAX row.
  add({ post: "a", captured: day(0), views: 255 });
  add({ post: "dropped", captured: day(-15), views: 1000 });
  add({ post: "dropped", captured: day(-5), views: 1100 });
  const seven = await getTrend(db, "genshin-impact", 7);
  const fourteen = await getTrend(db, "genshin-impact", 14);
  assert.equal(seven.reduce((n, r) => n + r.views_gained, 0), 195);
  assert.equal(fourteen.reduce((n, r) => n + r.views_gained, 0), 255);
  assert.equal(seven.at(-1).views, 1355);
  assert.equal(seven.at(-1).posts, 2);
  assert.equal(seven.at(-1).window_posts, 2);
  assert.equal(seven.find((r) => r.date === day(-2).slice(0, 10)).views_gained, 40);
  sql.close();
});

test("new posts count initial views; old posts without history do not invent gains", async () => {
  const { add, db, sql } = database();
  add({ post: "new", captured: day(-3), published: day(-4), views: 80 });
  add({ post: "new", captured: day(-1), published: day(-4), views: 100 });
  add({ post: "old", captured: day(-3), published: day(-90), views: 10000 });
  add({ post: "old", captured: day(0), published: day(-90), views: 10040 });
  add({ post: "unknown", captured: day(0), views: 9999 });
  const rows = await getTrend(db, "genshin-impact", 7);
  assert.equal(rows.reduce((n, r) => n + r.views_gained, 0), 140);
  assert.equal(rows.at(-1).views, 20139);
  assert.equal(rows.at(-1).unbaselined_posts, 2);
  sql.close();
});

test("UTC window boundaries, real corrections and per-platform IDs are preserved", async () => {
  const { add, db, sql } = database();
  add({ post: "same", captured: day(-7, "23"), views: 100, likes: 10 });
  add({ post: "same", captured: day(-6, "00"), views: 120, likes: 12 });
  add({ post: "same", captured: day(0), views: 115, likes: 11 });
  add({ post: "same", platform: "x", captured: day(-6), likes: 30, published: day(-6) });
  add({ post: "same", platform: "x", captured: day(0), likes: 35, published: day(-6) });
  const rows = await getTrend(db, "genshin-impact", 7);
  assert.equal(rows[0].date, day(-6).slice(0, 10));
  assert.equal(rows.filter((r) => r.platform === "youtube").reduce((n, r) => n + r.views_gained, 0), 15);
  assert.equal(rows.find((r) => r.date === day(0).slice(0, 10) && r.platform === "youtube").views_gained, -5);
  assert.equal((await getBuzz(db, "genshin-impact", 7, ["Genshin Impact"])).samples, 2);
  assert.equal((await getTopPosts(db, "genshin-impact", 7, 1)).length, 2);
  sql.close();
});

test("YouTube discovers multiple upload pages and refreshes videos that left the feed", async () => {
  const { add, db, sql } = database();
  add({ post: "previously-tracked", captured: day(-120), views: 400 });
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u);
    if (!u.hostname.endsWith("googleapis.com")) return new Response("", { status: 403 });
    if (u.pathname.endsWith("/channels")) return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads" } } }] });
    if (u.pathname.endsWith("/playlistItems")) {
      const page = u.searchParams.has("pageToken") ? 1 : 0;
      return Response.json({
        items: Array.from({ length: page ? 5 : 50 }, (_, i) => ({ contentDetails: { videoId: `new-${page * 50 + i}`, videoPublishedAt: day(-i) } })),
        ...(page ? {} : { nextPageToken: "next" }),
      });
    }
    if (u.pathname.endsWith("/videos")) return Response.json({ items: u.searchParams.get("id").split(",").map((id) => ({ id, snippet: { title: id, publishedAt: day(-1) }, statistics: { viewCount: "500" } })) });
    throw new Error("Unexpected endpoint");
  };
  try {
    const result = await collectAll("genshin-impact", { DB: db, YOUTUBE_API_KEY: "test" });
    assert.equal(result.counts.youtube, 56);
    assert.ok(result.metrics.some((m) => m.post_id === "previously-tracked" && m.views === 500));
    assert.equal(calls.filter((u) => u.pathname.endsWith("/videos")).length, 2);
    assert.equal(calls.filter((u) => u.pathname.endsWith("/playlistItems")).length, 2);
    assert.ok(!calls.some((u) => u.pathname.endsWith("/search")));
  } finally { global.fetch = original; sql.close(); }
});

test("YouTube failures report the quota error while other sources are saved", async () => {
  const { db, sql } = database();
  const original = global.fetch;
  global.fetch = async (url) => {
    const u = new URL(url);
    if (u.hostname.endsWith("googleapis.com")) return Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 });
    if (u.hostname.includes("reddit")) return Response.json({ data: { children: [{ data: { id: "reddit", title: "Test", score: 10, num_comments: 2, permalink: "/test" } }] } });
    return new Response("", { status: 403 });
  };
  try {
    const result = await collectAll("genshin-impact", { DB: db, YOUTUBE_API_KEY: "test" });
    assert.equal(result.counts.youtube, 0);
    assert.equal(result.counts.reddit, 1);
    assert.match(result.errors.youtube, /quotaExceeded/);
    assert.equal(result.metrics[0].platform, "reddit");
  } finally { global.fetch = original; sql.close(); }
});

test("a failed YouTube batch preserves successful batches and private videos never become zero", async () => {
  const { add, db, sql } = database();
  for (let i = 0; i < 51; i++) add({ post: `tracked-${i}`, captured: day(-120), views: 100 });
  const original = global.fetch;
  let batches = 0;
  global.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith("/channels")) return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads" } } }] });
    if (u.pathname.endsWith("/playlistItems")) return Response.json({ items: [] });
    if (u.pathname.endsWith("/videos")) {
      if (++batches === 2) return Response.json({}, { status: 503 });
      return Response.json({ items: u.searchParams.get("id").split(",").map((id, i) => ({
        id, snippet: { title: id }, ...(i ? { statistics: { viewCount: "150" } } : {}),
      })) });
    }
    return new Response("", { status: 403 });
  };
  try {
    const result = await collectAll("genshin-impact", { DB: db, YOUTUBE_API_KEY: "test" });
    assert.equal(result.counts.youtube, 49);
    assert.ok(result.metrics.every((m) => m.views === 150));
    assert.match(result.errors.youtube, /503/);
    assert.match(result.errors.reddit, /403/);
  } finally { global.fetch = original; sql.close(); }
});
