# CC Session Outbox — schedule the remaining CI checks

**Date:** 2026-07-28
**Commit:** 122587a (`main`, direct push — workflow-only infra change)

---

## What was asked

Following "automate follow-ups" (scheduling `line-movement-probe.yml`
and `streams-availability-probe.yml`), asked "what else can we
automate" — a review of every other workflow's trigger surfaced one
real bug and a few reasonable candidates; user said yes to fixing/
scheduling all of them.

---

## What was found

A trigger-by-trigger read of all 14 workflows (`awk` over each file's
`on:` block) turned up a genuine, previously-unnoticed problem:
**`build-check.yml`'s `push: branches: [main]` trigger has been
effectively dead this entire session**, for the exact same reason
`deploy-playground.yml`'s push trigger was found dead earlier today —
every commit this session's MCP tooling makes carries `[skip ci]`,
which suppresses push-triggered workflow runs entirely, not just the
one workflow that happened to notice. `build-check.yml` is the one
check answering "does this actually build" — a real break could have
landed on `main` undetected the whole time, discovered only because
`npm run build` happens to also be run manually before most commits
this session, not because the CI gate was doing its job.

`artifact-check.yml` (the offline-mode smoke test behind several of
this session's "verified" claims — `allPass`, dead-section count, no
uncaught page errors) had no automatic trigger at all, manual-only.

---

## What was built

Added `schedule:` triggers to four workflows, alongside their existing
triggers (additive, not a replacement):

| Workflow | Cadence | Why |
|---|---|---|
| `build-check.yml` | daily, `0 8 * * *` | Was silently dead; a real regression guard needs to actually run |
| `artifact-check.yml` | daily, `0 8 * * *` | Same reasoning — real regression guard, no trigger at all before |
| `open-meteo-probe.yml` | weekly, `0 10 * * 1` | Its venue-coverage step checks a hand-maintained table (`VENUE_COORDS`) against real venues that do turn up over time |
| `wikipedia-roof-probe.yml` | weekly, `0 11 * * 1` | Generates a reviewed roof-type proposal (never auto-applies — that stays a human call by design); a schedule catches drift in the proposal itself as venues get renovated or articles edited |

Times are staggered against each other and against the two probes
scheduled earlier this session (`line-movement-probe` 09:00 Monday,
`streams-availability-probe` 09:30 Monday) so nothing contends for a
runner at the same instant.

**Deliberately NOT scheduled:**
- `relay-venue-check.yml`, `mlbtv-pricing-probe.yml` — answered
  one-off factual questions (which spelling does the relay send, what
  price) that don't meaningfully drift day to day.
- `reconciliation-check-v2.yml`, `live-reconciliation-check.yml` —
  already marked `(SUPERSEDED)` in their own workflow names.
- `outcomes-sync-check.yml`, `broadcast-isolated-check.yml`,
  `url-load-check.yml`, `poi-geocode-probe.yml` — not reviewed in
  depth for this pass; flagged as-is rather than scheduled without a
  specific reason, matching the same "explain why, don't just add
  triggers everywhere" bar the other four were held to.

---

## Verification

- All four modified YAML files parsed clean via
  `python3 -c "import yaml; yaml.safe_load(...)"` before pushing.
- Not yet confirmed that any of the new schedules have actually fired
  — `build-check`/`artifact-check`'s first daily window is tomorrow
  08:00 UTC; the two weekly ones' first window is next Monday. Worth a
  spot-check after those land.

---

## Files changed

| Path | Status |
|------|--------|
| `.github/workflows/build-check.yml` | modified — added daily schedule |
| `.github/workflows/artifact-check.yml` | modified — added daily schedule |
| `.github/workflows/open-meteo-probe.yml` | modified — added weekly schedule |
| `.github/workflows/wikipedia-roof-probe.yml` | modified — added weekly schedule |
