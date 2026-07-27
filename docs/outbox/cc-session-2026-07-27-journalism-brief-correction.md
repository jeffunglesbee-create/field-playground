# CC Session Outbox — Correcting PR #15's False "Never Real" Claim

**Date:** 2026-07-27
**PR:** jeffunglesbee-create/field-playground#16 (merged)
**Commit:** cb61e72 (squash merge to main)
**Corrects:** PR #15 / commit 30e9b8d (2026-07-26)

---

## What was asked

A screenshot from a parallel `chat.claude.ai` session showing it had found
PR #15's justification was false: `/journalism/brief` was never fake, and
a first correction had already landed on `main` (commits `4c39ca0`,
`f77a8fa`). "Follow ups from chat."

---

## What was found

**PR #15's headline claim -- "`/journalism/brief` was never real on
field-relay-nba" -- was false.** It rested entirely on `read_source`
returning zero hits when grepping `field-relay-nba`'s source for
`"journalism"`/`"brief"`/`"/brief"` -- a search-tool limitation, not a
direct test. A direct `probe_relay_route` call settles it: `GET
/journalism/brief` → HTTP 200 with real prose (a real 3M Open recap, a
real Rays/Guardians box score); `GET /journalism/nonsense-xyz` → 403
"Path not allowed" -- an *allowlisted* route, not a catch-all (a 404
would have meant genuinely absent).

**The parallel session's first correction (already on `main`) fixed that
headline claim but left a narrower one standing.** Its own record (a
`FIELD_Handoff` codex entry) still asserted the `brief`/`cycleId`/
`proseScore` fields `JournalismBrief` used to read "exist in no real
payload." Also false: the same direct probe's raw response is exactly
`{brief, generatedAt, contextHash, gameCount, cycleId, proseScore,
clicheCount}` -- the shape this component always rendered. Both false
claims trace to the same root cause: a zero-hit grep proves only that a
literal string is absent, never that a route or field is. This session's
`OPERATING-MODE.md` update (from the parallel session, already on `main`)
now codifies that: only a direct probe establishes a genuine negative.

One part of PR #15's original reasoning *did* hold up under a direct
probe: `/journalism/brief` genuinely ignores a `?date=` param (confirmed
byte-identical response with and without one) -- the parallel session's
correction was right to note the endpoint doesn't take date input, just
wrong about why the earlier endpoint choice was necessary.

---

## What was built

- `JournalismBrief` and its `relay.js` resource reverted to the real
  `/journalism/brief` endpoint and its real fields, with the earlier
  correction's accurate finding (no date param) preserved as a comment.
- Real `cycleId`-based regeneration detection restored -- simpler and
  more correct than the text-comparison workaround PR #15 built to route
  around a field that was never actually missing.
- `pick.brief` and `night_stars` -- the genuinely useful real fields PR
  #15 surfaced on `/analytics/newspaper/{date}` -- kept, but moved to
  `AmbientPanel` (a new `SlateVerdict` component) instead of staying on
  `JournalismBrief`, since `AmbientPanel` already holds that payload.
  `AmbientPanel`'s unrelated `timeMode` fix from PR #15 is unaffected.
- `vite.config.js`'s dev mock now uses the real captured prose from
  today's probe as its example text, replacing the prior placeholder --
  the mock's field *names* were never the problem, only its example text
  was ever synthetic (same as every mock in this repo).

---

## CodeRabbit findings -- 3 total, all addressed in one round

1. **Real: star-rating accessibility gap.** `AmbientPanel`'s new
   `starRating` span used Unicode glyphs plus a `title` attribute only;
   `title` isn't exposed as an accessible name to screen readers. Added
   `role="img"` + a dynamic `aria-label`, kept the existing `title` and
   visual glyphs.
2. **Real: non-reactive age label.** `JournalismBrief`'s `age` memo read
   `Date.now()` directly, which isn't a tracked dependency -- the memo
   only re-ran when the resource's data changed, so "Xm ago" would freeze
   for the full 5-minute poll interval. Added a component-local ticking
   clock signal (30s interval) read inside the memo.
3. **Real: unflushed flash timer.** The cycleId-change detector scheduled
   a `setTimeout` to clear `freshlyUpdated` on every genuine change
   without clearing a prior pending one -- two changes within the 4s
   flash window could let the earlier timer cut the later flash short.
   Now tracks the timer handle, clears it before each new schedule, and
   clears it again on unmount.

---

## Verification

`npm run build` clean. Playwright against the real dev server confirmed:
`JournalismBrief` renders real captured brief text with real `q112`/
`8 games` metadata and a live "just now" age label; `AmbientPanel`'s
`SlateVerdict` renders a real 4/5 star rating with `role="img"` and the
expected `aria-label`, alongside real "2 drama · 3 close · 1 walkoff"
detail; no regression to either component's existing real coverage.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/relay.js` | modified — `journalismBrief` resource reverted to `/journalism/brief`, comment corrected |
| `src/components/JournalismBrief/index.jsx` | modified — reverted to real fields/cycleId detection; added ticking clock + timer tracking |
| `src/components/JournalismBrief/JournalismBrief.module.css` | modified — `.meta`/`.metaItem` restored, star-rating styles removed |
| `src/components/AmbientPanel/index.jsx` | modified — new `SlateVerdict` component (`pick.brief` + `night_stars`), with accessible star rating |
| `src/components/AmbientPanel/AmbientPanel.module.css` | modified — `.verdict`/`.verdictText`/`.verdictStars`/`.starRating`/`.starDetail` added |
| `vite.config.js` | modified — `/journalism/brief` mock's example text replaced with real captured prose |

---

## What this does NOT change

- No relay/data-layer changes beyond correcting which endpoint is
  fetched and how a rating span exposes its accessible name --
  `field-relay-nba` itself is untouched.
- The negative-result verification rule already added to
  `OPERATING-MODE.md` by the parallel session stands as-is; this session
  didn't need to add to it, only to follow it.
