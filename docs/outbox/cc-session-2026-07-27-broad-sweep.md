# CC Session Outbox — Broad Health Sweep: 8 Components Fixed

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#20 (merged)
**Commit:** 32f158a (squash merge to main)

---

## What was asked

"What's next for playground?" -- recommended either continuing the
deep-search pattern on Games/Picks/Stats, or pausing to run a broad
health sweep given 4 PRs (#16-#19) had just shipped in one session,
several touching shared files (`App.jsx`, `relay.js`, `vite.config.js`).
User approved the sweep.

---

## What was found

Reused this repo's own `scripts/verify-artifact.mjs` rather than writing
a new check -- it was purpose-built (by the parallel session, earlier
this same day) to test the artifact build under simulated total-fetch-
failure: `page.setContent()` gives the page an opaque origin, so every
relay fetch rejects exactly as it would in a sandboxed iframe with no
proxy, a close analogue of the conditions that caused an earlier
blank-artifact incident.

Ran it (against a locally patched copy setting an explicit browser
`executablePath` for this sandbox -- not committed, the shared script is
unchanged) and found **17 dead sections** (`ErrorBoundary` "Retry"
fallbacks) across **8 pre-existing components**. None were from this
session's own new work -- `QualityReport`, `DramaLeaderboard`,
`RelaySystemStatus`, and `BriefArchive` all already guarded correctly,
confirming the sweep wasn't catching a self-inflicted regression.

Enhanced the dead-section detection locally (captured each Retry
button's enclosing `<section>` class name, since the stock script only
records the rendered message) to attribute every failure to its exact
component before touching any code.

**Two distinct root causes, both already-known failure patterns in this
repo, just not applied to these 8:**

1. **`CompareToRelay`, `Agreement`, `CrossCheck`, `DrillDown`'s
   `useTopPickId`/`useTopPick`**: each calls `ambientData()` directly
   inside a `createMemo` without checking `.error` first. `createMemo`
   evaluates eagerly at creation, so this throws immediately when the
   resource is already errored -- and a memo that throws on its first
   evaluation doesn't reliably re-throw on later reads, settling into a
   stale `undefined` instead, which then crashed downstream `.length`
   reads with an opaque `TypeError` rather than the real fetch failure.
   `DrillDown`'s own JSX already had careful `ambientData.error` guards
   -- they never got a chance to run, since the crash happened in the
   two memo-creation calls before any JSX rendered.
2. **`History`'s `MultiDayStreak`, `TransitionDemo`,
   `DateBrowserTransition`, `SuspenseDemo`**: each reads a resource
   accessor directly inside Suspense-coordinated JSX or a loop with no
   error guard. Suspense only ever catches PENDING reads, never rejected
   ones, so an error escapes straight past it to the outer boundary.

**A self-caught mistake worth recording**: the first fix attempt for
`TransitionDemo`/`DateBrowserTransition` used a plain `if (data.error)
return null` at the top of the reading component. Wrong -- SolidJS
components run their function body once, not on every reactive update,
so that check only ever reflected the resource's state at the single
initial call. Re-running the verification harness caught this
immediately (still 2 dead sections after the "fix"). Corrected to wrap
the read in `<Show when={!data.error}>`, which SolidJS re-evaluates
reactively on every update -- matching the pattern already used
correctly elsewhere (`SuspenseDemo`'s own fix, applied first, got this
right the first time).

---

## What was built

No new components -- pure fixes to 8 existing ones, all using the
`resource.error ? undefined : resource()` guard (or its `<Show>`
equivalent) already established throughout this repo (`StandingRoom`,
`DayComparison`, `JournalismBrief`, etc.).

---

## CodeRabbit findings

None -- review completed with "No actionable comments were generated."
The only failed pre-merge check was Docstring Coverage (40%, threshold
80%), which isn't a real issue -- this repo has no docstring convention
by design.

---

## Verification

Iteratively rebuilt both `dist/` and `dist-artifact/` and re-ran the
patched harness after each round of fixes: 17 dead sections -> 14 (after
fixing the 3 `.length`-crash bugs) -> 0 (after fixing the remaining 5,
correcting the plain-`if` mistake along the way). Final run:
`deadSectionCount: 0`, `allPass: true`, all 6 checks passing, 0 page
errors. Separately verified the happy path against the normal dev server
with working mock data: all 8 components render their real content
correctly, 0 `Retry` buttons anywhere on the Picks or Lab tabs.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/CompareToRelay/index.jsx` | modified — guard `ambientData` read in `useComparison` |
| `src/components/Agreement/index.jsx` | modified — guard `ambientData` read in `editorialPicks` |
| `src/components/CrossCheck/index.jsx` | modified — guard `ambientData` read in `editorialPicks` |
| `src/components/DrillDown/index.jsx` | modified — guard `ambientData` reads in `useTopPickId`/`useTopPick` |
| `src/components/History/index.jsx` | modified — guard `r.data()` read in `MultiDayStreak`'s `teamAppearances` |
| `src/components/TransitionDemo/index.jsx` | modified — `<Show when={!data.error}>` around `ReportText`'s read |
| `src/components/DateBrowserTransition/index.jsx` | modified — `<Show when={!data.error}>` around `HeadlineText`'s read |
| `src/components/SuspenseDemo/index.jsx` | modified — `<Show when={!news.error}>`/`<Show when={!desk.error}>` around `NewsMini`/`DeskMini` |
| `src/components/SuspenseDemo/SuspenseDemo.module.css` | modified — added `.error` class |

---

## What this does NOT change

- No relay/data-layer changes -- every fix is purely client-side error
  handling.
- The shared `scripts/verify-artifact.mjs` harness itself is unchanged;
  only a local, uncommitted copy was patched (an explicit browser
  `executablePath`) to run in this sandbox.
- No behavior changes to any component's happy path -- verified
  identical real-data rendering before and after.
