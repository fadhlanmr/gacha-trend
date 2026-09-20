// KISS dashboard client. No framework, Chart.js CDN only.
// Single worker serves this page and /api/*, so calls are same-origin.
const API = "";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Intl.NumberFormat("en", { notation: "compact" }).format(n || 0);
let chart;

async function j(path) {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.json();
}

async function loadGames(filter = "") {
  const { games } = await j("/api/games");
  const sel = $("game");
  sel.innerHTML = "";
  const list = games.filter((g) => g.includes(filter.toLowerCase()));
  for (const g of list) {
    const o = document.createElement("option");
    o.value = o.textContent = g;
    sel.appendChild(o);
  }
  // Game cards: 7d totals each (N+1 calls, fine for <20 games).
  const grid = $("games");
  grid.innerHTML = "";
  for (const g of list) {
    const d = await j(`/api/trend?game=${g}&days=7`).catch(() => null);
    const tot = (d?.rows ?? []).reduce((a, r) => a + (r.views || 0), 0);
    const el = document.createElement("div");
    el.className = "card game";
    el.innerHTML = `<b>${g}</b><div class="big">${fmt(tot)}</div><div class="mut">views / 7d · click to view</div>`;
    el.onclick = () => { sel.value = g; load(); };
    grid.appendChild(el);
  }
}

async function load() {
  const game = $("game").value;
  const days = $("days").value;
  if (!game) return;
  const half = Math.ceil(days / 2);
  const [cur, prev] = await Promise.all([
    j(`/api/trend?game=${game}&days=${days}`),
    j(`/api/trend?game=${game}&days=${days}`).catch(() => null), // prev-window skipped (YAGNI): compare halves below
  ]);
  void prev;
  const rows = cur.rows ?? [];
  const mid = new Date(Date.now() - half * 864e5);
  let v1 = 0, v0 = 0, l1 = 0, l0 = 0;
  const byPlat = {};
  for (const r of rows) {
    const recent = new Date(r.date) >= mid;
    if (recent) { v1 += r.views; l1 += r.likes; } else { v0 += r.views; l0 += r.likes; }
    byPlat[r.platform] = (byPlat[r.platform] || 0) + r.views;
  }
  const pct = (a, b) => (b ? (((a - b) / b) * 100).toFixed(1) + "%" : "new");
  $("sViews").textContent = fmt(v1);
  $("sViewsD").textContent = `${pct(v1, v0)} vs prior ${half}d`;
  $("sLikes").textContent = fmt(l1);
  $("sLikesD").textContent = `${pct(l1, l0)} vs prior ${half}d`;
  const buzz = Object.entries(cur.buzz?.counts ?? {}).sort((a, b) => b[1] - a[1])[0];
  $("sBuzzUp").textContent = buzz ? buzz[0] : "–";
  $("sBuzzUpD").textContent = buzz ? `${buzz[1]} mentions / ${days}d` : "";
  const top = Object.entries(byPlat).sort((a, b) => b[1] - a[1])[0];
  $("sPlat").textContent = top ? top[0] : "–";
  $("sPlatD").textContent = top ? `${fmt(top[1])} views` : "";

  $("buzz").textContent = JSON.stringify(cur.buzz, null, 2);
  $("plats").textContent = JSON.stringify(byPlat, null, 2);
  $("raw").textContent = JSON.stringify(rows.slice(-10), null, 2);

  const byDate = {};
  for (const r of rows) {
    (byDate[r.date] ??= { views: 0, likes: 0 });
    byDate[r.date].views += r.views;
    byDate[r.date].likes += r.likes;
  }
  const labels = Object.keys(byDate).sort();
  if (chart) chart.destroy();
  chart = new Chart($("chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "views", data: labels.map((d) => byDate[d].views) },
        { label: "likes", data: labels.map((d) => byDate[d].likes) },
      ],
    },
    options: { plugins: { legend: { labels: { color: "#e8eaf0" } } } },
  });
}

$("go").onclick = load;
$("q").oninput = (e) => loadGames(e.target.value);
await loadGames();
await load();
