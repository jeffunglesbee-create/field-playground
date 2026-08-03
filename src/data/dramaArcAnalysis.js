import { dramaTier } from '../components/DeskCard'

// Shared real-arc analysis: given a raw archived game object (`drama_arc`
// as its real JSON-string field, `drama_peak` as its real max-of-arc
// field), computes the "early read vs eventual peak" comparison. Extracted
// 2026-08-03 from TheUnwatched so HallOfSurprises shares one real
// implementation instead of an independently-maintained second copy of
// the same math.
export const EARLY_WINDOW_FRACTION = 0.2
export const EARLY_WINDOW_MIN_POINTS = 5

export function analyzeGameArc(g) {
  let arc
  try {
    arc = JSON.parse(g.drama_arc)
  } catch {
    return null
  }
  if (!Array.isArray(arc) || arc.length < EARLY_WINDOW_MIN_POINTS) return null

  const windowSize = Math.max(EARLY_WINDOW_MIN_POINTS, Math.round(arc.length * EARLY_WINDOW_FRACTION))
  const earlySlice = arc.slice(0, windowSize)
  const earlyPeak = Math.max(...earlySlice)
  const finalPeak = typeof g.drama_peak === 'number' ? g.drama_peak : Math.max(...arc)

  const earlyTier = dramaTier(earlyPeak) || 'cold'
  const finalTier = dramaTier(finalPeak) || 'cold'

  // "Unwatched": the early read never reached 'hot' (i.e., stuck at
  // warm/cold), but the real game did.
  const isUnwatched = earlyPeak < 60 && finalPeak >= 60

  const hotIdx = arc.findIndex(v => v >= 60)
  const flipPercent = hotIdx >= 0 ? Math.round((hotIdx / arc.length) * 100) : null

  return {
    game: g, arc, earlyPeak, finalPeak, earlyTier, finalTier, isUnwatched, flipPercent,
    gap: finalPeak - earlyPeak,
  }
}
