# field-playground — operating mode

Sandbox for FIELD-adjacent ideas that aren't production yet. Used by both
Claude and ChatGPT for faster, exploratory iteration — deliberately
outside the CC-CMD / Codex / confidence-gate discipline that governs
`jubilant-bassoon` and `field-relay-nba`.

## What's different here (on purpose)

- Claude reads/writes/commits directly — no CC-CMD dispatch to Claude Code
  required for changes in this repo specifically.
- No mandatory HANDOFF/Codex bookkeeping per experiment.
- No Rule 87 self-completion, no confidence-gate scoring tables.
- ADR-002 / RUWT patent-defense constraints don't apply — nothing here
  ships to FIELD's production surface.

The point is speed: try things, fail fast, throw work away without
ceremony.

## What doesn't change

- No fabricated data or invented content presented as real.
- No credentials committed, in any form, ever — ChatGPT has read access
  to this repo, so anything here is effectively shared with OpenAI too.
- Claims about what works are still genuinely verified before being
  reported as working, not assumed.
- Anything worth keeping graduates into `jubilant-bassoon` /
  `field-relay-nba` through the normal CC-CMD process. This repo itself
  never becomes a second production surface.
- **The 5-minute/3-turn diagnostic rule** — same standing discipline as
  the stricter repos: if a problem isn't resolved within roughly 5
  minutes or 3 real attempts, stop iterating the same fix and apply
  actual novel thinking (isolate the variable, question the assumption,
  change the approach) rather than retry a fourth time. Lighter
  governance here means no CC-CMD ceremony and no confidence-gate
  scoring — it was never license to keep re-running a failing approach
  hoping the next attempt differs from the last three. This is
  operational discipline, not process weight, and it doesn't get relaxed
  along with the rest.

  Real case, 2026-07-25: a BroadcastChannel cross-tab sync check hung
  three separate times in CI — the full combined harness, the same
  harness with a suspected culprit removed, then a maximally-simplified
  isolated script with a deliberately short 3-minute ceiling. All three
  ended the same way: cancelled, not failed, meaning even the diagnostic
  checkpoint data never survived to be read. Stopped after the third
  attempt rather than trying a fourth blind variant, and said so plainly
  — genuine CI limitation, reroute to a real browser (Claude Code's own
  environment, or two tabs open locally) instead of continuing to guess
  from here. That's the rule working correctly, not a failure to find
  the root cause; the discipline is knowing when automated diagnosis has
  stopped being the productive path, not solving everything from a
  single vantage point no matter the cost.

## Mechanical fact worth stating plainly: outbox path differs from jubilant-bassoon

`jubilant-bassoon`'s session outbox manifests live at root `outbox/`
(confirmed early in this project, outside the MCP READ_ALLOWLIST — needs
`get_archive_url`, not `read_file`, to reach). **field-playground's
outbox is `docs/outbox/`** — inside `docs/`, where `read_file`/
`read_source` can actually reach it directly. Different convention,
confirmed 2026-07-24 by pulling the real repo and checking, not assumed
to match the other one. When checking "what did the last session
actually do" here, check `docs/outbox/`, not root `outbox/` — a session
doc existing there is not something that should need a screenshot to
surface; a full-repo path sweep (`find . -iname "*outbox*"`) finds it in
one call.

## "Should we add rules?" — reconsidered and rejected, 2026-07-24

Asked directly after a session that hit a real string of friction:
Chromium unreachable from chat's sandbox, a Node harness that couldn't
actually test SolidJS's reactive scheduler, a couple of stale-`parent_sha`
retries. Worth checking honestly rather than assuming "no" by default.

**Conclusion: no, once the causes are separated out.** None of that
friction was caused by light governance. A CC-CMD document doesn't make
a blocked download succeed. No process gate substitutes for actually
running something and discovering a real Node-vs-browser incompatibility
— that requires trying it, which is what happened. The stale-sha retries
are a read-before-write habit, already self-correcting via the tool's
own error messages, and would happen identically under full CC-CMD
discipline in the other two repos.

**The real distinction: ceremony vs. knowledge.** "No rules" here has
only ever meant no *process weight* — CC-CMD dispatch, confidence-gate
scoring, mandatory bookkeeping. It was never a case against writing down
what's actually learned. The fix for today's friction wasn't a new gate,
it was capturing the hard-won fact ("Node can't test SolidJS's reactive
scheduler, use a real browser") directly in `docs/EXPERIMENT-live-reconciliation.md`
and encoding it into a reusable GHA workflow
(`.github/workflows/live-reconciliation-check.yml`) — durable knowledge
as an artifact, not a rule that has to be remembered and manually
followed. That's already the right kind of governance for this repo. If
the same question comes up again, check whether the actual cause is
missing process or missing knowledge before assuming the answer is
"add rules" — they're different problems with different fixes, and only
one of them fits what this repo is for.

## "Should we add rules?" — asked again, different question this time, 2026-07-24

The section above answers the CI-friction version of this question. This
is a different version, asked the same day: not "why did today feel
slow," but "real, confirmed findings keep sitting here instead of
reaching FIELD" — `<Switch>`-based state exclusivity, the shared chip
primitive, `createStore`+`reconcile()` for live polling. All three
verified, all three still nowhere near `jubilant-bassoon`. That's not
the same problem as a blocked Chromium download, and it doesn't get the
same answer.

**Conclusion: one narrow addition, not a reversal.** The gap isn't
ceremony during experiments — it's the total absence of anything at the
*end* of one. "Anything worth keeping graduates through the normal
CC-CMD process" has been true in principle since this file's first
version and has never once actually happened. A stated intent with
nothing forcing it isn't a process, it's a hope.

**The rule:** when an experiment's status in `docs/EXPERIMENTS.md` moves
to Done, or a specific finding inside an in-progress one is confirmed
solid, the closing entry isn't finished until it says one of two things
explicitly: "CC-CMD written: `<link>`" or "Not graduating because
`<reason>`." Silence is what caused the backlog — an explicit "not yet,
here's why" is a fine, honest answer; a finding that just trails off
with no line either way is the actual failure mode. This is one
checklist line, same shape as session-end already has for other things
— not a gate on building, not a review step, not anything that slows
down the next experiment. It only fires at the moment something is
already confirmed good enough to write down as done.

**Current backlog, named explicitly rather than left implicit:**
`<Switch>`-based render-state exclusivity, the shared chip/pill
primitive, and `createStore`+`reconcile()` for live polling are all
confirmed, all still un-graduated. Whether any of them gets a real
CC-CMD is Jeff's call, not a decision this rule makes automatically —
the rule only requires that the call gets made and written down, not
left to just not happen again.
