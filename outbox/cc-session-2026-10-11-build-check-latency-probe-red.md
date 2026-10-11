# CC session — Build Check was red for six days on a missing package

**Date:** 2026-10-11
**Repo:** field-playground, branch `main` — direct commits, no PR
**CC-CMD:** `docs/CC-CMD-2026-10-11-build-check-latency-probe-red.md` — four
tasks, four done conditions, no stop condition hit.

## Outcome

**`Build Check` run `38142199452` — conclusion `success`.** The first green run
in its visible history.

```
Install Chromium for the chart probe   success
Probe the latency chart                success     ← had never passed
The latency probe can still fail       success     ← new
Document citations are anchored        success
```

## Task 0 — the verbatim error, and how it was obtained

**The job log API could not be read from here.** `gh api
repos/…/actions/jobs/<id>/logs` redirects to `productionresultssa1.blob.core.windows.net`
and this client contacts `api.github.com` only. The check-run annotations carry
nothing but:

```
failure:
Process completed with exit code 1.
```

Six days of that, which is why nobody read it.

So it was reproduced locally instead — `npm run build`, `npx vite preview`, the
probe with `PLAYGROUND_URL` — and the error is immediate:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@playwright/test'
imported from /home/user/field-playground/scripts/latency-chart-probe.mjs
  code: 'ERR_MODULE_NOT_FOUND'
exit 1
```

**`package.json` declares `playwright`, not `@playwright/test`.** The import
threw before a browser was ever launched.

**None of the three readings the document listed was right**, and that is worth
recording because the document was confident it had covered the space: the
preview server coming up, the selector matching, and the chart regressing all
assume the module loaded. It never did.

**And it was the only script doing it.** 21 scripts in `scripts/` import
`{ chromium } from 'playwright'`. This one imported the other name. Rule 62 —
the convention already existed and this was the single file outside it.

## Task 2 — one word, and the three forbidden fixes stayed forbidden

Changed `'@playwright/test'` → `'playwright'`. Not the 20-second wait, not
`continue-on-error`, not deleting the step; the document names all three as
stop conditions, and none of them would have touched the cause.

**The chart never regressed** — the reading that would have stopped this work.
With the import fixed, locally:

```
tabbed true, panelInDom true, mountPresent true, canvases 1, uplotRoot true
ariaLabel "15 points. request duration (ms): 8.8 to 583.6"
PASS: the latency line draws from real instrumented samples.
```

## Task 3 — one green run proves nothing here

The probe's assertions had **never** been exercised: its only two states on
record were "crashed before launching a browser" and "passed once". A check
with that history has demonstrated nothing about what it asserts.

`scripts/mutate-latency-chart-probe.mjs`, now a CI step beside the probe:

```
baseline: the probe PASSES on clean source

  CAUGHT  M1 the chart mount loses the class the probe finds it by  → "no .latencyChart mount"
  CAUGHT  M2 the canvas stops announcing itself to assistive tech  → "no aria-label"

restored: the probe PASSES on clean source again

2 caught, 0 wrong, 0 never anchored, of 2 mutations
COVERAGE: the mount class and the aria summary. It does NOT mutate the
tab-opening path or the >=2-sample guard — those have no single anchor.
```

Three properties of the harness, each there for a reason this repo has already
paid for:

1. **It asserts its own anchors.** Each mutation checks the anchor is present
   and unique before editing and reports `ANCHOR` rather than a verdict
   otherwise. A harness that prints NOT CAUGHT without having mutated anything
   is worse than no test.
2. **A build failure is not a caught mutation.** `BUILD-FAILED` is its own
   verdict, because a mutation that stops the bundle compiling proves nothing
   about the probe.
3. **Red for the wrong reason is not caught either.** The expected message is
   matched, not just a non-zero exit.

Each mutation needs a rebuild, because the probe reads the built `dist/` through
`vite preview` rather than the source.

## One defect of my own

`pkill -f "vite preview"` matched its own command line and killed the shell
running it — exit 144, no output, no mutation attempted. Re-run as
`pkill -f "[v]ite preview"`. It cost one cycle and nothing else, and it is the
same shape as the harness rule above: a run that produced no verdict must not
be read as one.

## What this leaves

Nothing deferred. The coverage line states what the mutations do not reach —
the tab-opening path and the two-sample guard — and neither has a single anchor
to mutate, so extending it would mean restructuring the component rather than
the harness.
