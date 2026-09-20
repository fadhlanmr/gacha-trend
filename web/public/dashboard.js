// Dashboard client. One worker serves this page and /api/*, so calls are same-origin.
const API = "";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const fmtFull = (n) => Intl.NumberFormat("en").format(n || 0);
const fmtDate = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtStamp = (s) => (s ? new Date(s).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const iso = (d) => d.toISOString().slice(0, 10);
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isDark = () => document.documentElement.classList.contains("dark");

// Platform colour is the only saturated colour on the page.
const PLATFORM_C = {
  youtube: { light: "#D93025", dark: "#FF5A50" },
  reddit: { light: "#E4571F", dark: "#FF7A45" },
  twitch: { light: "#7B3FE4", dark: "#A98BFF" },
  x: { light: "#202124", dark: "#E7E9EA" },
  tiktok: { light: "#0E8F9B", dark: "#2FD3E0" },
  instagram: { light: "#C13584", dark: "#FF6FB0" },
  facebook: { light: "#1877F2", dark: "#5AA2FF" },
};
const PLATFORM_NAME = { youtube: "YouTube", reddit: "Reddit", twitch: "Twitch", x: "X", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" };
const PLATFORM_LOGO = {
  youtube: '<path d="M23.5 6.6a3 3 0 0 0-2.1-2.1C19.5 4 12 4 12 4s-7.5 0-9.4.5A3 3 0 0 0 .5 6.6C0 8.5 0 12 0 12s0 3.5.5 5.4a3 3 0 0 0 2.1 2.1C4.5 20 12 20 12 20s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.5 24 12 24 12s0-3.5-.5-5.4zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/>',
  x: '<path d="M18.9 2H22l-7 8 8.2 12h-6.6l-5.2-7.6L5.3 22H2l7.5-8.6L1.6 2h6.8l4.7 6.9L18.9 2zm-2.3 18h1.8L7.5 3.9H5.6L16.6 20z"/>',
  twitch: '<path d="M4.3 2 2.5 6.5v13h4.3V23l3.6-3.5h3.1l6.5-6.4V2H4.3zm14.2 10.2-3 2.9h-3.6l-3 2.9v-2.9H5.6V3.9h12.9v8.3zM13.9 6.6h1.9v5.4h-1.9V6.6zm-4.9 0h1.9v5.4H9V6.6z"/>',
  tiktok: '<path d="M12.5 0h3.2c.2 1.7 1 3.2 2.4 4.2 1.3 1 2.9 1.5 4.6 1.5v3.1c-1.6 0-3.2-.4-4.6-1.2v6.6c0 4.5-3.6 8.1-8.1 8.1S2 18.7 2 14.2s3.6-8.1 8.1-8.1c.5 0 .9 0 1.4.1v3.2c-.5-.1-.9-.2-1.4-.2-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5V0z"/>',
  instagram: '<path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2m0-2.2C8.7 0 8.3 0 7 .1 5.8.2 4.9.4 4.1.7c-.8.3-1.5.8-2.1 1.4C1.4 2.7.9 3.3.7 4.1.4 4.9.2 5.8.1 7 0 8.3 0 8.7 0 12s0 3.7.1 5c.1 1.2.3 2.1.6 2.9.3.8.8 1.5 1.4 2.1.6.6 1.2 1.1 2.1 1.4.8.3 1.7.5 2.9.6 1.3.1 1.7.1 5 .1s3.7 0 5-.1c1.2-.1 2.1-.3 2.9-.6.8-.3 1.5-.8 2.1-1.4.6-.6 1.1-1.2 1.4-2.1.3-.8.5-1.7.6-2.9.1-1.3.1-1.7.1-5s0-3.7-.1-5c-.1-1.2-.3-2.1-.6-2.9-.3-.8-.8-1.5-1.4-2.1-.6-.6-1.2-1.1-2.1-1.4-.8-.3-1.7-.5-2.9-.6C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zm0 10.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.8-10.4a1.4 1.4 0 1 1-2.9 0 1.4 1.4 0 0 1 2.9 0z"/>',
  facebook: '<path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.8V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z"/>',
};
const platColor = (p) => (PLATFORM_C[p] ?? { light: cssVar("--ink"), dark: cssVar("--ink") })[isDark() ? "dark" : "light"];
const platName = (p) => PLATFORM_NAME[p] ?? p;
const platMark = (p) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${PLATFORM_LOGO[p] ?? ""}</svg>`;

const state = {
  games: [], labels: {}, gameTotals: {}, gameSeries: {}, gamePlats: {},
  allRows: [], posts: [], buzz: null, platform: "all", mid: "", days: 7, mode: "platform",
};
let chart;

async function j(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

// ---------- helpers ----------
let sparkSeq = 0;
function sparkline(values, color) {
  if (!values.length) return "";
  const w = 100, h = 26, pad = 3;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const x = (i) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const d = values.length === 1
    ? `M0 ${y(values[0]).toFixed(1)} L ${w} ${y(values[0]).toFixed(1)}`
    : values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const id = "sp" + ++sparkSeq;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${d} L ${w} ${h} L 0 ${h} Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

const delta = (d, suffix = "vs previous day") => {
  if (d === null || d === undefined) return `<span style="color:var(--mut)">first capture</span>`;
  if (d === 0) return `<span style="color:var(--mut)">no change</span>`;
  return `<span class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${fmtFull(Math.abs(d))}</span> <span style="color:var(--mut)">${suffix}</span>`;
};

function buildSeries(rows) {
  const by = {};
  for (const r of rows) {
    const b = (by[r.date] ??= { views: 0, likes: 0, comments: 0 });
    b.views += r.views; b.likes += r.likes; b.comments += r.comments;
  }
  return { by, dates: Object.keys(by).sort() };
}

// platform -> date -> views
function platSeries(rows) {
  const out = {};
  for (const r of rows) ((out[r.platform] ??= {})[r.date] = (out[r.platform][r.date] || 0) + r.views);
  return out;
}

function setAccent() {
  const c = state.platform === "all" ? cssVar("--ink") : platColor(state.platform);
  document.documentElement.style.setProperty("--accent", c);
}

// ---------- renderers ----------
function renderSummary(dates, by) {
  const last = dates.at(-1);
  if (!last) {
    $("summary").innerHTML = ["Views", "Likes", "Comments", "Engagement", "Posts"]
      .map((k) => `<div class="cell"><div class="k">${k}</div><div class="v">–</div><div class="d"></div></div>`).join("");
    $("overviewNote").textContent = "";
    return;
  }
  const prev = dates.length > 1 ? by[dates.at(-2)] : null;
  const cur = by[last];
  const posts = state.buzz?.samples ?? 0;
  const eng = cur.views ? ((cur.likes + cur.comments) / cur.views) * 100 : 0;
  const cells = [
    ["Views", fmtFull(cur.views), prev ? cur.views - prev.views : null],
    ["Likes", fmtFull(cur.likes), prev ? cur.likes - prev.likes : null],
    ["Comments", fmtFull(cur.comments), prev ? cur.comments - prev.comments : null],
    ["Engagement", eng.toFixed(2) + "%", null],
    ["Posts tracked", fmtFull(posts), null],
  ];
  $("summary").innerHTML = cells.map(([k, v, d]) =>
    `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d === null ? "" : delta(d)}</div></div>`
  ).join("");
  $("overviewNote").textContent = `Latest capture ${fmtDate(last)}`;
}

function renderBoard() {
  const rows = state.allRows;
  const byP = platSeries(rows);
  const entries = Object.entries(byP);
  if (!entries.length) return void ($("board").innerHTML = '<p class="empty">No platform data in this window.</p>');
  const stats = entries.map(([p, d]) => {
    const ds = Object.keys(d).sort();
    const windowViews = ds.filter((x) => x >= state.mid).reduce((a, x) => a + d[x], 0);
    const cur = ds.length ? d[ds.at(-1)] : 0;
    const prev = ds.length > 1 ? d[ds.at(-2)] : null;
    return { p, views: windowViews, delta: prev === null ? null : cur - prev };
  }).sort((a, b) => b.views - a.views);
  const total = stats.reduce((a, s) => a + s.views, 0) || 1;
  const max = Math.max(...stats.map((s) => s.views), 1);
  $("board").innerHTML = stats.map((s) => `
    <button class="ptile" data-p="${esc(s.p)}" style="--c:${platColor(s.p)}" aria-pressed="${state.platform === s.p}">
      <span class="ptop"><span class="pmark">${platMark(s.p)}</span>${esc(platName(s.p))}</span>
      <span class="pval">${fmtFull(s.views)}</span>
      <span class="pmeta">${delta(s.delta)} <span>${((s.views / total) * 100).toFixed(0)}% of views</span></span>
      <span class="pbar"><i style="width:${(s.views / max) * 100}%"></i></span>
    </button>`).join("");
  $("board").querySelectorAll(".ptile").forEach((el) => {
    el.onclick = () => {
      state.platform = state.platform === el.dataset.p ? "all" : el.dataset.p;
      renderAll();
    };
  });
  $("boardNote").textContent = state.platform === "all"
    ? "Select a platform to filter the page"
    : `Filtered to ${platName(state.platform)}`;
  $("clearPlat").hidden = state.platform === "all";
}

function renderChart(dates, by, rows) {
  if (chart) { chart.destroy(); chart = null; }
  const mode = state.mode;
  const enough = mode === "total" ? dates.length >= 1 : dates.length > 1;
  $("chartEmpty").hidden = enough;
  if (!enough) return;

  const ink = cssVar("--ink"), mut = cssVar("--mut"), rule = cssVar("--rule");
  const ticks = { color: mut, callback: (v) => fmt(v) };
  let datasets = [], scales;

  if (mode === "platform") {
    const byP = platSeries(rows);
    datasets = Object.keys(byP).sort().map((p) => ({
      type: "bar", label: platName(p), stack: "v", yAxisID: "y", borderRadius: 2, maxBarThickness: 46,
      backgroundColor: platColor(p),
      data: dates.map((d, i) => (i === 0 ? 0 : Math.max(0, (byP[p][d] || 0) - (byP[p][dates[i - 1]] || 0)))),
    }));
    scales = {
      x: { stacked: true, ticks: { color: mut }, grid: { display: false }, border: { color: rule } },
      y: { stacked: true, beginAtZero: true, ticks, grid: { color: rule }, border: { display: false } },
    };
  } else if (mode === "total") {
    datasets = [
      { type: "line", label: "Views", yAxisID: "y", data: dates.map((d) => by[d].views), borderColor: ink, backgroundColor: ink, tension: 0.35, pointRadius: 2, borderWidth: 2 },
      { type: "line", label: "Likes", yAxisID: "y1", data: dates.map((d) => by[d].likes), borderColor: mut, backgroundColor: mut, tension: 0.35, pointRadius: 2, borderWidth: 1.5, borderDash: [4, 3] },
    ];
    scales = {
      x: { ticks: { color: mut }, grid: { display: false }, border: { color: rule } },
      y: { beginAtZero: true, ticks, grid: { color: rule }, border: { display: false } },
      y1: { beginAtZero: true, position: "right", ticks, grid: { display: false }, border: { display: false } },
    };
  } else {
    const gainOf = (m) => dates.map((d, i) => (i === 0 ? null : Math.max(0, by[d][m] - by[dates[i - 1]][m])));
    datasets = [
      { type: "bar", label: "Views", yAxisID: "y", data: gainOf("views"), backgroundColor: ink, borderRadius: 2, maxBarThickness: 42 },
      { type: "line", label: "Likes", yAxisID: "y1", data: gainOf("likes"), borderColor: mut, backgroundColor: mut, tension: 0.35, pointRadius: 2, borderWidth: 1.5 },
    ];
    scales = {
      x: { ticks: { color: mut }, grid: { display: false }, border: { color: rule } },
      y: { beginAtZero: true, ticks, grid: { color: rule }, border: { display: false } },
      y1: { beginAtZero: true, position: "right", ticks, grid: { display: false }, border: { display: false } },
    };
  }

  chart = new Chart($("chart"), {
    data: { labels: dates.map(fmtDate), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: ink, boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: "rectRounded", font: { family: "Archivo, system-ui, sans-serif", size: 12 } } },
        tooltip: {
          backgroundColor: ink, titleColor: cssVar("--card"), bodyColor: cssVar("--card"),
          padding: 10, cornerRadius: 4, boxPadding: 4,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}` },
        },
      },
      scales,
    },
  });
}

