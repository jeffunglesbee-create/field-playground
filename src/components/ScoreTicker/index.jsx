import { For, Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js'
import { deskStore, deskLastFetchedAt } from '../../data/relay'
import styles from './ScoreTicker.module.css'

// ScoreTicker — the first genuinely HIGH-FREQUENCY surface here.
//
// WHY THIS ONE MATTERS. The Solid island rubric's first criterion is
// "live, sub-second updates during active state." Every surface in this
// playground so far runs on a 15s poll, which is not that. The
// ControlGroup's 2:1 node-operation finding was measured at that slow
// cadence -- a continuously-moving ticker is where that ratio either
// compounds into something visible or turns out to be irrelevant.
//
// THE ACTUAL QUESTION, and it is not "can Solid render a list":
//   A CSS-animated marquee has a start position and a duration. If the
//   underlying list re-renders, the animation RESTARTS -- the ticker
//   visibly jumps back. That is the classic failure of ticker
//   implementations built on frameworks that re-render on data change.
//   reconcile() patches nodes in place rather than recreating them, so
//   the animated container should never be touched when a score
//   changes. This component exists to prove or disprove that.
//
// HOW IT PROVES IT: the scroll is driven by CSS on the OUTER container,
// which is never keyed to data. Scores live in patched leaf nodes
// inside. A `restarts` counter increments on every animationstart
// event -- if a score update restarts the animation, that number
// climbs. If reconcile() is doing its job, it stays at 1 forever.
// That counter is the experiment; the ticker is just the vehicle.

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

export function ScoreTicker() {
  const [restarts, setRestarts] = createSignal(0)
  const [paused, setPaused] = createSignal(false)
  const [now, setNow] = createSignal(Date.now())

  // A wall clock at 1s, deliberately faster than the 15s data poll.
  // This is what makes the surface genuinely high-frequency: the
  // "since last update" readout moves every second even when no data
  // has changed, so any re-render it causes is real and observable.
  onMount(() => {
    const h = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(h))
  })

  const games = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ])

  // Live first, then finals, then upcoming -- a ticker that leads with
  // pregame games is useless. Ordering is derived, so it re-sorts
  // reactively as games change state.
  const ordered = createMemo(() => {
    const rank = { live: 0, final_ot: 1, final: 1, pre: 2 }
    return [...games()].sort((a, b) => rank[gameStatus(a)] - rank[gameStatus(b)])
  })

  const liveCount = createMemo(() => games().filter(g => gameStatus(g) === 'live').length)

  const secsSinceFetch = createMemo(() => {
    const t = deskLastFetchedAt()
    if (!t) return null
    return Math.floor((now() - t) / 1000)
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Score Ticker</span>
        <span class={styles.note}>
          first sub-second surface here — animation restarts:{' '}
          <b class={restarts() > 1 ? styles.bad : styles.good}>{restarts()}</b>
          {restarts() > 1 ? ' (data change is restarting the scroll)' : ' (scroll survives data changes)'}
        </span>
      </header>

      <div class={styles.meta}>
        <span class={styles.stat}>{liveCount()} live</span>
        <span class={styles.stat}>{games().length} games</span>
        <Show when={secsSinceFetch() !== null}>
          <span class={styles.stat}>data {secsSinceFetch()}s old</span>
        </Show>
        <button class={styles.pauseBtn} onClick={() => setPaused(p => !p)}>
          {paused() ? 'resume' : 'pause'}
        </button>
      </div>

      <Show when={ordered().length} fallback={<p class={styles.empty}>No games to ticker.</p>}>
        <div class={styles.viewport}>
          {/* The animated element. Deliberately NOT keyed to data --
              nothing about a score change should reach this node. */}
          <div
            class={`${styles.track} ${paused() ? styles.trackPaused : ''}`}
            onAnimationStart={e => {
              // animationstart bubbles -- the live-status dot's own
              // `blink` keyframe animation (see TickerItem) fires this
              // same event and bubbles up through this exact listener.
              // Without the target check, every live game's blinking
              // dot gets miscounted as the marquee itself restarting,
              // which is precisely the false positive this counter
              // exists to catch, not produce. Only count an animation
              // that started on the track element itself.
              if (e.target !== e.currentTarget) return
              setRestarts(n => n + 1)
            }}
          >
            {/* Rendered twice for a seamless loop. Both copies read the
                same reactive source, so both patch in place together. */}
            <For each={ordered()}>{g => <TickerItem game={g} />}</For>
            <For each={ordered()}>{g => <TickerItem game={g} />}</For>
          </div>
        </div>
      </Show>
    </div>
  )
}

function TickerItem(props) {
  const g = () => props.game
  const status = () => gameStatus(g())
  const score = () =>
    g().home_score === null ? '—' : `${g().away_score}-${g().home_score}`

  const abbr = t => (t ?? '').split(' ').pop().slice(0, 12)

  return (
    <span class={styles.item}>
      <span class={`${styles.dot} ${styles[status()]}`} />
      <span class={styles.teams}>{abbr(g().away)} @ {abbr(g().home)}</span>
      {/* The leaf that actually changes. reconcile() should patch this
          text node without touching the animated ancestor. */}
      <span class={`${styles.score} ${styles['score_' + status()]}`}>{score()}</span>
      <Show when={status() === 'final_ot'}>
        <span class={styles.ot}>OT</span>
      </Show>
    </span>
  )
}
