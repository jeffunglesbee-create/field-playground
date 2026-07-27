# CC Session Outbox — BriefArchive + BriefReconcile Dev-Mock Fix

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#19 (merged)
**Commit:** 6147cd6 (squash merge to main)

---

## What was asked

Two screenshots from a parallel `chat.claude.ai` session showing its own
investigation into whether `/journalism/brief/history` is redundant with
`/archive/query` (a real reconciliation question about the production
FIELD app's own internal data paths) -- "History endpoint from chat."
Follow-up: "Yes" (to building something in field-playground based on
what chasing that down surfaced).

---

## What was found

Chat's `/journalism/brief/history` phrase in its own screenshots turned
out to describe a source-file path inside `jubilant-bassoon` (the
production app's codebase), not a public relay HTTP route -- not
directly applicable to field-playground, which only talks to
`field-relay-nba`'s real HTTP surface.

**Chasing the "archive" side of chat's reconciliation directly surfaced
something genuinely useful here.** `GET /archive/query?date=X` is real,
live, and returns EVERY brief generated that day -- confirmed via a
direct probe: 10 real entries for 2026-07-26 alone, covering game
recaps, individual MLB game briefs, and the full slate summary. Nothing
in this app browsed that; `JournalismBrief` only ever shows the single
current one.

**A genuine, separate discrepancy resolved along the way**: an earlier
probe of `/journalism/brief/history` this same session (during the
StandingRoom investigation) returned 403 "Path not allowed" -- a real
negative at the time. A fresh probe just now returned HTTP 200 with real
data, matching exactly what the parallel chat session's own
`BriefReconcile` component (committed directly to `main` between those
two probes) expects. The relay's own routing evidently changed via a
live deploy in between -- both probes were honest at the moment they ran;
this is the negative-result rule working as intended (a stale negative
re-checked rather than assumed permanent).

---

## What was built

- `BriefArchive`: a date-steppable browser (its own local `archiveDate`
  signal, not the shared `currentDate` -- a history browser is a
  different concern from "what date is the app currently showing") over
  the full day's brief output from `/archive/query?date=X`, each row
  expandable (native `<details>`/`<summary>`) to the full brief text,
  word count, model, and source.
- Deliberately does NOT assume `quality_score` (archive's field) and
  `JournalismBrief`'s `proseScore` are the same metric under two names --
  nothing confirms that, and this exact assumption-without-verification
  pattern caused PR #15's original error earlier this same session.

**Also fixed, found while verifying this doesn't regress the tab**:
`BriefReconcile` (the parallel session's component, live on `main`) had
no dev mock for `/journalism/brief/history` -- its fetch fell through to
Vite's `index.html` fallback and threw a JSON parse error in local dev.
Added the mock using the real captured probe response; `BriefReconcile`
now renders correctly in local dev too, alongside `BriefArchive`.

---

## CodeRabbit findings -- 2 total, both addressed in one round

1. **Real: the archive mock wasn't date-aware.** The `/archive/query`
   dev mock returned the same 2026-07-26 fixture for every requested
   date, so `BriefArchive`'s date stepper couldn't be meaningfully
   verified in dev. Mock now keys on the requested `?date=`, returning
   the real fixture only for 2026-07-26 and a real-shaped empty result
   for any other date.
2. **Real: stale rows during a date change.** `createResource` keeps its
   previous value while refreshing, so stepping the date or clicking
   refresh could briefly show the OLD date's rows under the NEW date's
   header. Gated the results `Show` on `!archiveQuery.loading` so the
   loading fallback takes over during any transition.

---

## Verification

`npm run build` clean at every stage. Playwright against the real dev
server confirmed: all four Journalism panels (Brief, Quality, Brief
Reconcile, Brief Archive) render together with real data and no errors;
2026-07-27 (no fixture) shows the empty state, stepping to 2026-07-26
shows the real 10-brief fixture, stepping past it to 2026-07-28 shows
the empty state again rather than leftover rows; expanding a brief row
shows its full real text.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/relay.js` | modified — `archiveDate`/`archiveQuery` resource added |
| `src/components/BriefArchive/index.jsx` | new |
| `src/components/BriefArchive/BriefArchive.module.css` | new |
| `src/App.jsx` | modified — `BriefArchive` mounted in its own `SafeSection`, alongside chat's `BriefReconcile` |
| `src/App.module.css` | modified — `.briefArchive` added to shared section layout class list |
| `vite.config.js` | modified — real captured `/archive/query` mock (now date-aware) + new `/journalism/brief/history` mock fixing `BriefReconcile`'s dev rendering |

---

## What this does NOT change

- No relay/data-layer changes -- `/archive/query` already existed and
  was already live; this only surfaces it client-side.
- `BriefReconcile` itself is untouched beyond the dev-mock fix that lets
  it actually render locally -- its own logic/UI is the parallel
  session's work, not modified here.
