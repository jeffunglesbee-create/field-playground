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

export function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

const mountCounts = {}

export const [collapsed, setCollapsed] = createStore({})
function toggleGroup(sport) {
  setCollapsed(sport, c => !c)
}

// Hoisted to module scope (was local to Content()) so it can round-trip
// through the URL the same way watched/collapsed do -- a signal that only
// exists inside one function's closure can't be read from initExtendedUrlSync.
export const [liveOnly, setLiveOnly] = createSignal(false)

// Multi-key URL sync. relay.js's initUrlDateSync already round-trips
// currentDate through ?d=. This extends the same idea to three more
// independent signals -- watched, liveOnly, collapsed -- all inside ONE
// createEffect rather than one effect per signal. Three separate effects
// each doing read-current-URL -> set-one-param -> replaceState would
// still be correct (JS is single-threaded; Solid runs effects one after
// another, never concurrently, so each would see the previous one's
// write) but there's no reason to couple three independent signals'
// effect-scheduling order together -- one effect that tracks all three
// keeps every param write atomic with the others in the same tick.
export function initExtendedUrlSync() {
  try {
    const params = new URLSearchParams(window.location.search)
    const watchParam = params.get('watch')
    if (watchParam) {
      for (const id of watchParam.split(',').filter(Boolean)) setWatched(id, true)
    }
    if (params.get('live') === '1') setLiveOnly(true)
    const collapsedParam = params.get('collapsed')
    if (collapsedParam) {
      for (const sport of collapsedParam.split(',').filter(Boolean)) setCollapsed(sport, true)
    }
  } catch { /* window/location unavailable (SSR, tests) */ }

  createEffect(() => {
    const watchedIds = Object.keys(watched).filter(id => watched[id])
    const collapsedSports = Object.keys(collapsed).filter(s => collapsed[s])
    const isLiveOnly = liveOnly()
    try {
      const url = new URL(window.location.href)
      if (watchedIds.length) url.searchParams.set('watch', watchedIds.join(',')); else url.searchParams.delete('watch')
      if (isLiveOnly) url.searchParams.set('live', '1'); else url.searchParams.delete('live')
      if (collapsedSports.length) url.searchParams.set('collapsed', collapsedSports.join(',')); else url.searchParams.delete('collapsed')
      window.history.replaceState({}, '', url)
    } catch { /* best effort */ }
  })
}

// Exported so a standalone playground surface (ThresholdAlert isn't a
// separate component here -- see the alertThreshold signal below and the
// GameRow effect that reads it -- but WatchlistAlert-style consumers
// elsewhere could read the same watchlist without duplicating it).
export const [watched, setWatched] = createStore({})
function toggleWatch(id) {
  setWatched(id, w => !w)
}

// Score-differential threshold alert: purely a derived condition over
// data that's already polling (deskStore), no new fetch. A watched, live
// game that closes to within N points fires a toast exactly once, on the
// crossing -- not on every poll while it stays close.
const [alertThreshold, setAlertThreshold] = createSignal(5)

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

function AlertThresholdControl() {
  return (
    <label class={styles.alertControl} title="toast when a ★ watched live game's margin closes to this many points or fewer">
      <span class={styles.alertLabel}>alert ≤</span>
      <input
        type="number"
        min="0"
        max="99"
        class={styles.alertInput}
        value={alertThreshold()}
        onInput={e => setAlertThreshold(Math.min(99, Math.max(0, Number(e.currentTarget.value) || 0)))}
      />
    </label>
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
        <OddsRow opening={g().opening_odds} closing={g().closing_odds} />
      </Show>
    </div>
  )
}

// Odds arrive as a JSON payload (string or object) shaped like:
//   {source, captured_at, _oddsProof:{...}, moneyline:{home,away},
//    spread:{home,away}, total:{over,under}}
// Previously this rendered the whole blob verbatim -- unreadable, and it
// leaked internal fields (_oddsProof, adapterId) into the UI. Parsed
// into the three lines that actually mean something, with the source and
// capture time kept as a small caption since provenance is genuinely
// useful here. Defensive on shape: relay may send a string or an object,
// and any field may be absent -- nothing is invented when it's missing.
function fmtOdds(v) {
  return typeof v === 'number' ? (v > 0 ? `+${v}` : String(v)) : null
}

