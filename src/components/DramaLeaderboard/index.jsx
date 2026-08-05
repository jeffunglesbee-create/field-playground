import { For, Show, createMemo, createEffect, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { dramaLeaderboard, refetchDramaLeaderboard } from '../../data/relay'
import { fetchWpMovement } from '../../data/dramaWpMovement'
import styles from './DramaLeaderboard.module.css'

// Round 3's validated WP-movement drama metric (docs/outbox/chat-
// update-2026-07-30-drama-scoring-round3.md), re-confirmed against
// TODAY'S real leaderboard 2026-08-01 (scripts/probe-drama-leaderboard-
// wp-movement.mjs): the production drama_peak leaderboard's own top-8
// "Most Dramatic Games" were ALL tied at drama_peak=74 (1/8 distinct --
// real coarseness, not hypothetical) while total_wp_movement
// distinguished all 8 (8/8 distinct, 3.30-7.18) on those exact same
// games. User instruction 2026-08-01: show ONLY this finer signal, not
// the old peak/sparkline system alongside it.
//
// MLB ONLY, deliberately no sport switcher: Baseball Savant (the real
// win-probability source this metric is built on) is MLB-specific and
// this method has never been validated for any other sport -- there is
// no round-3 equivalent to fall back to for MLS, so this component
// doesn't pretend to cover it.
//
// Still uses /archive/drama/leaderboard as the real source of WHICH
// games to rank (real completed MLB games, real dates) -- what changed
// is that drama_peak itself is no longer displayed or ranked on; each
// game's real gamePk/Savant data is fetched live to compute the actual
// displayed and ranked metric.

function WpMovementBlock(props) {
  return (
    <Show
      when={!props.loading && !props.error && props.movement}
      fallback={
        <span class={styles.wpMovementState}>
          {props.loading ? 'loading…' : props.error ? `unavailable: ${props.error}` : ''}
        </span>
      }
    >
      <span class={styles.wpMovementValue}>
        {props.movement.totalMovement.toFixed(2)}
        <span class={styles.wpMovementSub}> total</span>
      </span>
      <span class={styles.wpMovementValue}>
        {props.movement.lateMovement.toFixed(2)}
        <span class={styles.wpMovementSub}> late (inn 7+)</span>
      </span>
    </Show>
  )
}

function GameRow(props) {
  const g = () => props.game
  return (
    <li class={styles.row}>
      <div class={styles.rowMain}>
        <span class={styles.rank}>{props.rank}</span>
        <div class={styles.matchupBlock}>
          <span class={styles.matchup}>{g().away} @ {g().home}</span>
          <span class={styles.score}>{g().away_score}–{g().home_score}</span>
        </div>
        <div class={styles.wpMovementInline}>
          <WpMovementBlock loading={props.wpMovement?.loading} error={props.wpMovement?.error} movement={props.wpMovement?.data} />
        </div>
      </div>
    </li>
  )
}

export function DramaLeaderboard() {
  const data = () => (dramaLeaderboard.error ? undefined : dramaLeaderboard())

  // Keyed by game id.
  const [wpMovements, setWpMovements] = createStore({})
  let cancelled = false
  onCleanup(() => { cancelled = true })

  createEffect(() => {
    const games = data()?.games ?? []
    for (const g of games) {
      if (wpMovements[g.id]) continue // already loaded/loading -- don't re-fetch on every leaderboard refresh
      setWpMovements(g.id, { loading: true, error: null, data: null })
      fetchWpMovement(g.date, g.home, g.away)
        .then(result => {
          if (cancelled) return
          if (!result) { setWpMovements(g.id, { loading: false, error: 'no real gamePk/WP data resolved', data: null }); return }
          setWpMovements(g.id, { loading: false, error: null, data: result })
        })
        .catch(e => {
          if (cancelled) return
          setWpMovements(g.id, { loading: false, error: String(e?.message ?? e).slice(0, 100), data: null })
        })
    }
  })

  // Ranked by real total_wp_movement as each game's data resolves --
  // resolved games sort above unresolved/errored ones; ties among
  // unresolved games keep their original relative order (stable sort).
  const rankedGames = createMemo(() => {
    const games = data()?.games ?? []
    return [...games].sort((a, b) => {
      const am = wpMovements[a.id]?.data?.totalMovement
      const bm = wpMovements[b.id]?.data?.totalMovement
      if (am != null && bm != null) return bm - am
      if (am != null) return -1
      if (bm != null) return 1
      return 0
    })
  })

  // Real, plain-language payoff -- names tonight's #1 real game by
  // total WP movement and how much of that movement happened late,
  // instead of leaving two raw numbers for the reader to compare
  // unaided. Waits for that top game's real Savant data to resolve
  // (returns null until then, same as every other loading guard here).
  const verdict = createMemo(() => {
    const top = rankedGames()[0]
    if (!top) return null
    const m = wpMovements[top.id]?.data
    if (!m) return null
    const latePct = m.totalMovement > 0 ? Math.round((m.lateMovement / m.totalMovement) * 100) : 0
    return `Tonight's most dramatic real game: ${top.away} @ ${top.home}, with ${m.totalMovement.toFixed(2)} total real win-probability movement -- ${latePct}% of it (${m.lateMovement.toFixed(2)}) happening late, in the 7th inning or after.`
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Most Dramatic Games</span>
        <button class={styles.refreshBtn} onClick={refetchDramaLeaderboard} aria-label="refresh drama leaderboard">↻</button>
      </header>
      <p class={styles.note}>
        MLB only, ranked by real win-probability movement (round 3's validated signal) — not the
        coarse drama_peak, which ties nearly every top game at the same value.
      </p>
      <Show when={dramaLeaderboard.error}>
        <p class={styles.error}>{String(dramaLeaderboard.error)}</p>
      </Show>
      <Show when={!dramaLeaderboard.error}>
        <Show when={data()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={rankedGames().length} fallback={<p class={styles.empty}>No games found.</p>}>
            <Show when={verdict()}>
              <p class={styles.verdict}>{verdict()}</p>
            </Show>
            <ul class={styles.rows}>
              <For each={rankedGames()}>
                {(g, i) => <GameRow game={g} rank={i() + 1} wpMovement={wpMovements[g.id]} />}
              </For>
            </ul>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
