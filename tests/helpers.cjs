const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { DatabaseSync } = require("node:sqlite");

// Run the actual TypeScript against SQLite, using D1's prepare/bind/all shape.
function loadTS(file) {
  const absolute = path.resolve(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (!name.startsWith(".")) return require(name);
    const resolved = path.resolve(path.dirname(absolute), name);
    return resolved.endsWith(".json") ? require(resolved) : loadTS(resolved + ".ts");
  };
  vm.runInThisContext(`(function(require, module, exports) { ${code}\n})`, { filename: absolute })(localRequire, module, module.exports);
  return module.exports;
}

function database() {
  const sql = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("api/migrations").sort()) {
    if (file.endsWith(".sql")) sql.exec(fs.readFileSync(`api/migrations/${file}`, "utf8"));
  }
  const db = {
    prepare(query) {
      const statement = sql.prepare(query);
      return { bind: (...args) => ({ all: async () => ({ results: statement.all(...args) }) }) };
    },
  };
  const insert = sql.prepare(`INSERT INTO snapshots
    (game, platform, post_id, title, views, likes, comments, shares, source, captured_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'test', ?, ?)`);
  return {
    db, sql,
    add({ game = "genshin-impact", platform = "youtube", post = "a", title = "Genshin Impact #genshin", views = 0, likes = 0, comments = 0, shares = 0, captured, published = null }) {
      insert.run(game, platform, post, title, views, likes, comments, shares, captured, published);
    },
  };
}

function day(offset, hour = "06") {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offset);
  return `${now.toISOString().slice(0, 10)}T${hour}:00:00.000Z`;
}

module.exports = { loadTS, database, day };
