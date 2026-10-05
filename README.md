# Gacha Trend

Social-activity dashboard for gacha games. **One Cloudflare Worker**: Hono API + Astro static dashboard, all free tier.

- `api/src/` — Hono API (`/api/*`), D1 access, cron collector.
- `web/` — Astro source. `npm run build` outputs `web/dist`, served as Worker static assets.
- `wrangler.jsonc` (root) — single worker: `main` + `assets` + D1 + cron.

Non-asset paths run the Worker; `/` and `/dashboard.js` are served from assets. Same origin, so no CORS and no API URL config.

## What the numbers mean

- The time window is the last **N UTC calendar days including today**. At a glance,
  platform tiles, daily gains and Across games all use that same window.
- Views/likes/comments gained are **per-post observed changes**, using the last
  capture before the window as the baseline. A newly published post in the window
  starts from zero; an older post without history starts at its first observed
  count. Its earlier growth is unknown, and the summary notes missing baselines.
- Totals retain each post's last-known count if it leaves a feed or a collection
  fails. They are totals for tracked posts, not the entire channel's lifetime views.
- Gaps are attributed to the next successful capture, not interpolated. Real
  count corrections can produce negative gains. Historical views that were never
  captured cannot be reconstructed.
- YouTube discovers the last 90 days of uploads through the uploads playlist
  (50 per page, including Shorts), and continues refreshing every previously
  tracked video in batches of 50. Older public videos already in D1 remain tracked.
- `/api/collect` returns `counts` and `errors`. A failed source or YouTube batch
  is reported; successful batches and other sources are still saved.

Regression checks: `npm test` (Node 22.13+ for SQLite) and `npm run typecheck`.

## Prerequisites

Node 20+, a Cloudflare account.

```sh
npm install
npx wrangler login
```

## Deploy

```sh
npm run db:migrate   # apply schema to remote D1
npm run deploy       # builds web/dist, then deploys the worker
```

Worker URL: `https://gacha-trend.<your-subdomain>.workers.dev` (API + dashboard together).

## Local dev

```sh
npm run dev          # builds web/dist, then wrangler dev --remote
```

Frontend change = rerun `npm run dev` (assets are built, not hot-reloaded).

## Secrets

**Secrets are per-worker.** This project deploys as `gacha-trend`; set secrets on that worker. Nothing secret lives in `wrangler.jsonc`.

```sh
npx wrangler secret put YOUTUBE_API_KEY   # required for YouTube collection
npx wrangler secret put INGEST_TOKEN      # bearer token for /api/ingest and /api/collect
```

Generate the token with `openssl rand -hex 32` (or `-join ((48..57)+(97..122) | Get-Random -Count 40 | % {[char]$_})` in PowerShell). Secrets persist across deploys and are not readable back out — to rotate, run `secret put` again.

The same two can be set in the Cloudflare dashboard → Workers & Pages → `gacha-trend` → Settings → Variables and Secrets → Add → type **Secret**.

For local dev, copy `api/.dev.vars.example` to `api/.dev.vars` (gitignored).

## Platform status (Cloudflare-side, verified 2026-09-21)

| Platform | Status | Reason |
|---|---|---|
| YouTube | live (needs `YOUTUBE_API_KEY`) | free Data API v3, Inspect -> search 'browse_id' |
| X | live (`ENABLE_X`) | keyless syndication timeline; no view counts |
| Twitch | off (`ENABLE_TWITCH`) | needs free dev.twitch.tv app |
| Reddit | blocked | JSON API 403s; the Atom feed works but carries no scores/comments |
| TikTok / Instagram / Facebook | ingest-only | no keyless read API; push from the homelab |

Platforms that report no view counts (X, Reddit) are handled by the dashboard:
their tile leads with likes instead of views and they are left out of the
"% of views" maths, and post cards show Likes/Replies/Reposts instead of
Views/Likes/Comments.

## X: on by default, unofficial (`ENABLE_X`)

One request per handle to
`https://syndication.twitter.com/srv/timeline-profile/screen-name/<handle>`
returns the latest ~20 posts as JSON embedded in the page's `__NEXT_DATA__` script.
No key, no paid tier.

