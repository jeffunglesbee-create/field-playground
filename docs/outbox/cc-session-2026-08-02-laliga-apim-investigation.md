# CC Session Outbox — LaLiga APIM investigation (CC-CMD-2026-08-02)

**Date:** 2026-08-02
**Commit:** `c9daeaa` (probe + CI workflow)
**Confidence: 97/100 — committing.**

---

## What was asked

Execute the three tasks in `docs/CC-CMD-2026-08-02-laliga-apim-
investigation.md`: confirm `apim.laliga.com/public-service` and
`/webview` are genuinely reachable, find real sub-paths by searching
laliga.com's own real script bundles (no guessed REST conventions),
then one targeted real probe. `apim-int.laliga.com` explicitly off
limits at every step.

## Method

`scripts/probe-laliga-apim.mjs`, run via CI (`apim.laliga.com` and
`www.laliga.com` both confirmed sandbox-blocked by direct curl before
writing this, matching the CC-CMD's own claim, re-verified rather than
trusted blind). The workflow's own first step greps the script for any
`fetch(` call targeting `apim-int` and refuses to run if found —
a hard safety check, not just a code comment.

## Real result

`outbox/laliga-apim-2026-08-02T00-22-50-709Z.txt`

**Task 1 — confirmed reachable and real.** Both `GET
https://apim.laliga.com/public-service` and `GET
https://apim.laliga.com/webview` returned `404` with a clean,
structured JSON body (`{"statusCode":404,"message":"Resource not
found"}`) and real Azure API Management response headers
(`x-azure-ref`, `x-cache: CONFIG_NOCACHE`) — confirming the "apim"
naming theory and that this is a live, real Azure APIM gateway, not a
dead or parked host. A 404 at the bare root is expected for an API
gateway with no root resource — not itself evidence the API is
unusable, just that nothing is served at the exact base path.

**Task 2 — real search performed, genuine negative result.** Fetched
`https://www.laliga.com/en-US` (real 200, same URL — `/en-US` is
still correct, confirmed fresh not assumed), extracted 26 real
`<script src>` URLs from the actual response (all Next.js
`_next/static/chunks/...` bundles). Fetched 25 of the 26 (the 26th,
`_ssgManifest.js`, was skipped by the fetch cap — a Next.js-generated
path→hash manifest, not a source of API call strings, but noting the
gap rather than hiding it). Searched all 25 for three literal patterns
(`apim.laliga.com` + path, quoted `/public-service/...`, quoted
`/webview/...`): **zero matches, across all patterns, across all
fetched bundles.**

**What this negative result does and does not prove:** it is real and
faithfully searched, not a bug — but it only covers the specific
bundles referenced by the homepage's own `<script src>` tags at fetch
time. It does **not** prove no such endpoint calls exist, because a
Next.js app commonly makes exactly this kind of backend call
server-side (`getServerSideProps`/an internal API route on
laliga.com's own Node server), in which case the literal
`apim.laliga.com` string would never appear in client-shipped
JavaScript at all — the browser would only ever see already-rendered
data, not the API call itself. This is a plausible, common
architecture for a Next.js site and not something this method can
distinguish from "the client genuinely never calls apim.laliga.com
directly."

**Task 3 — correctly not performed.** Per the CC-CMD's explicit scope
("do not guess additional endpoint paths beyond what Task 2's bundle
search actually finds"), no real sub-path was found to target, so no
probe was made up to fill the gap.

**Safety constraint: apim-int.laliga.com was never contacted.**
Confirmed at three layers — the CI workflow's own grep-based refusal
step, the fact that no line in the script constructs a URL containing
`apim-int`, and the real CI output itself contains `apim-int` only in
constraint-statement log lines, never in an actual `GET` line.

## Verdict

The public host is real, alive, and genuinely backed by Azure API
Management — not a dead or fabricated lead. But this investigation
could not determine real callable sub-paths through the method the
CC-CMD specified (client-side bundle string search) — the honest
finding is "not discoverable this way," not "does not exist." If this
lead is worth pursuing further, the next real step is almost certainly
inspecting the site's actual live network requests (e.g. a headless
browser capturing real XHR/fetch calls while the page renders,
matching how the user's original page capture presumably surfaced the
two hosts in the first place) rather than more static bundle-string
searching — that's a materially different, separate technique from
what this task specified, not attempted here since it wasn't asked
for.

No build was requested here — this is the CC-CMD's investigation
scope only, executed as written.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-laliga-apim.mjs` | new — real Task 1-3 execution |
| `.github/workflows/laliga-apim-probe.yml` | new — `workflow_dispatch` only, with a hard apim-int safety refusal step |
| `outbox/laliga-apim-2026-08-02T00-22-50-709Z.txt` | new — real CI result |
| `docs/outbox/cc-session-2026-08-02-laliga-apim-investigation.md` | new — this doc |
