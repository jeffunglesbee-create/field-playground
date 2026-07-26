# CC Session Outbox — WeatherPoll Production Incident

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#8 (merged)
**Commit:** c3438c6 (squash merge to main)

---

## What was asked

A screenshot of another FIELD session's live audit reported that the
deployed artifact had gone completely blank — 48 sections down to zero —
and traced it to WeatherPoll. A second screenshot confirmed the
reproduction and flagged the architectural cause (a single top-level
`ErrorBoundary`), with an explicit "Do not ship the current artifact."
Instruction: "Verify weather. Automate follow-ups. No fallbacks, only
fixes." — meaning own the fix directly, including the architectural
follow-up, not just patch the one component.

---

## Root cause

`WeatherPoll`'s `<Show when={weatherData()} fallback={...}>` called the
`createResource` accessor directly inside `when`. Reading a resource
accessor while it's in error state re-throws — so the fallback's own
`.error` check never got a chance to run. The real
`/weather/today/{date}` endpoint returns 403 (confirmed via a live
probe); the dev mock had been fabricating a 200, so this path had never
actually been exercised in dev before shipping.

With only one `ErrorBoundary` wrapping the entire app, that one throw
took down every section, not just WeatherPoll's.

---

## What was fixed

- **`WeatherPoll/index.jsx`** — check `.error` before ever calling the
  resource accessor, matching the existing 3-way `.error`/`.loading`/data
  pattern already used by `DrillDown`, `Seasons`, and `StandingsDrawer`.
- **`vite.config.js`** — the dev mock for `/weather/today/` now returns
  the real, confirmed 403 instead of a fabricated 200, and the dead
  `weatherMock()`/`weatherRequestCount` code was removed. Matching real
  behavior by default is what makes the error path actually dev-testable
  instead of hidden — a fabricated happy-path mock is exactly how this
  shipped undetected.
- **`App.jsx` / `App.artifact.jsx`** — every section now gets its own
  `ErrorBoundary` via a small `SafeSection` wrapper, instead of one
  boundary for the whole layout. A future bug anywhere now degrades to
  just that section instead of blanking the app. `App.artifact.jsx` got
  the same treatment for the sections it actually contains (it has never
  had WeatherPoll wired in, so it wasn't at risk from this specific bug,
  but shared the same single-boundary exposure).

**CodeRabbit review, 3 findings:**
1. **`sectionFallback` dropped `reset` (real, fixed).** `ErrorBoundary`
   invokes its fallback as `(err, reset)`; the fallback only accepted
   `err`, so a section that threw once stayed dead until a full page
   reload — undercutting the isolation fix itself. Added a Retry button
   wired to `reset` in both App variants. Verified from
   `node_modules/solid-js/dist/dev.js`: `reset` calls `setErrored()` with
   no args, which re-runs `catchError(() => props.children, ...)` and
   genuinely remounts the section; confirmed live via Playwright using
   ErrorBoundaryDemo's own throw/reset controls.
2. **Dev-mock escape hatch for the 403 (skipped).** Suggested an opt-in
   query param to restore the happy path locally. Already covered by
   Playwright's `page.route()` interception used for happy-path testing;
   adding a server-side toggle would duplicate that coverage without
   adding a real gap it closes.
3. **Forward an AbortSignal into `fetchWeather` (skipped, finding was
   wrong).** Checked `node_modules/solid-js/dist/dev.js` directly:
   `createResource`'s fetcher is only ever called as
   `fetcher(source, { value, refetching })` — there is no `signal` field
   in this version of Solid to forward. Also would have been inconsistent
   with every other fetcher in `relay.js`, none of which accept one.

---

## Verification

Playwright against the real 403 mock: all sections render, WeatherPoll
shows its isolated error ("Unable to load weather: weather fetch failed:
403"), unrelated sections (Stats, HealthPanel's own intentional
error-boundary self-test) unaffected, zero unexpected console errors.
Happy path re-verified separately via `page.route()` interception (fake
200, 2 venues). Retry-control fix verified by arming
ErrorBoundaryDemo's own throw and confirming reset recovers it. Both
standard (117 modules) and single-file artifact (116 modules) builds
clean throughout.

---

## Process incidents worth recording

**A `git reset --hard` mid-session discarded uncommitted work.** While
fixing this, an earlier `git checkout main && git reset --hard
origin/main` was run while the three fix files still had uncommitted
changes on the feature branch — discarded irrecoverably (never
committed, no reflog entry). Caught immediately via `git status`
returning empty; recovered by re-applying all three changes from
session context and re-verifying from scratch before committing. No
data was silently lost from the user's perspective — the fix was
rebuilt to the same verified state — but this is exactly the failure
mode "check status and stash before a destructive git command" exists
to prevent, and it wasn't followed here.

**The feature branch had silently diverged from `main` before this
PR was even opened.** `claude/playground-setup-njng55` had been reused
across PR #7 and PR #8. Squash-merging PR #7 created a new commit on
`main` (`772ff39`) with different history than the original branch
commits, but the local/pushed branch still carried the pre-squash
commits as-is. Committing PR #8's two fix commits on top of that stale
tip meant they were built on a branch that GitHub's merge check
correctly flagged as conflicting (405 on the first merge attempt),
because it disagreed with `main` about content already resolved by the
squash. Fixed with `git rebase --onto origin/main <last-pre-squash-commit>
claude/playground-setup-njng55`, keeping only the two genuinely new
commits and replaying them onto current `main`; rebuilt and confirmed a
clean fast-forward before force-with-lease pushing. The correct process
— restarting a reused branch from `main` before adding new commits
whenever its prior PR has merged — exists in the repo's own operating
instructions; it should have been applied proactively at the start of
this session's work rather than discovered reactively via a failed
merge.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/WeatherPoll/index.jsx` | modified — 3-way `.error`/`.loading`/data guard |
| `src/App.jsx` | modified — `SafeSection` per-section `ErrorBoundary` + retry control |
| `src/App.artifact.jsx` | modified — same `SafeSection` + retry control, for its own section set |
| `vite.config.js` | modified — `/weather/today/` now returns real 403; dead mock code removed |

---

## What this does NOT change

- No changes to any component's actual data logic beyond the error-path
  guard in WeatherPoll — the happy-path rendering, venue list, and
  45-second poll cadence are untouched.
- `App.artifact.jsx` was not brought up to parity with `App.jsx`'s full
  component set (it's missing ~20 components added in later PRs,
  including WeatherPoll itself) — that's pre-existing staleness, out of
  scope for this incident fix.
