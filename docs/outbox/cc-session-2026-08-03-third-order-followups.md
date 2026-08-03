# CC Session Outbox — third-order follow-up: a real bug the new guard found

**Date:** 2026-08-03

---

## What was asked

"Automate these follow-ups at as many levels/orders as possible with
no fallbacks, only fixes" — repeated, continuing past the second round
(`docs/outbox/cc-session-2026-08-02-second-order-followups.md`), which
had explicitly identified the JSX-read manifestation of the resource
bug as the next real, un-automated gap.

---

## What was built

Extended `scripts/check-resource-safety.mjs` with a second check.
True control-flow analysis (does a specific `resource()` call site
only execute when `.error` is falsy?) needs a real AST and scope
tracker, which this deliberately does not attempt. Instead: a
file-wide heuristic — a resource called as a function anywhere in a
component, with `.error` never referenced for it anywhere in that same
file and never routed through `safeResource(...)`, is flagged. Every
real instance of this bug found this session matched that exact shape
("never checked at all"), not the harder case ("checked, but not
everywhere it needed to be") — so the heuristic trades precision for a
low false-positive rate on the actual bug shape that's actually
occurred, and says so honestly in its own header rather than
overclaiming completeness.

---

## Real result: this immediately found a genuine bug

Running the new check against the whole real codebase (not a synthetic
test) found exactly one violation: `src/components/DeskCard/index.jsx`
calls `ambientData()` directly inside `EmptyNight()` (the "no games
today" state) with zero `.error` handling anywhere in the file.
`DeskCard` is one of three components App.jsx's own comment describes
as "the app's spine" — always-on, not tabbed. It IS wrapped in its own
`SafeSection`/`ErrorBoundary`, so a real crash here wouldn't take down
the whole app, but it would replace the entire DeskCard section
(**all of today's games**, not just the small editorial quote this
code actually touches) with a raw error/retry state, on a night where
only the ambient-data fetch failed — a real, disproportionate blast
radius for a genuinely small piece of UI.

Fixed with the same established pattern: `safeResource(ambientData)`,
preserving the existing fallback cascade ("A quiet night. Sometimes
that's the story.") for both the empty-data case (already handled) and
the now-also-handled errored-resource case.

No other real violations found across the other 60+ component files —
strong evidence the heuristic is well-calibrated for this codebase,
not just untested theory.

---

## Verified

- `npm run build` — clean (176 modules).
- `scripts/check-resource-safety.mjs` — both checks pass clean against
  the real, current, now-fixed codebase.
- Local browser regression check (Playwright, real dev-mock data):
  DeskCard renders normally, real games visible, no error/retry state,
  no new page errors.

---

## Where this round of "as many levels as possible" actually stops

The next order after this would be replacing the heuristic with a real
AST-based control-flow checker (to catch the harder case: `.error`
checked somewhere but not gating every call site). That's a
meaningfully larger undertaking — a real dependency (a JS/JSX parser),
real scope-tracking logic, and a real risk of the kind of subtle
false-positive/false-negative bugs that erode trust in an automated
gate. Not attempted here; flagged honestly rather than either
overbuilt or silently dropped.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/check-resource-safety.mjs` | modified — second check (unguarded direct-call heuristic) |
| `src/components/DeskCard/index.jsx` | modified — real bug fix, `EmptyNight()`'s `ambientData` reads now guarded |
| `docs/outbox/cc-session-2026-08-03-third-order-followups.md` | new — this doc |
