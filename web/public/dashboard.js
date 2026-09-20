// KISS dashboard client. Single worker serves this page and /api/*, so calls are same-origin.
const API = "";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const fmtFull = (n) => Intl.NumberFormat("en").format(n || 0);
const fmtDate = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
const iso = (d) => d.toISOString().slice(0, 10);
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// --- inline icons (feather-style), mounted into [data-ic] ---
const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICON = {
  views: svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  likes: svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l8.8 8.6 8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>'),
  eng: svg('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
  plat: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>'),
  buzz: svg('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>'),
  game: svg('<rect x="2" y="6" width="20" height="12" rx="6"/><line x1="7" y1="12" x2="11" y2="12"/><line x1="9" y1="10" x2="9" y2="14"/><circle cx="15.5" cy="13" r="1"/><circle cx="18" cy="11" r="1"/>'),
};
const mountIcons = () => document.querySelectorAll("[data-ic]").forEach((el) => (el.innerHTML = ICON[el.dataset.ic] || ""));

const PLATFORM_C = { youtube: "#ff0033", reddit: "#ff4500", twitch: "#9146ff", x: "#71767b", tiktok: "#0fb5c4", instagram: "#e1306c", facebook: "#1877f2" };
const platColor = (p) => PLATFORM_C[p] || cssVar("--acc");

const state = { games: [], gameTotals: {}, allRows: [], posts: [], buzz: null, platform: "all", mid: "", days: 7 };
let chart;

async function j(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

// --- small visual builders (DRY: shared by every panel) ---
let sparkSeq = 0;
function sparkline(values, color) {
  if (!values.length) return "";
  const w = 100, h = 30, pad = 4;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const x = (i) => (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const d = values.length === 1
    ? `M0 ${y(values[0]).toFixed(1)} L ${w} ${y(values[0]).toFixed(1)}`
    : values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const id = "sp" + ++sparkSeq;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${d} L ${w} ${h} L 0 ${h} Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

const avatar = (slug) => {
  const initials = slug.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  let hue = 0;
  for (const ch of slug) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="avatar" style="--a:hsl(${hue} 72% 58%);--b:hsl(${(hue + 48) % 360} 72% 46%)">${esc(initials)}</span>`;
};

const bar = (pct, color) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;${color ? `background:${color};` : ""}"></i></div>`;

const dpill = (d) => {
  if (d === null || d === undefined) return '<span class="dpill flat">no prior day</span>';
  if (d === 0) return '<span class="dpill flat">no change</span>';
  return `<span class="dpill ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${fmt(Math.abs(d))}</span>`;
};

// Aggregate day rows into per-date totals (and per-platform views).
function buildSeries(rows) {
  const by = {};
  for (const r of rows) {
    const b = (by[r.date] ??= { views: 0, likes: 0, comments: 0, platforms: {} });
    b.views += r.views; b.likes += r.likes; b.comments += r.comments;
    b.platforms[r.platform] = (b.platforms[r.platform] || 0) + r.views;
  }
  return { by, dates: Object.keys(by).sort() };
}

function renderSnapshot(dates, by) {
  const last = dates.at(-1);
  if (!last) {
    for (const id of ["sViews", "sLikes", "sEng", "sPlat"]) $(id).textContent = "–";
    for (const id of ["sViewsD", "sLikesD", "sEngD", "sPlatD", "sViewsSpark", "sLikesSpark"]) $(id).innerHTML = "";
    $("snapHint").textContent = "";
    return;
  }
  const prev = dates.length > 1 ? by[dates.at(-2)] : null;
  const cur = by[last];

  $("sViews").textContent = fmt(cur.views);
  $("sViewsD").innerHTML = `${dpill(prev ? cur.views - prev.views : null)} <span class="mut">vs prev day</span>`;
  $("sLikes").textContent = fmt(cur.likes);
  $("sLikesD").innerHTML = `${dpill(prev ? cur.likes - prev.likes : null)} <span class="mut">vs prev day</span>`;

  const eng = cur.views ? ((cur.likes + cur.comments) / cur.views) * 100 : 0;
  $("sEng").textContent = eng.toFixed(2) + "%";
  $("sEngD").innerHTML = `<span class="mut">${fmtFull(cur.likes + cur.comments)} interactions</span>`;

  const top = Object.entries(cur.platforms).sort((a, b) => b[1] - a[1])[0];
  $("sPlat").textContent = top ? top[0] : "–";
  $("sPlatD").innerHTML = top ? `<span class="pdot" style="background:${platColor(top[0])}"></span> <span class="mut">${fmt(top[1])} views</span>` : "";

  $("snapHint").textContent = `latest capture ${fmtDate(last)}`;
  $("sViewsSpark").innerHTML = sparkline(dates.map((d) => by[d].views), cssVar("--acc"));
  $("sLikesSpark").innerHTML = sparkline(dates.map((d) => by[d].likes), cssVar("--acc2"));
}

function renderChart(dates, by) {
  if (chart) { chart.destroy(); chart = null; }
  const enough = dates.length > 1;
  $("chartEmpty").style.display = enough ? "none" : "block";
  $("chart").style.display = enough ? "block" : "none";
  if (!enough) return;

  const gain = (metric) => dates.map((d, i) => (i === 0 ? null : Math.max(0, by[d][metric] - by[dates[i - 1]][metric])));
  const c = { txt: cssVar("--txt"), mut: cssVar("--mut"), line: cssVar("--line"), acc: cssVar("--acc"), acc2: cssVar("--acc2") };

  chart = new Chart($("chart"), {
    data: {
      labels: dates.map(fmtDate),
      datasets: [
        { type: "bar", label: "views gained", data: gain("views"), backgroundColor: c.acc, hoverBackgroundColor: c.acc2, borderRadius: 5, maxBarThickness: 42, yAxisID: "y", order: 2 },
        { type: "line", label: "likes gained", data: gain("likes"), borderColor: c.acc2, backgroundColor: c.acc2, yAxisID: "y1", tension: 0.35, pointRadius: 2.5, pointHoverRadius: 4, borderWidth: 2, order: 1 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: c.txt, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } },
        tooltip: {
          backgroundColor: c.txt, titleColor: cssVar("--card"), bodyColor: cssVar("--card"),
          padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4,
          callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtFull(ctx.parsed.y ?? 0)}` },
        },
      },
      scales: {
        x: { ticks: { color: c.mut, maxRotation: 0, autoSkipPadding: 16 }, grid: { display: false }, border: { color: c.line } },
        y: { beginAtZero: true, position: "left", ticks: { color: c.mut, callback: (v) => fmt(v) }, grid: { color: c.line }, border: { display: false } },
        y1: { beginAtZero: true, position: "right", ticks: { color: c.mut, callback: (v) => fmt(v) }, grid: { display: false }, border: { display: false } },
      },
    },
  });
}

function renderPlatforms(rows) {
  const by = {};
  for (const r of rows) by[r.platform] = (by[r.platform] || 0) + r.views;
  const entries = Object.entries(by).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return void ($("plats").innerHTML = '<div class="empty">No data.</div>');
  const total = entries.reduce((a, e) => a + e[1], 0) || 1;
  $("plats").innerHTML = `<div class="rows">` + entries.map(([p, v]) => `
    <div class="row">
      <span class="pdot" style="background:${platColor(p)}"></span>
      <div><div class="row-name">${esc(p)}</div>${bar((v / entries[0][1]) * 100, platColor(p))}</div>
      <div class="row-val">${fmt(v)}<span class="row-sub">${((v / total) * 100).toFixed(0)}% share</span></div>
    </div>`).join("") + `</div>`;
}

function renderGames(filter = "") {
  const list = state.games.filter((g) => g.toLowerCase().includes(filter.toLowerCase()));
  if (!list.length) return void ($("games").innerHTML = '<div class="empty">No games match.</div>');
  const entries = list.map((g) => [g, state.gameTotals[g] || 0]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((e) => e[1]), 1);
  $("games").innerHTML = `<div class="rows">` + entries.map(([g, v]) => `
    <div class="row clickable" data-game="${esc(g)}">
      ${avatar(g)}
      <div><div class="row-name">${esc(g)}</div>${bar((v / max) * 100)}</div>
      <div class="row-val">${fmt(v)}<span class="row-sub">7d views</span></div>
    </div>`).join("") + `</div>`;
  $("games").querySelectorAll(".clickable").forEach((el) => {
    el.onclick = () => { $("game").value = el.dataset.game; load(); };
  });
}

function renderBuzz(buzz) {
  const tracked = Object.entries(buzz?.counts ?? {}).sort((a, b) => b[1] - a[1]);
  const terms = Object.entries(buzz?.terms ?? {});
  const parts = [];
  if (tracked.length) {
    const max = Math.max(...tracked.map((e) => e[1]), 1);
    parts.push(`<div class="group"><div class="glabel">Tracked keywords</div><div class="rows">` +
      tracked.map(([k, n]) => `
        <div class="row">
          <span class="pdot" style="background:var(--acc)"></span>
          <div><div class="row-name">${esc(k)}</div>${bar((n / max) * 100)}</div>
          <div class="row-val">${n}<span class="row-sub">posts</span></div>
        </div>`).join("") + `</div></div>`);
  }
  if (terms.length) {
    parts.push(`<div class="group"><div class="glabel">Top hashtags</div><div class="chips">` +
      terms.map(([k, n]) => `<span class="chip">${esc(k)} <b>${n}</b></span>`).join("") + `</div></div>`);
  }
  $("buzz").innerHTML = parts.join("") || '<div class="empty">No titles captured yet.</div>';
}

const thumb = (p) => (p.platform === "youtube" && p.post_id
  ? `<img class="thumb" loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(p.post_id)}/mqdefault.jpg" onerror="this.style.visibility='hidden'">`
  : `<span class="thumb" style="background:${platColor(p.platform)};opacity:.3"></span>`);

function renderPosts() {
  const list = state.posts.filter((p) => state.platform === "all" || p.platform === state.platform);
  $("postsHint").textContent = list.length ? `${list.length} posts` : "";
  if (!list.length) {
    $("posts").innerHTML = '<tbody><tr><td class="empty">No posts in this window.</td></tr></tbody>';
    return;
  }
  $("posts").innerHTML =
    `<thead><tr><th></th><th>Title</th><th>Platform</th><th class="num">Views</th><th class="num">Likes</th><th class="num">Comments</th></tr></thead><tbody>` +
    list.map((p, i) => `
      <tr>
        <td class="rk">${i + 1}</td>
        <td><div class="ttitle">${thumb(p)}<a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(p.title)}">${esc(p.title || p.post_id)}</a></div></td>
        <td><span class="pill"><span class="pdot" style="background:${platColor(p.platform)}"></span>${esc(p.platform)}</span></td>
        <td class="num">${fmtFull(p.views)}</td>
        <td class="num">${fmtFull(p.likes)}</td>
        <td class="num">${fmtFull(p.comments)}</td>
      </tr>`).join("") +
    `</tbody>`;
}

function renderFilters() {
  const plats = [...new Set(state.allRows.map((r) => r.platform))].sort();
  $("filters").innerHTML = ["all", ...plats]
    .map((p) => `<button data-p="${esc(p)}" class="${state.platform === p ? "on" : ""}">${esc(p)}</button>`)
    .join("");
  $("filters").querySelectorAll("button").forEach((b) => {
    b.onclick = () => { state.platform = b.dataset.p; renderAll(); };
  });
}

function renderAll() {
  if (!state.allRows.length && !state.posts.length) return;
  const rows = state.allRows.filter((r) => state.platform === "all" || r.platform === state.platform);
  const { by, dates } = buildSeries(rows);
  renderSnapshot(dates, by);
  renderChart(dates, by);
  renderPlatforms(rows.filter((r) => r.date >= state.mid));
  renderBuzz(state.buzz);
  renderPosts();
  $("filters").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.p === state.platform));
}

async function load() {
  const game = $("game").value;
  if (!game) return;
  const days = Number($("days").value);
  $("status").textContent = "Loading…";
  try {
    const win = Math.min(days * 2, 90); // 2 windows so the chart can plot daily gains across the span
    const [trend, posts] = await Promise.all([
      j(`/api/trend?game=${game}&days=${win}`),
      j(`/api/posts?game=${game}&days=${win}&limit=25`).catch(() => ({ rows: [] })),
    ]);
    state.allRows = trend.rows ?? [];
    state.buzz = trend.buzz;
    state.posts = posts.rows ?? [];
    state.days = days;
    state.mid = iso(new Date(Date.now() - days * 864e5));
    state.platform = "all";

    const { by, dates } = buildSeries(state.allRows);
    const last = dates.at(-1);
    $("hViews").textContent = fmt(last ? by[last].views : 0);
    $("hPosts").textContent = state.buzz?.samples ?? 0;
    $("hGames").textContent = state.games.length;
    $("hPlats").textContent = new Set(state.allRows.map((r) => r.platform)).size;
    const stamp = state.allRows.reduce((a, r) => (r.last_updated > a ? r.last_updated : a), "");
    $("status").textContent = `${game} · updated ${stamp ? stamp.slice(0, 16).replace("T", " ") + " UTC" : "n/a"}`;

    renderFilters();
    renderAll();
  } catch (e) {
    $("status").textContent = "Error: " + e.message;
  }
}

function setTheme(light, rerender = true) {
  document.documentElement.classList.toggle("light", light);
  localStorage.setItem("theme", light ? "light" : "dark");
  $("theme").textContent = light ? "☀" : "☾";
  if (rerender) renderAll();
}

async function init() {
  mountIcons();
  $("theme").textContent = document.documentElement.classList.contains("light") ? "☀" : "☾";
  $("status").textContent = "Loading…";
  try {
    const { games } = await j("/api/games");
    state.games = games;
    $("game").innerHTML = games.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
    const pairs = await Promise.all(
      games.map(async (g) => {
        const d = await j(`/api/trend?game=${g}&days=7`).catch(() => null);
        return [g, (d?.rows ?? []).reduce((a, r) => a + r.views, 0)];
      })
    );
    state.gameTotals = Object.fromEntries(pairs);
    renderGames();
    await load();
  } catch (e) {
    $("status").textContent = "Error: " + e.message;
  }
}

$("theme").onclick = () => setTheme(!document.documentElement.classList.contains("light"));
$("game").onchange = load;
$("days").onchange = load;
$("q").oninput = (e) => renderGames(e.target.value);
init();
