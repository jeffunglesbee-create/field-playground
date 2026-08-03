// Terrain Flight's data layer -- pure math, no DOM/Three.js/Solid
// dependency, so it's testable directly in Node before any rendering
// risk is introduced.
//
// THE ONLY MAPPING: arc[i] becomes the terrain height at position i.
// No smoothing, no interpolation presented as insight, no pattern
// matching anywhere in this file -- every vertex traces to one real
// drama_arc value at one real index, full stop.
//
// Landmarks reuse src/data/dramaArcAnalysis.js's already-real,
// already-tested analysis (earlyPeak/finalPeak/flipPercent/lateMax)
// rather than re-deriving "interesting points" with a second,
// independently-drifting definition of what's interesting.

import { analyzeGameArc } from './dramaArcAnalysis'

export const VERTEX_SPACING = 2 // world units between consecutive arc points along the flight path
export const HEIGHT_SCALE = 0.35 // world units per drama-score point (0-100 real range -> 0-35 tall)

// Real terrain mesh data: one height sample per real arc index, spaced
// along a straight flight path. Returns null if the game's drama_arc
// isn't real/parseable -- callers must handle that explicitly, not
// silently render an empty terrain as if it were real data.
export function buildTerrainMesh(game) {
  const analyzed = analyzeGameArc(game)
  if (!analyzed) return null
  const { arc, earlyPeak, finalPeak, flipPercent, lateMax, isFizzle, fizzleGap } = analyzed

  const heights = arc.map(v => v * HEIGHT_SCALE)
  const positions = arc.map((_, i) => i * VERTEX_SPACING)
  const pathLength = (arc.length - 1) * VERTEX_SPACING

  const landmarks = []

  // The real overall peak -- the tallest real point on this terrain,
  // wherever it actually occurs (first occurrence if tied).
  const peakIndex = arc.indexOf(Math.max(...arc))
  landmarks.push({
    index: peakIndex,
    x: peakIndex * VERTEX_SPACING,
    kind: 'peak',
    label: `peak · ${arc[peakIndex]}`,
  })

  // The real flip point -- where the arc first crossed into "hot"
  // (>=60), same real threshold TheUnwatched/HallOfSurprises already
  // use. Only a real landmark if the game actually crossed it.
  if (flipPercent != null) {
    const flipIndex = Math.round((flipPercent / 100) * (arc.length - 1))
    landmarks.push({
      index: flipIndex,
      x: flipIndex * VERTEX_SPACING,
      kind: 'flip',
      label: `crossed into hot · ${flipPercent}% through`,
    })
  }

  // The real fizzle point, when this game is one (peaked, then cooled
  // by the late window) -- reuses the exact same real computation
  // HallOfSurprises's "peaked early, cooled off" ranking already relies
  // on, not a second independent definition.
  if (isFizzle) {
    const windowSize = Math.max(5, Math.round(arc.length * 0.2))
    const lateStartIndex = arc.length - windowSize
    landmarks.push({
      index: lateStartIndex,
      x: lateStartIndex * VERTEX_SPACING,
      kind: 'fizzle',
      label: `cooled off · -${fizzleGap} pts by the end`,
    })
  }

  landmarks.sort((a, b) => a.index - b.index)

  return {
    game,
    arc,
    heights,
    positions,
    pathLength,
    landmarks,
    earlyPeak,
    finalPeak,
    lateMax,
  }
}

// Given a flight-path X position (world units), returns the exact real
// arc index it corresponds to -- the inverse of `positions` above, used
// to detect when the camera crosses a landmark. Exact math, not a
// nearest-neighbor heuristic.
export function xToArcIndex(x) {
  return x / VERTEX_SPACING
}
