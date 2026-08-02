# CC-CMD-2026-08-02-laliga-apim-investigation

**Repo:** field-playground
**Branch:** main — commit directly, do not create a feature branch or PR

One-liner:
```
git remote get-url origin | grep -q field-playground || { echo "WRONG REPO"; exit 1; }
git pull. Read docs/CC-CMD-2026-08-02-laliga-apim-investigation.md. Execute all tasks.
Do not commit unless confidence >= 95. If score < 95, report verbatim and stop.
```

---

## What this is — a genuinely new lead, not from chat/Drive history

Earlier today, chat/Drive search for "is there a separate La Liga API
beyond ESPN/FD/BSD" found nothing beyond paid commercial aggregators
(Sportmonks, Goalserve, Enetpulse) and one deprecated, TOS-violating
scraper. That answer was accurate for everything searchable at the
time.

**This is different: a real capture of laliga.com's own live page**
(user-provided, `/mnt/user-data/uploads/364DE0C5-...txt`, 1.5MB of
rendered HTML) contains two real backend API hosts, extracted directly
from the file, not guessed or assumed:

```
https://apim.laliga.com/public-service
https://apim.laliga.com/webview
https://apim-int.laliga.com/public-service
```

"apim" is standard Azure API Management naming. The captured page shows
genuinely live data rendered from *something* — real standings (Sevilla
1st, Athletic Club 2nd, etc.), real player leaders (Mbappé 25 goals,
Lamine Yamal 11 assists), real attendance figures back to 2013/2014.
This is LaLiga's own site serving its own data — a materially different
category from any third-party aggregator found earlier.

**Neither host is reachable from chat's sandbox** (`host_not_allowed`)
**nor from `web_fetch`** (URL never appeared in a prior search result,
so the tool's own permission check rejects it). This needs GitHub
Actions CI-as-proxy, the same pattern already proven for BSD, MLB Stats
API, and every other real external host this session.

**`apim-int.laliga.com` is almost certainly internal-only** (the `-int`
suffix is a standard internal/staging convention). Identify it, do not
probe it. This task is scoped to the public host only.

---

## Task 1 — Confirm the public host is genuinely reachable and real

- Via CI (`workflow_dispatch`, real GitHub Actions runner, unrestricted
  egress): `GET https://apim.laliga.com/public-service` and
  `GET https://apim.laliga.com/webview`. Record real status codes,
  headers, and response bodies — do not assume 200 means usable or 403
  means dead; report what actually comes back.
- Do NOT send any request to `apim-int.laliga.com` at any point in this
  task. If genuinely uncertain whether a discovered path might route to
  the internal host, stop and ask rather than guess.

## Task 2 — Find the real sub-paths, don't guess REST conventions

The uploaded capture only contains the base hosts, not specific
endpoint paths — the real paths live in laliga.com's own client-side JS
bundles, not in this rendered HTML snapshot.

- Via CI: fetch `https://www.laliga.com/en-US` (or whatever real,
  current homepage URL resolves — confirm fresh, don't assume `/en-US`
  is still correct), extract real `<script src>` URLs from the actual
  response.
- Fetch those real bundle URLs, search their real content for string
  literals containing `/public-service/` or `apim.laliga.com` followed
  by a path — this reveals the actual endpoint shapes the site's own
  frontend calls (standings, live scores, leaders, etc.), not guessed
  REST conventions.
- This is real reverse-engineering work against real bundle content —
  report the actual paths found, with the real surrounding code context
  for each, not a summary that could be confused with invention.

## Task 3 — One real, minimal, targeted probe

- Once at least one real sub-path is identified (ideally something
  standings- or live-score-shaped, matching what the captured page
  displayed), make exactly one real GET request to it via CI and report
  the real response — confirming actual data comes back, not just a
  200 with an empty or auth-walled body.
- If every discovered path requires an API key or auth header not
  available here, report that plainly as the finding — a real "requires
  auth" result is exactly as valuable as a real "open" result, and
  should not be presented as inconclusive if it's actually confirmed
  either way.

---

## Explicitly NOT in scope

- Do not probe `apim-int.laliga.com` under any circumstance.
- Do not build any relay route or client integration yet — this is
  viability investigation only, matching today's other "is X real"
  checks. If Task 3 confirms real, open, usable data, that becomes a
  separate build decision for later, not something to act on
  automatically in this same pass.
- Do not guess additional endpoint paths beyond what Task 2's bundle
  search actually finds — no inventing plausible-sounding REST routes.

---

## Outbox

`outbox/cc-session-2026-08-02-laliga-apim-investigation.md`: the real
CI probe results for both public-service and webview, the real bundle
URLs fetched and real endpoint paths found within them (with source
context), and the one targeted probe's real result — open, auth-walled,
or dead, stated plainly either way.
