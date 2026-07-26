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

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function pickStatus(game, pick) {
  if (!pick) return 'unpicked'
  const status = gameStatus(game)
  if (status !== 'final' && status !== 'final_ot') return 'pending'
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

  const record = createMemo(() => {
    let correct = 0, incorrect = 0
    for (const g of allGames()) {
      const s = pickStatus(g, picks[g.id])
      if (s === 'correct') correct++
      if (s === 'incorrect') incorrect++
    }
    return { correct, incorrect }
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
        <Show when={record().correct + record().incorrect > 0}>
          <span class={styles.record}>{record().correct}–{record().incorrect}</span>
        </Show>
      </header>
      <Show when={allGames().length} fallback={<p class={styles.empty}>No games today.</p>}>
        <Tabs tabs={tabs} active={activeOrFirst} setActive={setActiveSport} />
        <div class={styles.pickList}>
          <For each={visibleGames()}>{game => <PickRow game={game} />}</For>
        </div>
      </Show>
    </div>
  )
}