function parseOdds(raw) {
  if (!raw) return null
  let o = raw
  if (typeof raw === 'string') {
    try { o = JSON.parse(raw) } catch { return null }
  }
  if (!o || typeof o !== 'object') return null
  return {
    source: o.source ?? null,
    capturedAt: o.captured_at ?? null,
    ml: o.moneyline ? { home: fmtOdds(o.moneyline.home), away: fmtOdds(o.moneyline.away) } : null,
    spread: o.spread ? { home: fmtOdds(o.spread.home), away: fmtOdds(o.spread.away) } : null,
    total: o.total ?? null,
  }
}

// Raw (unformatted) parse for movement math -- parseOdds above already
// stringifies signs for display, which breaks numeric comparison/delta.
function parseOddsRaw(raw) {
  if (!raw) return null
  let o = raw
  if (typeof raw === 'string') {
    try { o = JSON.parse(raw) } catch { return null }
  }
  if (!o || typeof o !== 'object') return null
  return {
    capturedAt: o.captured_at ?? null,
    ml: o.moneyline ?? null,
    spread: o.spread ?? null,
    total: o.total ?? null,
  }
}

const SIDE_KEYS = { ml: ['home', 'away'], spread: ['home', 'away'], total: ['over', 'under'] }

// Per-field diff between two odds snapshots. Returns null when there's
// nothing to compare (either side missing or non-numeric) or no actual
// change on any side; otherwise an array of {side, from, to, delta}.
function fieldDelta(key, a, b) {
  if (!a || !b) return null
  const moves = []
  for (const side of SIDE_KEYS[key]) {
    const av = a[side]
    const bv = b[side]
    if (typeof av !== 'number' || typeof bv !== 'number') continue
    if (av !== bv) moves.push({ side, from: av, to: bv, delta: bv - av })
  }
  return moves.length ? moves : null
}

// Real line movement, not a raw open/close juxtaposition. The probe
// (scripts/probe-line-movement.mjs, outbox/line-movement-probe-*.txt)
// found 179/195 opening/closing pairs are the SAME cron run's snapshot
// seconds apart (captured_at deltas under 5 minutes) -- not a genuine
// open-to-close window. Comparing those as-is would report "no
// movement" on games that never actually had a closing line captured.
// Gate on the capture-time delta, but don't let the gate hide a real
// move: the probe also found one pair where values differed despite a
// short delta, so a value change always overrides the gate.
const MOVEMENT_THRESHOLD_SEC = 300 // 5 min -- same floor scripts/probe-line-movement.mjs used

export function lineMovement(opening, closing) {
  const open = parseOddsRaw(opening)
  const close = parseOddsRaw(closing)
  if (!open || !close || !open.capturedAt || !close.capturedAt) return null

  const openT = Date.parse(open.capturedAt)
  const closeT = Date.parse(close.capturedAt)
  if (Number.isNaN(openT) || Number.isNaN(closeT)) return null

  const deltaSec = (closeT - openT) / 1000
  const ml = fieldDelta('ml', open.ml, close.ml)
  const spread = fieldDelta('spread', open.spread, close.spread)
  const total = fieldDelta('total', open.total, close.total)
  const anyChanged = !!(ml || spread || total)

  if (Math.abs(deltaSec) < MOVEMENT_THRESHOLD_SEC && !anyChanged) {
    // Same-cron duplicate, no value change either -- there's no real
    // closing line here, so say that rather than claiming "no movement."
    return { status: 'no-data', deltaSec }
  }

  return { status: anyChanged ? 'moved' : 'stable', deltaSec, ml, spread, total }
}

