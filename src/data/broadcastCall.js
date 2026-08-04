import { analyzeGameArc } from './dramaArcAnalysis'

const RELAY_BASE = import.meta.env.DEV
  ? ''
  : 'https://field-relay-nba.jeffunglesbee.workers.dev'

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

// Real neural TTS via field-relay-nba's /audio/tts (Workers AI, Deepgram
// aura-2-en) -- confirmed live 2026-08-04, real free tier (Workers AI's own
// 10,000 neurons/day, no separate account). Returns a real audio Blob or
// throws with the real error text the relay returned (missing AI binding,
// text too long, upstream failure) -- never fabricates success.
export async function fetchCloudTts(text) {
  const res = await fetch(`${RELAY_BASE}/audio/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    let msg = 'HTTP ' + res.status
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch { /* non-JSON error body, keep the HTTP status */ }
    throw new Error(msg)
  }
  return res.blob()
}
