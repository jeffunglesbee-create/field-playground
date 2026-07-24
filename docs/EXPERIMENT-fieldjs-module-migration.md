# Experiment (considered, not started): field.js module migration

**Status: considered, not started, deprioritized below live-reconciliation.**

**The idea:** principle #1 (real ES modules, no monolith) has never
actually been tested against *real* complexity — every experiment so
far has been building something new from scratch. Pull one genuinely
gnarly, real function out of `field.js` (2.3MB, the actual production
file) and see how it decomposes into real modules. Would the real
tangle — shared mutable state, implicit ordering dependencies, DOM
assumptions baked into the function body — resist modularization in a
way a from-scratch build never would, because from-scratch never has to
pay off existing debt?

**Why it's real, not busywork:** this is arguably the *most* honest test
of principle #1, since it's the only one that would touch actual
inherited complexity instead of a clean-room build. Everything tested so
far has had the advantage of starting empty.

**Why it's ranked below live-reconciliation:** it's a different kind of
task, not just a smaller version of the same one. Every other experiment
here is "build something new, see what the framework does for free."
This one is "extract and refactor something that already exists and
already works in production" — closer to a real migration than an
experiment, with real risk of introducing a regression in code this repo
has no authority to touch (see `docs/OPERATING-MODE.md` — this repo's
lighter governance is explicitly for non-production exploration, and
`field.js` is about as production as FIELD gets). Doing this properly
would mean copying a function out for read-only analysis, never editing
the real file from here.

**If picked up later:** pick one function with real, documented
complexity (a boot-sequence function, or one of the DOM-store-once
patterns) via `CODE_MAP.json`, copy it in for analysis only, and treat
"decomposes cleanly" vs. "resists decomposition, here's exactly why" as
the two valid outcomes — same standard as the other experiments. Never
becomes a live migration path from this repo; anything learned here
would need its own CC-CMD in jubilant-bassoon to actually apply.
