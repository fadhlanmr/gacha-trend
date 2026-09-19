# Gacha Trend

Social-activity dashboard for gacha games. Two Cloudflare workers, all free tier:

- `api/` — Hono + D1 + cron (daily 6am). Collects YouTube/Reddit (Twitch off, X ingest-only). No assets.
- `web/` — Astro static dashboard. Served by a 2nd worker.

## Platform status (Cloudflare-side, verified 2026-09-19)

| Platform | Status | Reason |
|---|---|---|
| YouTube | live (needs `YOUTUBE_API_KEY`) | free Data API v3 |
| Reddit | likely 403 | blocks datacenter IPs without OAuth; use homelab ingest or add free OAuth later |
| Twitch | off (`ENABLE_TWITCH`) | needs free dev.twitch.tv app |
| X | ingest-only | all free endpoints dead (fxtwitter/vx/syndication); no paid API per rule |
| TikTok/IG | ingest-only | homelab push |

## Prerequisites

Node 20+, a Cloudflare account.

```sh
npx wrangler login
npm --prefix api install
npm --prefix web install
```

## Deploy

```sh
npm --prefix api run db:migrate   # remote D1
npm --prefix api run deploy       # -> https://<api>.<account>.workers.dev
PUBLIC_API_BASE="https://<api>.<account>.workers.dev" npm --prefix web run deploy
```

On Windows PowerShell, set the env var first:

```powershell
$env:PUBLIC_API_BASE="https://<api>.<account>.workers.dev"
npm --prefix web run deploy
```

## Local dev (separate terminals)

```sh
npm run api:dev
npm run web:dev
```

## Keys (Cloudflare dashboard: Workers > gacha-trend-api > Settings > Variables and Secrets)

Missing key = that collector returns `[]`, nothing crashes.

```
YOUTUBE_API_KEY, INGEST_TOKEN          # in use
TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET # only if you enable Twitch later
```

For local dev, put the same values in `api/.dev.vars` (gitignored, never commit).

## Twitch: OFF by default

No official keyless Twitch API exists — Helix needs a free `dev.twitch.tv` app
(Client ID + Secret, no paid tier, just registration). Since you skip that:

- Nothing to do: `collectTwitch` returns `[]` unless `ENABLE_TWITCH=1` (or
  `true`, as a Text var) **and** both Twitch keys are set.
- To turn on later: add the 2 keys + `ENABLE_TWITCH=1` var, redeploy api.
- To show Twitch numbers without keys: push them from homelab via `/api/ingest`
  with `"platform":"twitch"` — ingest accepts any platform string.

## Homelab push (TikTok/IG/Reddit/X)

```sh
curl -X POST "https://<api>.<account>.workers.dev/api/ingest?game=genshin-impact" \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '[{"platform":"tiktok","post_id":"abc","url":"...","title":"...","views":1,"likes":1,"comments":0,"shares":0}]'
```

Accepts a single object or an array (max 500). Stored with `source='external'`.

## Add game

Edit `api/src/games.json` (one block per game, no code change), redeploy api, then:

```sh
curl -X POST "https://<api>.<account>.workers.dev/api/collect?game=<slug>"
```
