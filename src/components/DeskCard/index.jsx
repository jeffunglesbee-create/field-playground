import { Show, For, createMemo, createSignal, createEffect, on, onMount, onCleanup, untrack, batch } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { deskData, deskStore, currentDate, setCurrentDate, deskLastFetchedAt, refetchDesk, ambientData } from '../../data/relay'
import { picks, NON_MATCHUP_SPORTS } from '../PickEm'
import { clearAllOutcomes } from '../../data/outcomes'
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

const mountCounts = {}

const [collapsed, setCollapsed] = createStore({})
function toggleGroup(sport) {
  setCollapsed(sport, c => !c)
}

const [watched, setWatched] = createStore({})
function toggleWatch(id) {
  setWatched(id, w => !w)
}

const [optimisticScores, setOptimisticScores] = createStore({})
const [editingGameId, setEditingGameId] = createSignal(null)

function submitOptimisticScore(gameId, homeScore, awayScore) {
  setOptimisticScores(gameId, { home_score: homeScore, away_score: awayScore, pendingAt: Date.now() })
  setEditingGameId(null)
}

// Prose-as-navigation target. AmbientPanel's morning_report links team
// names to real games; clicking one sets this, DeskCard reads it to
// highlight the matching row. Exported so a completely separate
// component tree (AmbientPanel isn't a parent of DeskCard, they're
// siblings under App) can drive DeskCard's own local visual state --
// same cross-tree-write pattern already proven safe elsewhere in this
// project (BroadcastChannel writing to signals from outside the
// component tree entirely), just via a direct import instead of an
// external browser event.
export const [highlightedGameId, setHighlightedGameId] = createSignal(null)

// Tell-me-more expansion. Per-game, multiple independently expandable --
// same store-keyed-by-id pattern proven everywhere else (collapsed
// groups, watchlist, AmbientPanel's pick expand).
const [expandedGames, setExpandedGames] = createStore({})
function toggleGameExpand(id) {
  setExpandedGames(id, e => !e)
}

// Dismiss / focus mode. Local only, per spec -- DeskCard as an
// attention-management surface, not a complete record.
const [dismissed, setDismissed] = createStore({})
function dismissGame(id) {
  setDismissed(id, true)
}
function resetDismissed() {
  setDismissed(reconcile({}))
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

// Freshness-as-ambient-signal: how many seconds since the last poll,
// shared by every row (all rows share the same deskLastFetchedAt) --
// computed once here, passed down, rather than each row running its
// own identical interval.
function useSecondsSinceFetch() {
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const handle = setInterval(() => setNow(Date.now()), 5000)
    onCleanup(() => clearInterval(handle))
  })
  return () => {
    const fetchedAt = deskLastFetchedAt()
    if (!fetchedAt) return 0
    return Math.floor((now() - fetchedAt) / 1000)
  }
}

function DateBrowser() {
  function shiftDay(delta) {
    const d = new Date(currentDate() + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + delta)
    batch(() => {
      setCurrentDate(d.toISOString().split('T')[0])
      clearAllOutcomes()
    })
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

function LiveFilterToggle(props) {
  return (
    <button
      class={`${styles.liveFilterBtn} ${props.active() ? styles.liveFilterActive : ''}`}
      onClick={() => props.setActive(a => !a)}
    >
      {props.active() ? '● live only' : 'live only'}
    </button>
  )
}

function ScoreEditor(props) {
  const g = () => props.game
  let homeRef, awayRef
  return (
    <span class={styles.scoreEditor} onClick={e => e.stopPropagation()}>
      <input ref={homeRef} type="number" class={styles.scoreInput} value={g().home_score ?? 0} />
      <span>-</span>
      <input ref={awayRef} type="number" class={styles.scoreInput} value={g().away_score ?? 0} />
      <button
        class={styles.scoreSubmitBtn}
        onClick={() => submitOptimisticScore(g().id, Number(homeRef.value), Number(awayRef.value))}
      >
        ✓
      </button>
    </span>
  )
}

function Countdown(props) {
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const handle = setInterval(() => setNow(Date.now()), 60000)
    onCleanup(() => clearInterval(handle))
  })
  const target = createMemo(() => {
    const seed = String(props.gameId).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    return Date.now() + ((seed % 240) + 15) * 60000
  })
  const label = createMemo(() => {
    const diffMs = target() - now()
    if (diffMs <= 0) return null
    const h = Math.floor(diffMs / 3600000)
    const m = Math.floor((diffMs % 3600000) / 60000)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  })
  return (
    <Show when={label()}>
      <span class={styles.countdown} title="SAMPLE — start_time not present in the real relay response">
        {label()} <span class={styles.countdownSample}>(sample)</span>
      </span>
    </Show>
  )
}

