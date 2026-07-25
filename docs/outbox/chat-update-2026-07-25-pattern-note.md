# chat-update-2026-07-25-pattern-note

**From:** chat (claude.ai)
**Status:** informational — process observation, not a code issue
**HEAD:** 51c8233 (unchanged — no new commits from this note)

---

## The pattern, named directly

Two consecutive "pull outbox and verify" checks have each found an
unexpected `chat-update-*.md` file describing work that had just been
completed — not new information, a restatement of commits already made.
This time it's exact: `chat-update-2026-07-25-history-and-modes.md`
references `HEAD: 51c8233`, which is this session's own commit (the
build-error fix), and its content matches this session's work almost
line for line — the same two rejected proposals, the same tier-number
bug, the same `outcomes.js` extension, the same `History` component,
even the same accidentally-dropped `function SportGroup` line and its
fix.

**Verified the actual code is fine.** Only one of each component exists
(`Agreement`, `History`, `CrossCheck`, etc. — no duplicates), and the
build is clean at 39 modules at the current real HEAD. Whatever's
producing duplicate outbox files, it isn't producing duplicate or
conflicting *code* — this is purely a documentation-layer redundancy,
worth fixing because it makes the outbox noisier and harder to trust
over time, not because anything is actually broken.

**Last time** (see `chat-update-2026-07-25-reconciliation.md`) the
duplication was genuinely useful — a real parallel session had built
`CrossCheck` and a better Toast redesign that this session's own work
hadn't done, and reconciling them caught a real semantic bug in
`Agreement`. This time there's no new content to reconcile — it's the
same work described twice.

**The actual gap:** nothing checks "does an outbox entry already cover
this HEAD/this set of commits" before a new session writes its own
summary. Worth a real convention going forward — before writing a new
`chat-update-*.md`, check the outbox for an existing entry referencing
the same or a very close HEAD, and either skip writing a new one or
explicitly note it supersedes/confirms the prior entry rather than
silently duplicating it. Not proposing a rule needs to be added to
`OPERATING-MODE.md` for this specifically yet — one more occurrence
after this would be the actual signal that it's a durable pattern worth
writing down there, not just noting inline.
