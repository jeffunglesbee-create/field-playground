import { analyzeGameArc } from './dramaArcAnalysis'

// Leverage Index -- the real sabermetric concept (how much more, or
// less, a specific moment moved the outcome than an average moment in
// the same game) applied to the real drama_arc array already
// validated this session (docs/GROUND-UP-DESIGN.md principle 10:
// drama_peak/drama_arc confirmed valid across 110 real games).
//
// EXACT, KEYED COMPUTATION, NO PATTERN MATCHING: every leverage value
// is one real subtraction between two real adjacent array entries,
// divided by the real average of all such subtractions in the same
// game. No smoothing, no interpolation, no fuzzy thresholding.
export function computeLeverageIndex(game) {
  const analyzed = analyzeGameArc(game)
  if (!analyzed) return null
  const { arc } = analyzed
  if (arc.length < 3) return null

  const deltas = []
  for (let i = 1; i < arc.length; i++) deltas.push(Math.abs(arc[i] - arc[i - 1]))
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length
  if (avgDelta === 0) return null // perfectly flat arc -- leverage is undefined (0/0), not fabricated as 0

  const leverages = deltas.map(d => d / avgDelta)
  let peakDeltaIndex = 0
  for (let i = 1; i < leverages.length; i++) {
    if (leverages[i] > leverages[peakDeltaIndex]) peakDeltaIndex = i
  }

  return {
    game,
    arc,
    avgDelta,
    peakLeverage: leverages[peakDeltaIndex],
    peakArcIndex: peakDeltaIndex + 1, // arc index the jump lands on
    peakFrom: arc[peakDeltaIndex],
    peakTo: arc[peakDeltaIndex + 1],
  }
}