// Real drama_arc sparkline -- confirmed live: a long array of numeric
// drama values sampled across the game, not invented. Downsampled to a
// manageable number of bars for a compact row rather than plotting
// every point.
function DramaSparkline(props) {
  const bars = createMemo(() => {
    const arc = props.arc
    if (!Array.isArray(arc) || arc.length === 0) return []
    const targetBars = 30
    const step = Math.max(1, Math.floor(arc.length / targetBars))
    const sampled = []
    for (let i = 0; i < arc.length; i += step) sampled.push(arc[i])
    const max = Math.max(...sampled, 1)
    return sampled.map(v => Math.max(4, Math.round((v / max) * 100)))
  })
  return (
    <Show when={bars().length}>
      <div class={styles.sparkline}>
        <For each={bars()}>{h => <div class={styles.sparkBar} style={{ height: `${h}%` }} />}</For>
      </div>
    </Show>
  )
}

function GameExpansion(props) {
  const g = () => props.game
  return (
    <div class={styles.gameExpansion}>
      <Show when={g().drama_arc}>
        <div class={styles.expansionLabel}>drama over time (peak {g().drama_peak})</div>
        <DramaSparkline arc={g().drama_arc} />
      </Show>
      <Show when={g().note}>
        <div class={styles.expansionRow}><span class={styles.expansionKey}>note</span> {g().note}</div>
      </Show>
      <Show when={g().crew}>
        <div class={styles.expansionRow}><span class={styles.expansionKey}>crew</span> {g().crew}</div>
      </Show>
      <Show when={g().opening_odds || g().closing_odds}>
        <div class={styles.expansionRow}>
          <span class={styles.expansionKey}>odds</span> {g().opening_odds ?? '—'} → {g().closing_odds ?? '—'}
        </div>
      </Show>
    </div>
  )
}

function GameRow(props) {
  const g = () => props.game
  const status = () => gameStatus(g())
  const isIndividual = () => NON_MATCHUP_SPORTS.has(g().sport?.toLowerCase())
  const isWatched = () => !!watched[g().id]
  const optimistic = () => optimisticScores[g().id]
  const displayHome = () => optimistic()?.home_score ?? g().home_score
  const displayAway = () => optimistic()?.away_score ?? g().away_score
  const scoreStr = () => `${displayAway()}–${displayHome()}`
  const isEditing = () => editingGameId() === g().id
  const isExpanded = () => !!expandedGames[g().id]
  const isHighlighted = () => highlightedGameId() === g().id

  // Drama hierarchy: real drama_peak number (52, 74, 60... confirmed
  // live, not an invented high/medium/low category) drives visual
  // weight directly via a CSS custom property rather than bucketing
  // into discrete classes -- the relay's signal is continuous, the
  // styling should be too.
  const dramaWeight = () => Math.min(1, (g().drama_peak ?? 0) / 80)

  const secondsSinceFetch = props.secondsSinceFetch
  const isStale = () => status() === 'live' && secondsSinceFetch() > 300

  let rowEl
  createEffect(() => {
    if (isHighlighted() && rowEl) {
      rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const timeout = setTimeout(() => setHighlightedGameId(null), 2500)
      onCleanup(() => clearTimeout(timeout))
    }
  })

  onMount(() => {
    const id = g().id
    mountCounts[id] = (mountCounts[id] || 0) + 1
    if (import.meta.env.DEV) {
      console.log(`[reconcile-check] GameRow mounted: ${id} (mount #${mountCounts[id]})`)
    }
  })

  createEffect(on(status, (curr, prev) => {
    if (prev === 'live' && (curr === 'final' || curr === 'final_ot')) {
      const label = isIndividual() ? `${g().home} — ${g().away}` : `${g().away} @ ${g().home}`
      const pickCountAtFinal = untrack(() => Object.keys(picks).length)
      const pickNote = pickCountAtFinal > 0 ? ` (${pickCountAtFinal} picks made so far)` : ''
      showToast(`Final: ${label} ${scoreStr()}${pickNote}`, 'live')
    }
  }, { defer: true }))

  return (
    <div
      ref={rowEl}
      class={`${styles.gameRow} ${isStale() ? styles.rowStale : ''} ${isHighlighted() ? styles.rowHighlighted : ''}`}
      style={{ '--drama-weight': dramaWeight() }}
      data-game-id={g().id}
    >
      <span class={`${styles.statusDot} ${styles[status()]}`} />
      <button
        class={`${styles.watchBtn} ${isWatched() ? styles.watchBtnActive : ''}`}
        onClick={() => toggleWatch(g().id)}
        aria-label={isWatched() ? 'remove from watchlist' : 'add to watchlist'}
      >
        {isWatched() ? '★' : '☆'}
      </button>
      <span class={styles.matchup} onClick={() => toggleGameExpand(g().id)} role="button" tabIndex={0}>
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
          <Show when={isEditing()} fallback={
            <span
              class={`${styles.scoreClickable} ${optimistic() ? styles.scorePending : ''}`}
              onClick={() => status() !== 'pre' && setEditingGameId(g().id)}
              title={status() !== 'pre' ? 'click to correct (optimistic, reconciles on next poll)' : ''}
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
                <Countdown gameId={g().id} />
              </Show>
              <Show when={optimistic()}>
                <span class={styles.pendingDot} title="optimistic, not yet confirmed by the relay">•</span>
              </Show>
            </span>
          }>
            <ScoreEditor game={g()} />
          </Show>
        </Show>
      </span>
      <Show when={g().venue}>
        <span class={styles.venue}>{g().venue}</span>
      </Show>
      <button class={styles.dismissBtn} onClick={() => dismissGame(g().id)} aria-label="dismiss" title="not interested in this one">✕</button>
      <Show when={import.meta.env.DEV}>
        <span class={styles.mountDebug} title="mount count -- should never exceed 1 if reconciliation is working">
          m{mountCounts[g().id] || 1}
        </span>
      </Show>
      <Show when={isExpanded()}>
        <GameExpansion game={g()} />
      </Show>
    </div>
  )
}

