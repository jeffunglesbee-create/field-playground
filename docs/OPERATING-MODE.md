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

## Note on where this file lives

Wanted this at the root README.md; the FIELD Handoff MCP's
`commit_file` write-allowlist (`docs/`, `HANDOFF.md`, `CODE_MAP.json` —
same fixed set applied across all three repos) doesn't include a bare
root `README.md`, so it landed here instead. Root README still just says
"# field-playground" from repo creation. Fixing the allowlist itself
would be a field-relay-nba change, which is production infra, not
in-scope for this repo's own lighter rules.
