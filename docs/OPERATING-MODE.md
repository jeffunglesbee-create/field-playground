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