function renderTopics(buzz) {
  const tracked = Object.entries(buzz?.counts ?? {}).sort((a, b) => b[1] - a[1]);
  const tags = Object.entries(buzz?.terms ?? {});
  const rows = (entries, unit) => entries.length
    ? entries.map(([k, n], i, arr) => {
        const max = Math.max(...arr.map((e) => e[1]), 1);
        return `<div class="trow">
          <div><div class="tname">${esc(k)}</div><div class="tbar"><i style="width:${(n / max) * 100}%"></i></div></div>
          <div class="tn">${n}</div>
        </div>`;
      }).join("")
    : `<p class="empty">Nothing found in this window.</p>`;
  $("topicsKw").innerHTML = rows(tracked);
  $("topicsTags").innerHTML = rows(tags);
  $("topicsNote").textContent = state.buzz?.samples ? `From ${state.buzz.samples} post titles` : "";
}

function renderGames(filter = "") {
  const needle = filter.toLowerCase();
  const list = state.games.filter((g) => g.includes(needle) || (state.labels[g] ?? "").toLowerCase().includes(needle));
  if (!list.length) return void ($("games").innerHTML = '<p class="empty">No games match that filter.</p>');
  const entries = list.map((g) => [g, state.gameTotals[g] || 0]).sort((a, b) => b[1] - a[1]);
  $("games").innerHTML = entries.map(([g, v]) => {
    const plats = (state.gamePlats[g] ?? []).map((p) => `<span class="mark" style="background:${platColor(p)}" title="${esc(platName(p))}"></span>`).join(" ");
    return `<button class="grow" data-game="${esc(g)}">
      <span><span class="gname">${esc(state.labels[g] ?? g)}</span><span class="gsub">${plats ? plats : "No platforms yet"}</span></span>
      <span class="gspark">${sparkline(state.gameSeries[g] || [], platColor((state.gamePlats[g] ?? [])[0] ?? "youtube") || cssVar("--ink"))}</span>
      <span class="gv" style="text-align:right"><strong>${fmtFull(v)}</strong><span class="gsub">views, 7 days</span></span>
    </button>`;
  }).join("");
  $("games").querySelectorAll(".grow").forEach((el) => {
    el.onclick = () => { $("game").value = el.dataset.game; load(); };
  });
}

