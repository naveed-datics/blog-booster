# Decision Log — 2026-08-10: Pipeline Security, Quality & Duplicate-Detection Hardening

This log records the decisions and changes made to this pipeline in one working session, triggered by an SEO audit of whatreligionisinfo.com (the site this pipeline publishes to) that traced several of the site's indexing problems back to how this pipeline generates content.

## Why this session happened

An SEO audit of whatreligionisinfo.com found:
- ~69% of the site's pages were never indexed by Google (`Crawled – currently not indexed`), traced to this pipeline publishing every article from an identical H2/FAQ template
- Low click-through rate on ranking pages, traced to a generic non-answering title template
- A slug-generation bug producing duplicate posts for accented names (e.g. "Mbappé" → "Mbapp")

Reviewing the pipeline itself surfaced further issues addressed below.

## PRs merged

| PR | Title | Decision / Why |
|---|---|---|
| [#1](https://github.com/naveed-datics/blog-booster/pull/1) | Remove hardcoded WordPress credential fallback | A real, base64-encoded WP password was committed in plaintext to this **public** repo, exposed since ~Jan 2026 (`app/api/wp-create-post/route.js`, `app/api/wp-delete-post/route.js`). Removed the fallback; the app now throws at startup if `WP_AUTH_HEADER` isn't set, instead of silently authenticating with the exposed credential. |
| [#2](https://github.com/naveed-datics/blog-booster/pull/2) | Add daily cron pipeline (`CRON_SECRET`-protected) | New `/api/cron/daily-articles`, wired to Vercel's native Cron Jobs (`vercel.json`). Every route in the chain (`trend-search`, `generate-article`, `image-search`, `find-sources`, `fetch-content`, `write-blog`, `humanize`, `wp-create-post`, `wordpress-posts`, `auto-generate-articles`) now accepts an `x-cron-secret` header as an alternative to the NextAuth session cookie (`lib/cronAuth.js`), so the pipeline can run unattended without ever storing a login password. |
| [#3](https://github.com/naveed-datics/blog-booster/pull/3) | Randomize article heading structure per generation | Root fix for the site's indexing problem. `write-blog` now injects a randomized 3-5 section structure (from a 16-angle pool) + FAQ angles per article, which overrides any fixed heading list — including a custom `prompt_template` stored per-website in the database, which likely was the actual source of the identical structure (not directly inspectable without DB access, but the fix works regardless of what's stored there). |
| [#4](https://github.com/naveed-datics/blog-booster/pull/4) | Filter low-authority sources, prefer reputable domains, use up to 6 | `find-sources` picked exactly 3 URLs by keyword-match score alone, no quality signal — in practice often other "celebrity religion" content-farm sites (rewrite-of-a-rewrite, weak E-E-A-T). Added `BLOCKED_DOMAINS` + a blanket rule rejecting any domain with "religion" in its name, a `PREFERRED_DOMAINS` scoring boost, and expanded selection to up to 6 domain-diverse sources — all from the existing single search call, no added API cost. |
| [#5](https://github.com/naveed-datics/blog-booster/pull/5) | Migrate find-sources and image-search to Tavily; add quota guard | Splits providers so one exhausted quota can't take the whole pipeline down (this had just happened — SerpAPI ran out mid-session, failing 10/10 articles in one run). `trend-search` stays on SerpAPI (~1 call/day, flat regardless of article volume); `find-sources`/`image-search` moved to Tavily (2 calls/article). Added a quota-exhaustion guard in `auto-generate-articles` that stops the batch immediately on a 429/quota-shaped error instead of retrying every remaining queue item. |
| [#6](https://github.com/naveed-datics/blog-booster/pull/6) | Implement real duplicate-detection before writing new articles | **Root-cause fix for a live incident** (below). `searchCelebrityUrl()` in `trend-search` was a no-op placeholder that always returned `null`. Now does a real WordPress search and compares slugs by Levenshtein edit distance — needed because the accent-truncation bug drops a character in the *middle* of a slug (`kylian-mbappe-religion` → `kylian-mbapp-religion`), which a simple prefix/`startsWith` check structurally cannot catch. |
| [#7](https://github.com/naveed-datics/blog-booster/pull/7) | Refresh stale-but-currently-trending existing articles | Once duplicate-detection correctly skips writing a new article for an already-covered trending name, that search-interest spike would otherwise be wasted. New `/api/update-stale-articles`: for trends matching an existing post that's 7+ days stale relative to the trend date (same threshold the dashboard's manual "Update" tab already used), does a fresh Tavily news search and inserts a short dated update section — not a full rewrite. Capped at 5/day. No explicit reindex call needed; Rank Math's Instant Indexing already auto-submits updated URLs. Self-reviewed before merge: found and fixed a quota-bounding gap where Tavily spend was counted by successful updates rather than attempts, which could have burned up to 50 calls instead of 5 on a run with downstream failures. |

## Incident: duplicate article publishing (2026-08-10, ~13:10–13:20 UTC)

Before PR #6 shipped, a live test of the daily cron published 15 articles — **13 were duplicates** of existing posts (Nigel Farage and Nancy Ajram each published 3x in one run).

**Response:**
1. Attempted to pause by removing `CRON_SECRET` from Vercel — did **not** take effect immediately (a warm serverless instance kept the old value in memory and kept processing, producing more duplicates during the delay). A forced redeploy was required to actually stop it.
2. Created 301 redirects (Rank Math) from all 13 duplicates to their canonical originals.
3. Unpublished all 13 duplicates (with explicit confirmation before each).
4. Shipped PR #6 as the root-cause fix.

**Known residual issue:** the 13 redirects fire (confirmed 301) but currently resolve to the homepage instead of the specific canonical article. Not yet root-caused — the Rank Math redirect list isn't readable via REST API, so this needs checking directly in WP Admin → Rank Math → Redirections.

**Process lesson:** a "pause" action that only removes an env var should be paired with an immediate forced redeploy, not attempted as a lighter first step — serverless warm-instance caching means the env var change alone isn't guaranteed to take effect promptly.

## Environment variables touched this session

| Variable | Change |
|---|---|
| `WP_AUTH_HEADER` | Rotated to a dedicated application password |
| `CRON_SECRET` | Created → removed (incident pause) → recreated |
| `TAVILY_API_KEY` | Added |
| `SERPAPI_KEY` | Rotated (site owner provided a fresh key after the original quota was exhausted) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Added, then removed — turned out unnecessary since Rank Math's Instant Indexing already covers reindexing |

## Current configuration

- Cron schedule: `05:00 UTC` daily (`vercel.json`)
- `DAILY_ARTICLE_LIMIT = 10` (new articles/day)
- `DAILY_REFRESH_LIMIT = 5` (stale-article refreshes/day)
- Quota budget: SerpAPI ~30/month of a 250/month plan; Tavily ~750/month of a 1000/month plan

## Open items

- [ ] Run one full manual end-to-end cron test (all 3 steps) before fully trusting the unattended daily schedule
- [ ] Diagnose the Rank Math redirect-to-homepage bug
- [ ] Consider splitting the shared `WP_AUTH_HEADER` credential (currently reused by an external SEO-fix routine too) for cleaner revocation boundaries
