# CC Session Outbox — closing the edge-case gap in the verdict sweep

**Date:** 2026-08-05

---

## What was asked

Following the 28-component "why should I care" sweep and a CI Build Check confirming structural
soundness: "how does that boost the score from 93?" — answered honestly that the CI check confirmed a
different thing (no dead/unread memos, clean build) than the actual 7-point deduction (branches of each
verdict memo never exercised beyond the current data snapshot). "Close the edge-case gap then."

---

## What was done

Four parallel agents, each assigned 7 of the 28 components, systematically:
1. Read each component's real `verdict`/`headline` memo and enumerated every distinct branch it can
   take -- empty/zero-item, single-item, a tie between top values, and null/missing fields.
2. Traced the real data source for each (a `relay.js` resource, `outcomes.js` localStorage, or the
   component's own live client-side instrumentation) and read its confirmed real shape.
3. Exercised every branch against the real running app (Playwright, `page.route()` interception for
   relay-fetched data matching real confirmed field shapes, `page.evaluate()` for localStorage-driven
   data) -- not fabricated display data, but engineered inputs at the real data's own shape to reach
   code paths the current snapshot never hits.
4. Fixed any real bug found directly in the component, then re-verified the fix live.

Roughly 70+ distinct branches were tested across the 28 components. Most passed clean on the first
attempt (the original verdict logic was sound). **9 real bugs were found and fixed**, all in the class
the gap predicted -- grammar/logic errors in branches the current data snapshot never exercised:

- **Stats** (3 sub-tabs, 2 bugs each) -- a tie at the top produced "0 games/points ahead of the
  next-best," a self-contradicting claim of leading by zero; fixed to state the tie plainly. A
  legitimately-empty (not loading, not errored) standings response showed "Loading…" forever; fixed to
  an honest "No [league] standings available."
- **StandingRoom** -- a tied division race read "trails X by tied at the top," not English; rebuilt as
  its own clause.
- **BriefReconcile** -- the `archOnly` clause was missing its noun ("3 archive has that history doesn't"
  instead of "3 briefs archive has that history doesn't").
- **CompareToRelay** -- a tied editorial score (no clear predicted side) was silently counted as an
  implied disagreement in the denominator, inflating the "diverged" count with a game that was never
  actually compared.
- **WcBracketTree** -- `undefined` leaked into the sentence when `Champion.team` was absent; now falls
  back to "TBD," matching the file's own existing convention for an unresolved slot.
- **WeatherPoll** -- a tie between two-or-more distinct outdoor venues (not just one venue) was
  mislabeled "only real outdoor venue," silently hiding a real second venue from the reader.
- **LatencyHistogram, RelaySystemStatus** -- singular/plural agreement ("1 requests," "1 real
  subsystems").

---

## Verification

Full production build clean after consolidating all 8 fixed files. A final regression sweep across 5
tabs confirmed the fixes didn't disturb the original (normal-path) rendering already verified in the
prior sweep -- zero page errors. GitHub Actions Build Check re-run against the fix commit (`c30bbea`):
success -- clean build plus all 4 automated regression guards (resource-safety, unread-`createMemo`,
unguarded-`localStorage`, WebGL-disposal).

---

## Confidence gate

**98/100 -- commit stands.**

This directly closes the specific gap the 93/100 score was docked for: verdict logic has now been
exercised across its real branches, not just the current data snapshot, and 9 real bugs that gap
predicted would exist were found and fixed. The 2-point remainder: a small number of branches were noted
as genuinely untestable through the UI (a few dead/unreachable guard clauses where an outer `Show`
already gates on the same condition, and one true race-condition state in HealthPanel's in-flight check
that resolves faster than Playwright can observe) -- disclosed rather than silently skipped, and none of
them represent an unverified real risk, just an unreachable code path.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/Stats/index.jsx` | modified -- tie contradiction + empty-state fallback (×3 sub-tabs) |
| `src/components/StandingRoom/index.jsx` | modified -- ungrammatical tie clause |
| `src/components/BriefReconcile/index.jsx` | modified -- missing noun in archOnly clause |
| `src/components/CompareToRelay/index.jsx` | modified -- tied-score denominator bug |
| `src/components/WcBracketTree/index.jsx` | modified -- undefined leak on missing Champion.team |
| `src/components/WeatherPoll/index.jsx` | modified -- mislabeled multi-venue tie |
| `src/components/LatencyHistogram/index.jsx` | modified -- singular/plural agreement |
| `src/components/RelaySystemStatus/index.jsx` | modified -- singular/plural agreement |
| `docs/outbox/cc-session-2026-08-05-why-should-i-care-edge-case-closure.md` | new -- this doc |
