import { Show, For, createMemo, createSignal, createEffect, on, onMount, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { deskData, deskStore, currentDate, setCurrentDate, deskLastFetchedAt, refetchDesk } from '../../data/relay'
import { showToast } from '../Toast'
import styles from './DeskCard.module.css'
import shared from '../shared.module.css'

function Skeleton() {
  return (
    <div class={shared.skeleton}>
      <div class={`${shared.bar} ${shared.wide}`} />
      <div class={`${shared.bar} ${shared.medium}`} />
      <div class={`${shared.bar} ${shared.wide}`} />
      <div class={`${shared.bar} ${shared.narrow}`} />
      <div class={`${shared.bar} ${shared.medium}`} />
    </div>
  )
}

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

const NON_MATCHUP_SPORTS = new Set(['golf'])

const mountCounts = {}

// Collapsible sport groups -- CONFIRMED 2026-07-25, real browser
// verification, survives real poll cycles. Store keyed by sport name
// (stable string, immune to grouped()'s reference churn).
const [collapsed, setCollapsed] = createStore({})
function toggleGroup(sport) {
  setCollapsed(sport, c => !c)
}

// Watchlist. Same underlying question as collapsed groups above -- does
// this survive a poll -- but worth being precise about a SHARPER version
// of that lesson: a plain createSignal(new Set()) would NOT work here
// even though it might look like it should. Calling .add()/.delete() on
// the SAME Set object mutates it in place without creating a new
// reference, and SolidJS signals only notify subscribers on an actual
// setter call with a value SolidJS considers changed -- mutating the
// existing Set silently, with no setter call, fires no update at all.
// createStore's proxy-based approach doesn't have this trap: setWatched
// below is a real setter call every time, keyed by a stable game id
// (immune to reference churn) the same way collapsed/sport already is.
const [watched, setWatched] = createStore({})
function toggleWatch(id) {
  setWatched(id, w => !w)
}

function StaleIndicator() {
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const handle = setInterval(() => setNow(Date.now()), 15000)
    onCleanup(() => clearInterval(handle))
  })
  const label = createMemo(() => {
    const fetchedAt = deskLastFetchedAt()
    if (!fetchedAt) return null
    const seconds = Math.floor((now() - fetchedAt) / 1000)
    if (seconds < 30) return 'just now'
    if (seconds < 60) return `${seconds}s ago`
    return `${Math.floor(seconds / 60)}m ago`
  })
  return (
    <Show when={label()}>
      <span class={styles.staleIndicator} title="time since the last successful poll">
        ↻ {label()}
      </span>
    </Show>
  )
}

function DateBrowser() {
  function shiftDay(delta) {
    const d = new Date(currentDate() + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta)
    setCurrentDate(d.toISOString().split('T')[0])
    refetchDesk()
  }
  return (
    <div class={styles.dateBrowser}>
      <button class={styles.dateBtn} onClick={() => shiftDay(-1)} aria-label="previous day">‹</button>
      <span class={styles.dateMeta}>{deskStore.date}</span>
      <button class={styles.dateBtn} onClick={() => shiftDay(1)} aria-label="next day">›</button>
    </div>
  )
}

function TonightsCard(props) {
  const summary = createMemo(() => {
    let live = 0, final = 0, pre = 0
    for (const g of props.games()) {
      const s = gameStatus(g)
      if (s === 'live') live++
      else if (s === 'final' || s === 'final_ot') final++
      else pre++
    }
    return { live, final, pre, total: props.games().length }
  })
  return (
    <Show when={summary().total}>
      <div class={styles.tonightsCard}>
        {summary().pre} remaining · {summary().live} live · {summary().final} final
      </div>
    </Show>
  )
}

