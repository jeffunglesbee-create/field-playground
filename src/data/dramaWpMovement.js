// Round 3's validated WP-movement drama metric (docs/outbox/chat-
// update-2026-07-30-drama-scoring-round3.md), extracted for reuse in
// DramaLeaderboard. Re-confirmed against TODAY's real leaderboard
// games, not just round 3's historical 28-game sample, before this
// module was wired into any UI (scripts/probe-drama-leaderboard-wp-
// movement.mjs, outbox/drama-leaderboard-wp-movement-probe-2026-08-
// 01T01-46-34-126Z.txt): every one of the top 8 real "Most Dramatic
// Games" ties at drama_peak=74 (1/8 distinct) -- the exact coarseness
// round 1-3 diagnosed, confirmed live on the current real leaderboard
// -- while total_wp_movement distinguished all 8 (8/8 distinct, range
// 3.30-7.18) on the SAME real games.
//
// MLB ONLY: Baseball Savant is MLB-specific. Round 3's method has
// never been tested against any other sport -- do not silently apply
// this to MLS/WNBA leaderboard rows.
//
// DIRECT client fetch, not routed through field-relay-nba: both
// statsapi.mlb.com (gamePk resolution) and baseballsavant.mlb.com
// confirmed CORS-open (Access-Control-Allow-Origin: *) via
// scripts/probe-wp-ticker-cors.mjs earlier this session -- same
// verified basis LiveWpTicker already relies on.

async function resolveGamePk(date, home, away) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`)
  if (!res.ok) throw new Error('schedule HTTP ' + res.status)
  const data = await res.json()
  const games = data?.dates?.[0]?.games ?? []
  const norm = s => (s || '').toLowerCase().replace(/[^a-z]/g, '')
  const h = norm(home), a = norm(away)
  const match = games.find(g => {
    const gh = norm(g.teams?.home?.team?.name)
    const ga = norm(g.teams?.away?.team?.name)
    return (gh.includes(h) || h.includes(gh)) && (ga.includes(a) || a.includes(ga))
  })
  return match?.gamePk ?? null
}

function inningOf(e) {
  // Real field confirmed via probe-savant-wp-metrics.mjs's shape dump:
  // `i` is a half-inning string like "T1"/"B9", not a plain number.
  const m = /^[TB](\d+)/.exec(String(e?.i ?? ''))
  return m ? parseInt(m[1], 10) : null
}

// Returns { totalMovement, lateMovement } on success, or null if the
// game can't be resolved/fetched -- callers must show an honest
// "unavailable" state, never fabricate a number.
export async function fetchWpMovement(date, home, away) {
  const gamePk = await resolveGamePk(date, home, away)
  if (!gamePk) return null

  const res = await fetch(`https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`)
  if (!res.ok) throw new Error('Savant HTTP ' + res.status)
  const data = await res.json()
  const arr = data?.scoreboard?.stats?.wpa?.gameWpa
  if (!Array.isArray(arr) || !arr.length) return null

  // Same /100 scale fix as every other Savant consumer this session
  // (Savant's real API returns 0-100, not the 0-1 fraction its own
  // field.js comment claims).
  const totalMovement = arr.reduce((s, e) => s + Math.abs(Number(e?.homeTeamWinProbabilityAdded ?? 0) / 100), 0)
  const lateEntries = arr.filter(e => { const inn = inningOf(e); return inn != null && inn >= 7 })
  const lateMovement = lateEntries.reduce((s, e) => s + Math.abs(Number(e?.homeTeamWinProbabilityAdded ?? 0) / 100), 0)

  return { totalMovement, lateMovement }
}