function EmptyNight() {
  const truthIs = () => ambientData()?.truth_is
  const contradiction = () => ambientData()?.contradiction
  return (
    <div class={styles.emptyNight}>
      <p class={styles.emptyNightHeadline}>No games today.</p>
      <Show when={truthIs()?.headline}>
        <p class={styles.emptyNightQuote}>{truthIs().headline}</p>
      </Show>
      <Show when={contradiction()}>
        <p class={styles.emptyNightQuote}>{contradiction()}</p>
      </Show>
      <Show when={!truthIs()?.headline && !contradiction()}>
        <p class={styles.emptyNightQuote}>A quiet night. Sometimes that's the story.</p>
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
        <Show when={props.isLive}><span class={styles.liveIndicator}>●</span></Show>
        <span class={styles.groupCount}>{props.games.length}</span>
      </div>
      <Show when={!isCollapsed()}>
        <For each={props.games}>{game => <GameRow game={game} secondsSinceFetch={props.secondsSinceFetch} />}</For>
      </Show>
    </div>
  )
}

function Content() {
  const [liveOnly, setLiveOnly] = createSignal(false)
  const secondsSinceFetch = useSecondsSinceFetch()

  createEffect(on(deskLastFetchedAt, (fetchedAt, prevFetchedAt) => {
    if (prevFetchedAt !== undefined && fetchedAt !== prevFetchedAt) {
      setOptimisticScores(reconcile({}))
    }
  }, { defer: true }))

  const allGames = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  const hasLiveGames = createMemo(() => allGames().some(g => gameStatus(g) === 'live'))

  const visibleGames = createMemo(() =>
    (liveOnly() && hasLiveGames() ? allGames().filter(g => gameStatus(g) === 'live') : allGames())
      .filter(g => !dismissed[g.id])
  )

  const dismissedCount = createMemo(() => Object.keys(dismissed).length)

  // Sport spotlight: whichever sport has live games right now floats to
  // the top, derived purely from the polling store -- no manual input.
  // Sports tied on "has live games" keep the relay's own relative order
  // via the array index at time of grouping.
  const grouped = createMemo(() => {
    const map = {}
    for (const g of visibleGames()) {
      if (!map[g.sport]) map[g.sport] = []
      map[g.sport].push(g)
    }
    return Object.entries(map).sort(([, gamesA], [, gamesB]) => {
      const liveA = gamesA.some(g => gameStatus(g) === 'live')
      const liveB = gamesB.some(g => gameStatus(g) === 'live')
      if (liveA === liveB) return 0
      return liveA ? -1 : 1
    })
  })

  return (
    <div>
      <header class={styles.header}>
        <span class={styles.label}>Desk</span>
        <DateBrowser />
        <StaleIndicator />
      </header>

      <div class={styles.controlRow}>
        <TonightsCard games={allGames} />
        <LiveFilterToggle active={liveOnly} setActive={setLiveOnly} />
        <Show when={dismissedCount()}>
          <button class={styles.resetBtn} onClick={resetDismissed}>reset ({dismissedCount()} hidden)</button>
        </Show>
      </div>

      <Show when={grouped().length} fallback={<EmptyNight />}>
        <div class={styles.gameList}>
          <For each={grouped()}>
            {([sport, games]) => (
              <SportGroup
                sport={sport}
                games={games}
                isLive={games.some(g => gameStatus(g) === 'live')}
                secondsSinceFetch={secondsSinceFetch}
              />
            )}
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
