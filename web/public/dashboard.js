// KISS dashboard client. Single worker serves this page and /api/*, so calls are same-origin.
const API = "";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (n) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
const iso = (d) => d.toISOString().slice(0, 10);

const state = { games: [], gameTotals: {}, allRows: [], posts: [], buzz: null, platform: "all", mid: "", days: 7 };
let chart;

async function j(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
}

const totals = (rows) =>
  rows.reduce(
    (a, r) => ({ views: a.views + r.views, likes: a.likes + r.likes, comments: a.comments + r.comments }),
    { views: 0, likes: 0, comments: 0 }
  );

function delta(cur, prev) {
  if (!prev) return '<span class="mut">no prior window</span>';
  const x = ((cur - prev) / prev) * 100;
  return `<span class="${x >= 0 ? "up" : "down"}">${x >= 0 ? "+" : ""}${x.toFixed(1)}%</span> <span class="mut">vs prior ${state.days}d</span>`;
}

function renderSnapshot(recent, prior) {
  const t = totals(recent), p = totals(prior);
  $("sViews").textContent = fmt(t.views);
  $("sViewsD").innerHTML = delta(t.views, p.views);
  $("sLikes").textContent = fmt(t.likes);
  $("sLikesD").innerHTML = delta(t.likes, p.likes);
  const eng = t.views ? ((t.likes + t.comments) / t.views) * 100 : 0;
  $("sEng").textContent = eng.toFixed(2) + "%";
  $("sEngD").textContent = `${fmt(t.likes + t.comments)} interactions`;

  const byPlat = {};
  for (const r of recent) byPlat[r.platform] = (byPlat[r.platform] || 0) + r.views;
  const top = Object.entries(byPlat).sort((a, b) => b[1] - a[1])[0];
  $("sPlat").textContent = top ? top[0] : "–";
  $("sPlatD").textContent = top ? `${fmt(top[1])} views` : "";
}

function renderChart(recent) {
  const byDate = {};
  for (const r of recent) {
    (byDate[r.date] ??= { views: 0, likes: 0, comments: 0 });
    byDate[r.date].views += r.views;
    byDate[r.date].likes += r.likes;
    byDate[r.date].comments += r.comments;
  }
  const labels = Object.keys(byDate).sort();
  if (chart) { chart.destroy(); chart = null; }
  $("chartEmpty").style.display = labels.length ? "none" : "block";
  $("chart").style.display = labels.length ? "block" : "none";
  if (!labels.length) return;
  chart = new Chart($("chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "views", data: labels.map((d) => byDate[d].views) },
        { label: "likes", data: labels.map((d) => byDate[d].likes) },
        { label: "comments", data: labels.map((d) => byDate[d].comments) },
      ],
    },
    options: {
      plugins: { legend: { labels: { color: "#e8eaf0" } } },
      scales: {
        x: { ticks: { color: "#9aa3b2" }, grid: { color: "#262b36" } },
        y: { beginAtZero: true, ticks: { color: "#9aa3b2" }, grid: { color: "#262b36" } },
      },
    },
  });
}

