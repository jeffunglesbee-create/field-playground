# CC Session Outbox — follow-up fixes from a self-assessment

**Date:** 2026-08-02

---

## What was asked

Asked directly for an honest opinion on what field-playground should be
watching out for, based on direct observation across this session.
Follow-up: "Automate follow-ups. No fallbacks, only fixes" — act on
what's genuinely actionable rather than just having said it.

## What was actually fixable, and what wasn't

Of the 5 concerns raised, 2 were directly, safely actionable and are
fixed here. One (pre-merge real-network testing) turned out to already
be a deliberate, documented tradeoff (`artifact-check.yml`'s own header
explains why it's scheduled rather than push-triggered — every commit
here carries `[skip ci]`, so a push trigger would go silently dead the
same way `build-check.yml`'s once did). Two (concurrent-session
coordination, backlog prioritization) are process/judgment calls for
the user, not something to impose unilaterally.

## Fix 1: one canonical helper for a bug class fixed 4+ times

Before touching anything, swept the whole codebase for both real
manifestations of the pattern (a resource accessor called unconditionally
re-throws if its resource has errored) — both as a `createResource`
`source` parameter and as a raw JSX `resource()` read. Confirmed clean
everywhere except the known instances; `SuspenseDemo`'s apparently-
unguarded read turned out to be intentional and already correctly
separated from its own `.error` check (verified by reading it, not
assumed).

`src/data/safeResource.js` — one function, `safeResource(resource,
fallback)`, replacing the two components that used the matching
standalone-accessor style (`JournalismBrief`, `GameSymphonyArchive`).
The other four (`DayComparison`, `MultiDayStreak`, `WcBracketTree`,
`Newspaper`) use a structurally different inline-early-return style
across multi-resource memos — left untouched rather than restructured
for cosmetic-only benefit on already-shipped, already-verified code.

## Fix 2: a real API-surface reference doc

`docs/REAL-API-SURFACE.md` — every external host/route this project
actually touches, each entry's confidence level stated honestly (directly
probed this session vs. inferred from merged code vs. known broken),
compiled from this session's own real probe results plus direct
inspection of concurrent sessions' merged work. Explicitly documents
the `window.storage` non-existence and BSD's broken search so neither
gets rediscovered a third time.

---

## Verified

- `npm run build` — clean (176 modules).
- `safeResource` unit-checked directly (Node, no browser): correctly
  returns the fallback for an errored resource without throwing, and
  correctly passes through real data for a healthy one.
- Local browser regression check (Playwright, real dev-mock data):
  `JournalismBrief` renders normally; `GameSymphonyArchive` degrades
  gracefully to its own honest "Unable to load: Failed to fetch"
  message (real MLB Stats API host sandbox-blocked in local dev, same
  as always) with **no page-level crash** — confirming the retrofit
  preserves the exact graceful-degradation behavior the original fix
  established.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/safeResource.js` | new — canonical resource-error guard |
| `src/components/JournalismBrief/index.jsx` | modified — retrofit to shared helper |
| `src/components/GameSymphonyArchive/index.jsx` | modified — retrofit to shared helper |
| `docs/REAL-API-SURFACE.md` | new — real external API surface reference |
| `docs/outbox/cc-session-2026-08-02-followup-fixes.md` | new — this doc |
