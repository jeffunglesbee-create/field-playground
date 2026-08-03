# CC Session Outbox — fourth-order follow-up: a second, different bug-class guard

**Date:** 2026-08-03

---

## What was asked

"Automate these follow-ups at as many levels/orders as possible with
no fallbacks, only fixes" — repeated again, continuing past the third
round (`docs/outbox/cc-session-2026-08-03-third-order-followups.md`),
which had explicitly declined a full AST-based control-flow checker as
disproportionate for extending the *same* resource-safety guard
further. Rather than reach for that declined idea again, this round
looked for a genuinely different, already-proven bug class instead.

---

## What was built

`scripts/check-unread-memos.mjs` — a new, independent guard for a
different real, documented Solid.js bug from this session's own
history: DramaSoundscape's real bug (found 2026-07-31, user report
"soundboard doesn't play live") was a bare `createMemo(...)` whose
return value nothing ever called. Solid's memos are lazy/pull-based —
with zero consumers, a memo runs exactly once at creation and never
re-runs, silently. `createEffect` is the correct primitive for a
side-effect-only computation; a memo used that way looks like it works
(no error, no warning) but is actually dead.

Scans for `const NAME = createMemo(` declarations where `NAME` never
appears again anywhere else in the same file — neither called
(`NAME()`) nor referenced bare (`<Child prop={NAME} />`, which counts
as "used" since a child could call it).

**Validated, not just reasoned about, before being trusted:**

1. Ran against the real, current codebase first — zero violations.
2. Reproduced the exact historical bug shape in a throwaway component
   (a memo used only for a side effect, return value never read) —
   correctly caught.
3. Tested a legitimate bare-prop-passing case (`<Child data={derived}
   />` where `derived` is a memo passed as a prop without being called
   in the same file) — correctly NOT flagged.
4. Cleaned up the throwaway test component.

**Honest limitation, stated in the script's own header rather than
overclaimed away:** a memo's accessor exported from its file and
called only from another file would be invisible to this single-file
scan. Not seen anywhere in this codebase's actual local-memo patterns
today, but a real blind spot if that pattern is introduced.

Matched the established pattern from the resource-safety guard: hard
failure (`process.exit(1)`) on violations, not a "manual review
needed" warning that CI would silently pass through — a warning that
doesn't gate anything doesn't actually prevent the bug from
recurring, which defeats the point of automating this at all.

Wired into `.github/workflows/build-check.yml` as a new step right
after the resource-safety check, same low-ceremony posture as the rest
of that workflow.

---

## Verified

- `npm run build` — clean (176 modules).
- `node scripts/check-unread-memos.mjs` — exits 0, "No unread
  createMemo declarations found." against the real, current codebase.
- Reproduction test (throwaway component, cleaned up after): caught
  the exact historical bug shape.
- False-positive test (throwaway component, cleaned up after): a
  legitimate bare-prop-passed memo was correctly not flagged.

---

## Where this round stops

Same honest limit as the resource-safety guard: true cross-file
tracking (an exported memo accessor called only from another module)
needs real import/export resolution, not a single-file regex scan.
Not attempted here — flagged in the script's header rather than
silently left as an unstated gap. No other unread-memo-shaped
candidates were found in the real codebase to fix this round; this
guard's value is preventing recurrence, not resolving an existing
instance (there wasn't one).

---

## Files changed

| Path | Status |
|------|--------|
| `scripts/check-unread-memos.mjs` | new — automated unread-createMemo guard |
| `.github/workflows/build-check.yml` | modified — runs the new guard after the resource-safety check |
| `docs/outbox/cc-session-2026-08-03-fourth-order-followups.md` | new — this doc |
