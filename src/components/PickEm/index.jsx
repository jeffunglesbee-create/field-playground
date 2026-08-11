import { For, Show, createMemo, createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { deskStore } from '../../data/relay'
import { Tabs } from '../Tabs'
import styles from './PickEm.module.css'
import shared from '../shared.module.css'

// Genuinely new territory for this repo, not just a UI clone of FIELD's
// Picks tab. Every prior component was read-only: fetch, render, done.
// This one introduces user input (a pick) and derived state that depends
// on TWO reactive sources at once -- the user's own local choice, and
// deskStore's live-polled game data. The real question: does a pick's
// displayed status ("pending" -> "correct"/"incorrect") update itself
// automatically the moment a poll cycle brings back a final score, with
// zero manual recheck logic anywhere? That's the natural next question
// after the reconciliation experiment, not a separate one.

const STORAGE_KEY = 'field-playground-picks'

function loadPicks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const [picks, setPicks] = createStore(loadPicks())

// Persist on every change. This is plain browser localStorage in a real
// standalone Vite app -- not a Claude.ai sandboxed artifact, where
// storage APIs are unavailable. Different environment, different rules.
createEffect(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...picks }))
  } catch {
    // Storage can fail (private browsing, quota) -- picks still work
    // for the session, just won't survive a reload. Not fatal.
  }
})

