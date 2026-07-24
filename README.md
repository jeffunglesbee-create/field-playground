# field-playground

Sandbox for FIELD-adjacent ideas that aren't production yet. See
`docs/OPERATING-MODE.md` for the full operating rules.

**Read before starting new work here** — reduces the odds of writing
something that already exists (this happened once already: two
independent design docs collided on the same filename because neither
writer knew the other existed):

- **`docs/GROUND-UP-DESIGN.md`** — founding design spec for what FIELD
  would look like rebuilt from scratch. Eight principles, each traced to
  a real incident, revised 2026-07-24 with actual evidence from building
  against them (some confirmed, some humbled — read the revision notes).
- **`docs/SOLIDJS-BUILD.md`** — the actual SolidJS implementation plan
  for the AmbientPanel + DeskCard rebuild specifically (why SolidJS,
  architecture, the two structural tests being run).
- **`docs/EXPERIMENT-desk-ambient-rebuild.md`** — the build log and
  current honest answer to the experiment's real question (is this class
  of bug structurally harder to write in a real framework — split
  result: yes for state-transition bugs, no for CSS containment).

Current implementation: `src/components/AmbientPanel/` and
`src/components/DeskCard/`, wired to live relay data via
`src/data/relay.js`. Vite + SolidJS, no router, no TypeScript, no test
suite (exploratory — the experiment's answer *is* the output).