function renderPosts() {
  const list = state.posts.filter((p) => state.platform === "all" || p.platform === state.platform).slice(0, 5);
  $("postsNote").textContent = list.length ? "Top 5 by views" : "";
  if (!list.length) {
    $("posts").innerHTML = '<p class="empty">No posts in this window.</p>';
    return;
  }
  const media = (p) => (p.platform === "youtube" && p.post_id
    ? `<div class="pthumb"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(p.post_id)}/hqdefault.jpg" onerror="this.style.display='none'"></div>`
    : `<div class="pthumb ph" style="--c:${platColor(p.platform)}">${platMark(p.platform)}</div>`);
  $("posts").innerHTML = list.map((p) => `
    <a class="postcard" href="${esc(p.url)}" target="_blank" rel="noopener">
      ${media(p)}
      <div class="pbody">
        <div class="ptitle">${esc(p.title || p.post_id)}</div>
        <div class="pmeta2">
          <span class="mark" style="background:${platColor(p.platform)}"></span>
          <span>${esc(platName(p.platform))}</span>
          <span>${p.published_at ? `Published ${fmtStamp(p.published_at)}` : `First seen ${fmtStamp(p.captured_at)}`}</span>
        </div>
        <div class="pstats">
          <div><span class="k">Views</span><span class="n">${fmtFull(p.views)}</span></div>
          <div><span class="k">Likes</span><span class="n">${fmtFull(p.likes)}</span></div>
          <div><span class="k">Comments</span><span class="n">${fmtFull(p.comments)}</span></div>
        </div>
      </div>
    </a>`).join("");
}