// MEASURED BEFORE CHANGED, and the measurement moved the design.
// probe-gamestatus-over-real-slate.mjs ran this function over 150 real
// /context/date/ games across 7 days:
//
//   key absent entirely:  0      misclassified unstarted games: 0
//   key present, null:   17      final 126 · pre 17 · final_ot 7
//   numeric score:      133
//
// So the strict `=== null` was NOT producing a live defect -- the relay always
// sends the key. That is a hardening change, and saying otherwise would be
// claiming a fix for a bug that was not happening. Two real things remain:
//
// 1. `== null` instead of `=== null` costs nothing and removes the dependency
//    on the relay never omitting the field. The schema lists home_score as
//    optional, so absence is permitted by the contract even though it has
//    never been observed.
//
// 2. The 0-for-unplayed trap is genuinely open, and the same probe proved it:
//    gameStatus({home_score: 0, away_score: 0, finalized_at: null}) -> "live".
//    /cfl/scoreboard/rounds writes 0 on all 47 of its unplayed fixtures, so
//    if that route is ever archived, every unstarted CFL game becomes
//    unpickable (picking is gated on 'pre'). start_time closes it where the
//    relay provides one -- measured fill is only 16.7% for MLS, so this is a
//    partial guard and is written to fail toward 'live' rather than 'pre'.
//
// FAILING TOWARD 'live' IS DELIBERATE. Wrongly calling an unstarted game live
// blocks a pick; wrongly calling a live game 'pre' lets someone pick a match
// already in progress. Between a blocked pick and a retroactive one, blocking
// is the harmless direction.
//
// The null branch stays FIRST rather than being reordered behind finalized_at:
// the reorder would change how a finalized-but-unscored row is classified, and
// nothing in the measured sample pins down that case. Preserving it keeps this
// function byte-identical in behaviour across all 150 observed records.
function gameStatus(g) {
  if (g.home_score == null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  if (g.start_time) {
    const t = Date.parse(g.start_time)
    if (Number.isFinite(t) && t > Date.now()) return 'pre'
  }
  return 'live'
}

// A level final score has no winner, and the old `home > away ? 'home' :
// 'away'` had no branch for it -- a 2-2 draw fell to 'away', so every home
// pick was marked incorrect and every away pick correct, silently and with
// full confidence. Soccer is not excluded from this component (only
// NON_MATCHUP_SPORTS is), and MLS ran 11-14 rows/day in the window measured
// on 2026-08-08, so this was firing on real games.
//
// No sport list is involved on purpose. A draw is a level score at final,
// full stop; in MLB and the NBA that state cannot occur, so the branch simply
// never fires there. A hardcoded "these sports can draw" table would be one
// more thing to keep true as leagues come and go.
//
// KNOWN LIMIT, stated rather than papered over: a cup tie decided on
// penalties also finals level on the scoreline, and the relay does not carry
// a penalty result today (that is the pending BSD /incidents/ fix). Such a
// game is reported as a push here. That is wrong in the sense that somebody
// did advance, but it is wrong in the direction of admitting ignorance
// instead of crediting a coin-flip guess to one side.
function pickStatus(game, pick) {
  if (!pick) return 'unpicked'
  const status = gameStatus(game)
  if (status !== 'final' && status !== 'final_ot') return 'pending'
  if (game.home_score === game.away_score) return 'push'
  const winner = game.home_score > game.away_score ? 'home' : 'away'
  return pick === winner ? 'correct' : 'incorrect'
}

function PickRow(props) {
  const g = () => props.game
  const pick = () => picks[g().id]
  const status = createMemo(() => pickStatus(g(), pick()))

  return (
    <div class={styles.pickRow}>
      <div class={styles.matchup}>{g().away} @ {g().home}</div>
      <div class={styles.buttons}>
        <button
          class={`${styles.pickBtn} ${pick() === 'away' ? styles.selected : ''}`}
          onClick={() => setPicks(g().id, 'away')}
          disabled={gameStatus(g()) !== 'pre'}
        >
          {g().away}
        </button>
        <button
          class={`${styles.pickBtn} ${pick() === 'home' ? styles.selected : ''}`}
          onClick={() => setPicks(g().id, 'home')}
          disabled={gameStatus(g()) !== 'pre'}
        >
          {g().home}
        </button>
      </div>
      <span class={`${shared.chip} ${styles.statusBadge} ${styles[status()]}`}>
        {status()}
      </span>
    </div>
  )
}

export const NON_MATCHUP_SPORTS = new Set(['golf', 'pga', 'atp', 'wta'])

export function PickEm() {
  const [activeSport, setActiveSport] = createSignal(null)

  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ].filter(g => !NON_MATCHUP_SPORTS.has(g.sport?.toLowerCase())))

  // Pushes are counted but deliberately kept OUT of `decided` -- a draw
  // neither validates nor refutes the pick, so folding it into either column
  // would move the percentage on the strength of a game nobody won.
  const record = createMemo(() => {
    let correct = 0, incorrect = 0, pending = 0, push = 0
    for (const g of allGames()) {
      const s = pickStatus(g, picks[g.id])
      if (s === 'correct') correct++
      if (s === 'incorrect') incorrect++
      if (s === 'pending') pending++
      if (s === 'push') push++
    }
    return { correct, incorrect, pending, push }
  })

  // Real, plain-language payoff -- states the reader's real record on
  // finished games plus how many real picks are still pending/live,
  // instead of leaving a bare "3–1" chip for the reader to parse.
  const verdict = createMemo(() => {
    const { correct, incorrect, pending, push } = record()
    const decided = correct + incorrect
    const drawn = push ? ` ${push} ended level and ${push === 1 ? 'is' : 'are'} not counted either way.` : ''
    if (!decided && !pending) return push ? `No picks decided yet.${drawn}` : null
    if (!decided) return `No picks decided yet -- ${pending} of your real pick${pending === 1 ? '' : 's'} still pending or live.${drawn}`
    const pct = Math.round((correct / decided) * 100)
    return `You're ${correct}-${incorrect} (${pct}%) on decided real picks${pending ? `, with ${pending} more still pending or live` : ''}.${drawn}`
  })

  const grouped = createMemo(() => {
    const map = {}
    for (const g of allGames()) {
      if (!map[g.sport]) map[g.sport] = []
      map[g.sport].push(g)
    }
    return Object.entries(map)
  })

  const tabs = createMemo(() =>
    grouped().map(([sport, games]) => ({ key: sport, label: sport, count: games.length }))
  )

  // Default the selection to the first real sport rather than hardcoding
  // one -- the slate's sports aren't known until deskStore resolves, and
  // a hardcoded 'MLB' would show an empty tab on a night with no MLB.
  // Only fills a NULL selection, so it never fights a user's own click,
  // and re-fills if the current tab's sport disappears on a date change.
  const activeOrFirst = createMemo(() => {
    const keys = grouped().map(([sport]) => sport)
    const current = activeSport()
    return current && keys.includes(current) ? current : (keys[0] ?? null)
  })

  const visibleGames = createMemo(() => {
    const entry = grouped().find(([sport]) => sport === activeOrFirst())
    return entry ? entry[1] : []
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Pick'em</span>
        <Show when={record().correct + record().incorrect + record().push > 0}>
          <span class={styles.record}>
            {record().correct}–{record().incorrect}{record().push ? `–${record().push}` : ''}
          </span>
        </Show>
      </header>
      <Show when={allGames().length} fallback={<p class={styles.empty}>No games today.</p>}>
        <Show when={verdict()}>
          <p class={styles.verdict}>{verdict()}</p>
        </Show>
        <Tabs tabs={tabs} active={activeOrFirst} setActive={setActiveSport} />
        <div class={styles.pickList}>
          <For each={visibleGames()}>{game => <PickRow game={game} />}</For>
        </div>
      </Show>
    </div>
  )
}
