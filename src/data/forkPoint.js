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
