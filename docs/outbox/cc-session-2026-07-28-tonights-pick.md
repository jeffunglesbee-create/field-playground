# CC Session Outbox — Tonight's Pick + My Services

**Date:** 2026-07-28
**Branch:** `claude/playground-setup-njng55`
**Commits:** bf6d989 (My Services), 0cd21c0 (TonightsPick)

---

## What was asked

User asked for "wow" feature ideas to test in the playground. Proposed
several outward-facing ones grounded in signals already proven real
this session (drama_peak, line movement, streams/cost, weather),
recommended a synthesis card combining them as the highest-value one,
and the user asked to build it. Mid-build, the user separately asked
to combine Arbitrage's ownership-tracking with production's real "My
Services" concept rather than keep it as Arbitrage's own local state.

---

## What was built

**`src/data/myServices.js`** -- Arbitrage's first version tracked which
streaming services a user owns as a local, ephemeral `createStore({})`
-- reset on remount, invisible to any other surface. Confirmed via
FIELD_Handoff against jubilant-bassoon's `STANDARDS.md` that production
already has a real, named concept for this: "My Services", an
onboarding modal gated behind a `field_setup_done` localStorage flag.
This module is that concept done properly here: a shared,
localStorage-persisted store (`field-my-services` key), same
load-then-persist shape `LocalNoteLayer` already proved out. Arbitrage's
inline "What you have" chip row moved into an actual modal (backdrop +
`role="dialog"` + Escape-to-close, the exact pattern `CommandPalette`
already proved out), opened via a "My Services (N)" button, since
ownership is now a shared concern, not something owned by one card.
`PRICES` and `parseStreams` were also exported from Arbitrage so
TonightsPick could reuse them instead of holding a second copy of
"production's real prices."

**`src/components/TonightsPick/`** -- the synthesis surface. Everything
built in this playground so far surfaces one real signal at a time
(DramaLeaderboard for drama_peak, DeskCard's OddsRow for line movement,
Arbitrage for cost, WeatherPoll for weather). This combines those four
already-verified real signals into one ranked, explained list. Scoring
is deliberately visible on every card, not a black box:

```
score = drama_peak (0-100, real field)
      + 25 if live right now
      + 10 if the line moved (via DeskCard's lineMovement)
      - 30 if live and a blowout (margin > 20, same threshold GameRow uses)
```

Only games still watchable are ranked -- finals are excluded entirely,
not shown at the bottom. Cost-to-watch checks the shared `myServices`
store first: a game reachable through something already owned shows
"you have it" instead of a price that would double-count a
subscription already paid for. Wired in leading the Games tab, ahead
of ScoreTicker -- the App.jsx ordering comment was updated to explain
why (synthesis of the product question, ahead of the per-signal
mechanism demos).

`gameStatus`, `lineMovement`, `dramaTier`, `dramaLabel` were exported
from DeskCard rather than re-derived a third time. `gameStatus` already
has one accepted duplicate (ScoreTicker's own copy, pre-existing,
untouched) -- not worth chasing. `lineMovement`/`dramaTier` are more
substantial, driftable logic; a third divergent copy was the one worth
avoiding.

---

## A real bug, caught by verification

First browser check: TonightsPick's section rendered WeatherPoll's own
error text ("all venue weather requests failed") instead of its own
content -- silently swallowed by `SafeSection`'s `ErrorBoundary`, no
console error to point at it directly. Root cause: `weatherFor()`
called the `weatherData` resource accessor unguarded. Today's real
weather fetch is genuinely down (confirmed independently via
WeatherPoll's own error state), and calling a `createResource` accessor
while it's in an error state re-throws that error -- the exact failure
class `App.jsx`'s own header comment documents from WeatherPoll's first
version, reintroduced here in a new component that hadn't learned the
lesson. Fixed with the same guard WeatherPoll itself uses: check
`.error` before ever calling `weatherData()`.

---

## Verification

- `npm run build` clean, 146 modules.
- Live browser check against the real relay (dev server + headless
  Chromium): after the fix, TonightsPick rendered ranked live-then-
  upcoming correctly (Red Sox @ Yankees and Astros @ Rangers, both
  LIVE, ranked above the upcoming MLS/WNBA games), "no stream data"
  shown honestly since today's real slate genuinely carries none --
  cross-consistent with Arbitrage's own "No games carry stream data on
  this date" for the same slate. Zero console errors after the fix.
- The My Services modal's open/toggle/close/persist path was **not**
  independently exercised against real stream data -- none of the past
  6 days checked live had a slate carrying `streams`, so the button
  never appeared to click. Confidence here rests on the modal being a
  structural match to two already-proven patterns in this exact
  codebase (CommandPalette's backdrop/dialog/Escape, LocalNoteLayer's
  localStorage persist), not on a live interaction test -- flagged
  explicitly rather than claimed as verified.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/myServices.js` | new -- shared, persisted service-ownership store |
| `src/components/Arbitrage/index.jsx` | modified -- reads shared store, ownership UI moved into a modal, exports `PRICES`/`parseStreams` |
| `src/components/Arbitrage/Arbitrage.module.css` | modified -- modal/backdrop styles |
| `src/components/TonightsPick/index.jsx` | new |
| `src/components/TonightsPick/TonightsPick.module.css` | new |
| `src/components/DeskCard/index.jsx` | modified -- exports `gameStatus`/`lineMovement`/`dramaTier`/`dramaLabel` |
| `src/App.jsx` | modified -- wired TonightsPick leading the Games tab, updated ordering rationale comment |
| `src/App.module.css` | modified -- `.tonightsPick` added to the shared section layout rule |
