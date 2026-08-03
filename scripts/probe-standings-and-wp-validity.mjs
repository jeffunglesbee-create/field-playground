// Continuing docs/GROUND-UP-DESIGN.md principle 10 across the other
// real, shipped fields this repo depends on -- checking the exact
// contracts already implied by consuming code, not an invented bound:
//
//   1. MLB standings (StandingRoom's mlbTeamState, src/components/
//      StandingRoom/index.jsx:99-107): `gamesBack`/`wildCardGamesBack`
//      are assumed to be either the literal string '-' or a string
//      parseFloat can turn into a valid, non-negative number --
//      otherwise NaN propagates silently into `urgency` math and the
//      UI shows "NaN GB". `divisionRank` is assumed parseInt-able.
//   2. Savant win probability (LiveWpTicker's joinSamePlay/
//      latestSavantWp, src/components/LiveWpTicker/index.jsx): raw
//      `homeTeamWinProbability` is divided by 100 and used AS a
//      probability -- must land in [0, 1] after scaling, a real
//      mathematical constraint, not a guess.
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev,
// statsapi.mlb.com, and baseballsavant.mlb.com are all sandbox-blocked
// from chat.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/standings-and-wp-validity-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

// --- Part 1: MLB standings field validity ---
async function checkStandings() {
  log('=== PART 1: MLB standings field validity ===')
  const dates = ['2026-08-03', '2026-08-01', '2026-07-28']
  let teamsChecked = 0
  const violations = []

  for (const date of dates) {
    const res = await fetch(RELAY_BASE + '/mlb-stats/standings?leagueId=103,104&season=2026&date=' + date)
    if (!res.ok) { log(date + ': HTTP ' + res.status); continue }
    const data = await res.json()
    const records = data?.records ?? data ?? []
    const teams = Array.isArray(records)
      ? records.flatMap(r => r.teamRecords ?? [])
      : []
    log(date + ': ' + teams.length + ' real team records')

    for (const t of teams) {
      teamsChecked++
      const name = t.team?.name ?? t.teamName ?? 'unknown'

      for (const field of ['gamesBack', 'wildCardGamesBack']) {
        const v = t[field]
        if (v === '-' || v === undefined || v === null) continue
        const parsed = parseFloat(v)
        if (!Number.isFinite(parsed) || parsed < 0) {
          violations.push({ date, team: name, field, value: v, parsed })
        }
      }

      const rank = parseInt(t.divisionRank, 10)
      if (t.divisionRank != null && (!Number.isFinite(rank) || rank < 1)) {
        violations.push({ date, team: name, field: 'divisionRank', value: t.divisionRank, parsed: rank })
      }
    }
    await new Promise(r => setTimeout(r, 300))
  }

  log('teams checked: ' + teamsChecked)
  if (!violations.length) {
    log('NONE -- every gamesBack/wildCardGamesBack/divisionRank checked is either "-" or a valid, sane value.')
  } else {
    log('FOUND ' + violations.length + ' violations:')
    for (const v of violations) log('  ' + JSON.stringify(v))
  }
  log('')
}

// --- Part 2: Savant win probability bound ---
async function resolveGamePk(date, home, away) {
  const url = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=' + date
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
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
}

async function checkSavantWp() {
  log('=== PART 2: Savant win probability bound (must be in [0,1] after /100) ===')
  const res = await fetch(RELAY_BASE + '/archive/drama/leaderboard?sport=MLB&limit=8')
  if (!res.ok) { log('leaderboard fetch failed: HTTP ' + res.status); return }
  const data = await res.json()
  const games = data?.games ?? []

  let gamesChecked = 0
  let entriesChecked = 0
  const violations = []

  for (const g of games) {
    if (!g.date) continue
    const pk = await resolveGamePk(g.date, g.home, g.away)
    if (!pk) { log('SKIP ' + g.away + ' @ ' + g.home + ': no gamePk resolved'); continue }
    await new Promise(r => setTimeout(r, 300))

    const wpRes = await fetch('https://baseballsavant.mlb.com/gf?game_pk=' + pk, { headers: { 'User-Agent': UA } })
    if (!wpRes.ok) { log('SKIP ' + g.away + ' @ ' + g.home + ': Savant HTTP ' + wpRes.status); continue }
    const wpData = await wpRes.json()
    const arr = wpData?.scoreboard?.stats?.wpa?.gameWpa
    if (!Array.isArray(arr) || !arr.length) { log('SKIP ' + g.away + ' @ ' + g.home + ': gameWpa empty'); continue }

    gamesChecked++
    for (const e of arr) {
      const raw = Number(e?.homeTeamWinProbability)
      if (!Number.isFinite(raw)) continue
      entriesChecked++
      const scaled = raw / 100
      if (scaled < 0 || scaled > 1) {
        violations.push({ matchup: g.away + ' @ ' + g.home, atBatIndex: e.atBatIndex, raw, scaled })
      }
    }
    log(g.away + ' @ ' + g.home + ': ' + arr.length + ' real WP entries checked')
    await new Promise(r => setTimeout(r, 400))
  }

  log('')
  log('games checked: ' + gamesChecked + '  total WP entries checked: ' + entriesChecked)
  if (!violations.length) {
    log('NONE -- every real homeTeamWinProbability entry, scaled /100, fell within [0, 1].')
  } else {
    log('FOUND ' + violations.length + ' violations:')
    for (const v of violations.slice(0, 20)) log('  ' + JSON.stringify(v))
  }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  await checkStandings()
  await checkSavantWp()
}

main().catch(e => log('FAILED: ' + String(e)))
