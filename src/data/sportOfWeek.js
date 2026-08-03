// Real sport_of_week.allSports carries multiple separate, un-normalized
// entries for the same real sport -- confirmed via a direct probe,
// 2026-08-03 (outbox/sport-of-week-shape-probe-2026-08-03T18-07-46-
// 260Z.txt): "MLB", "Baseball (MLB)", and "mlb" all counted
// independently that same day; same pattern for MLS/WNBA/PGA Tour. The
// backend's own precomputed winner/summary/dramaTotal/gamesPlayed
// fields are built from the un-normalized counts, so they're real but
// undercounted -- today's real MLB high-quality total is 171
// (141+18+12 across its three casings), not the 141 the backend
// reports. Today's specific winner still happens to be correct (MLB's
// undercounted 141 alone already beats every other un-normalized
// bucket), but the stated numbers are wrong, and a day where two
// sports split more evenly across casings could flip the winner too --
// not assumed safe just because it wasn't observed yet.
//
// Explicit alias table, not a fuzzy heuristic: every real variant seen
// across two real dates this session, matching src/components/
// Arbitrage's own established precedent (real, verbatim service-name
// aliasing, not guessed). An unrecognized label falls back to itself
// rather than being silently dropped or merged incorrectly.
const SPORT_ALIASES = {
  mlb: 'MLB', 'baseballmlb': 'MLB',
  wnba: 'WNBA',
  mls: 'MLS', 'mlssoccer': 'MLS',
  pgatour: 'PGA Tour',
}

function normalizeKey(label) {
  return String(label || '').toLowerCase().replace(/[^a-z]/g, '')
}

function canonicalSportName(label) {
  return SPORT_ALIASES[normalizeKey(label)] ?? label
}

// Re-aggregates the real allSports array by canonical sport name and
// recomputes winner/runnerUp/summary from the corrected totals --
// doesn't invent any new data, just correctly combines what the
// endpoint already sent split across casings.
export function recomputeSportOfWeek(raw) {
  if (!raw || !Array.isArray(raw.allSports) || !raw.allSports.length) return raw

  const grouped = new Map()
  for (const s of raw.allSports) {
    const name = canonicalSportName(s.sport)
    const cur = grouped.get(name) ?? { sport: name, games: 0, high_quality: 0 }
    cur.games += s.games ?? 0
    cur.high_quality += s.high_quality ?? 0
    grouped.set(name, cur)
  }
  const ranked = [...grouped.values()].sort((a, b) => b.high_quality - a.high_quality)
  const winner = ranked[0]
  if (!winner) return raw
  const runnerUp = ranked[1]

  return {
    ...raw,
    winner: winner.sport,
    dramaTotal: winner.high_quality,
    gamesPlayed: winner.games,
    runnerUp: runnerUp?.sport ?? raw.runnerUp,
    runnerUpDrama: runnerUp?.high_quality ?? raw.runnerUpDrama,
    summary: runnerUp
      ? `${winner.sport} (${winner.high_quality}/${winner.games} high-quality) edged ${runnerUp.sport} (${runnerUp.high_quality}/${runnerUp.games}).`
      : `${winner.sport} (${winner.high_quality}/${winner.games} high-quality).`,
  }
}
