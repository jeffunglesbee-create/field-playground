import { Show, For, createMemo, createSignal, createEffect, on, onMount, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
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
// verification, survives real poll cycles.
const [collapsed, setCollapsed] = createStore({})
function toggleGroup(sport) {
  setCollapsed(sport, c => !c)
}

// Watchlist -- CONFIRMED live. createStore keyed by id, not a
// createSignal(new Set()), which would silently fail to notify on
// .add()/.delete() (mutates without a setter call).
const [watched, setWatched] = createStore({})
function toggleWatch(id) {
  setWatched(id, w => !w)
}

// Optimistic score edit. Local override keyed by game id, shown instead
// of deskStore's real value while pending. The actual point being
// tested: what does "reconcile" mean when LOCAL state and SERVER state
// can genuinely disagree, not just when they're both deriving from the
// same source. Answer implemented here: server truth always wins the
// moment a real poll lands, whether or not it matched the guess --
// cleared inside DeskCard's own effect below (needs a component-level
// reactive root, not module top-level, same reason initUrlDateSync
// lives in App.jsx's onMount rather than bare in relay.js).
const [optimisticScores, setOptimisticScores] = createStore({})
const [editingGameId, setEditingGameId] = createSignal(null)

function submitOptimisticScore(gameId, homeScore, awayScore) {
  setOptimisticScores(gameId, { home_score: homeScore, away_score: awayScore, pendingAt: Date.now() })
  setEditingGameId(null)
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

// "What's live now" filter -- pure derived memo, zero new fetching.
// Flips back to the full list when nothing is live, per spec.
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

// Countdown -- SAMPLE, not real. Checked both field-relay-nba's source
// AND the live /context/date response before building: start_time
// appears in several internal upstream-parsing paths but does not
// survive to the actual game object this endpoint returns (confirmed
// keys: id, sport, league, date, home, away, scores, venue, streams,
// note, tags, crew, local_note, created_at, odds, drama fields,
// espn_event_id, went_to_ot, finalized_at -- no start time). Rather
// than invent one, this renders a clearly-labeled sample countdown for
// pregame games using a synthetic target computed client-side, tagged
// as sample directly in the UI, same honest pattern as Seasons'
// NFL/EPL cards.
function Countdown(props) {
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const handle = setInterval(() => setNow(Date.now()), 60000)
    onCleanup(() => clearInterval(handle))
  })
  // Synthetic target: a stable, deterministic offset derived from the
  // game id (not Math.random(), so it doesn't reshuffle every render) --
  // purely illustrative of the wall-clock-composed-with-a-target pattern.
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

function GameRow(props) {
  const g = () => props.game
  const status = () => gameStatus(g())
  const isIndividual = () => NON_MATCHUP_SPORTS.has(g().sport)
  const isWatched = () => !!watched[g().id]
  const optimistic = () => optimisticScores[g().id]
  const displayHome = () => optimistic()?.home_score ?? g().home_score
  const displayAway = () => optimistic()?.away_score ?? g().away_score
  const scoreStr = () => `${displayAway()}–${displayHome()}`
  const isEditing = () => editingGameId() === g().id

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
  const [liveOnly, setLiveOnly] = createSignal(false)

  // Server truth wins the moment a real poll lands, whether or not the
  // optimistic guess matched -- this effect needs a real reactive root,
  // which is why it lives here (inside a component) rather than at
  // relay.js's module top-level, same reasoning as initUrlDateSync.
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

  // Flips back to full list when nothing is live, per spec -- checking
  // hasLiveGames() rather than just trusting the toggle avoids an empty
  // list the moment the last live game goes final.
  const visibleGames = createMemo(() =>
    liveOnly() && hasLiveGames() ? allGames().filter(g => gameStatus(g) === 'live') : allGames()
  )

  const grouped = createMemo(() => {
    const map = {}
    for (const g of visibleGames()) {
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

      <div class={styles.controlRow}>
        <TonightsCard games={allGames} />
        <LiveFilterToggle active={liveOnly} setActive={setLiveOnly} />
      </div>

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
