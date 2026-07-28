# CC Session Outbox — automate the probe follow-ups

**Date:** 2026-07-28
**Commit:** 8d49949 (`main`, direct push -- workflow-only infra change,
matching this repo's established convention for probe/CI changes)

---

## What was asked

"Automate follow-ups" -- after this session's two verification probes
(`line-movement-probe.yml`, `streams-availability-probe.yml`) had both
only ever been triggered by hand.

---

## What was built

Added a weekly `schedule:` trigger to both workflows, same pattern
`deploy-playground.yml` already established earlier this session for
exactly the same reason: every commit this session's MCP tooling makes
carries `[skip ci]`, which suppresses `push`-triggered workflows too --
a plain push trigger would not have fixed this. A `schedule:` trigger
is independent of commit messages, so it's the actual fix rather than
a different flavor of the same gap.

- `line-movement-probe.yml`: `0 9 * * 1` (Monday 09:00 UTC).
- `streams-availability-probe.yml`: `30 9 * * 1`, offset 30 minutes so
  the two don't contend for a runner at the same instant.

Both keep their existing `workflow_dispatch` trigger for on-demand
runs -- the schedule is additive, not a replacement.

Weekly was chosen deliberately over daily: `line-movement-probe`
verifies a property of the relay's own capture cadence (same-cron vs.
genuine-window), which isn't expected to drift day to day.
`streams-availability-probe` is the more valuable one to actually
automate -- `SERVICE_MAP` is a manually-maintained table matched
against a real broadcast landscape (streaming deals get renamed,
networks come and go), so a recurring re-check is what would actually
catch that drift, rather than it silently regressing until someone
happens to ask again.

---

## Verification

- Both workflow files validated with `python3 -c "import yaml; ...
  yaml.safe_load(...)"` before pushing -- both parse clean.
- Not independently confirmed that the schedule actually fires yet --
  cron schedules only take effect once the file lands on the default
  branch (same registration requirement as `workflow_dispatch`, per
  what this session already learned the hard way trying to dispatch
  `streams-availability-probe.yml` before it existed on `main`), and
  the first scheduled window is next Monday. Worth a spot-check then.

---

## Files changed

| Path | Status |
|------|--------|
| `.github/workflows/line-movement-probe.yml` | modified — added weekly schedule |
| `.github/workflows/streams-availability-probe.yml` | modified — added weekly schedule |
