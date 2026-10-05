const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTS, database, day } = require("./helpers.cjs");
const { collectAll } = loadTS("api/src/collectors.ts");
const { saveMetrics, getTopPosts } = loadTS("api/src/db.ts");

test("X photos, video posters and entity fallbacks survive collection, storage and API reads", async () => {
  const { db, sql } = database();
  const originalFetch = global.fetch;
  const tweets = [
    { id_str: "photo", extended_entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/photo.jpg" }, { type: "photo", media_url_https: "https://pbs.twimg.com/media/second.jpg" }] } },
    { id_str: "video", extended_entities: { media: [{ type: "video", media_url_https: "https://pbs.twimg.com/media/poster.jpg" }] } },
    { id_str: "gif", extended_entities: { media: [{ type: "animated_gif", media_url_https: "https://pbs.twimg.com/media/gif-poster.jpg" }] } },
    { id_str: "fallback", extended_entities: { media: [] }, entities: { media: [{ media_url: "http://pbs.twimg.com/media/fallback.jpg" }] } },
    { id_str: "text" },
  ].map((tweet) => ({ ...tweet, full_text: tweet.id_str, created_at: day(0), favorite_count: 10 }));
  global.fetch = async (url) => new URL(url).hostname === "syndication.twitter.com"
    ? new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { timeline: { entries: tweets.map((tweet) => ({ content: { tweet } })) } } } })}</script>`)
    : new Response("", { status: 403 });
  try {
    const result = await collectAll("genshin-impact", { DB: db, ENABLE_X: "1" });
    assert.equal(result.counts.x, 5);
    assert.equal(result.errors.x, undefined);
    assert.equal(await saveMetrics(db, "genshin-impact", "cloudflare", result.metrics), 5);
    const rows = await getTopPosts(db, "genshin-impact", 7, 6);
    const byId = Object.fromEntries(rows.map((row) => [row.post_id, row]));
    assert.equal(byId.photo.thumbnail_url, "https://pbs.twimg.com/media/photo.jpg");
    assert.equal(byId.video.thumbnail_url, "https://pbs.twimg.com/media/poster.jpg");
    assert.equal(byId.gif.thumbnail_url, "https://pbs.twimg.com/media/gif-poster.jpg");
    assert.equal(byId.fallback.thumbnail_url, "http://pbs.twimg.com/media/fallback.jpg");
    assert.equal(byId.text.thumbnail_url, null);
  } finally { global.fetch = originalFetch; sql.close(); }
});

test("external thumbnails are optional and the newest capture supplies the correct image", async () => {
  const { db, sql, add } = database();
  add({ post: "legacy", platform: "x", captured: day(0) });
  const base = { platform: "instagram", post_id: "external", url: "https://www.instagram.com/p/external", title: "Photo", views: 0, likes: 10, comments: 0, shares: 0, published_at: day(0) };
  try {
    await saveMetrics(db, "genshin-impact", "external", [{ ...base, thumbnail_url: "https://example.com/old.jpg" }]);
    await saveMetrics(db, "genshin-impact", "external", [{ ...base, likes: 20, thumbnail_url: "https://example.com/new.jpg" }]);
    await saveMetrics(db, "genshin-impact", "external", [{ ...base, post_id: "invalid", thumbnail_url: "not-an-image-url" }]);
    const byId = Object.fromEntries((await getTopPosts(db, "genshin-impact", 7, 6)).map((row) => [row.post_id, row]));
    assert.equal(byId.external.thumbnail_url, "https://example.com/new.jpg");
    assert.equal(byId.external.likes, 20);
    assert.equal(byId.invalid.thumbnail_url, null);
    assert.equal(byId.legacy.thumbnail_url, null);
  } finally { sql.close(); }
});