function GameRow(props) {
  const g = () => props.game
  const status = () => gameStatus(g())
  const isIndividual = () => NON_MATCHUP_SPORTS.has(g().sport)
  const scoreStr = () => `${g().away_score}–${g().home_score}`
  const isWatched = () => !!watched[g().id]

  onMount(() => {
    const id = g().id
    mountCounts[id] = (mountCounts[id] || 0) + 1
    if (import.meta.env.DEV) {
      console.log(`[reconcile-check] GameRow mounted: ${id} (mount #${mountCounts[id]})`)
    }
  })

  // Game-state transition toast. on(status, ...) gives access to the
  // PREVIOUS value on every re-run, not just the current one -- required
  // to detect an actual transition (live -> final) rather than firing on
  // every re-render regardless of whether status changed. Tests whether
  // an effect on DERIVED state (gameStatus() is computed, not a raw
  // signal) behaves as cleanly as an effect on a plain signal would --
  // it does, since status() still participates in the same reactive
  // graph deskStore's fields do.
  createEffect(on(status, (curr, prev) => {
    if (prev === 'live' && (curr === 'final' || curr === 'final_ot')) {
      const label = isIndividual() ? `${g().home} — ${g().away}` : `${g().away} @ ${g().home}`
      showToast(`Final: ${label} ${scoreStr()}`, 'live')
    }
  }, { defer: true }))

  return (
    <div class={styles.gameRow}>
      <span class={`${styles.statusDot} ${styles[status()]}`} />
      <button
        class={`${styles.watchBtn} ${isWatched() ? styles.watchBtnActive : ''}`}
        onClick={() => toggleWatch(g().id)}
        aria-label={isWatched() ? 'remove from watchlist' : 'add to watchlist'}
      >
        {isWatched() ? '★' : '☆'}
      </button>
      <span class={styles.matchup}>
        <Show when={isIndividual()} fallback={<>{g().away} @ {g().home}</>}>
          {g().home} — {g().away}
        </Show>
      </span>
      <span class={styles.scoreArea}>
        <Show
          when={!isIndividual()}
          fallback={
            <span class={styles.finalScore}>
              {g().note || (g().home_score != null ? `${g().home_score > 0 ? '+' : ''}${g().home_score}` : '—')}
            </span>
          }
        >
          <Show when={status() === 'pre'} fallback={
            <Show when={status() === 'live'} fallback={
              <>
                <span class={styles.finalScore}>{scoreStr()}</span>
                <span class={styles.badge}>{status() === 'final_ot' ? 'F/OT' : 'F'}</span>
              </>
            }>
              <span class={styles.liveScore}>{scoreStr()}</span>
            </Show>
          }>
            <span class={styles.pre}>—</span>
          </Show>
        </Show>
      </span>
      <Show when={g().venue}>
        <span class={styles.venue}>{g().venue}</span>
      </Show>
      <Show when={import.meta.env.DEV}>
        <span class={styles.mountDebug} title="mount count -- should never exceed 1 if reconciliation is working">
          m{mountCounts[g().id] || 1}
        </span>
      </Show>
    </div>
  )
}

function SportGroup(props) {
  const isCollapsed = () => !!collapsed[props.sport]
  return (
    <div class={styles.sportGroup}>
      <div
        class={styles.sportLabel}
        onClick={() => toggleGroup(props.sport)}
        role="button"
        tabIndex={0}
      >
        <span class={styles.collapseIcon}>{isCollapsed() ? '▸' : '▾'}</span>
        {props.sport}
        <span class={styles.groupCount}>{props.games.length}</span>
      </div>
      <Show when={!isCollapsed()}>
        <For each={props.games}>{game => <GameRow game={game} />}</For>
      </Show>
    </div>
  )
}

function Content() {
  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  const grouped = createMemo(() => {
    const map = {}
    for (const g of allGames()) {
      if (!map[g.sport]) map[g.sport] = []
      map[g.sport].push(g)
    }
    return Object.entries(map)
  })

  return (
    <div>
      <header class={styles.header}>
        <span class={styles.label}>Desk</span>
        <DateBrowser />
        <StaleIndicator />
      </header>

      <TonightsCard games={allGames} />

      <Show when={grouped().length} fallback={<p class={styles.empty}>No games today.</p>}>
        <div class={styles.gameList}>
          <For each={grouped()}>
            {([sport, games]) => <SportGroup sport={sport} games={games} />}
          </For>
        </div>
      </Show>
    </div>
  )
}

export function DeskCard() {
  return (
    <div class={styles.root}>
      <Show when={deskData.error}>
        <p class={styles.error}>{String(deskData.error)}</p>
      </Show>
      <Show when={!deskData.error}>
        <Show when={deskData()} fallback={<Skeleton />}>
          <Content />
        </Show>
      </Show>
    </div>
  )
}