function OddsLine(props) {
  const o = () => parseOdds(props.value)
  return (
    <Show when={o()} fallback={<span class={styles.oddsNone}>—</span>}>
      <span class={styles.oddsLine}>
        <Show when={o().ml}>
          <span class={styles.oddsPart}>ML {o().ml.away} / {o().ml.home}</span>
        </Show>
        <Show when={o().spread}>
          <span class={styles.oddsPart}>SPR {o().spread.away} / {o().spread.home}</span>
        </Show>
        <Show when={o().total}>
          <span class={styles.oddsPart}>O/U {o().total.over ?? o().total.under}</span>
        </Show>
      </span>
    </Show>
  )
}

const MOVE_FIELD_LABEL = { ml: 'ML', spread: 'SPR', total: 'O/U' }

function MovementLine(props) {
  const m = () => lineMovement(props.opening, props.closing)
  return (
    <Show when={m()}>
      <div class={styles.movementRow}>
        <span class={styles.expansionKey}>move</span>
        <Show when={m().status === 'no-data'}>
          <span class={styles.movementNoData}>
            no closing line captured -- same-cron snapshot, {Math.abs(m().deltaSec).toFixed(0)}s apart
          </span>
        </Show>
        <Show when={m().status === 'stable'}>
          <span class={styles.movementStable}>
            line held over {(Math.abs(m().deltaSec) / 3600).toFixed(1)}h
          </span>
        </Show>
        <Show when={m().status === 'moved'}>
          <span class={styles.movementMoved}>
            <For each={['ml', 'spread', 'total']}>
              {key => (
                <Show when={m()[key]}>
                  <For each={m()[key]}>
                    {mv => (
                      <span class={styles.movementPart}>
                        {MOVE_FIELD_LABEL[key]} {mv.side} {fmtOdds(mv.from) ?? mv.from} → {fmtOdds(mv.to) ?? mv.to}
                      </span>
                    )}
                  </For>
                </Show>
              )}
            </For>
          </span>
        </Show>
      </div>
    </Show>
  )
}

function OddsRow(props) {
  const src = () => parseOdds(props.opening) ?? parseOdds(props.closing)
  return (
    <div class={styles.oddsBlock}>
      <div class={styles.expansionRow}>
        <span class={styles.expansionKey}>open</span>
        <OddsLine value={props.opening} />
      </div>
      <div class={styles.expansionRow}>
        <span class={styles.expansionKey}>close</span>
        <OddsLine value={props.closing} />
      </div>
      <MovementLine opening={props.opening} closing={props.closing} />
      <Show when={src()?.source}>
        <div class={styles.oddsSource}>
          {src().source}
          <Show when={src().capturedAt}> · captured {String(src().capturedAt).slice(11, 16)}Z</Show>
        </div>
      </Show>
    </div>
  )
}

// Drama hierarchy, corrected: the first version of this used a raw
// drama_peak number to drive a continuous glow, on the assumption no
// categorical version existed. Wrong -- jubilant-bassoon's real,
// production index.html has exact functions for this:
//   dramaTier(score): >=80 'fire', >=60 'hot', >=40 'warm', else none
//   dramaLabel(score): matching emoji per tier
// Ported verbatim, same thresholds, not re-derived. Also porting
// isBlowout (real threshold: margin > 20, or > 36 for AFL specifically
// -- not replicated here since deskStore's mock data doesn't include
// AFL). What's NOT a faithful port: the real system's CRUNCH/
// CLOSE_LATE tiers depend on ESPN's live period + game clock via
// findESPNScore(), which deskStore doesn't expose in the same form.
// isCloseLate below is an honest, labeled approximation (live status +
// close margin) standing in for that, not a claimed exact match.
export function dramaTier(score) {
  if (score >= 80) return 'fire'
  if (score >= 60) return 'hot'
  if (score >= 40) return 'warm'
  return ''
}
export function dramaLabel(score) {
  if (score >= 80) return '🔥'
  if (score >= 60) return '⚡'
  if (score >= 40) return '●'
  return ''
}

