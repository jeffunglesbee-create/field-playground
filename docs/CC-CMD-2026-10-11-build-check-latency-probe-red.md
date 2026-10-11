# Claude Code Command — Build Check has been red for six runs and nobody is reading it

**Date:** 2026-10-11
**Repo:** field-playground
**Branch:** main — commit directly, do not create a feature branch or PR
**Type:** B (gap) — a workflow that cannot go green is a workflow nobody checks
**Status:** DONE 2026-10-11. Four tasks, four done conditions, no stop
condition hit. Session doc:
`outbox/cc-session-2026-10-11-build-check-latency-probe-red.md`.

**`Build Check` run `38142199452` — conclusion `success`.** The first green run
in its visible history.

**THE CAUSE WAS NONE OF THE THREE READINGS BELOW**, and that is the finding
worth keeping: all three assume the module loaded. It never did.
`scripts/latency-chart-probe.mjs` imported `@playwright/test`, which is not a
dependency of this repo — `package.json` declares `playwright` — so it threw
`ERR_MODULE_NOT_FOUND` before a browser was launched. **It was the only script
in `scripts/` doing that; 21 import `{ chromium } from 'playwright'`.** Rule 62:
the convention already existed and this was the single file outside it.

**Task 0's log could not be read from here.** `gh api .../jobs/<id>/logs`
redirects to blob storage, and the annotations carry only
`Process completed with exit code 1` — six days of exactly that, which is why
nobody read it. Reproduced locally instead, which gave the error verbatim.

**One word changed.** None of this document's three forbidden fixes was used —
not the 20-second wait, not `continue-on-error`, not deleting the step — and
none of them would have touched the cause.

**The chart never regressed.** With the import fixed: `canvases 1`,
`uplotRoot true`, `ariaLabel "15 points. request duration (ms): 8.8 to 583.6"`.

**Task 3 — and one green run proves nothing here.** The probe's assertions had
never been exercised; its only two states on record were "crashed before
launching a browser" and "passed once". `scripts/mutate-latency-chart-probe.mjs`
is now a CI step beside it: **2 caught, 0 wrong, 0 never anchored**, restored
green. It reports `ANCHOR` when an anchor is not unique, `BUILD-FAILED` when a
mutation stops the bundle compiling, and `RED-FOR-THE-WRONG-REASON` when the
probe fails without the expected message.

**Second CC-CMD per Rule 87.4**, opened rather than widening the citation-check
port that found it. That port's own step passes; this one does not, and it
predates it.

## The measurement

`Build Check` has failed on **every run in its visible history**, always at the
same step:

```
2026-10-11  47ad522  failure   Probe the latency chart
2026-10-10  b4a826a  failure   Probe the latency chart
2026-10-09  bb792b5  failure   Probe the latency chart
2026-10-08  4d5b8dd  failure   Probe the latency chart
2026-10-07  fba60cb  failure   Probe the latency chart
2026-10-06  7b740ff  failure   Probe the latency chart
```

Six consecutive days, one step. The step is:

```yaml
npx vite preview --port 4173 &
for i in $(seq 1 20); do curl -sf -o /dev/null http://localhost:4173/ && break; sleep 1; done
PLAYGROUND_URL=http://localhost:4173/ node scripts/latency-chart-probe.mjs
```

## Why it matters more than one broken probe

**A permanently red workflow stops being a signal.** Every gate in that job
after the failing step still runs and still reports, but the workflow's own
conclusion is `failure` regardless, so nothing new can be noticed from it. The
citation ratchet added on 2026-10-11 sits at step ~76, before this one at ~156,
which is the only reason its verdict is readable at all — and that is luck of
ordering, not design.

The repo already knows this failure shape. The comment immediately below the
failing step records `update-odds-key.yml`, deleted 2026-08-25, which "piped
the EXHAUSTED free-tier key into `wrangler secret put`" and "would have printed
a green checkmark". The lesson taken there was about names matching behaviour.
The lesson here is adjacent: a conclusion nobody can move is a conclusion
nobody reads.

## Tasks

**Task 0 — read the actual error before changing anything.** Fetch the step's
log and report, verbatim, what `latency-chart-probe.mjs` printed and what exit
code it returned. Three readings are available and no two have the same fix:
the preview server never came up within the 20-second loop; it came up and the
probe's selector no longer matches; the probe runs and the assertion genuinely
fails because the chart regressed. **Do not guess which.** If the log is gone
from retention, re-run the workflow once to get a fresh one.

**Task 1 — reproduce it locally or establish that you cannot.** `npx vite
preview` plus the probe, same env var. If it passes locally and fails in CI,
that difference is the finding and the next question is what the runner has
that this does not (headless browser, fonts, timing).

**Task 2 — fix the cause Task 0 names, not the symptom.** Specifically NOT:
raising the 20-second wait without evidence that timing is the cause, adding
`continue-on-error`, or deleting the step. A probe removed to get green is the
signal deleted, which is the defect this document is about, completed.

**Task 3 — the assertion must be able to fail.** Whatever the fix, break the
thing the probe exists to catch, watch it go red, restore it (Rule 90). A probe
that has only ever failed has proven as little as one that has only ever
passed.

## Stop conditions

- Do not touch `scripts/check-doc-citations.mjs`, `docs/citation-budget.txt`, or
  the citation step. They are green and unrelated.
- Do not add `continue-on-error` to the failing step, and do not delete it.
- If Task 0 shows the chart genuinely regressed, STOP and report — fixing the
  chart is a different document from fixing its probe.

## Done conditions

1. The step's verbatim log output and exit code are recorded.
2. The cause is named as one of the three readings above, with the evidence.
3. `Build Check` reaches conclusion `success` on a real push.
4. A mutation shows the probe can still fail.
