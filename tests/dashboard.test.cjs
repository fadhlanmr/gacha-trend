const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { loadTS, database, day } = require("./helpers.cjs");
const { getTrend, getTopPosts, getBuzz } = loadTS("api/src/db.ts");

test("changing the window updates At a glance, charts and Across games together", async () => {
  const { add, db, sql } = database();
  for (const game of ["genshin-impact", "honkai-star-rail"]) {
    add({ game, captured: day(-35), views: 30, likes: 3 });
    add({ game, captured: day(-15), views: 100, likes: 10 });
    add({ game, captured: day(-10), views: 160, likes: 16 });
    add({ game, captured: day(-5), views: 200, likes: 20 });
    add({ game, captured: day(0), views: 250, likes: 25 });
  }
  add({ platform: "x", captured: day(-10), likes: 100 });
  add({ platform: "x", captured: day(-5), likes: 110 });
  add({ platform: "x", captured: day(0), likes: 120 });
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: "", innerHTML: "", textContent: "", dataset: {}, hidden: false,
      contains: () => false, setAttribute() {}, querySelectorAll: () => [],
    });
    return elements.get(id);
  };
  const requests = [];
  let chartData;
  const context = vm.createContext({
    console, Intl, Date, AbortController, URLSearchParams,
    matchMedia: () => ({ matches: false }),
    document: {
      getElementById: element,
      querySelector: () => null,
      documentElement: { classList: { contains: () => false } },
    },
    getComputedStyle: () => ({ getPropertyValue: () => "#222222" }),
    Chart: class { constructor(canvas, config) { chartData = config.data; } destroy() {} },
    fetch: async (path) => {
      const url = new URL(path, "https://test.local");
      requests.push(url);
      const game = url.searchParams.get("game");
      const days = Number(url.searchParams.get("days"));
      return { ok: true, json: async () => url.pathname === "/api/posts"
        ? { rows: await getTopPosts(db, game, days, 6) }
        : { rows: await getTrend(db, game, days), buzz: await getBuzz(db, game, days, []) } };
    },
  });
  const client = fs.readFileSync("web/public/dashboard.js", "utf8").replace(/\ninit\(\);\s*$/, "\n");
  vm.runInContext(client, context);
  vm.runInContext(`state.games = ['genshin-impact', 'honkai-star-rail']; state.labels = {};`, context);
  element("game").value = "genshin-impact";
  try {
    element("days").value = "7";
    await vm.runInContext("load()", context);
    assert.match(element("summary").innerHTML, /Views gained<\/div><div class="v">90</);
    assert.match(element("summary").innerHTML, /Posts tracked<\/div><div class="v">2</);
    assert.match(element("gameList").innerHTML, /90 views gained in 7 days/);
    assert.equal(chartData.datasets.find((d) => d.label === "YouTube").data.join(","), "40,50");
    // X's missing capture on other dates cannot reduce totals or inflate engagement.
    assert.match(element("summary").innerHTML, /Engagement<\/div><div class="v">10.00%/);
    requests.length = 0;
    element("days").value = "14";
    await vm.runInContext("load()", context);
    assert.match(element("summary").innerHTML, /Views gained<\/div><div class="v">150</);
    assert.match(element("gameList").innerHTML, /150 views gained in 14 days/);
    assert.equal(chartData.datasets.find((d) => d.label === "YouTube").data.join(","), "60,40,50");
    assert.ok(requests.every((u) => u.searchParams.get("days") === "14"));
    assert.equal(element("gamesDescription").textContent, "Observed view gains in the last 14 days");
    element("days").value = "30";
    await vm.runInContext("load()", context);
    assert.match(element("summary").innerHTML, /Views gained<\/div><div class="v">220</);
    assert.match(element("gameList").innerHTML, /220 views gained in 30 days/);
    vm.runInContext("state.platform = 'x'; renderAll();", context);
    assert.match(element("summary").innerHTML, /Views gained<\/div><div class="v">—</);
    assert.match(element("summary").innerHTML, /Posts tracked<\/div><div class="v">1</);
    assert.equal(element("error").hidden, true);
  } finally { sql.close(); }
});
