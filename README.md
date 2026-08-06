# field-playground

FIELD's sandbox — part of FIELD, not adjacent to it. Ideas get built and
measured here before they're production; the work, the probes and the
findings are FIELD's. FIELD spans three repos: the client
(`jubilant-bassoon`), the relay (`field-relay-nba`), and this one. See
`docs/OPERATING-MODE.md` for the full operating rules.

**Read before starting new work here** — reduces the odds of writing
something that already exists (this happened once already: two
independent design docs collided on the same filename because neither
writer knew the other existed):

- **`docs/GROUND-UP-DESIGN.md`** — founding design spec for what FIELD
  would look like rebuilt from scratch. Nine principles, each traced to
  a real incident, revised 2026-07-24 with actual evidence from building
  against them (some confirmed, some humbled — read the revision notes).
- **`docs/SOLIDJS-BUILD.md`** — the SolidJS implementation plan behind
  the AmbientPanel + DeskCard rebuild (why SolidJS, architecture).
- **`docs/EXPERIMENTS.md`** — status index for every experiment run or
  considered here, one row each. Check this before starting something
  new — it's the fastest way to see what's done, what's scoped and
  waiting, and what's been considered and deprioritized (with why).

Current implementation: `src/components/AmbientPanel/` and
`src/components/DeskCard/`, wired to live relay data via
`src/data/relay.js`. Vite + SolidJS, no router, no TypeScript, no test
suite (exploratory — each experiment's answer *is* the output).
