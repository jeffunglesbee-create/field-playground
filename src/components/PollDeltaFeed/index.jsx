import { For, Show, createSignal, createEffect } from 'solid-js'
import { deskStore, deskLastFetchedAt } from '../../data/relay'
import styles from './PollDeltaFeed.module.css'

// Every other consumer of deskStore reacts to CURRENT state ("is this
// game live right now"). This derives EVENTS from the sequence of
// snapshots instead ("this game WENT live between poll N and N+1") --
// a first-class transition log, not a re-derivation of the present
// moment. The distinction matters: current-state reactivity throws away
// the fact that a transition happened at all once the next render
// settles; nothing else in this repo remembers "score changed 2-1 to
// 3-1" after the row re-renders with 3-1. This does, for the whole
// session, module-level so it survives this component unmounting.
//
// lastSnapshot is a plain Map, not a signal -- it's WRITE-ONLY bookkeeping
// for the diff, never read reactively itself. Only the derived events
// array is reactive state.

const [events, setEvents] = createSignal([])
let lastSnapshot = new Map()
let seeded = false
let lastDate = null

function status(g) {
  if (g.finalized_at) return 'final'
  if (g.home_score != null) return 'live'
  return 'pre'
}

function describeChanges(prev, next) {
  const label = `${next.away} @ ${next.home}`
  const out = []
  if (!prev) {
    out.push({ kind: 'appeared', text: `${label} appeared on the slate` })
    return out
  }
  const prevStatus = status(prev)
  const nextStatus = status(next)
  if (prevStatus === 'pre' && nextStatus !== 'pre') {
    out.push({ kind: 'live', text: `${label} went live` })
  }
  if (prev.home_score !== next.home_score || prev.away_score !== next.away_score) {
    out.push({
      kind: 'score',
      text: `${label} score changed ${prev.away_score ?? '—'}-${prev.home_score ?? '—'} → ${next.away_score ?? '—'}-${next.home_score ?? '—'}`,
    })
  }
  if (prevStatus !== 'final' && nextStatus === 'final') {
    out.push({ kind: 'final', text: `${label} finalized ${next.away_score}-${next.home_score}` })
  }
  return out
}

function recordCycle() {
  const games = [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ]
  const nextSnapshot = new Map(games.map(g => [g.id, g]))

  // Snapshots are fetched per date (DeskCard's date browser swaps the
  // whole slate), but the baseline above spans every poll regardless of
  // date. Without this, navigating to a different day would diff an
  // unrelated slate against the old one and report every game as a false
  // transition -- same failure shape as the empty-baseline bug below,
  // just triggered by date navigation instead of the first poll.
  if (deskStore.date !== lastDate) {
    lastDate = deskStore.date
    seeded = false
  }

  // First cycle (or first cycle after a date change) just seeds the
  // baseline -- there's no "previous" to diff against yet, and treating
  // every game as a fresh "appeared" event would just be restating the
  // whole slate, not a real event.
  if (!seeded) {
    seeded = true
    lastSnapshot = nextSnapshot
    return
  }

  const newEvents = []
  for (const [id, g] of nextSnapshot) {
    newEvents.push(...describeChanges(lastSnapshot.get(id), g).map(e => ({ ...e, id, at: Date.now() })))
  }
  if (newEvents.length) {
    setEvents(e => [...e, ...newEvents].slice(-200))
  }
  lastSnapshot = nextSnapshot
}

export function PollDeltaFeed() {
  createEffect(() => {
    // Reads null on the very first synchronous effect run (before any
    // poll has resolved) -- returning early there, instead of letting
    // recordCycle() seed against an empty snapshot right then, means the
    // FIRST REAL poll is what gets treated as the baseline. Skipping
    // this guard was the actual bug: it seeded against {} one tick too
    // early, so the first real poll diffed against nothing and every
    // game on the slate fired a false "appeared" event.
    if (deskLastFetchedAt() == null) return
    recordCycle()
  })

  const ordered = () => [...events()].reverse()

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Poll Delta Feed</span>
        <span class={styles.sublabel}>events derived from snapshots, not current state</span>
      </header>
      <Show when={events().length} fallback={<p class={styles.empty}>No transitions yet — waiting for a second poll cycle to diff against.</p>}>
        <div class={styles.feed}>
          <For each={ordered()}>
            {e => (
              <div class={`${styles.eventRow} ${styles['kind_' + e.kind]}`}>
                <span class={styles.eventTime}>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span class={styles.eventText}>{e.text}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
