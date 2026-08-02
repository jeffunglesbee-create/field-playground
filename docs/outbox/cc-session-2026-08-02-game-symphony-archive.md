# CC Session Outbox — Game Symphony Archive

**Date:** 2026-08-02

---

## What was asked

"3. Game Symphony Archive" — DramaSoundscape's six real cues fire live
and vanish. Record the actual sequence and timing that played during a
genuinely dramatic completed game, persist it, and let it be replayed
or shared as a small standalone composition.

---

## Pre-build viability check (real data, not assumed)

`scripts/probe-symphony-candidate-game.mjs`, run via CI (`statsapi.
mlb.com` sandbox-blocked, confirmed repeatedly this session):
`outbox/symphony-candidate-2026-08-02T14-27-43-694Z.txt`

- Confirmed the real timing field on MLB Stats API play objects:
  `about.startTime` (ISO string).
- First attempt fed every individual real play into the shared cue
  engine (109 real plays for one real game) — only 2 of 5 possible cue
  types fired. Real, explainable cause, not a bug: DramaSoundscape's
  live thresholds are tuned for `App.jsx`'s real 15s poll interval
  (`POLL_INTERVAL_MS`), which naturally skips several real plays
  between snapshots. A single play rarely swings a score margin by 3+
  runs; several plays across 15 real seconds can. **Fixed by bucketing**
  real plays into 15s real-wallclock windows (via `startTime`) before
  running the cue engine — reproduces what a live listener would
  actually have heard, not an artificially finer-grained replay the
  thresholds were never built for.

---

## What was built

- `src/data/dramaCueEngine.js` — DramaSoundscape's real per-game cue
  logic (lead change, comeback, blowout, extra frames, dramatic final)
  extracted into a shared, pure, framework-free module. `DramaSoundscape`
  itself was refactored to call it instead of duplicating the rules
  inline, so live and reconstructed replay provably run identical
  logic, not two hand-synced copies. "New hottest game" (a cross-slate
  comparison) intentionally excluded — not a property of any single
  game's own state sequence.
- `src/data/cartoonSynth.js` — the six real synthesized sounds
  (webaudio-tinysynth, same CDN URL, same GM instrument programs)
  extracted verbatim from `DramaSoundscape`. Deliberately did **not**
  refactor `DramaSoundscape` itself to consume this one — that
  component is already carefully tuned via multiple real-listening
  iterations ("Sounds 8-bit," "sounds are more generic than fun or
  silly") and touching its own copy again for pure deduplication
  wasn't worth the regression risk. `GameSymphonyArchive` uses the
  shared module; `DramaSoundscape` keeps its own already-verified copy.
- `src/data/gameSymphony.js` — fetches a real completed game's real
  play data directly client-side (MLB Stats API confirmed CORS-open
  earlier this session, same basis `LiveWpTicker`/`BsdXgPanel` already
  rely on), buckets it to real 15s windows, runs the shared cue engine,
  and compresses the real relative timing into a 20-second replay (a
  cue that happened 90% through the real game plays near the end of
  the compressed replay, not at a random point).
- `src/components/GameSymphonyArchive/index.jsx` — picks a real
  dramatic game from the existing `dramaLeaderboard` resource, tries
  each real candidate in order until one yields a reconstructable cue
  sequence (honestly reporting if none do, not silently picking a
  zero-cue game), plays the real timeline through the shared synth, and
  persists compositions to a local gallery (`localStorage`) so they can
  be replayed without re-fetching. Honest scoping note in the file
  itself: persistence here is per-browser, not cross-visitor shared
  storage (`window.storage`'s shared mode is a separate, not-yet-
  investigated capability — see the other pitched features).

---

## Verified

- `npm run build` — clean, both passes (before and after the error-
  handling fix below).
- Local browser test (Playwright, mocked real-shaped MLB Stats API
  data — schedule + live feed matching the exact fields the CI probe
  confirmed, `about.startTime`/`result.homeScore`/`result.awayScore`/
  `about.inning`), deliberately designed to exercise multiple cue types
  (not just the 2 the one real probed game happened to produce):
  reconstruction correctly fired 4 real cue types (lead change,
  blowout, extra frames, dramatic final) with plausible compressed
  offsets (8.9s, 13.3s, 17.8s, 20.0s). Save-to-gallery confirmed
  working (gallery section appeared with correct matchup/cue count,
  play/delete buttons present).
- **Found and fixed during testing**: clicking play in this sandboxed
  test environment (webaudio-tinysynth's CDN import blocked here, same
  known limitation `DramaSoundscape` already documents) surfaced as an
  unhandled promise rejection rather than an honest UI error. Wrapped
  in the same try/catch pattern `DramaSoundscape`'s own `enableSound()`
  already uses — now shows "Couldn't play: <real error>" instead of a
  silent console-only failure.
- CDN load itself (the real `webaudio-tinysynth` fetch succeeding for
  a real user) is already verified by the existing `soundscape-cdn-
  load-probe.yml` against the real deployed site — `cartoonSynth.js`
  reuses the exact same CDN URL verbatim, so that existing real-world
  verification covers this playback path too; no redundant probe
  added.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-symphony-candidate-game.mjs` | new — real pre-build viability check |
| `.github/workflows/symphony-candidate-probe.yml` | new — `workflow_dispatch` only |
| `outbox/symphony-candidate-2026-08-02T14-27-43-694Z.txt` | new — real CI result |
| `src/data/dramaCueEngine.js` | new — shared per-game cue detection |
| `src/data/cartoonSynth.js` | new — shared six-gesture synth engine |
| `src/data/gameSymphony.js` | new — real fetch/bucket/reconstruct/compress |
| `src/components/GameSymphonyArchive/index.jsx` | new |
| `src/components/GameSymphonyArchive/GameSymphonyArchive.module.css` | new |
| `src/components/DramaSoundscape/index.jsx` | modified — uses shared `dramaCueEngine`, own synth code untouched |
| `src/App.jsx` | modified — wired into Games tab |
| `src/App.module.css` | modified — added to shared section layout rule |
| `docs/outbox/cc-session-2026-08-02-game-symphony-archive.md` | new — this doc |
