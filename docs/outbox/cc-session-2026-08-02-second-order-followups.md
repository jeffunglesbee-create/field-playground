# CC Session Outbox — second-order follow-ups

**Date:** 2026-08-02

---

## What was asked

"Automate follow-ups at as many levels/orders as possible with no
fallbacks, only fixes" — a direct instruction to keep going past the
first round of fixes (`docs/outbox/cc-session-2026-08-02-followup-
fixes.md`) into genuine next-order work, not just the first thing that
came to mind.

---

## Fix 3: an automated, self-verified guard for the resource bug

`src/data/safeResource.js` fixed 2 known instances of the bug, but
remained a manual convention — nothing stopped a 5th hand-written
instance from appearing. `scripts/check-resource-safety.mjs` closes
that: reads `relay.js` at check-time to find every real
`createResource` accessor (12 today, not hardcoded — stays correct as
relay.js grows), scans every component for `createResource(` calls
passing one of those bare accessor names directly as the source
parameter, and fails loudly if found.

**Verified as a real guard, not just trusted to work:** intentionally
reintroduced the exact bug in a throwaway component
(`createResource(dramaLeaderboard, ...)`, no wrapper) — the checker
caught it and exited 1 with the real file/line. Then confirmed zero
false positives against the three legitimate safe patterns
(`safeResource(...)` wrapper, a plain-signal source, and an inline
arrow-function wrapper) — checker passed clean. Both cases actually
run, not assumed correct from reading the regex.

**Honestly scoped, not oversold**: this catches the `createResource`
source-parameter manifestation only. The other real manifestation (a
bare resource call directly in JSX, e.g. `<Show when={resource()}>`)
needs real scope tracking to distinguish from a safe render-prop call
and isn't attempted here — still caught by code review and
`artifact-check.yml`'s real render test, same as before. Stated in the
script's own header, not left implicit.

Wired into `build-check.yml` right after the build step — the one
workflow already confirmed firing on push for this session's own
commits (contra its 2026-07-28 header note about `[skip ci]`, which
applies to the fully-automated bot commits, not commits like this
one), plus its daily schedule as a backstop.

## Fix 4: redacted a real credential value from my own writeup

Swept `src/`, `scripts/`, `docs/`, and `outbox/` for anything
credential-shaped. Found real LaLiga subscription key values in two
places: the raw probe captures (`outbox/laliga-*.txt` — evidence,
untouched, consistent with treating raw research capture as an
immutable audit trail) and `docs/outbox/cc-session-2026-08-02-laliga-
network-capture.md` — my own authored writeup, not raw evidence.
Redacted the actual values from the writeup; the finding itself (that
real, public keys exist and are shipped client-side) is unchanged and
still fully documented, just without gratuitously repeating a
credential-shaped string a third time when the raw capture already
proves it twice. `docs/REAL-API-SURFACE.md` (written after the
capture) already didn't repeat the values — checked, not assumed.

No other real credentials found anywhere else in the repo.

---

## Verified

- `npm run build` — clean (176 modules).
- `scripts/check-resource-safety.mjs` — run directly: passes clean
  against the real, current codebase; genuinely catches an
  intentionally-reintroduced instance of the real bug; genuinely
  produces zero false positives against all three known-safe patterns.
- Full repo credential sweep (`grep` for key/token/secret/subscription
  patterns plus a broader 32-char-hex sweep) — only the two known
  LaLiga occurrences found, now redacted from the one that was a
  writeup rather than raw evidence.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/check-resource-safety.mjs` | new — automated resource-safety guard |
| `.github/workflows/build-check.yml` | modified — runs the guard after every build |
| `docs/outbox/cc-session-2026-08-02-laliga-network-capture.md` | modified — redacted real key values, evidence pointer kept |
| `docs/outbox/cc-session-2026-08-02-second-order-followups.md` | new — this doc |
