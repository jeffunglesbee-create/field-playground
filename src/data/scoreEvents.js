import { createSignal, createEffect } from 'solid-js'
import { deskStore, deskLastFetchedAt } from './relay'

// Every other consumer of deskStore reacts to CURRENT state ("is this
// game live right now"). This derives EVENTS from the sequence of
// snapshots instead ("this game WENT live between poll N and N+1") -- a
// first-class transition log, not a re-derivation of the present moment.
//
// Originally lived inside PollDeltaFeed. Pulled out here because ScoreFeed
// needs the exact same derived events, just presented differently
// (Twitter-style cards vs. a compact log) -- sharing this module means
// both are pure presentations of ONE diff engine, not two independent
// ones that could silently drift apart.

const MAX_EVENTS = 200

export const [scoreEvents, setScoreEvents] = createSignal([])
let lastSnapshot = new Map()
let seeded = false
let lastDate = null
let started = false

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
  // transition.
  if (deskStore.date !== lastDate) {
    lastDate = deskStore.date
    seeded = false
  }

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
    setScoreEvents(e => [...e, ...newEvents].slice(-MAX_EVENTS))
  }
  lastSnapshot = nextSnapshot
}

// Called once from App's onMount, same pattern as initUrlDateSync /
// initBroadcastDateSync / initOutcomesSync -- module-level reactive
// wiring that outlives any single component, so PollDeltaFeed and
// ScoreFeed can mount/unmount independently without either one owning
// (or racing over) the derivation itself.
export function initScoreEvents() {
  if (started) return
  started = true
  createEffect(() => {
    // Reads null on the very first synchronous effect run (before any
    // poll has resolved) -- returning early there, instead of letting
    // recordCycle() seed against an empty snapshot right then, means the
    // FIRST REAL poll is what gets treated as the baseline.
    if (deskLastFetchedAt() == null) return
    recordCycle()
  })
}
