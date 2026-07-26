# chat-update-2026-07-26-harness-tab-aware

**From:** chat (claude.ai)
**To:** Claude Code
**Status:** DONE, verified live
**File:** `scripts/verify-artifact.mjs`

---

## Result

```
allPass: true
10 tabs walked · 0 dead sections · 0 page errors · 0 console errors
Games 13 · Picks 16 · Stats 13 · Journalism 6 · Social 8 · System 7 · Lab 22
```

---

## Why it changed

Your type-based tab reorg mounts only the active panel. The harness was
asserting against the old flat layout where all ~56 sections rendered at
once, so it reported `allPass: false` on a **healthy** build. The app was
never broken — the test was stale.

Two things came out of fixing that.

### 1. It now walks every tab — better coverage, not just a repair

Each tab mounts its own subtree, so a component that throws **only when
its tab is activated** is now caught. The old flat check couldn't reach
those code paths at all.

### 2. The name-based check is gone, replaced by a structural one

`seasons_section_present` asserted a component **label** was visible. It
broke twice in one day, both times for reasons unrelated to app health:

- your tab reorg moved the label behind a tab
- the `Seasons → StandingRoom` merge deleted the label entirely

Replaced with `no_dead_sections`, which detects `App.jsx`'s per-section
`ErrorBoundary` fallback by its rendered **"Retry" button** — a
structural marker no rename can invalidate.

---

## The part worth your attention

**`no_dead_sections` is the check that would have caught WeatherPoll at
the section level**, instead of only once it took all 55 sections down.

A single dead section is invisible to every other assertion in this
harness:

- sibling sections still render
- the tab still looks healthy
- `sectionCount` stays high
- there is **no console error**, precisely *because* the boundary caught it

So between your per-section `SafeSection` boundaries and this check, a
section dying is now both contained *and* detected. Before today it was
contained and silent, which is arguably worse than loud failure — it
looks fine.

---

## Three bugs in my own harness, all found by RUNNING it

Recording these because the pattern is more useful than the fixes:

1. **Stale flat-layout assertions** — described above.
2. **`page.$` instead of `page.$$`.** The doubled character was mangled
   to a single one in a patch. A single query returns ONE element handle,
   not an array — so `.length` was `undefined`, the loop never executed,
   and the manifest silently reported `0 tabs walked` on a healthy build.
   Fixed via `locator().count()` / `.nth()`, which avoids that character
   sequence entirely. Added `tabButtonsFound` to the manifest so a
   zero-match can never be silent again.
3. **`body.innerText.slice(0, 1500)` used for an assertion** — a heading
   below the truncation read as absent.

None of these were visible by reading the code. All three surfaced by
running it against the real artifact.

---

## Two standing lessons

**Assert on structure, not names or counts.** Names get renamed, layouts
get reorganized, counts shift with every component added. Both false
negatives this session came from assertions coupled to cosmetic facts.
*"Does any section show an error fallback"* survives all of it.

**`allPass: false` is not a verdict on its own.** The tab-reorg failure
and the WeatherPoll failure had the **same** `allPass: false` shape — one
was a stale test, one was a real crash that replaced the entire app with
an error string. `pageErrors`, `consoleErrors`, and whether real content
is in the body are the load-bearing signals. Read the detail before
concluding anything.

---

## Unrelated, worth knowing

`GameDrawerRow`'s `createMemo` → accessor fix in the StandingRoom merge is
a genuinely useful SolidJS finding: `createMemo` computes its initial
value **eagerly at creation**, not lazily on first read. Verifying it by
instrumenting `Array.prototype.flatMap` — 8 rows mounted and collapsed,
zero lookups; expand one, exactly one lookup — is the right kind of
proof. That trap hadn't been hit in this repo before.
