# chat-update-2026-07-26-weather-endpoint-investigation

**From:** chat (claude.ai)
**To:** Claude Code
**Status:** diagnosis complete, fix not yet written
**Scope:** `WeatherPoll` / `src/data/weather.js` — client-side only, no relay work

---

## The finding

`WeatherPoll` polls `${RELAY_BASE}/weather/today/{date}`. **That endpoint
has never existed.** Not gated, not broken — never built.

The incident fix you shipped was correct and worth keeping: the `.error`
guard was genuinely inverted, per-section `ErrorBoundary`s are the right
structural fix, and correcting the dev mock to return the real 403 instead
of a fabricated 200 is the single most valuable part of it — a fabricated
happy-path mock is exactly how this shipped undetected.

But it fixed the *crash*, not the *weather*. The feature has never worked
and can't, as currently pointed.

---

## Why there's no relay route — verified, not assumed

**Open-Meteo is CORS-open, so the browser calls it directly. A proxy was
never needed.** That's why `field-relay-nba` has no `/weather` route: it
was never supposed to.

Prior FIELD research (Drive + chat history) evaluated the field and chose
Open-Meteo explicitly: no API key, CORS-open, most comprehensive free
option. OpenWeatherMap was evaluated and **rejected** — "strictly worse
than Open-Meteo + NWS relay," now requires a credit card even on free tier.

Confirmed live rather than trusted. Chat's sandbox can't reach
`api.open-meteo.com` (not on its egress allowlist — a direct curl returns
403, which is the *sandbox* refusing, not Open-Meteo), so this used the
documented **CI-as-proxy** pattern: GitHub Actions runners aren't
egress-restricted. See `.github/workflows/open-meteo-probe.yml`.

```
http_code: 200                          (no API key sent)
access-control-allow-origin: *
access-control-allow-methods: GET, POST, OPTIONS
access-control-max-age: 600
preflight OPTIONS: 200, same headers
real payload for Comerica Park: temps °F, precip %, wind mph
```

**A correction worth inheriting:** the first probe reported *no*
`access-control-allow-origin` header. That was a bug in the probe — `curl`
sent no `Origin`, so none could ever come back. Sending a browser-like
`Origin` returns `*` immediately. That false negative would have pointed
the fix squarely at building a relay proxy that shouldn't exist.

---

## Venue → coordinates is already solved (in production)

Do not design this from scratch. `jubilant-bassoon/src/utils/venues.js`:

- `VENUE_COORDS` — ~90 venues, `{lat, lon, outdoor, city}`
- `getVenueCoords()` — fuzzy-matches against venue name strings
- `OM_BASE = "https://api.open-meteo.com/v1/forecast"`
- `WX_TTL = 3600000` — 1-hour cache, `wxCache` keyed `"lat_lon"`

It survived the esbuild module extraction, so it's live code, not history.

**`outdoor` is the flag that matters most.** `outdoor: false` means
dome/retractable — skip weather entirely rather than showing a forecast
for an indoor game.

---

## The fix

Point `src/data/weather.js` at Open-Meteo directly using venue lat/lon.
No relay CC-CMD, no new endpoint, no credential.

Two details that will bite otherwise:

1. **Timestamps are UTC.** Response is `timezone: GMT`,
   `utc_offset_seconds: 0`. Hourly times need converting to game-local
   before display.
2. **`weather_code` is a WMO code, not text.** Needs a ~30-line lookup to
   become "light rain." Prior research flagged this exact tradeoff against
   Pirate Weather's ready-made summary strings and still chose Open-Meteo —
   the lookup table is the accepted cost.

---

## The genuinely playground-shaped experiment

Copying the 90-venue table over isn't interesting. This is:

Production's static table must be hand-maintained and **silently yields no
weather for any unlisted venue**. Open-Meteo also ships a geocoding API
(`geocoding-api.open-meteo.com/v1/search`). Run them head-to-head against a
real slate: how many of today's actual `venue` strings does the static
table resolve, versus live geocoding? Real data, measurable, answers a
genuine maintenance question production can't easily test.

**Prediction worth confirming or refuting rather than assuming:**
geocoding can find coordinates but **cannot know whether a stadium has a
dome**. If that holds, the honest end state is hybrid — geocode for coords,
keep a table for the `outdoor` flag — meaning the table shrinks rather than
disappears. That would be a real result either way.

**Do not bulk-port 90 venues as a first move.** Start with the handful on
today's real slate, prove the direct call renders, then decide table vs.
geocoding on evidence.

---

## Also worth knowing

- `App.artifact.jsx` is **dead code**. `vite.config.artifact.js` has no
  `input` override — it builds from the real `index.html` → `main.jsx` →
  `App.jsx` via the `lazyModules` alias. Its "missing ~20 components"
  caveat is a non-issue, not a gap, but it's still attracting maintenance
  effort. Wants a `git rm`, same as `wrangler.jsonc`.
- Latest verified render: `allPass: true`, 55 sections, 0 page errors.
  The one console error is the weather 403, which is now correctly
  contained to its own section.
