// Follow-up to round 1-3 (docs/outbox/chat-update-2026-07-30-drama-scoring-
// granularity*.md). Round 1 found the continuous-formula rewrite made NO
// difference to dramaScoreLive's peak resolution (4/25 distinct either
// way) -- but round 1's old_formula/new_formula (scripts/validate-drama-
// scoring.py) both approximate wpBonus as 0, because ESPN's play-by-play
// (round 1's data source) carries no win-probability data at all.
//
// SEPARATELY this session: jubilant-bassoon's wpBonus scale bug (real
// formula, confirmed via docs/CC-CMD-2026-07-30-fix-savant-wp-scale.md --
// pre-fix wpDelta = |wpNow-wpPrev|*100 was computed on an already-0-100
// raw Savant value, so it saturated near the *1.5,25 clamp almost every
// play) shipped to production. THIS SCRIPT asks the question round 1
// couldn't: does the peak-resolution finding change once a REAL,
// correctly-scaled wpBonus term is actually included?
//
// DATA: Savant's own gameWpa array (scripts/probe-savant-wp-metrics.mjs's
// shape dump, outbox/savant-wp-metrics-2026-07-31T01-46-16-958Z.txt)
// carries WP fields + atBatIndex + half-inning string, but NO score. MLB
// Stats API's live-feed allPlays carries score + inning + atBatIndex, but
// no WP. Joined by atBatIndex (same real play in both), same as the join
// LiveWpTicker's own reconciliation gap identified this session (Task A).
//
// SAME 28-game sample as round 3 (outbox/mlb-sample-round3.json) -- reusing
// the real, already-fetched game list keeps this an apples-to-apples
// extension of round 1/round 3, not a fresh cherry-picked sample.
//
// CI-AS-PROXY: statsapi.mlb.com and baseballsavant.mlb.com are sandbox-
// blocked (confirmed: scripts/probe-savant-wp-metrics.mjs's own header,
// x-deny-reason: host_not_allowed) -- run via workflow_dispatch, same
// pattern as every other real-data probe this session.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/wpbonus-fix-resolution-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (research)'

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

async function fetchSavantWpa(gamePk) {
  const url = 'https://baseballsavant.mlb.com/gf?game_pk=' + gamePk
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'Savant HTTP ' + res.status }
  const data = await res.json()
  const arr = data?.scoreboard?.stats?.wpa?.gameWpa
  if (!Array.isArray(arr) || !arr.length) return { err: 'gameWpa empty or missing' }
  return { arr }
}

