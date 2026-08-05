import { analyzeGameArc } from './dramaArcAnalysis'

// Fork Point -- splices two REAL archived drama_arcs at a real,
// user-chosen index: "what if this game had followed that game's path
// from here." Both arcs are 100% real archived data; the only
// invented part is the pairing itself, which the user picks
// explicitly and can see labeled as such.
//
// HONEST SCOPING: no client-side win-probability model exists to
// "rerun" from the fork point (WP is server-computed, not exposed as
// a re-invocable function) -- this does NOT claim to recompute
// anything. It is an exact splice of two real arrays: the real source
// arc up to the fork point, then the real other game's own real shape
// from that point on, shifted by a single constant offset so the
// values connect continuously at the seam (the fork game's real
// SHAPE from that point is preserved exactly -- only its absolute
// level is shifted, not smoothed or rescaled).
export function computeFork(sourceGame, forkGame, splicePoint) {
  const source = analyzeGameArc(sourceGame)
  const fork = analyzeGameArc(forkGame)
  if (!source || !fork) return null

  const maxIndex = Math.min(source.arc.length, fork.arc.length) - 1
  const clamped = Math.max(0, Math.min(splicePoint, maxIndex))

  const seamValue = source.arc[clamped]
  const forkSeamValue = fork.arc[clamped]
  const offset = seamValue - forkSeamValue
  const splicedTail = fork.arc.slice(clamped + 1).map(v => v + offset)
  const splicedArc = [...source.arc.slice(0, clamped + 1), ...splicedTail]

  return {
    sourceGame,
    forkGame,
    splicePoint: clamped,
    maxIndex,
    originalArc: source.arc,
    splicedArc,
    originalPeak: source.finalPeak,
    splicedPeak: Math.max(...splicedArc),
    offset,
  }
}

// "Game vs game, one manual pairing at a time" undersells this: the real
// utility is "for THIS real game, which of its own real turning points --
// forked onto some other real game's path -- would have swung it the
// most." That's answerable from data already on hand: scan every OTHER
// real game in the sample against a set of real candidate splice points
// for the fixed source game, and rank by the real resulting peak swing.
//
// Not exhaustive: a real per-play arc can run to hundreds of points, and
// scanning every single one against every other real game doesn't scale
// client-side, so each (source, fork-game) pair samples FORK_SAMPLE_COUNT
// real, evenly-spaced candidate points (always including play 0 and the
// real final shared index) and keeps that pair's single biggest real
// swing. This is a disclosed sampling choice, not a silent cap -- see the
// note rendered alongside the ranked list in ForkPoint's UI.
export const FORK_SAMPLE_COUNT = 12

export function findBiggestForks(sourceGame, otherGames, sampleCount = FORK_SAMPLE_COUNT) {
  const results = []
  for (const forkGame of otherGames) {
    if (forkGame === sourceGame) continue
    const points = new Set()
    // Seed with computeFork(..., 0) purely to read the real, shared
    // maxIndex for this pair before sampling it.
    const probe = computeFork(sourceGame, forkGame, 0)
    if (!probe || probe.maxIndex < 1) continue
    for (let i = 0; i < sampleCount; i++) {
      points.add(Math.round((i / (sampleCount - 1)) * probe.maxIndex))
    }
    let best = null
    for (const p of points) {
      const r = computeFork(sourceGame, forkGame, p)
      if (!r) continue
      const delta = r.splicedPeak - r.originalPeak
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { ...r, delta }
    }
    if (best) results.push(best)
  }
  results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return results
}

// Generic version of computeFork's splice, operating on two already-
// real numeric arrays directly instead of parsing them out of a game's
// own drama_arc field -- used by the real-WP path (src/data/
// forkPointWp.js), where the real per-play array comes from a live
// Baseball Savant fetch, not drama_arc. Exact same mechanic: the real
// source arc up to the splice point, then the real other arc's own
// real shape from that point, shifted by one constant so it connects
// continuously at the seam.
//
// Win probability is a real, physically bounded 0-100 metric (unlike
// drama score, which has no such ceiling) -- when clampMin/clampMax
// are given, the shifted tail is clamped to that real range so a large
// seam offset can't produce a nonsensical value like "153% to win."
export function spliceRealArcs(sourceArc, forkArc, splicePoint, { clampMin, clampMax } = {}) {
  const maxIndex = Math.min(sourceArc.length, forkArc.length) - 1
  if (maxIndex < 0) return null
  const clamped = Math.max(0, Math.min(splicePoint, maxIndex))

  const seamValue = sourceArc[clamped]
  const forkSeamValue = forkArc[clamped]
  const offset = seamValue - forkSeamValue
  const clampFn = v => (clampMin != null || clampMax != null)
    ? Math.max(clampMin ?? -Infinity, Math.min(clampMax ?? Infinity, v))
    : v
  const splicedTail = forkArc.slice(clamped + 1).map(v => clampFn(v + offset))
  const splicedArc = [...sourceArc.slice(0, clamped + 1), ...splicedTail]

  return {
    splicePoint: clamped,
    maxIndex,
    originalArc: sourceArc,
    splicedArc,
    originalEnd: sourceArc[sourceArc.length - 1],
    splicedEnd: splicedArc[splicedArc.length - 1],
    offset,
  }
}
