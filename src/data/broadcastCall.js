import { analyzeGameArc } from './dramaArcAnalysis'

const TIER_CALL = { fire: 'an absolute fire game', hot: 'a hot one', warm: 'a warm one', '': 'a quiet one' }

// Builds a real narration script from real archived-game data --
// team names, real final score, real drama_peak, and the same real
// flip/fizzle signals Terrain Flight already surfaces as landmarks
// (src/data/dramaArcAnalysis.js). No invented commentary, no filler
// score-by-score play-calling this data doesn't actually contain --
// every sentence maps to one real field.
export function buildCallScript(game) {
  const analyzed = analyzeGameArc(game)
  if (!analyzed) return null
  const { finalPeak, finalTier, flipPercent, isFizzle, fizzleGap } = analyzed
  const g = game

  const sentences = []
  sentences.push(`Tonight's call: the ${g.away} on the road at the ${g.home}.`)
  sentences.push(`Final score, ${g.away} ${g.away_score}, ${g.home} ${g.home_score}.`)
  sentences.push(`This one graded out as ${TIER_CALL[finalTier] ?? TIER_CALL['']}, a real drama peak of ${finalPeak} out of 100.`)
  if (flipPercent != null) {
    sentences.push(`It turned hot about ${flipPercent} percent of the way through.`)
  }
  if (isFizzle) {
    sentences.push(`But it cooled off late, dropping ${fizzleGap} points from its peak by the end.`)
  }

  return { text: sentences.join(' '), analyzed }
}
