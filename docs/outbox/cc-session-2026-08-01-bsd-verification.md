# CC Session Outbox — BSD independently re-verified

**Date:** 2026-08-01
**Commit:** `93f0709` (probe + CI workflow)

---

## What was asked

User shared chat screenshots of a concurrent session's work (production
`jubilant-bassoon` CC-CMD + a `field-playground` build) reporting real
findings about BSD, a football data source proxied through
`field-relay-nba` (`/bsd/events/...`): direct event-ID lookup works,
but `season=`/`date=` list-filter params don't actually filter. Asked
to use that conversation to verify BSD.

Screenshots aren't independently checkable evidence on their own — per
this session's own established discipline, re-ran the same class of
check with fresh real data via CI before treating the claims as
established fact in this session's own record, rather than taking a
chat transcript at face value.

## Repo state found

A concurrent session had already built and merged `BsdXgPanel`
(`src/components/BsdXgPanel/`, wired into `App.jsx`, two real bugs
found and fixed in it — an unconditional resource-accessor re-throw,
same class as `WcBracketTree`/`Newspaper` earlier this session, and a
strict-vs-fuzzy team-name matching bug for "Man City" vs "Manchester
City"). `Build Check` is green on the current `main` HEAD including
all of it.

## Independent re-verification

`scripts/probe-bsd-verification.mjs`, run via CI (`field-relay-nba`
confirmed sandbox-blocked by direct curl before writing this, same as
every real-data probe this session):
`outbox/bsd-verification-2026-08-01T23-55-01-600Z.txt`

- **`season=` doesn't filter — CONFIRMED, independently.** Three
  different season values (2023/2024/2025) all returned the identical
  count (50) and the identical first-page dates
  (`2027-05-30T15:00:00+00:00`, repeated). Not a coincidence — the
  param is being ignored.
- **`date=` doesn't filter — CONFIRMED, independently, with different
  evidence than the screenshot's.** Requested `2026-07-25`, got back
  results dated `2027-05-30` — a different specific mismatch than the
  "November 8" example in the screenshots, but the same bug: the date
  param has no effect on what's returned.
- **Direct event-ID lookup is reliable — CONFIRMED, independently.**
  `/bsd/events/209914/shotmap` (the same event ID `BsdXgPanel`'s commit
  history cites) returned real, correctly-shaped data: `event_id`,
  `stats` (with real `home`/`away` keys), `shotmap`, `momentum`,
  `average_positions`, `xg_per_minute`.

## Verdict

BSD is real and its `BsdXgPanel` integration is soundly built: it
doesn't defensively retry the broken list search, it structurally
avoids it by resolving the real event via FPL's already-verified
fixtures endpoint (team-name matching) and only ever hitting BSD by
direct event ID — the one path independently confirmed reliable here.
Nothing further needed; this closes the loop the user asked for.

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/probe-bsd-verification.mjs` | new — independent real-data re-check of season=/date=/event-ID claims |
| `.github/workflows/bsd-verification-probe.yml` | new — `workflow_dispatch` only |
| `outbox/bsd-verification-2026-08-01T23-55-01-600Z.txt` | new — real CI result |
| `docs/outbox/cc-session-2026-08-01-bsd-verification.md` | new — this doc |
