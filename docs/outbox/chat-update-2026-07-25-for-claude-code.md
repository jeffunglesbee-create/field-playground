# chat-update-2026-07-25-for-claude-code

**From:** chat (claude.ai)
**To:** Claude Code, next session in this repo
**Status:** informational + one correction to your own prior work
**Repo:** field-playground (main)
**Covers:** everything since your `cc-session-2026-07-24-pick-outcomes.md`

---

## Read this part first: a real bug in your own prior work

`DeskCard`'s root originally used `<Switch><Match when={deskData.loading}>`
to choose between skeleton and content. `createResource.loading` flips
`true` on *every* refetch by default, not just the first load — so
`Content` (and every `GameRow` inside it) was unmounting and remounting
on every single 15s poll, regardless of whether `deskStore`'s
`reconcile()` was working correctly underneath. This is the exact bug
class the entire `live-reconciliation` experiment existed to catch, and
it was hiding the real answer for a long time. Found it via real
browser DOM-identity testing (`stillConnected`/`sameNodeReference` both
false on nodes that should have persisted), not by reading the code.

Fixed: `<Show when={deskData()} fallback={<Skeleton/>}>` instead — checks
the resolved value, which stays truthy across a refetch, so `Content`
only unmounts on the genuine first load. Same fix applied to
`AmbientPanel`, which had the identical pattern (lower stakes there —
not in the poll loop — but it shares `currentDate` with `DeskCard`, so
date navigation would have triggered the same unnecessary unmount).

**Worth internalizing generally, not just for this file:** `.loading`
on a `createResource` is not the same signal as "has this ever
resolved." If a component needs "don't show skeleton on refetch,"
check the resolved value's truthiness, not `.loading`.

Also found and fixed: your `LiveFilterToggle` and `ScoreEditor`
(optimistic score edit) — both fully built and wired correctly — never
had corresponding CSS. The classes were referenced in JSX
(`styles.liveFilterBtn`, `styles.scoreEditor`, etc.) but never defined,
so they'd have rendered unstyled. Added the missing rules; no logic
changes needed, the components themselves were correct.

---

## live-reconciliation: CONFIRMED, not just built

After the `.loading` fix above, real DOM node-reference identity
confirmed `deskStore` + `reconcile()` genuinely prevents unnecessary
remounts — same node, literal `===`, for both a changed game and an
untouched one, across a real poll cycle in a real browser. Full
six-step resolution chain (CI job-vs-step-timeout lesson, dev-server
fragility, artifact-visibility gap, a MutationObserver blind spot, then
the actual app bug) is in `docs/EXPERIMENT-live-reconciliation.md`.

`pickem-derived-state` is also CONFIRMED the same way — a pick
correctly resolves `pending` → `correct`/`incorrect` automatically once
`deskStore` marks a game final.

---

## New reusable verification pattern — use this before building a new one

`scripts/verify-reconciliation.mjs` + `.github/workflows/reconciliation-check-v3.yml`:
real production build (`npm run build`), served statically via Python's
`http.server`, Playwright's `page.route()` for deterministic mock data
across staged poll responses (pregame → live → final). No spawned dev
server, no dependency on `mockRelay()`'s dev-only Vite plugin. Currently
covers eleven checks across five experiments in one run: reconciliation,
collapsible groups, watchlist, the transition toast, and the date
browser. There's also `scripts/verify-url-load.mjs` and
`scripts/verify-broadcast-isolated.mjs` — small, deliberately isolated
scripts for two checks that didn't belong bundled into the main one.

**Real lesson from getting this working, worth carrying forward:** a
`timeout-minutes` at the JOB level force-kills the entire job on
expiry — including any `if: always()` commit-back step. A `timeout-minutes`
on just the risky *step* fails that step gracefully instead, letting
later steps still run. Two runs hung to an 8-minute job ceiling with
*zero* recoverable diagnostic data before this was found — the fix
turned every subsequent failure into something actually readable. If
you're writing a new verification workflow here, put the timeout on the
step that might hang, not (only) on the job.

Also: write checkpoint data to disk *incrementally*, after every stage,
not just at the end. A hard process kill prevents any code that hasn't
already run from running — an end-of-script write is worthless if the
kill happens before it. `checkpoint(name, extra)` in the scripts above
is the pattern; it's cheap and it's what actually made the later
failures diagnosable.

---

## Built this session (all build-verified; most also live-verified via the harness above)

- **Date browser, URL-persisted date, BroadcastChannel sync** — the
  latter two turned out to already be yours, found reading `relay.js`
  fresh before duplicating the work. All three now confirmed live,
  including BroadcastChannel specifically (real two-page test, fetch
  counts stabilized at +1 per page after one change, no runaway).
- **Stale indicator, "tonight's card" aggregate** — build-verified only.
- **Watchlist, game-transition toast (`<Portal>`, first use in this
  repo)** — confirmed live.
- **`truth_is` pull quote, `contradiction` tension card, `sport_of_week`
  banner** — all real relay fields, checked via source
  (`recap.contradiction?.brief_text`, `recap.sport_of_week?.value` —
  both plain strings) before building, not guessed from one date's null
  live value.
- **Streak pip row** — alternative viz next to the existing chips; a
  streak count directly implies a same-outcome pip sequence, no new
  data needed.
- **Compact/expand per pick** — same store-keyed-by-id pattern as
  collapsed groups and watchlist, now a proven pattern applied for
  product value, not another research question.
- **Keyboard navigation between picks** — arrow keys move a
  `focusedIndex` signal, Enter toggles expand, `createEffect` scrolls
  into view.
- **Print/export view** — `src/print.css` (plain global stylesheet,
  not a CSS module — needed to reach hashed class names a module
  couldn't) + ordering rules in `App.module.css`.
- **Game countdown** — the one item that's SAMPLE, not real. Checked
  both your source and the live `/context/date` response: `start_time`
  appears in several internal upstream-parsing paths but does not
  survive to the actual game object this endpoint returns. Tagged
  `(sample)` directly in the UI rather than invented as if real.
- **Day comparison, Suspense coordination demo** — first non-singleton
  resource pattern (`createDayContext` factory) and first `<Suspense>`
  use in this repo, respectively. Build-verified.

Full detail on all of the above: `docs/EXPERIMENT-production-gaps-2026-07-25.md`.

---

## Governance addition

`docs/OPERATING-MODE.md` now has two new sections worth knowing about:
- The graduation-checkpoint rule (a Done experiment's entry isn't
  finished until it says "CC-CMD written: `<link>`" or "Not graduating
  because `<reason>`" — silence was the actual cause of the backlog).
- The 5-minute/3-turn diagnostic rule applies here too, explicitly —
  lighter governance means no CC-CMD ceremony, not license to keep
  retrying a failing approach. Real case study included (the
  BroadcastChannel CI saga above).

---

## Carry-forwards

- `DeskCard`'s `shiftDay` calls both `setCurrentDate(...)` (which
  already triggers `createResource`'s automatic refetch via the source
  signal) and an explicit `refetchDesk()` right after — likely a
  redundant double-fetch on every date click. Confirmed the final
  displayed state is correct despite it, so not a correctness bug, just
  a probable wasted network call. Not fixed this session.
- Nothing from this session has graduated to `jubilant-bassoon` yet.
  Per the graduation rule above, that's a real open call, not an
  oversight — worth a look next time product/architecture priorities
  are being set.
