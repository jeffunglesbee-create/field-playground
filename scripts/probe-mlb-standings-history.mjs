// Real-data check for a specific feature-viability question: can MLB
// Stats API back a "live playoff-stakes tracker using standings
// trajectories"? Two sub-questions, both testable, neither assumed:
//
// 1. Does /api/v1/standings actually return DIFFERENT results for
//    different historical `date` params, or does it silently ignore
//    the param and always return today's snapshot (the same
//    "historical as-of-date is a real, unresolved gap" problem flagged
//    for a different feature)?
// 2. What playoff-stakes fields does a standings record actually carry
//    -- gamesBack, wildCardGamesBack, eliminationNumber,
//    wildCardEliminationNumber, clinched flags, streak, division rank?
//    Shape-first: dump one real record before assuming field names.
//
// CI-AS-PROXY: statsapi.mlb.com is sandbox-blocked (confirmed
// repeatedly this session, x-deny-reason: host_not_allowed).

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/mlb-standings-history-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (research)'

async function fetchStandings(date, season) {
  const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&date=${date}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  return { data }
}

function findTeamRecord(standingsData, teamName) {
  const records = standingsData?.records ?? []
  for (const div of records) {
    const match = div.teamRecords?.find(t => (t.team?.name || '').includes(teamName))
    if (match) return { divisionId: div.division?.id, divisionRank: div.division?.abbreviation, record: match }
  }
  return null
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does statsapi.mlb.com /standings support real historical as-of-date, and what playoff-stakes fields does it carry?')
  log('')

  // ── Test 1: shape dump, current date ──
  const season = 2026
  const today = new Date().toISOString().slice(0, 10)
  const { data: todayData, err: todayErr } = await fetchStandings(today, season)
  if (todayErr) { log('FAILED at today fetch: ' + todayErr); return }

  const firstDiv = todayData?.records?.[0]
  const firstTeam = firstDiv?.teamRecords?.[0]
  log('=== RAW SHAPE (today, first division, first team) ===')
  log(JSON.stringify(firstTeam, null, 2))
  log('')
  log('divisions returned: ' + (todayData?.records?.length ?? 0))
  log('')

  // ── Test 2: does a DIFFERENT historical date param actually change the result? ──
  // Pick a team and compare its record/gamesBack/streak across three
  // real dates a month apart within the season, plus today.
  const probeTeam = firstTeam?.team?.name
  if (!probeTeam) { log('no team name found in today\'s response -- cannot run historical comparison'); return }
  log('=== TEST: does date= actually change the response? (team: ' + probeTeam + ') ===')

  const testDates = ['2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15', today]
  const rows = []
  for (const d of testDates) {
    const { data, err } = await fetchStandings(d, season)
    if (err) { log('  ' + d + ': FETCH FAILED -- ' + err); rows.push(null); await new Promise(r => setTimeout(r, 300)); continue }
    const found = findTeamRecord(data, probeTeam)
    if (!found) { log('  ' + d + ': team not found in this date\'s response'); rows.push(null); await new Promise(r => setTimeout(r, 300)); continue }
    const r = found.record
    const summary = {
      date: d,
      wins: r.wins, losses: r.losses,
      gamesBack: r.gamesBack, wildCardGamesBack: r.wildCardGamesBack,
      divisionRank: r.divisionRank, wildCardRank: r.wildCardRank,
      eliminationNumber: r.eliminationNumber, wildCardEliminationNumber: r.wildCardEliminationNumber,
      streak: r.streak?.streakCode,
      clinched: r.clinched,
    }
    rows.push(summary)
    log('  ' + d + ': ' + JSON.stringify(summary))
    await new Promise(r => setTimeout(r, 300))
  }

  log('')
  const valid = rows.filter(Boolean)
  const distinctWinLoss = new Set(valid.map(r => r.wins + '-' + r.losses)).size
  const distinctGB = new Set(valid.map(r => r.gamesBack)).size
  log('=== RESULT ===')
  log('dates successfully fetched: ' + valid.length + ' / ' + testDates.length)
  log('distinct win-loss records across dates: ' + distinctWinLoss + ' / ' + valid.length)
  log('distinct gamesBack values across dates: ' + distinctGB + ' / ' + valid.length)
  log('')

  log('=== VERDICT ===')
  if (distinctWinLoss > 1) {
    log('CONFIRMED: the date= param genuinely changes the returned standings -- real historical')
    log('as-of-date data IS available from this endpoint. This is NOT the same gap flagged for the')
    log('other feature this session -- MLB Stats API standings resolves it, at least at this')
    log('resolution (whatever real dates were tested above).')
  } else {
    log('NOT CONFIRMED: win-loss records were identical across all tested dates -- either the date=')
    log('param is being ignored (always returns current/latest standings), or these specific test')
    log('dates happened to land on identical records by coincidence. Needs closer inspection before')
    log('trusting this endpoint for a historical trajectory feature.')
  }

  // ── Test 3: what playoff-stakes fields are actually populated (not null/undefined)? ──
  log('')
  log('=== PLAYOFF-STAKES FIELD AVAILABILITY (today\'s data, all teams, all divisions) ===')
  const allTeams = (todayData?.records ?? []).flatMap(d => d.teamRecords ?? [])
  const fieldPresence = {}
  for (const t of allTeams) {
    for (const key of ['gamesBack', 'wildCardGamesBack', 'eliminationNumber', 'wildCardEliminationNumber', 'magicNumber', 'divisionRank', 'wildCardRank', 'clinched', 'streak']) {
      if (!fieldPresence[key]) fieldPresence[key] = { present: 0, total: 0, sampleValues: new Set() }
      fieldPresence[key].total++
      const v = key === 'streak' ? t.streak?.streakCode : t[key]
      if (v != null) { fieldPresence[key].present++; if (fieldPresence[key].sampleValues.size < 5) fieldPresence[key].sampleValues.add(String(v)) }
    }
  }
  for (const [key, stats] of Object.entries(fieldPresence)) {
    log(`  ${key}: present ${stats.present}/${stats.total}  sample values: ${[...stats.sampleValues].join(', ')}`)
  }
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