- **No view counts.** X does not expose impressions here, so `views` stays 0 and the
  dashboard leads with likes for X. Retweets + quotes go into `shares` (shown as
  "Reposts" on the post cards).
- Thread replies are included, so a multi-post announcement counts as several posts.
- Unofficial and can break without warning — set `ENABLE_X` to `"0"` in `wrangler.jsonc`
  and redeploy to switch it off. On failure the collector returns nothing and the rest
  of the run continues.
- One request per handle per run, so rate limiting is not a practical concern at the
  daily cron cadence.

## Twitch: OFF by default

No official keyless Twitch API exists — Helix needs a free `dev.twitch.tv` app.

- `collectTwitch` returns `[]` unless `ENABLE_TWITCH=1` (or `true`) **and** both keys are set.
- To enable later: add `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` secrets and `ENABLE_TWITCH=1` var, redeploy.
- Or push Twitch numbers via `/api/ingest` with `"platform":"twitch"`.

## Homelab push (TikTok/IG/Reddit)

```sh
curl -X POST "https://gacha-trend.<your-subdomain>.workers.dev/api/ingest?game=genshin-impact" \
  -H "Authorization: Bearer $INGEST_TOKEN" -H "Content-Type: application/json" \
  -d '[{"platform":"tiktok","post_id":"abc","url":"...","title":"...","views":1,"likes":1,"comments":0,"shares":0}]'
```

Single object or array (max 500). Stored with `source='external'`.

An optional `thumbnail_url` supplies a photo or video-poster image for any
platform, for example `"thumbnail_url":"https://example.com/post.jpg"`.
X collection saves the first attached photo or video poster automatically.
Text-only posts and failed image loads use the platform icon.

Thumbnail support requires migration `0003_add_thumbnail_url.sql`: run
`npm run db:migrate` **before** `npm run deploy`, then collect again (or wait
for the daily cron). Existing snapshots have no thumbnail until a new capture
includes one; only posts still returned by the X timeline can be refreshed.

## Add game

Edit `api/src/games.json` (one block per game, no code change), redeploy, then:

```sh
curl -X POST "https://gacha-trend.<your-subdomain>.workers.dev/api/collect?game=<slug>" \
  -H "Authorization: Bearer $INGEST_TOKEN"
```

## Deploy to another Cloudflare organization

A Cloudflare account belongs to exactly one organization, so this means a second account. The D1 database does not transfer — it must be recreated there.

Run from PowerShell (WSL Ubuntu 20.04 can't run `workerd`):

```powershell
cd C:\Users\user\Documents\GitHub\gacha-trend
npm install

# 1. Point wrangler at the target account (API token: My Profile > API Tokens > "Edit Cloudflare Workers")
$env:CLOUDFLARE_API_TOKEN="<target-token>"
$env:CLOUDFLARE_ACCOUNT_ID="<target-account-id>"

# 2. Create the database in that account
npx wrangler d1 create gacha-trend-db
# -> copy the printed database_id into wrangler.jsonc (replaces the other org's id)

# 3. Schema + secrets
npx wrangler d1 migrations apply gacha-trend-db --remote
npx wrangler secret put YOUTUBE_API_KEY
npx wrangler secret put INGEST_TOKEN

# 4. Deploy
npm run deploy

# 5. Seed once (or wait for the 6am cron)
Invoke-RestMethod -Method Post -Uri "https://gacha-trend.<target-subdomain>.workers.dev/api/collect?game=genshin-impact" `
  -Headers @{ Authorization = "Bearer <your-token>" }

# 6. Stop targeting the wrong account
Remove-Item Env:CLOUDFLARE_API_TOKEN, Env:CLOUDFLARE_ACCOUNT_ID
```

Switching back to the first org: log in normally, or set that org's token, and restore its `database_id` in `wrangler.jsonc`.

> The `database_id` is per-account, so bouncing between orgs means swapping that one line. If it becomes frequent, keep a second config file and deploy with `wrangler deploy -c wrangler.org2.jsonc`.
