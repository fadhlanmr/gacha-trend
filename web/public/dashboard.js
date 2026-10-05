// Dashboard client. One worker serves this page and /api/*, so calls are same-origin.
const API = "";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const fmtFull = (n) => Intl.NumberFormat("en").format(n || 0);
const fmtDate = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtStamp = (s) => (s ? new Date(s).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isDark = () => document.documentElement.classList.contains("dark");

// Platform colours distinguish sources from the dashboard's violet controls.
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
  allRows: [], posts: [], buzz: null, platform: "all", days: 7, mode: "platform",
  game: "", postsError: false,
};
let chart;
let loadController;
let loadVersion = 0;

async function j(path, signal) {
  const r = await fetch(API + path, { signal });
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

function buildSeries(rows) {
  const by = {};
  const latest = {};
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  for (const date of dates) {
    const daily = rows.filter((r) => r.date === date);
    for (const r of daily) latest[r.platform] = r;
    by[date] = { views: 0, likes: 0, comments: 0, posts: 0, views_gained: 0, likes_gained: 0, comments_gained: 0 };
    for (const r of Object.values(latest)) {
      for (const key of ["views", "likes", "comments", "posts"]) by[date][key] += r[key] || 0;
    }
    for (const r of daily) {
      for (const key of ["views_gained", "likes_gained", "comments_gained"]) by[date][key] += r[key] || 0;
    }
  }
  return { by, dates };
}

// platform -> date -> summed `key` (views, likes, ...)
function series(rows, key) {
  const out = {};
  for (const r of rows) ((out[r.platform] ??= {})[r.date] = (out[r.platform][r.date] || 0) + (r[key] || 0));
  return out;
}
function windowTotals(rows) {
  const latest = {};
  const result = { views: 0, likes: 0, comments: 0, posts: 0, unbaselined: 0, viewEngagement: 0, viewGains: 0, hasViews: false };
  for (const r of rows) {
    if (!latest[r.platform] || r.date > latest[r.platform].date) latest[r.platform] = r;
    result.views += r.views_gained || 0;
    result.likes += r.likes_gained || 0;
    result.comments += r.comments_gained || 0;
    if (r.views > 0) {
      result.hasViews = true;
      result.viewGains += r.views_gained || 0;
      result.viewEngagement += (r.likes_gained || 0) + (r.comments_gained || 0);
    }
  }
  for (const r of Object.values(latest)) {
    result.posts += r.window_posts || 0;
    result.unbaselined += r.unbaselined_posts || 0;
  }
  return result;
}

// ---------- renderers ----------
function renderSummary(dates, by, rows) {
  const last = dates.at(-1);
  if (!last) {
    $("summary").innerHTML = ["Views gained", "Likes gained", "Comments gained", "Engagement", "Posts tracked"]
      .map((k) => `<div class="cell"><div class="k">${k}</div><div class="v">–</div><div class="d"></div></div>`).join("");
    $("overviewNote").textContent = `No captures in the last ${state.days} days`;
    return;
  }
  const cur = windowTotals(rows);
  const hasViews = cur.hasViews;
  const eng = cur.viewGains > 0 && cur.viewEngagement >= 0 ? (cur.viewEngagement / cur.viewGains) * 100 : null;
  const cells = [
    ["Views gained", hasViews ? fmtFull(cur.views) : "—"],
    ["Likes gained", fmtFull(cur.likes)],
    ["Comments gained", fmtFull(cur.comments)],
    ["Engagement", eng === null ? "—" : eng.toFixed(2) + "%"],
    ["Posts tracked", fmtFull(cur.posts)],
  ];
  $("summary").innerHTML = cells.map(([k, v]) => {
    const detail = k === "Engagement" ? "Gains on platforms reporting views"
       : k === "Posts tracked" ? `Seen in the last ${state.days} days`
       : k === "Views gained" && !hasViews ? "View counts unavailable"
       : `Observed in the last ${state.days} days`;
    return `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${detail}</div></div>`;
  }).join("");
  $("overviewNote").textContent = `Last ${state.days} days · Through ${fmtDate(last)}${cur.unbaselined ? ` · ${cur.unbaselined} older posts lack a starting baseline` : ""}`;
}

function renderBoard() {
  const focusedPlatform = $("board").contains(document.activeElement) ? document.activeElement.dataset.p : null;
  const rows = state.allRows;
  const plats = [...new Set(rows.map((r) => r.platform))];
  $("boardNote").textContent = state.platform === "all" ? "Select a platform to filter activity and posts" : `Viewing ${platName(state.platform)}`;
  $("clearPlat").hidden = state.platform === "all";
  if (!plats.length) return void ($("board").innerHTML = '<p class="empty">No platform captures in this window. Try a longer time window or check back after the next daily collection.</p>');
  const stats = plats.map((p) => {
    const totals = windowTotals(rows.filter((r) => r.platform === p));
    return { p, ...totals };
  }).sort((a, b) => b.views - a.views || b.likes - a.likes);
  const total = stats.reduce((a, s) => a + s.views, 0);
  const max = Math.max(...stats.map((s) => s.views), 1);
  $("board").innerHTML = stats.map((s) => {
    // Some platforms (X, Reddit) report no view counts, so lead with likes.
    const noViews = !s.hasViews;
    const value = noViews ? fmtFull(s.likes) : fmtFull(s.views);
    const unit = noViews ? "likes gained" : "views gained";
    const meta = noViews
      ? `<span>Last ${state.days} days</span><span>Views unavailable</span>`
      : `<span>Last ${state.days} days</span><span>${total > 0 ? Math.max(0, (s.views / total) * 100).toFixed(0) : 0}% of net view gains</span>`;
    return `
    <button class="ptile" data-p="${esc(s.p)}" style="--c:${platColor(s.p)}" aria-pressed="${state.platform === s.p}">
      <span class="ptop"><span class="pmark">${platMark(s.p)}</span>${esc(platName(s.p))}${state.platform === s.p ? '<span class="platform-check" aria-hidden="true">✓</span>' : ""}</span>
      <span class="pvalue-line"><span class="pval">${value}</span><span class="punit">${unit}</span></span>
      <span class="pmeta">${meta}</span>
      <span class="pbar"><i style="width:${noViews ? 0 : Math.max(0, (s.views / max) * 100)}%"></i></span>
    </button>`;
  }).join("");
  $("board").querySelectorAll(".ptile").forEach((el) => {
    if (el.dataset.p === focusedPlatform) el.focus({ preventScroll: true });
    el.onclick = () => {
      state.platform = state.platform === el.dataset.p ? "all" : el.dataset.p;
      renderAll();
    };
  });
}

function renderChart(dates, by, rows) {
  if (chart) { chart.destroy(); chart = null; }
  const mode = state.mode;
  $("chartDescription").textContent = {
    platform: "Observed view gains per post, grouped by platform. Gaps are attributed to the next capture; corrections may be negative.",
    total: "Last-known totals for tracked posts. Missing posts retain their last capture. Views on the left axis; likes on the right.",
    gain: "Observed gains per post. Views on the left axis; likes on the right. Missing history is not estimated.",
  }[mode];
  const viewsByP = series(rows, "views");
  const withViews = Object.keys(viewsByP).filter((p) => Object.values(viewsByP[p]).some((v) => v > 0));
  const withoutViews = Object.keys(viewsByP).filter((p) => !withViews.includes(p));

  let enough = mode === "total" ? dates.length >= 1 : dates.length > 1 || rows.some((r) => r.views_gained || r.likes_gained);
  if (mode === "platform" && withViews.length === 0) enough = false;

  $("chartNote").textContent = withoutViews.length
    ? `${withoutViews.map(platName).join(", ")} ${withoutViews.length > 1 ? "report" : "reports"} no view counts — see the platform tiles.`
    : "";
  const chartAvailable = typeof Chart !== "undefined";
  $("chartEmpty").hidden = enough && chartAvailable;
  $("chartBox").hidden = !enough || !chartAvailable;
  if (!enough) {
    $("chartEmpty").textContent = !dates.length
      ? "No captures in this window. Try a longer time window to see activity."
      : mode === "platform" && withViews.length === 0
      ? "No view counts in this selection — the platform tiles show likes instead."
      : "Not enough captures yet — a second collection is needed before a trend line appears.";
    return;
  }
  if (!chartAvailable) {
    $("chartEmpty").textContent = "The chart library could not load. Reload the page to try again; the activity totals are available above.";
    return;
  }

  const ink = cssVar("--brand"), mut = cssVar("--mut"), rule = cssVar("--rule");
  const ticks = { color: mut, callback: (v) => fmt(v) };
  let datasets = [], scales;

  if (mode === "platform") {
    datasets = withViews.sort().map((p) => ({
      type: "bar", label: platName(p), stack: "v", yAxisID: "y", borderRadius: 2, maxBarThickness: 46,
      backgroundColor: platColor(p),
      data: dates.map((d) => rows.find((r) => r.platform === p && r.date === d)?.views_gained ?? null),
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
    const gainOf = (m) => dates.map((d) => by[d][`${m}_gained`]);
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
      animation: matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 250 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: ink, boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: "rectRounded", font: { family: "Nunito Sans, system-ui, sans-serif", size: 12 } } },
        tooltip: {
          backgroundColor: cssVar("--ink"), titleColor: cssVar("--card"), bodyColor: cssVar("--card"),
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
  const rows = (entries) => entries.length
    ? entries.map(([k, n], i, arr) => {
        const max = Math.max(...arr.map((e) => e[1]), 1);
        return `<div class="trow">
          <div><div class="tname">${esc(k)}</div><div class="tbar"><i style="width:${(n / max) * 100}%"></i></div></div>
          <div class="tn">${n}</div>
        </div>`;
      }).join("")
    : `<p class="empty">No matching titles in this window. Try a longer time window.</p>`;
  $("topicsKw").innerHTML = rows(tracked);
  $("topicsTags").innerHTML = rows(tags);
  $("topicsNote").textContent = state.buzz?.samples ? `${fmtFull(state.buzz.samples)} titles · All platforms` : "All platforms";
}

function renderGames(filter = $("q").value) {
  const needle = filter.trim().toLowerCase();
  const list = state.games.filter((g) => g.includes(needle) || (state.labels[g] ?? "").toLowerCase().includes(needle));
  $("gameCount").textContent = list.length;
  if (!list.length) return void ($("gameList").innerHTML = '<p class="empty">No games match that filter.</p>');
  const entries = list.map((g) => [g, state.gameTotals[g] || 0]).sort((a, b) => b[1] - a[1]);
  $("gameList").innerHTML = entries.map(([g, v]) => {
    const plats = (state.gamePlats[g] ?? []).map((p) => `<span class="mark" style="background:${platColor(p)}" title="${esc(platName(p))}"></span>`).join(" ");
    const initials = (state.labels[g] ?? g).split(/[\s:-]+/).map((word) => word[0]).slice(0, 3).join("");
    const hasData = (state.gameSeries[g] ?? []).length > 0;
    return `<button class="grow" data-game="${esc(g)}" aria-current="${state.game === g}" aria-label="View ${esc(state.labels[g] ?? g)} dashboard">
      <span class="game-icon" aria-hidden="true">${esc(initials)}</span>
      <span><span class="gname">${esc(state.labels[g] ?? g)}</span><span class="gsub">${plats ? `${plats} <span>Official channels</span>` : "No captures yet"}</span></span>
      <span class="gv"><strong title="${fmtFull(v)} views gained in ${state.days} days">${hasData ? fmt(v) : "—"}</strong>${sparkline(state.gameSeries[g] || [], cssVar("--brand"))}</span>
    </button>`;
  }).join("");
  $("gameList").querySelectorAll(".grow").forEach((el) => {
    el.onclick = () => { $("game").value = el.dataset.game; load(); };
  });
}

function renderPosts() {
  const list = state.posts.filter((p) => state.platform === "all" || p.platform === state.platform).sort((a, b) => b.views - a.views || b.likes - a.likes).slice(0, 6);
  const byLikes = list.length > 0 && list.every((p) => !p.views);
  $("postsNote").textContent = list.length ? `Top ${list.length} by ${byLikes ? "likes" : "views"} · Opens in a new tab` : "";
  if (!list.length) {
    $("postList").innerHTML = `<p class="empty">${state.postsError ? "Posts could not load. Use the refresh button to try again." : "No posts in this selection. Try another platform or a longer time window."}</p>`;
    return;
  }
  // Platforms without view counts get their engagement stats instead.
  const stats = (p) => (p.views
    ? [["Views", fmtFull(p.views)], ["Likes", fmtFull(p.likes)], ["Comments", fmtFull(p.comments)]]
    : [["Likes", fmtFull(p.likes)], ["Replies", fmtFull(p.comments)], ["Reposts", fmtFull(p.shares)]]);
  const media = (p, i) => (p.platform === "youtube" && p.post_id
    ? `<div class="pthumb"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/${esc(encodeURIComponent(p.post_id))}/hqdefault.jpg"><span class="post-rank" aria-label="Rank ${i + 1}">${i + 1}</span></div>`
    : `<div class="pthumb ph" style="--c:${platColor(p.platform)}">${platMark(p.platform)}<span class="post-rank" aria-label="Rank ${i + 1}">${i + 1}</span></div>`);
  $("postList").innerHTML = list.map((p, i) => `
    <a class="postcard" href="${esc(p.url)}" target="_blank" rel="noopener">
      ${media(p, i)}
      <div class="pbody">
        <div class="pmeta2">
          <span class="mark" style="background:${platColor(p.platform)}"></span>
          <span>${esc(platName(p.platform))}</span>
          <span class="post-date">${fmtStamp(p.published_at || p.captured_at)}</span>
        </div>
        <div class="ptitle">${esc(p.title || p.post_id)}</div>
        <div class="pstats">
          ${stats(p).map(([k, v]) => `<div><span class="k">${k}</span><span class="n">${v}</span></div>`).join("")}
        </div>
      </div>
    </a>`).join("");
  $("postList").querySelectorAll("img").forEach((img) => {
    img.onerror = () => {
      img.hidden = true;
      img.parentElement.classList.add("ph");
      img.parentElement.style.setProperty("--c", platColor("youtube"));
      img.parentElement.insertAdjacentHTML("afterbegin", platMark("youtube"));
    };
  });
}

function renderAll() {
  const rows = state.allRows.filter((r) => state.platform === "all" || r.platform === state.platform);
  const { by, dates } = buildSeries(rows);
  $("gameTitle").textContent = state.labels[state.game] ?? "Social activity";
  $("scope").textContent = state.platform === "all" ? "All platforms" : platName(state.platform);
  renderSummary(dates, by, rows);
  renderBoard();
  renderChart(dates, by, rows);
  renderTopics(state.buzz);
  renderPosts();
  renderGames();
}

function setLoading(loading) {
  $("dashboard").setAttribute("aria-busy", String(loading));
  $("dashboard").inert = loading;
  $("refresh").disabled = loading;
  $("refresh").setAttribute("aria-label", loading ? "Refreshing dashboard" : "Refresh dashboard");
}

function showError(message) {
  $("errorMessage").textContent = message;
  $("error").hidden = false;
  $("status").dataset.state = "error";
  $("status").textContent = "Activity unavailable";
}

async function load() {
  const game = $("game").value;
  if (!state.games.includes(game)) return;
  const days = Number($("days").value);
  const version = ++loadVersion;
  loadController?.abort();
  loadController = new AbortController();
  const { signal } = loadController;
  setLoading(true);
  $("error").hidden = true;
  $("status").dataset.state = "loading";
  $("status").textContent = `Loading ${state.labels[game] ?? game} activity…`;
  try {
    const query = new URLSearchParams({ game, days: String(days) });
    const [trend, posts, comparison] = await Promise.all([
      j(`/api/trend?${query}`, signal),
      j(`/api/posts?${query}&limit=6`, signal).catch((e) => {
        if (e.name === "AbortError") throw e;
        return { rows: [], failed: true };
      }),
      loadComparison(days, signal),
    ]);
    if (version !== loadVersion) return;
    if (state.game !== game) state.platform = "all";
    state.game = game;
    state.allRows = trend.rows ?? [];
    // A platform may disappear when changing the time window.
    if (!state.allRows.some((r) => r.platform === state.platform)) state.platform = "all";
    state.buzz = trend.buzz;
    state.posts = posts.rows ?? [];
    state.postsError = Boolean(posts.failed);
    state.days = days;
    state.gameTotals = Object.fromEntries(comparison.map(([g, o]) => [g, o.total]));
    state.gameSeries = Object.fromEntries(comparison.map(([g, o]) => [g, o.series]));
    state.gamePlats = Object.fromEntries(comparison.map(([g, o]) => [g, o.plats]));
    $("gamesDescription").textContent = `Observed view gains in the last ${days} days`;
    const stamp = state.allRows.reduce((a, r) => (r.last_updated > a ? r.last_updated : a), "");
    $("status").dataset.state = "ready";
    $("status").innerHTML = [
      `<span>Last ${days} days</span>`,
      `<span>${stamp ? "Collected " + esc(stamp.slice(0, 16).replace("T", " ")) + " UTC" : "No captures yet — collected daily at 06:00 UTC"}</span>`,
    ].join("");
    renderAll();
  } catch (e) {
    if (version !== loadVersion || e.name === "AbortError") return;
    state.game = game;
    state.allRows = [];
    state.posts = [];
    state.buzz = null;
    state.platform = "all";
    state.postsError = true;
    renderAll();
    showError("Could not load this game’s activity. Check your connection and try again.");
  } finally {
    if (version === loadVersion) setLoading(false);
  }
}

function updateThemeButton() {
  const dark = isDark();
  $("theme").innerHTML = dark
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.5 13.2A8.5 8.5 0 0 1 10.8 3.5a8.5 8.5 0 1 0 9.7 9.7Z"/></svg>';
  const label = `Switch to ${dark ? "light" : "dark"} theme`;
  $("theme").setAttribute("aria-label", label);
  $("theme").title = label;
}

function setTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
  updateThemeButton();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#171A29" : "#F3F4FA");
  if (state.game) renderAll();
}

async function loadComparison(days, signal) {
  return Promise.all(state.games.map(async (g) => {
    const d = await j(`/api/trend?game=${encodeURIComponent(g)}&days=${days}`, signal).catch((e) => {
      if (e.name === "AbortError") throw e;
      return null;
    });
    const rows = d?.rows ?? [];
    const { by, dates } = buildSeries(rows);
    return [g, {
      total: windowTotals(rows).views,
      series: dates.map((x) => by[x].views_gained),
      plats: [...new Set(rows.map((r) => r.platform))],
    }];
  }));
}

async function init() {
  setLoading(true);
  $("error").hidden = true;
  $("status").dataset.state = "loading";
  $("status").textContent = "Loading official channel activity…";
  try {
    const data = await j("/api/games");
    state.games = data.games ?? [];
    state.labels = data.labels ?? {};
    $("game").innerHTML = state.games.map((g) => `<option value="${esc(g)}">${esc(state.labels[g] ?? g)}</option>`).join("");
    $("game").disabled = !state.games.length;
    if (!state.games.length) {
      $("game").innerHTML = '<option value="">No games configured</option>';
      renderAll();
      $("status").textContent = "No games are configured yet.";
      setLoading(false);
      return;
    }
    await load();
  } catch {
    $("game").innerHTML = '<option value="">Games unavailable</option>';
    $("game").disabled = true;
    renderAll();
    showError("Could not reach the dashboard API. Check your connection and try again.");
    setLoading(false);
  }
}

updateThemeButton();
$("theme").onclick = () => setTheme(!isDark());
$("game").onchange = load;
$("days").onchange = load;
$("q").oninput = (e) => renderGames(e.target.value);
$("chartMode").querySelectorAll("button").forEach((b) => {
  b.onclick = () => {
    state.mode = b.dataset.m;
    $("chartMode").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    if (state.game) renderAll();
  };
});
$("clearPlat").onclick = () => { state.platform = "all"; renderAll(); };
$("refresh").onclick = () => state.games.length ? load() : init();
$("retry").onclick = () => $("game").disabled ? init() : load();
init();