// Real MLB Stats API live feed -- same endpoint LiveWpTicker already
// fetches, but reading the FULL allPlays array (LiveWpTicker only reads
// the last one) so every atBatIndex can be joined against Savant's array.
async function fetchMlbPlays(gamePk) {
  const url = `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'MLB live feed HTTP ' + res.status }
  const data = await res.json()
  const plays = data?.liveData?.plays?.allPlays
  if (!Array.isArray(plays) || !plays.length) return { err: 'allPlays empty or missing' }
  const byAtBatIndex = new Map()
  for (const p of plays) {
    const idx = p?.about?.atBatIndex
    if (idx == null) continue
    const homeScore = p?.result?.homeScore
    const awayScore = p?.result?.awayScore
    const inning = p?.about?.inning
    if (homeScore == null || awayScore == null || inning == null) continue
    byAtBatIndex.set(idx, { homeScore, awayScore, inning })
  }
  return { byAtBatIndex }
}

// old_formula's exact base/timeBonus step functions (scripts/validate-
// drama-scoring.py, ported verbatim -- same buckets, same thresholds).
function baseTimeBonus(homeScore, awayScore, inning) {
  const diff = Math.abs(homeScore - awayScore)
  let base
  if (diff === 0) base = 1.0
  else if (diff === 1) base = 0.85
  else if (diff === 2) base = 0.55
  else if (diff <= 4) base = 0.28
  else base = 0.08

  let timeBonus
  if (inning >= 10) timeBonus = 22
  else if (inning >= 9) timeBonus = 16
  else if (inning >= 7) timeBonus = 7
  else timeBonus = 0

  return base * 100 + timeBonus
}

function tier(score) {
  if (score >= 80) return 'fire'
  if (score >= 60) return 'hot'
  if (score >= 40) return 'warm'
  return 'cold'
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does the wpBonus scale fix change dramaScoreLive peak resolution (round 1 approximated wpBonus=0)?')
  log('')

  const sample = JSON.parse(readFileSync('outbox/mlb-sample-round3.json', 'utf-8'))
  log('sample: ' + sample.length + ' real MLB games (same sample as round 3)')
  log('')

  const rows = []
  const skips = []
  let shapeLogged = false

  for (const g of sample) {
    const gamePk = await resolveGamePk(g.date, g.home, g.away)
    if (!gamePk) { skips.push(`${g.away} @ ${g.home}: no gamePk resolved`); continue }
    await new Promise(r => setTimeout(r, 250))

    const [wpaResult, playsResult] = await Promise.all([fetchSavantWpa(gamePk), fetchMlbPlays(gamePk)])
    if (wpaResult.err) { skips.push(`${g.away} @ ${g.home}: ${wpaResult.err}`); await new Promise(r => setTimeout(r, 250)); continue }
    if (playsResult.err) { skips.push(`${g.away} @ ${g.home}: ${playsResult.err}`); await new Promise(r => setTimeout(r, 250)); continue }

    const arr = wpaResult.arr
    const byAtBatIndex = playsResult.byAtBatIndex

    // Join by atBatIndex -- same real play in both real sources.
    let joined = 0, missed = 0
    let noBonusPeak = -Infinity
    let withBonusPeak = -Infinity
    let prevWp = null // fraction, 0-1, after the real /100 scale fix

    for (const e of arr) {
      const idx = e?.atBatIndex
      const state = idx != null ? byAtBatIndex.get(idx) : null
      const wpNow = Number(e?.homeTeamWinProbability) / 100 // real /100 scale fix, same as fetchSavantGameFeed
      if (!state) { missed++; if (Number.isFinite(wpNow)) prevWp = wpNow; continue }
      joined++

      const btb = baseTimeBonus(state.homeScore, state.awayScore, state.inning)
      noBonusPeak = Math.max(noBonusPeak, btb)

      // Real wpBonus formula (post-fix, docs/CC-CMD-2026-07-30-fix-savant-
      // wp-scale.md Task 2): wpDelta = |wpNow-wpPrev|*100 (percentage
      // points), wpBonus = min(wpDelta*1.5, 25). prevWp starts null on the
      // very first joined play -- treated as 0 bonus (no prior play to
      // diff against), same as dramaScoreLive would see on first read.
      const wpDelta = prevWp != null && Number.isFinite(wpNow) ? Math.abs(wpNow - prevWp) * 100 : 0
      const wpBonus = Math.min(wpDelta * 1.5, 25)
      withBonusPeak = Math.max(withBonusPeak, btb + wpBonus)

      if (Number.isFinite(wpNow)) prevWp = wpNow
    }

    if (!shapeLogged) {
      log(`=== JOIN CHECK (first real game: ${g.away} @ ${g.home}) ===`)
      log(`Savant entries: ${arr.length}  MLB allPlays w/ usable state: ${byAtBatIndex.size}  joined: ${joined}  missed: ${missed}`)
      log('')
      shapeLogged = true
    }

    if (joined === 0) { skips.push(`${g.away} @ ${g.home}: 0 atBatIndex joined`); continue }

    const noBonusPeakR = Math.round(noBonusPeak)
    const withBonusPeakR = Math.round(withBonusPeak)
    rows.push({ matchup: `${g.away} @ ${g.home}`, joined, missed, noBonusPeakR, withBonusPeakR })

    log(
      `${g.away} @ ${g.home}  joined=${joined}/${arr.length}  ` +
      `no_wpBonus_peak=${noBonusPeakR} (${tier(noBonusPeakR)})  with_wpBonus_peak=${withBonusPeakR} (${tier(withBonusPeakR)})`
    )
    await new Promise(r => setTimeout(r, 400))
  }

  log('')
  log('=== SKIPPED ===')
  for (const s of skips) log('  ' + s)

  log('')
  log('=== RESULT ===')
  log(`games joined and scored: ${rows.length} / ${sample.length}`)
  if (rows.length) {
    const noBonus = rows.map(r => r.noBonusPeakR)
    const withBonus = rows.map(r => r.withBonusPeakR)
    const tierChanges = rows.filter(r => tier(r.noBonusPeakR) !== tier(r.withBonusPeakR))
    log(`no_wpBonus  -- distinct peak values: ${new Set(noBonus).size} / ${noBonus.length}  values: ${[...new Set(noBonus)].sort((a, b) => a - b).join(',')}`)
    log(`with_wpBonus -- distinct peak values: ${new Set(withBonus).size} / ${withBonus.length}  values: ${[...new Set(withBonus)].sort((a, b) => a - b).join(',')}`)
    log(`tier changes (no_wpBonus tier != with_wpBonus tier, same game): ${tierChanges.length}`)
    for (const r of tierChanges) log(`  ${r.matchup}: ${tier(r.noBonusPeakR)} -> ${tier(r.withBonusPeakR)}`)
    log('')
    const avgJoinRate = rows.reduce((s, r) => s + r.joined / (r.joined + r.missed), 0) / rows.length
    log(`avg atBatIndex join rate: ${(avgJoinRate * 100).toFixed(1)}%`)
  } else {
    log('No games successfully joined -- cannot report a distribution.')
  }

  log('')
  log('=== VERDICT ===')
  if (rows.length) {
    const noRes = new Set(rows.map(r => r.noBonusPeakR)).size / rows.length
    const withRes = new Set(rows.map(r => r.withBonusPeakR)).size / rows.length
    log(`resolution (distinct/total): no_wpBonus ${(noRes * 100).toFixed(0)}% -> with_wpBonus ${(withRes * 100).toFixed(0)}%`)
    log('This isolates ONE question: does adding a correctly-scaled wpBonus to')
    log('a PEAK-taken formula change round 1\'s resolution finding? It does')
    log('not test round 3\'s already-confirmed alternative (summing WP')
    log('movement across the whole game, not peak) -- that finding stands')
    log('regardless of this result.')
  }
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
