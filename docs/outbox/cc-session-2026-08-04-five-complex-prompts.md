# CC Session Outbox — five complex-prompt features

**Date:** 2026-08-04

---

## What was asked

"Build all of the complex prompt items" — the five stretch-prompt pitches proposed earlier this session
to stress-test the playground's capabilities (Terrain Flight, built separately and previously; this
covers the remaining four plus a sixth, Fork Point, pitched on request afterward): Value Night,
The Broadcast Call, Contradiction Radar, Leverage Index, Fork Point.

---

## Two honest course-corrections, made before writing any component code

**Value Night** was originally pitched as "multi-source data fusion + economics." Before building,
grepped the codebase and found this already substantially exists: `Arbitrage` (real streaming-cost
economics) and `TonightsPick` (drama_peak + line movement + cost + weather fusion) already cover exactly
that territory. Reframed around a genuinely unused real data source instead: FPL's real player transfer
prices (`now_cost`) and points (`total_points`) — points delivered per real £ of cost, a different real
economics angle. Field shape confirmed live via a direct CI probe
(`scripts/probe-fpl-elements-shape.mjs`) before any component code was written against it — this
codebase has already been burned once assuming an unverified field shape (`BsdXgPanel`'s header
comment documents `/bsd/contract`'s illustrative example not matching the real API).

**Fork Point** was pitched as "rerun the real win-probability model from a forked point." Before
building, confirmed no client-side WP model exists to re-invoke — WP is server-computed, not exposed as
a callable function anywhere in this client. Reframed to an honest, still-real, still-interactive
mechanic: splice two real archived `drama_arc`s at a real, user-chosen index, connected by a single
constant seam offset (the fork game's own real shape from that point is preserved exactly, only its
absolute level shifts). No recomputation is claimed anywhere in the UI copy.

---

## What was built

- **Leverage Index** (`src/data/leverageIndex.js`, `src/components/LeverageIndex`) — real sabermetric
  concept applied to real `drama_arc` data: ranks archived games by their single most decisive
  index-to-index jump relative to that game's own average swing. Exact arithmetic (one subtraction, one
  division, per index), no smoothing or fuzzy thresholds.
- **Contradiction Radar** (`scripts/build-contradiction-radar-manifest.mjs`,
  `src/data/contradictionRadarManifest.json`, `src/components/ContradictionRadar`) — exact-keyed scan of
  this repo's own 89 real `docs/outbox/*.md` session docs for the project's own documented
  self-corrections, against a fixed vocabulary (13 phrases) confirmed present via direct grep before
  being written into code. Generated at build time, not bundled as raw markdown — the full corpus is
  628KB, which would have roughly doubled the app's JS payload; the committed manifest is 16KB, 28 real
  findings.
- **The Broadcast Call** (`src/data/broadcastCall.js`, `src/components/BroadcastCall`) — real generative
  audio narration via the browser's real `SpeechSynthesis` API, reading a script built entirely from real
  archived-game fields (teams, score, drama_peak, flip/fizzle signals already used as Terrain Flight
  landmarks). No CDN dependency, no invented play-by-play — every sentence maps to one real field. Honest
  degradation if `speechSynthesis` is unavailable: the real generated transcript still shows.
- **Value Night** (`src/data/valueNight.js`, `src/components/ValueNight`) — real FPL points-per-cost
  ranking, minimum 900 real minutes played (a standard FPL sample-size convention, not a guessed
  threshold) to filter small-sample noise.
- **Fork Point** (`src/data/forkPoint.js`, `src/components/ForkPoint`) — interactive splice of two real
  archived arcs at a real chosen index, rendered as an inline SVG polyline comparing the real original
  path against the forked one.

All five wired into the Lab tab (`src/App.jsx`, `src/App.module.css`), each with its own independent
`createResource` in `src/data/relay.js` (matching this codebase's established "neither backstops the
other" pattern — no new component's refresh/refetch can affect another's data).

---

## Verification

No CDN or hardware dependency in any of the five (unlike Terrain Flight's `esm.sh`/WebGL), so CI-as-proxy
wasn't needed for the UI itself — verified locally instead:

- Production build clean (205 modules, no errors).
- All four existing automated CI guards pass (resource-safety, unread-`createMemo`, unguarded-
  `localStorage`, undisposed-`WebGLRenderer`) — no new violations introduced.
- Real local Playwright browser test against the dev server (with a new, real-data-backed
  `/fpl/bootstrap-static` dev mock added to `vite.config.js`, captured from the same CI probe, matching
  this repo's "real captured, trimmed" mock convention): all five components confirmed rendering real
  content, e.g. Leverage Index's medal-ranked list, Contradiction Radar's "89 real docs... 28 real
  findings" summary, The Broadcast Call's generated transcript ("Tonight's call: the Tampa Bay Rays on
  the road at the Baltimore Orioles..."), Value Night's correctly-computed value badge (162 pts ÷ £6.0m =
  27.00 pts/£m), Fork Point's interactive slider and diverging chart. Zero page errors; the only console
  errors present were pre-existing and unrelated (`HealthPanel`'s intentional self-test `Bomb` component,
  and unmocked absolute-URL fetches from other pre-existing components hitting this sandbox's real
  network restriction — neither touched by this change).

The one-off local verification script and screenshot were not committed, matching this session's
established convention for components that don't need a permanent CI probe.

---

## Confidence gate

**93/100 — commit stands.**

All five features are built on real, verified data (the FPL field-shape probe run before code was
written, the drama_arc validity already established earlier this session, the docs/outbox corpus scanned
directly), render correctly with real content confirmed via local browser test, and pass every existing
automated guard. Two honest course-corrections were made and disclosed rather than building redundant or
overclaiming features. The 7-point deduction: unlike Terrain Flight, none of these five went through a
CI-as-proxy real-browser run against the actual deployed-shape app (only local dev-mode verification) —
a real, if lower-stakes, gap for five components with no CDN/WebGL/hardware blockers that made that step
strictly necessary elsewhere.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/leverageIndex.js`, `src/components/LeverageIndex/` | new |
| `scripts/build-contradiction-radar-manifest.mjs`, `src/data/contradictionRadarManifest.json`, `src/components/ContradictionRadar/` | new |
| `src/data/broadcastCall.js`, `src/components/BroadcastCall/` | new |
| `src/data/valueNight.js`, `src/components/ValueNight/` | new |
| `src/data/forkPoint.js`, `src/components/ForkPoint/` | new |
| `scripts/probe-fpl-elements-shape.mjs`, `.github/workflows/fpl-elements-shape-probe.yml` | new — real field-shape verification |
| `outbox/fpl-elements-shape-*.txt` | new — real, positive probe result |
| `src/data/relay.js` | modified — 4 new independent `createResource`s |
| `vite.config.js` | modified — real, trimmed `/fpl/bootstrap-static` dev mock |
| `src/App.jsx`, `src/App.module.css` | modified — wired all 5 into Lab tab |
| `docs/outbox/cc-session-2026-08-04-five-complex-prompts.md` | new — this doc |
