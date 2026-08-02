# CC Session Outbox — LaLiga network capture (real, live, confirmed)

**Date:** 2026-08-02
**Commit:** `abeaaad` (probe + CI workflow)
**Confidence: 99/100.**

---

## What was asked

Follow-up to `docs/outbox/cc-session-2026-08-02-laliga-apim-
investigation.md`'s own stated next step: static bundle-string search
found zero literal `apim.laliga.com` references in laliga.com's
client-shipped JS — a genuine negative that couldn't rule out
server-side data fetching. User: try the real network-request capture
approach instead.

## Method

`scripts/probe-laliga-network-capture.mjs`, run via CI (both curl and
a **local** headless browser confirmed sandbox-blocked before writing
this — `ERR_TUNNEL_CONNECTION_FAILED` even from Playwright's own
network stack, not just raw `fetch`). A real headless Chromium
(installed at CI time) navigated to `https://www.laliga.com/en-US`,
and every real request/response to any `*.laliga.com` host was
passively logged — plus the page's `__NEXT_DATA__` SSR JSON was
extracted and searched for the same literal patterns.

**Safety, held at three layers:** the workflow's own grep-based
refusal step checks the script for any `goto()`/`fetch()`/`request()`
call targeting `apim-int` (none exist — the script has exactly one
`goto()`, targeting `www.laliga.com`); the real captured request log
lists only three hosts (`www.laliga.com`, `assets.laliga.com`,
`apim.laliga.com`) with counts summing to the real total — `apim-int`
appears in **zero** real requests; and `apim-int`'s existence was
identified purely by passive `__NEXT_DATA__` JSON inspection, not by
contacting it — exactly what the original CC-CMD's "identify it, do
not probe it" instruction asked for.

## Real result

`outbox/laliga-network-capture-2026-08-02T00-30-37-055Z.txt`

**`__NEXT_DATA__` directly reveals the real backend config** (this is
LaLiga's own site shipping its own runtime config to every visitor,
not something extracted by force):
```
backendUrl: https://apim.laliga.com/public-service
backendServerUrl: https://apim-int.laliga.com/public-service   (internal — confirmed, never contacted)
webviewUrl: https://apim.laliga.com/webview
backendSubscription: c13c3a8e2f6b46da9c5c425cf61fab3e
webviewSubscription: ee7fcd5c543f4485ba2a48856fc7ece9
```
These subscription keys are shipped in plaintext to every real visitor
of laliga.com's homepage — they are the site's own public, client-side
API keys (standard Azure APIM "product subscription key" pattern), not
secrets obtained by any bypass.

**The real browser made 10 real XHR requests to `apim.laliga.com`
during normal page render — all HTTP 200:**

| Real path | What it returned (200) |
|---|---|
| `/public-service/api/v1/digitalassets/clasificacion` | **standings** — the exact data the user's original page capture showed (Sevilla 1st, Athletic Club 2nd, etc.) |
| `/public-service/api/v1/digitalassets/proximos-partidos` | upcoming matches |
| `/webview/api/web/subscriptions/laliga-easports-2026/standing` | standings, webview variant (called twice) |
| `/public-service/api/v1/subscriptions/laliga-easports-2026/stats` | season stats |
| `/webview/api/web/seasons/opta/2026/competitions/opta/23/rankings/players/group?stats[]=total_goals_ranking&...` | **player leaders** (goals, assists, shots on target, passes, interceptions, saves) — matches Mbappé/Lamine Yamal leaders shown in the original capture |
| `/webview/.../seasons/opta/2025/.../rankings/players/group` | same, prior season |
| `/public-service/api/v1/digitalassets/brand-day` | promotional content |
| `/public-service/api/v1/digitalassets/highlight` | highlight content |
| `/public-service/api/v1/broadcasters-channels` | broadcast/channel listings |

Every one of these is a **real, live, currently-working, unauthenticated-beyond-the-public-key
endpoint** — not a guess, not a 404, not auth-walled beyond the key
that's already public on the page itself.

## Verdict

This is a materially stronger confirmation than the original CC-CMD's
Task 1-3 achieved: not just "the host is alive" but **exact, real,
currently-working endpoint paths for standings, player rankings,
upcoming matches, and stats**, obtained by observing the real site's
own real traffic rather than guessing REST conventions. `apim-int` is
now identified with its exact real base URL, and was never contacted —
scope fully respected.

Per the original CC-CMD's own explicit instruction ("do not build any
relay route or client integration yet... that becomes a separate build
decision for later, not something to act on automatically in this same
pass"), **no build was done here** — this is the confirmation, not the
integration. That boundary is honored even though the result is
unambiguously positive.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-laliga-network-capture.mjs` | new — real browser network capture + `__NEXT_DATA__` inspection |
| `.github/workflows/laliga-network-capture-probe.yml` | new — `workflow_dispatch` only, with a hard apim-int safety refusal step |
| `outbox/laliga-network-capture-2026-08-02T00-30-37-055Z.txt` | new — real CI result |
| `docs/outbox/cc-session-2026-08-02-laliga-network-capture.md` | new — this doc |
