// Real win-probability splicing for MLB Fork Point candidates -- the
// resolution to "what novel thinking resolves the wp problem?" Fork
// Point was originally pitched as "rerun the real win-probability
// model from a forked point," then scoped down because no client-side
// WP model exists to re-invoke (docs/outbox/cc-session-2026-08-04-
// five-complex-prompts.md). wpEstimator.js doesn't resolve this either
// -- it needs real per-play score+inning inputs archived games don't
// carry. The actual resolution: don't rerun or approximate anything.
// This repo already has a validated method (round 3, docs/outbox/chat-
// update-2026-07-30-drama-scoring-round3.md) for reading the REAL
// recorded win probability straight from Baseball Savant for a
// completed MLB game, resolved via a real statsapi.mlb.com gamePk
// lookup. Re-confirmed against Fork Point's own real candidate pool,
// including its oldest real games (13/13, up to 73 days old --
// docs/outbox/cc-session-2026-08-05-fork-point-savant-historical-
// coverage-probe.md) before this file was written.
//
// MLB ONLY: Baseball Savant is MLB-specific. Fork Point's candidate
// pool is MLB-only today (forkPointSport in relay.js has no UI to
// change it away from 'MLB'), but this checks game.sport defensively
// rather than assuming that never changes.
//
// DIRECT client fetch, not routed through field-relay-nba:
// statsapi.mlb.com and baseballsavant.mlb.com both confirmed CORS-open
// -- the same verified basis LiveWpTicker and dramaWpMovement.js
// already rely on.
//
// Every function here returns null (never throws past its own catch,
// never fabricates a value) when a specific real game can't be
// resolved -- callers must show an honest "unavailable" state.

const gamePkCache = new Map()

async function resolveGamePk(date, home, away) {
  const key = date + '|' + home + '|' + away
  if (gamePkCache.has(key)) return gamePkCache.get(key)
  const promise = (async () => {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`)
    if (!res.ok) return null
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
  })().catch(() => null)
  gamePkCache.set(key, promise)
  return promise
}

const wpArcCache = new Map()

// Real per-play home-team win-probability array (0-100 scale -- the
// real field's own scale, confirmed live everywhere else this repo
// reads Savant; no /100 divisor applied here since this is a direct
// display curve, not the WPA-delta-sum path that needed that fix),
// sorted by atBatIndex. Returns null if this specific real game isn't
// MLB or can't be resolved/fetched.
export async function fetchRealWpArc(game) {
  if (!game) return null
  const key = game.date + '|' + game.home + '|' + game.away
  if (wpArcCache.has(key)) return wpArcCache.get(key)
  const promise = (async () => {
    if (game.sport !== 'MLB') return null
    const gamePk = await resolveGamePk(game.date, game.home, game.away)
    if (!gamePk) return null
    const res = await fetch(`https://baseballsavant.mlb.com/gf?game_pk=${gamePk}`)
    if (!res.ok) return null
    const data = await res.json()
    const arr = data?.scoreboard?.stats?.wpa?.gameWpa
    if (!Array.isArray(arr) || !arr.length) return null
    const values = [...arr]
      .sort((a, b) => (a?.atBatIndex ?? 0) - (b?.atBatIndex ?? 0))
      .map(e => Number(e?.homeTeamWinProbability))
      .filter(v => Number.isFinite(v))
    return values.length ? values : null
  })().catch(() => null)
  wpArcCache.set(key, promise)
  return promise
}
