# CC Session Outbox — DramaSoundscape live-trigger fix

**Date:** 2026-07-31
**Commit:** `0bcc382` (fix), `9ce0109` (real CI confirmation)

---

## What was reported

"Soundboard doesn't play live" — DramaSoundscape's preview buttons
worked (already CI-verified by a prior session's `probe-soundscape-
cdn-load.mjs`), but the six real triggers (lead change, comeback,
blowout, new hottest, extra frames, dramatic final) never seemed to
fire from actual game data changing.

---

## Root cause — confirmed before touching the fix, not assumed

The transition-detection logic was a bare `createMemo(() => {...})`
whose return value nothing ever read. Verified in isolation first (a
standalone node script against solid-js core, no DOM, no app code):
an unread `createMemo` runs exactly once at creation and never
re-runs on subsequent signal changes — memos are lazy/pull-based in
Solid, and with zero consumers there's nothing to pull. Confirmed via
a controlled test: a signal changed twice, the memo's own run counter
stayed at 1 both times.

This exactly matches the symptom: the six checks ran once against the
component's first render and never observed a second `deskStore`
poll, no matter how many times real game data actually changed
afterward.

**Fix:** `createEffect` instead of `createMemo`. Effects are
push-based and always re-run when their tracked dependencies change —
the correct primitive for a side-effect-only computation (detect a
transition, log it, play a sound), which the component's own
pre-existing comment already correctly described this block as, just
with the wrong primitive underneath.

---

## A second, compounding gap found while investigating

Even with the reactivity bug fixed, none of the six cues were
reachable in local dev: the mock had no `drama_peak` field at all, no
repeated score deltas on the same live game, and no false→true
`went_to_ot`/`finalized_at` transition — every field each cue checks
for was either absent or static. `vite.config.js`'s mock now stages a
real transition ladder across polls 5 through 8 (full schedule
documented in its own comment).

One real, non-obvious constraint surfaced while building that ladder:
the dev server fires **3 near-simultaneous `/context/date/` requests
at page mount** (confirmed via server-side request timestamps: two of
the three landed in the same millisecond) before settling into a
clean one-request-per-poll cadence. This is a benign, pre-existing
Vite/HMR dev-only startup quirk, unrelated to DramaSoundscape — but a
count-keyed mock ladder has to start comfortably past it (this one
starts at request 5) or its early steps get silently skipped, which
is exactly what caused an earlier draft of the ladder to never
observe a real "blowout" step even after the actual bug was fixed.

---

## Verified

- Isolated reactivity claim: node test against solid-js core directly,
  before writing any component code.
- Local, twice, against a freshly-restarted dev server both times (the
  mock's request counter is server-process-persistent, not
  per-page-load — re-running against an already-warmed server
  silently reuses an already-exhausted ladder, worth knowing if
  re-testing manually): all 6 cues fired, log stabilized on
  steady-state ticks afterward (no repeat-firing).
- **Real CI** (`soundscape-live-triggers-probe.yml`, run 30672353485,
  triggered manually to get an unambiguous result before trusting the
  fix): starts this repo's own dev server fresh, watches the real DOM
  log across real 15s polls. Result: **all 6/6 cues fired, 0 console/
  page errors.**
- `npm run build` — clean throughout.

---

## New regression coverage

`scripts/probe-soundscape-live-triggers.mjs` +
`.github/workflows/soundscape-live-triggers-probe.yml`
(`workflow_dispatch` only — this checks a UI interaction/polling path,
not slowly-drifting data, so rerun manually after any future change to
this component rather than relying on a schedule). Deliberately
separate from `probe-soundscape-cdn-load.mjs`, which only ever covered
the preview buttons — that gap between "preview buttons work" and
"live path works" is exactly how this shipped broken in the first
place; both checks are needed now.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/DramaSoundscape/index.jsx` | modified — `createMemo` → `createEffect` for the live-trigger block |
| `vite.config.js` | modified — staged transition ladder (drama_peak, score deltas, went_to_ot/finalized_at flips) across polls 5-8 |
| `scripts/probe-soundscape-live-triggers.mjs` | new |
| `.github/workflows/soundscape-live-triggers-probe.yml` | new — `workflow_dispatch` only |
| `outbox/soundscape-live-triggers-probe-2026-07-31T23-15-42-508Z.txt` | new — real CI confirmation, 6/6, 0 errors |
| `docs/SUMMARY-2026-07-31-dramasoundscape.md` | modified — root-cause writeup for the next session |
