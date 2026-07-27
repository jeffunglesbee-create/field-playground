import { createSignal, createMemo, onMount, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { createControlGroupMetrics } from './metrics'
import { ComparisonView } from './ComparisonView'

// ControlGroup answers "does reconcile() beat vanilla DOM for the
// polled game list" at the one size every dev-mock game list has ever
// been -- ~8 games, the same toy slate every other Lab demo uses. That
// leaves the actual motivating question unanswered: does it still hold
// at the volume FIELD really runs at (hundreds of rows across a full
// slate of sports), or does the real-data comparison only look close
// because there's barely anything to reconcile either way?
//
// Same instrumentation (metrics.js) and the same presentational shell
// (ComparisonView.jsx), both shared with ControlGroup so this can't
// quietly measure or display something different, against a synthetic
// 500-row dataset instead of real deskStore data. Synthetic, not real,
// because production data never reaches this size in this app's own
// dev mock or its real relay slate on an ordinary day -- inventing 500
// fake rows is the only way to actually test the volume question, and
// it's labeled as exactly that throughout rather than presented as if
// it were real.
const ROW_COUNT = 500

// Independent of the real app's 15s poll interval on purpose: this is a
// synthetic instrument meant to be watched, not a faithful replica of
// production's actual cadence (which is a fetch cost, not a rendering
// one -- irrelevant to what this measures).
const CYCLE_MS = 4000

// Fraction of still-live/pregame games that advance each cycle. 5% of
// 500 is a real per-poll churn rate in the same ballpark as a busy live
// slate (a handful of games moving at once out of hundreds scheduled),
// not a worst-case stress figure.
const CHANGE_FRACTION = 0.05

function makeSyntheticGames(n) {
  const games = []
  for (let i = 0; i < n; i++) {
    // Roughly a third pregame, a third live, a third final at start, so
    // the initial render isn't trivially all-empty -- matches a real
    // slate mid-day, with games in every state at once.
    const phase = i % 3
    const home = 10 + (i % 7)
    const away = 8 + (i % 5)
    games.push({
      id: `synthetic-${i}`,
      home: `Synth Home ${i}`,
      away: `Synth Away ${i}`,
      home_score: phase === 0 ? null : home,
      away_score: phase === 0 ? null : away,
      finalized_at: phase === 2 ? '2026-07-27T00:00:00Z' : null,
      went_to_ot: phase === 2 && i % 9 === 0 ? true : null,
    })
  }
  return games
}

// Advances a fraction of the still-live/pregame games one step (pregame
// -> live with a real score, or live score incrementing) -- finalized
// games are left alone, matching how a real slate never un-finalizes.
// Never reorders: the real deskStore poll never reorders games either
// (relay.js's own mock returns a stable array order across polls), so
// neither this nor ControlGroup has ever exercised the "moved"
// classification against real conditions -- a known, separate gap this
// scale test doesn't happen to close either.
function advanceGames(games) {
  const candidates = games.filter((g) => !g.finalized_at)
  const changeCount = Math.max(1, Math.round(candidates.length * CHANGE_FRACTION))
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const toChange = new Set(shuffled.slice(0, changeCount).map((g) => g.id))
  return games.map((g) => {
    if (!toChange.has(g.id)) return g
    if (g.home_score === null) {
      return { ...g, home_score: 0, away_score: 0 }
    }
    return {
      ...g,
      home_score: g.home_score + (Math.random() < 0.4 ? 1 : 0),
      away_score: g.away_score + (Math.random() < 0.4 ? 1 : 0),
    }
  })
}

export function ScaleTest() {
  const [store, setStore] = createStore({ games: makeSyntheticGames(ROW_COUNT) })
  const allGames = createMemo(() => store.games)

  // The metrics module's cycleTrigger contract: bump unconditionally on
  // every real cycle, same as relay.js's deskLastFetchedAt does for
  // ControlGroup -- this signal's whole job is to never miss one.
  const [pollAt, setPollAt] = createSignal(0)

  onMount(() => {
    const handle = setInterval(() => {
      setStore('games', reconcile(advanceGames(store.games)))
      setPollAt(Date.now())
    }, CYCLE_MS)
    onCleanup(() => clearInterval(handle))
  })

  const metrics = createControlGroupMetrics(pollAt)

  return (
    <ComparisonView
      title="Scale Test"
      note={`synthetic, ${ROW_COUNT} rows, ${CYCLE_MS / 1000}s cycle`}
      allGames={allGames}
      {...metrics}
    >
      Same comparison as Control Group -- identical VanillaGameList/
      ReconcileGameList, identical metrics.js instrumentation -- run
      against {ROW_COUNT} synthetic rows instead of real deskStore
      data, since every Control Group reading so far was measured at
      the ~8-game size every other Lab demo already uses. Data is
      fabricated (labeled as such); the poll cadence is independent
      of the real app's 15s interval on purpose.
    </ComparisonView>
  )
}
