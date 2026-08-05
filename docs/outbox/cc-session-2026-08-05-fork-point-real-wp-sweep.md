# CC Session Outbox — Fork Point real-WP pairing sweep

**Date:** 2026-08-05

---

## What was asked

Closing the first of two gaps behind the real-WP feature's 92/100 confidence gate: the original e2e
probe only ever exercised ONE real source/fork pairing (the default) end-to-end. "Would GitHub Actions
runner help?" -- yes, since it's the only way to reach the real hosts from this sandbox. "Yes" to
building the wider sweep.

---

## What was run

`scripts/probe-fork-point-real-wp-sweep.mjs` / `.github/workflows/fork-point-real-wp-sweep-probe.yml`
(CI-as-proxy, real built app, real browser, real hosts). Toggled real WP on once, then swept 9 distinct
real pairings against the actual real hosts:

- The default pairing (source=0, fork=1) -- already covered by the first e2e probe, re-checked here.
- 6 manual pairings spread evenly across the real 25-game candidate pool (source/fork indices 3&6,
  6&9, 9&12, 12&15, 15&18, 18&21).
- 2 of the app's own "Biggest real forks" ranked picks for the current source game -- the pairings a
  real user is most likely to actually click, not hand-picked by this probe.

---

## Result

**9 / 9 real pairings rendered a real WP verdict.** Zero honest-unavailable responses, zero
unknown/neither states, zero page errors. Every real `gamePk` resolved, every real Savant fetch
succeeded, across a real spread of the candidate pool (not just one lucky pair) and across the app's
own ranked suggestions.

Full real output: `outbox/fork-point-real-wp-sweep-probe-2026-08-05T21-45-08-706Z.txt`.

---

## Verdict

**CONFIRMED, gap 1 closed.** The real-WP toggle behaves correctly across a real breadth of pairings, not
just the single default pairing the first e2e probe checked.

**Gap 2 still stands, honestly, and isn't closeable by more sweeping:** every one of these 9 real runs
(plus the earlier 13/13 historical-coverage probe, plus the first e2e run) succeeded -- the honest
"unavailable" fallback has still never been triggered by a genuine real-world failure, only a mocked one.
That's not a flaw to chase further with more sweeps of the current pool; it's the expected shape of a
disclosed-but-rare failure mode. The fallback code stays in place because a 100% real success rate on
every observation so far is not the same claim as "will always succeed."

---

## Confidence gate

**97/100 -- commit stands.**

Up from 92/100: the wider sweep directly closed the "only one pairing tested" gap with 9/9 real
successes across a real spread of the pool, including the app's own ranked suggestions, not just
hand-picked pairings. The remaining 3-point gap is the one honestly not closeable by more of the same
work: the real "unavailable" fallback path has proven correct against a forced mock, but has never yet
been exercised by an actual real failure, since none has occurred in any real run so far.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-fork-point-real-wp-sweep.mjs` | new |
| `.github/workflows/fork-point-real-wp-sweep-probe.yml` | new |
| `outbox/fork-point-real-wp-sweep-probe-2026-08-05T21-45-08-706Z.txt` | new -- real CI result, 9/9 |
| `docs/outbox/cc-session-2026-08-05-fork-point-real-wp-sweep.md` | new -- this doc |
