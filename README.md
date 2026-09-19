# Gacha Trend (2 workers)

- `api/` — Hono + D1 + cron. Collects YouTube/Reddit (Twitch off, X ingest-only). No assets.
- `web/` — Astro static dashboard (ennead.cc style). Served by 2nd worker.

## Platform status (Cloudflare-side, verified 2026-09-19)

| Platform | Status | Reason |
|---|---|---|
| YouTube | live (needs `YOUTUBE_API_KEY`) | free Data API v3 |
| Reddit | likely 403 | blocks datacenter IPs without OAuth; use homelab ingest or add free OAuth later |
| Twitch | off (`ENABLE_TWITCH`) | needs free dev.twitch.tv app |
| X | ingest-only | all free endpoints dead (fxtwitter/vx/syndication); no paid API per rule |
| TikTok/IG | ingest-only | homelab push |

## Deploy (PowerShell, WSL20.04 can't run workerd locally)

```powershell
cd C:\Users\user\Documents\GitHub\gacha-trend
npx wrangler login
npm --prefix api run db:migrate   # remote D1
npm --prefix api run deploy       # -> https://gacha-trend-api.workers.dev
$env:PUBLIC_API_BASE="https://gacha-trend-api.workers.dev"
npm --prefix web run deploy       # builds Astro dist/ + deploys web worker
```

Local: `npm run api:dev` + `npm run web:dev` (separate terminals).

## Keys (Dashboard UI: Workers > gacha-trend-api > Settings > Variables and Secrets)

Missing key = collector returns `[]`, nothing crashes.

```
YOUTUBE_API_KEY, INGEST_TOKEN          # in use
TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET # only if you enable Twitch later
```

## Twitch: OFF by default

No official keyless Twitch API exists — Helix needs a free `dev.twitch.tv` app
(Client ID + Secret, no paid tier, just registration). Since you skip that:

- Nothing to do: `collectTwitch` returns `[]` unless `ENABLE_TWITCH=1` (or
  `true`, as a Text var) **and** both Twitch keys are set.
- To turn on later: add the 2 keys + `ENABLE_TWITCH=1` var, redeploy api.
- To show Twitch numbers without keys: push them from homelab via `/api/ingest`
  with `"platform":"twitch"` — ingest accepts any platform string.

## Homelab push (TikTok/IG)

```bash
curl -X POST "https://<api>.workers.dev/api/ingest?game=genshin-impact" \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '[{"platform":"tiktok","post_id":"abc","url":"...","title":"...","views":1,"likes":1,"comments":0,"shares":0}]'
```

## Add game

Edit `api/src/games.json`, then `POST /api/collect?game=<slug>`.
