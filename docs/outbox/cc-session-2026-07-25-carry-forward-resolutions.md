# CC Session: Carry-Forward Resolutions — 2026-07-25

Resolving the four open items surfaced in the most recent chat outbox
(`chat-update-2026-07-25-for-claude-code.md`).

---

## 1. Tier scale direction: still unconfirmable from live data

**Status: documented, code correct.**

Probed `/analytics/newspaper/` for 2026-07-25 and 2026-07-19. Every ranked
pick returned `tier: 2` on both dates, including Spain vs Argentina (WC
quarterfinal, score 3) which was the highest drama score visible in any probe
this session. The relay has not returned a `tier: 1` game in any accessible
date.

The assumption "1 = highest drama" remains unconfirmed by a concrete example.
However: History sorts `useTierCalibration` ascending (`Number(a) - Number(b)`)
which would put tier 1 first. If 1 = highest, that's the right order for a
calibration table. It's also consistent with standard sports broadcasting usage
of "Tier 1" = marquee matchup. The sort direction is correct for either
interpretation as long as the relay uses the conventional direction — but this
won't be verifiable until the relay issues a tier 1 pick on a genuine
high-drama night.

**Carry-forward remains**: check a high-drama WC or playoffs night once the
relay issues tier 1 picks. No code change needed now.

---

## 2. "What would you have picked" mode — two separate bugs, both fixed

**Status: one was already resolved, one fixed in this session.**

The outbox described "a user who's never touched PickEm sees editorial
permanently hidden, with no fallback." Reading the live AmbientPanel code:
there IS a "show anyway" button (`setManuallyRevealed(true)`) — that fallback
existed already. So that specific claim was outdated.

The real latent bug was different: `allPicked()` compared pick count to ALL
games in deskStore, but PickEm only shows games that aren't in
`NON_MATCHUP_SPORTS`. On a day with PGA Tour events in deskStore (possible
given golf in `quality_feedback.adjustments`), PickEm shows no golf games
but the gate demands picks on them — `allPicked()` can never auto-fire. Also:
if `todaysGames()` after filtering is empty (all sports are golf/tennis),
`allPicked()` was permanently false, even though PickEm correctly shows
"No games today."

**Fixed:**
- Exported `NON_MATCHUP_SPORTS` from `PickEm/index.jsx`
- AmbientPanel now applies the same filter to its `todaysGames` memo
- Changed `allPicked()` from `length > 0 && count === length` to
  `length === 0 || count === length` — zero pickable games means editorial
  reveals immediately (no point gating when nothing can be predicted)

---

## 3. History: tab sync via BroadcastChannel

**Status: implemented.**

`src/data/outcomes.js` — new export: `initOutcomesSync()`.

This is genuinely new SolidJS territory vs. the date sync already in the repo:
- Date sync: external write to a **string signal**, no derived state downstream
- Outcomes sync: external write to an **object signal** (`outcomes()`) with
  three distinct memos deriving from it in History — `useTierCalibration`,
  `useMultiDayRecord`, `usePickCalendar`

The question: does a tab-external write to `outcomes()` cause all three History
views to re-render correctly? The reactive graph should handle it — the memo
dependencies are on `outcomes()` the signal, not on the localStorage read —
but this is the first time in this repo that multiple derived memos have had
their source signal written from completely outside their component tree.

Pattern used (same guard logic as date sync):
```js
syncChannel.onmessage = (event) => {
  const d = event?.data
  if (d.outcomes && JSON.stringify(d.outcomes) !== JSON.stringify(outcomes())) {
    setOutcomesSignal(d.outcomes)
    localStorage.setItem(KEY, JSON.stringify(d.outcomes))
  }
  ...
}
```

Echo prevention: JSON comparison before writing. If Tab A writes an outcome
and Tab B echoes the same state back, Tab A's comparison sees no difference
and skips the write. Loop terminates in one round-trip.

`initOutcomesSync()` called from App.jsx's `onMount` alongside `initUrlDateSync`
and `initBroadcastDateSync`.

**To verify manually:** open two tabs on the same origin, mark an outcome W/L
in AmbientPanel in one tab — History in the other tab should update without
reload.

---

## 4. Nothing graduated to jubilant-bassoon

**Status: unchanged, relay-side issue.**

The playground can't resolve this. Still a live open call.

---

## Build

41 modules, clean. No new chunk count (outcomes.js is inline, not lazy).

---

## Broader pattern notes

Three consecutive sessions have now caught bugs by comparing what was WRITTEN
in a proposal against what the LIVE PAYLOAD actually returns:
- `tier` assumed to be a letter → was a number
- `quality_alert` assumed per-pick → was a global aggregate
- Gate's game count assumed to match PickEm → didn't, because of filter mismatch

Standing prior now in effect: read the actual payload or source before assuming
a field's shape. Proposals (including these outbox docs) name things by their
intent; the relay names them by what it implemented.