function renderAll() {
  const rows = state.allRows.filter((r) => state.platform === "all" || r.platform === state.platform);
  const { by, dates } = buildSeries(rows);
  setAccent();
  renderSummary(dates, by);
  renderBoard();
  renderChart(dates, by, rows);
  renderTopics(state.buzz);
  renderPosts();
}

async function load() {
  const game = $("game").value;
  if (!game) return;
  const days = Number($("days").value);
  $("status").textContent = "Loading…";
  try {
    const win = Math.min(days * 2, 90);
    const [trend, posts] = await Promise.all([
      j(`/api/trend?game=${game}&days=${win}`),
      j(`/api/posts?game=${game}&days=${win}&limit=5`).catch(() => ({ rows: [] })),
    ]);
    state.allRows = trend.rows ?? [];
    state.buzz = trend.buzz;
    state.posts = posts.rows ?? [];
    state.days = days;
    state.mid = iso(new Date(Date.now() - days * 864e5));
    state.platform = "all";

    const stamp = state.allRows.reduce((a, r) => (r.last_updated > a ? r.last_updated : a), "");
    $("status").innerHTML = [
      `<span>${esc(state.labels[game] ?? game)}</span>`,
      `<span>Last ${days} days</span>`,
      `<span>Collected ${stamp ? esc(stamp.slice(0, 16).replace("T", " ")) + " UTC" : "never"}</span>`,
    ].join("");
    renderAll();
  } catch (e) {
    $("status").textContent = "Could not load this game: " + e.message;
  }
}

function setTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
  $("theme").textContent = dark ? "☀" : "☾";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#14161C" : "#EFF1F5");
  try { renderAll(); } catch { /* nothing rendered yet */ }
}

async function init() {
  $("theme").textContent = isDark() ? "☀" : "☾";
  $("chartMode").querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      state.mode = b.dataset.m;
      $("chartMode").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      try { renderAll(); } catch { /* not loaded yet */ }
    };
  });
  $("clearPlat").onclick = () => { state.platform = "all"; renderAll(); };
  $("status").textContent = "Loading…";
  try {
    const data = await j("/api/games");
    state.games = data.games ?? [];
    state.labels = data.labels ?? {};
    $("game").innerHTML = state.games.map((g) => `<option value="${esc(g)}">${esc(state.labels[g] ?? g)}</option>`).join("");
    const pairs = await Promise.all(state.games.map(async (g) => {
      const d = await j(`/api/trend?game=${g}&days=7`).catch(() => null);
      const rows = d?.rows ?? [];
      const { by, dates } = buildSeries(rows);
      return [g, {
        total: rows.reduce((a, r) => a + r.views, 0),
        series: dates.map((x) => by[x].views),
        plats: [...new Set(rows.map((r) => r.platform))],
      }];
    }));
    state.gameTotals = Object.fromEntries(pairs.map(([g, o]) => [g, o.total]));
    state.gameSeries = Object.fromEntries(pairs.map(([g, o]) => [g, o.series]));
    state.gamePlats = Object.fromEntries(pairs.map(([g, o]) => [g, o.plats]));
    renderGames();
    await load();
  } catch (e) {
    $("status").textContent = "Could not reach the API: " + e.message;
  }
}

$("theme").onclick = () => setTheme(!isDark());
$("game").onchange = load;
$("days").onchange = load;
$("q").oninput = (e) => renderGames(e.target.value);
init();
