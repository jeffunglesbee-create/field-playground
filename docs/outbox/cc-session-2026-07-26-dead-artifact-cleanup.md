# CC Session Outbox — Dead App.artifact.jsx Cleanup

**Date:** 2026-07-26
**PR:** jeffunglesbee-create/field-playground#9 (merged)
**Commit:** 7f9f00b (squash merge to main)

---

## What was asked

A direct follow-up to the WeatherPoll incident (#8): bring `App.artifact.jsx`
up to parity with `App.jsx`, since it was missing roughly 20 components,
including `WeatherPoll` itself.

---

## What actually happened instead

While diffing the two files to find the missing components,
`vite.config.artifact.js`'s own comments revealed the real fix had
already landed in an earlier session — it just couldn't be finished.

The artifact build works by aliasing `./lazyModules` to
`lazyModules.artifact.js` (so `Seasons`/`HeavyPanel` resolve through
`lazy(() => Promise.resolve(...))` instead of a real `import()`, which
is what makes a single-file build possible with zero emitted chunks).
Since `vite.config.artifact.js` has no `rollupOptions.input` override,
`vite build --config vite.config.artifact.js` uses Vite's default entry
— `index.html` → `main.jsx` → `App.jsx` — **the exact same entry as the
standard build.**

That means `App.artifact.jsx`, `main.artifact.jsx`, `index.artifact.html`,
and `LazyBoundaryDemo/index.artifact.jsx` were never actually part of the
artifact build. They were leftovers from an earlier, abandoned approach
(duplicating the entire App tree) that the alias fix was written
specifically to replace. The previous session's own comments say the
duplicate had already drifted from `App.jsx` and shipped broken twice,
and that the dead files were "safe to delete" but couldn't be, because
that session was chat-based with no file-delete tool.

It had drifted a third time — this session, ~20 missing components —
without anyone noticing, because nothing was actually building from it
to surface the drift. My own initial plan (resync the duplicate) would
have been the fourth iteration of maintaining a file that does nothing.

---

## What was done

- Deleted the four confirmed-dead files.
- Updated `vite.config.artifact.js`'s comment, which still told a future
  reader these files were "safe to delete" — now that they are, it says
  so in past tense instead.

---

## Verification

- **Byte-identical build output hashes**, both standard (117 modules)
  and artifact (116 modules) targets, before and after deleting the four
  files — direct proof they were never part of either build, not just an
  assumption from reading the config.
- Statically served the resulting `dist-artifact` and drove it with
  Playwright. This sandbox's network policy blocks every external relay
  call, so every resource in the real app errored simultaneously —
  incidentally a strong stress test of #8's per-section isolation: the
  app still rendered 49 sections with no whole-app crash under total
  resource failure.
- CodeRabbit review: zero actionable comments, all 5 pre-merge checks
  passed (docstring coverage passed too this time — no functions in a
  deletion-only diff to evaluate).

---

## Files changed

| Path | Status |
|------|--------|
| `src/App.artifact.jsx` | deleted |
| `src/main.artifact.jsx` | deleted |
| `index.artifact.html` | deleted |
| `src/components/LazyBoundaryDemo/index.artifact.jsx` | deleted |
| `vite.config.artifact.js` | modified — comment updated to past tense |

---

## What this does NOT change

- No change to either build's actual output or behavior — confirmed by
  the identical file hashes, not inferred from the diff.
- No change to the alias mechanism itself (`lazyModules` /
  `lazyModules.artifact.js`), which is the part that's actually load-
  bearing for the artifact build.
