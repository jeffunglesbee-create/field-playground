# chat-update-2026-07-26-session-handoff

**From:** chat (claude.ai)
**Covers:** 2026-07-25 into 2026-07-26
**Repo state at write time:** build clean, 103 modules

---

## Read this first — one thing is unverified

The shared `Tabs` refactor (PickEm + DayComparison) is **build-verified
only**. It has NOT been through `artifact-check.yml`. Build-clean is not
render-verified — that distinction cost three blank artifacts today, so
it's stated plainly rather than buried.

Everything else below was verified live.

---

## What shipped

**Odds display** — raw JSON blob replaced with parsed
`ML +153 / -186 · SPR +1.5 / -1.5 · O/U 8.5`, open/close on separate
lines, source + capture time as caption. Internal fields (`_oddsProof`,
`adapterId`) no longer leak. Verified against 15 real games via the
actual `parseOdds` code, not a re-implementation.

**Seasons rendering** — fixed. Root cause was the lazy chunk having
nowhere to load from in a single-file artifact (`Unable to preload CSS
for /assets/index-*.css`). Fixed via the artifact build target, not a
workaround.

**Public hosting** — `https://field-playground.jeffunglesbee.workers.dev`
live. Verified beyond the status code: a bare 200 proves nothing here
because `not_found_handling = single-page-application` returns 200 with
`index.html` for broken asset paths. Fetched the hashed asset directly —
`application/javascript`, 159KB, real asset.

**Countdown** — now wired to the real `start_time` field. See the
correction section below; this one has history worth knowing.

**Shared `Tabs` primitive** — `src/components/Tabs/`. PickEm gets sport
tabs; DayComparison gets Both/Yesterday/Today. Extracted rather than
copied because parallel copies drifted twice today.

---

## Relay side

`CC-CMD-2026-07-25-start-time-persistence` **shipped and is verified
live**:

- `start_time` column exists on `regular_season_games`; 7 of 1402 rows
  populated (nulls elsewhere are correct — the spec excluded backfill
  deliberately)
- present as a key on live `/context/date`
- **format: ISO 8601 UTC with NO seconds** — `2026-07-25T20:05Z`
- client `Countdown` parses that exact format correctly (verified by
  running the real logic against real values)

Still open on the relay: `CC-CMD-2026-07-25-playground-secret-bootstrap`
— automates the deploy credential via the existing OIDC Courier. Hosting
is already live, so this is about removing a manual step, not unblocking.

---

## Corrections worth inheriting

Four claims chat made that were **wrong**, each corrected in place so
they don't propagate:

1. **"`start_time` gets dropped before the response is assembled."**
   Wrong. The handler does `SELECT *` and drops nothing — the column
   didn't exist. Said from a grep of unrelated parsing paths without
   checking the schema.
2. **"`field-playground` needs adding to the Courier's allowed
   `repository` claims."** Wrong. `ALLOWED_REPOS` gates the CALLER, not
   the target; the target is a plain body param. No Courier change was
   ever needed.
3. **Removing the countdown entirely.** Never asked for. Only the
   fabricated `(sample)` data was the problem. Worse, when asked
   directly what had been removed, chat justified the removal instead of
   fixing it. Restored to render only when a real `start_time` exists.
4. **Three blank artifacts shipped** on the strength of clean builds.
   The real cause was a `PropsDemo` JSX bug (`{...rest}` in children text
   parsed as a spread against undefined) throwing on every render with
   no `ErrorBoundary` above it — found by Claude Code browser-testing,
   not by chat.

---

## Governance added

`docs/OPERATING-MODE.md` now carries two rules earned by real incidents:

- **5-minute/3-turn diagnostic rule** applies here too. Lighter
  governance means no CC-CMD ceremony, not license to retry a failing
  approach a fourth time.
- **Verify the deliverable, not the thing upstream of it.** A clean
  compile, module count, matching hashes and well-formed output are
  *preconditions*, not evidence. `scripts/verify-artifact.mjs` +
  `artifact-check.yml` exist because of this.

---

## Open

- **`Tabs` refactor needs `artifact-check`.** Highest priority item here.
- **Stats surface not built.** Production has one (`renderStats`,
  bottom-sheet stats, MLS novel metrics, sub-impact, amnesty
  leaderboard). Playground has never touched it; Seasons covers standings
  only, which is one slice. Deliberately not scoped from the name —
  this session proved four times that assuming a data shape from a name
  is wrong here (tier was a number not a letter; editorial picks carry no
  side field; `start_time` was absent; `quality_alert` was global not
  per-pick). **Read the real `renderStats` before scoping.**
- **`wrangler.jsonc` should be deleted** (`git rm`). `.toml` is
  authoritative — it carries `account_id`, which the deploy workflow
  depends on. `.jsonc` is kept as an exact mirror so ambiguity is
  currently harmless. Chat has no delete capability.
- **`Seasons.module.css` carries dead `.tabBar`/`.tab`/`.tabActive`
  rules** and Seasons still uses its own local `Tabs`. Migrating it to
  the shared one is the obvious next step, deliberately not done in the
  same pass to keep blast radius to what was asked.
- **Nothing has graduated to `jubilant-bassoon`.** Per the graduation
  checkpoint rule, stating it rather than leaving it silent. Highest-value
  candidate by a distance: the **`.error`-before-accessor guards** —
  production FIELD has the same silent-subtree-removal exposure that
  blanked this app, and it's the hardest failure mode to diagnose here
  (blank section, no console error).

---

## Standing hazard worth knowing

`src/data/fetchTiming.js` monkey-patches `window.fetch` globally to time
every request. It currently preserves semantics correctly — `return res`
passes the Response through unmodified so each fetcher's `!res.ok` throw
still fires, and `catch` rethrows. **Break either and every `.error`
guard silently fails app-wide**, with a blank section and no console
error as the only symptom. Highest-leverage regression surface in the
repo.