// Countdown to first pitch/kickoff. Reads the REAL start_time field --
// no synthetic value, no (sample) label.
//
// History worth keeping: this first shipped with a hash-derived fake
// time labeled "(sample)" because start_time isn't in /context/date
// yet. It was then deleted outright, which was also wrong -- the
// feature was asked for, only the fabricated data wasn't. This is the
// version that should have existed from the start: render when there's
// a real timestamp, render nothing when there isn't.
//
// start_time is not in the relay response TODAY. field-relay-nba's
// CC-CMD-2026-07-25-start-time-persistence adds the column and persists
// the value that /archive/game already receives and discards. The
// moment that ships, this lights up on its own with zero client change,
// because it's driven by the field's presence rather than a flag.
function Countdown(props) {
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const handle = setInterval(() => setNow(Date.now()), 30000)
    onCleanup(() => clearInterval(handle))
  })
  const label = createMemo(() => {
    const raw = props.startTime
    if (!raw) return null
    const target = new Date(raw).getTime()
    if (Number.isNaN(target)) return null
    const diffMs = target - now()
    if (diffMs <= 0) return null
    const totalMin = Math.floor(diffMs / 60000)
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return { text: h > 0 ? `${h}h ${m}m` : `${m}m`, soon: totalMin <= 30 }
  })
  return (
    <Show when={label()}>
      <span
        class={`${styles.countdown} ${label().soon ? styles.countdownSoon : ''}`}
        title={`starts ${new Date(props.startTime).toLocaleString()}`}
      >
        {label().text}
      </span>
    </Show>
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

  // Real ported thresholds (dramaTier/dramaLabel), not an invented
  // continuous scale. isBlowout and isCloseLate use the real relay
  // fields available here (scores), same exact isBlowout threshold
  // (margin > 20) the production code uses; isCloseLate is the labeled
  // approximation described above the function definitions.
  const dramaPeak = () => g().drama_peak ?? 0
  const tier = () => dramaTier(dramaPeak())
  const label = () => dramaLabel(dramaPeak())
  const margin = () => Math.abs((g().home_score ?? 0) - (g().away_score ?? 0))
  const isBlowout = () => status() !== 'pre' && margin() > 20
  const isCloseLate = () => status() === 'live' && margin() <= 5

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

  createEffect(on(margin, (curr, prev) => {
    if (!isWatched() || isIndividual() || status() !== 'live') return
    const threshold = alertThreshold()
    if (prev > threshold && curr <= threshold) {
      const label = `${g().away} @ ${g().home}`
      showToast(`${label} within ${threshold}: ${scoreStr()}`, 'live')
    }
  }, { defer: true }))

  return (
    <div
      ref={rowEl}
      class={`${styles.gameRow} ${styles['tier_' + tier()]} ${isBlowout() ? styles.rowBlowout : ''} ${isCloseLate() ? styles.rowCloseLate : ''} ${isStale() ? styles.rowStale : ''} ${isHighlighted() ? styles.rowHighlighted : ''}`}
      data-game-id={g().id}
    >
      {/* .gameRow is a CSS grid with fixed positional columns (see
          DeskCard.module.css), not named grid areas -- so every direct
          child's column comes from its position among ITS SIBLINGS, not
          from a stable slot. dramaLabel and venue below render
          unconditionally (empty when there's nothing to show) rather
          than behind a <Show>, because <Show> removes the child from
          the DOM entirely when its condition is false: on a game with no
          drama yet (drama_peak < 40 -- true for essentially every
          pregame row) the label span used to vanish, shifting every
          later sibling one column left. That's what made team names
          render 16px wide -- the watch-star's column -- while the score
          area quietly inherited the wide 1fr column meant for the
          matchup text. Confirmed live: every pregame row measured
          matchupWidth === 16 before this fix. */}
      <span class={`${styles.statusDot} ${styles[status()]}`} />
      <span class={styles.dramaLabel} title={label() ? `drama tier: ${tier()} (peak ${dramaPeak()})` : undefined}>{label()}</span>
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
                <Countdown startTime={g().start_time} />
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
      <span class={styles.venue}>{g().venue}</span>
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
        <AlertThresholdControl />
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