function renderBuzz(buzz) {
  const entries = Object.entries(buzz?.counts ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return void ($("buzz").innerHTML = '<div class="empty">No keyword hits.</div>');
  const max = entries[0][1];
  $("buzz").innerHTML = entries
    .map(([k, n]) => `<div class="buzzrow">
        <div><div>${esc(k)}</div><div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div></div>
        <div class="num" style="text-align:right">${n}</div>
      </div>`)
    .join("");
}

function renderPlatforms(recent) {
  const by = {};
  for (const r of recent) {
    const b = (by[r.platform] ??= { views: 0, likes: 0, comments: 0 });
    b.views += r.views; b.likes += r.likes; b.comments += r.comments;
  }
  const list = Object.entries(by).sort((a, b) => b[1].views - a[1].views);
  if (!list.length) return void ($("plats").innerHTML = '<div class="empty">No data.</div>');
  $("plats").innerHTML =
    `<table><tr><th>Platform</th><th class="num">Views</th><th class="num">Likes</th></tr>` +
    list.map(([p, b]) => `<tr><td>${esc(p)}</td><td class="num">${fmt(b.views)}</td><td class="num">${fmt(b.likes)}</td></tr>`).join("") +
    `</table>`;
}

function renderPosts() {
  const list = state.posts.filter((p) => state.platform === "all" || p.platform === state.platform);
  if (!list.length) return void ($("posts").innerHTML = '<div class="empty">No posts in this window.</div>');
  $("posts").innerHTML =
    `<table><tr><th>Title</th><th>Platform</th><th class="num">Views</th><th class="num">Likes</th><th class="num">Comments</th></tr>` +
    list
      .map(
        (p) => `<tr>
          <td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc((p.title || p.post_id).slice(0, 90))}</a></td>
          <td>${esc(p.platform)}</td>
          <td class="num">${fmt(p.views)}</td>
          <td class="num">${fmt(p.likes)}</td>
          <td class="num">${fmt(p.comments)}</td>
        </tr>`
      )
      .join("") +
    `</table>`;
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
  const rows = state.allRows.filter((r) => state.platform === "all" || r.platform === state.platform);
  const recent = rows.filter((r) => r.date >= state.mid);
  const prior = rows.filter((r) => r.date < state.mid);
  renderSnapshot(recent, prior);
  renderChart(recent);
  renderBuzz(state.buzz); // keyword hits are game-wide, not split per platform
  renderPlatforms(recent);
  renderPosts();
  $("filters").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.p === state.platform));
}

async function load() {
  const game = $("game").value;
  if (!game) return;
  const days = Number($("days").value);
  $("status").textContent = "Loading…";
  try {
    const win = Math.min(days * 2, 90); // fetch 2 windows: recent + prior for deltas
    const [trend, posts] = await Promise.all([
      j(`/api/trend?game=${game}&days=${win}`),
      j(`/api/posts?game=${game}&days=${win}&limit=20`).catch(() => ({ rows: [] })),
    ]);
    state.allRows = trend.rows ?? [];
    state.buzz = trend.buzz;
    state.posts = posts.rows ?? [];
    state.days = days;
    state.mid = iso(new Date(Date.now() - days * 864e5));
    state.platform = "all";
    const stamp = state.allRows.reduce((a, r) => (r.last_updated > a ? r.last_updated : a), "");
    $("status").textContent = `${game} · ${state.allRows.length} day-rows · updated ${stamp ? stamp.slice(0, 16).replace("T", " ") + " UTC" : "n/a"}`;
    renderFilters();
    renderAll();
  } catch (e) {
    $("status").textContent = "Error: " + e.message;
  }
}

function renderGameList(filter = "") {
  const list = state.games.filter((g) => g.toLowerCase().includes(filter.toLowerCase()));
  if (!list.length) return void ($("games").innerHTML = '<div class="empty">No games match.</div>');
  $("games").innerHTML = list
    .map((g) => `<div class="game" data-game="${esc(g)}"><b>${esc(g)}</b><div class="mut">${fmt(state.gameTotals[g])} views / 7d</div></div>`)
    .join("");
  $("games").querySelectorAll(".game").forEach((el) => {
    el.onclick = () => { $("game").value = el.dataset.game; load(); };
  });
}

async function init() {
  $("status").textContent = "Loading…";
  try {
    const { games } = await j("/api/games");
    state.games = games;
    $("game").innerHTML = games.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
    // 7d totals per game for the Games panel (parallel; fine for a handful of games).
    const pairs = await Promise.all(
      games.map(async (g) => {
        const d = await j(`/api/trend?game=${g}&days=7`).catch(() => null);
        return [g, (d?.rows ?? []).reduce((a, r) => a + r.views, 0)];
      })
    );
    state.gameTotals = Object.fromEntries(pairs);
    renderGameList();
    await load();
  } catch (e) {
    $("status").textContent = "Error: " + e.message;
  }
}

$("game").onchange = load;
$("days").onchange = load;
$("q").oninput = (e) => renderGameList(e.target.value);
init();
