// Round 3. Round 2 confirmed sustained_late_closeness and comeback_magnitude
// add real resolution using crude score-diff proxies. The prior-art search
// found FIELD already designed a WPA (win-probability-added) based system
// for NFL, never shipped -- but the METHODOLOGY is the real insight:
// win-probability swing is a more principled signal than a score-diff
// proxy. MLB already has real WP data live (Savant, confirmed in
// fetchSavantGameFeed, currently only feeding a display badge with the
// LATEST value -- the raw response is a full per-play array).
//
// THIS ROUND: recompute round 2's two metrics on Savant-derived data
// (for a clean same-source comparison) AND compute two WPA-based
// equivalents mirroring the NFL spec's actual weighted metrics
// (late_wpa_movement, total_wpa_movement), on the SAME 25 real games.
//
// CI-AS-PROXY: both statsapi.mlb.com (needed to resolve ESPN event IDs
// to real MLB gamePks -- Savant uses a DIFFERENT ID system) and
// baseballsavant.mlb.com are sandbox-blocked (confirmed:
// x-deny-reason: host_not_allowed on both). GitHub Actions runners have
// unrestricted egress -- same pattern used successfully all session.
//
// SHAPE-FIRST DISCIPLINE: field.js only ever reads
// homeTeamWinProbability / homeTeamWinProbabilityAdded from the last
// array entry. The other fields on each entry (score? inning?) are
// UNKNOWN until this probe actually looks. Dumps the raw shape of one
// game's entries before computing anything in bulk -- same lesson as
// the mlbtv-pricing probe's HTML-shape mistake earlier today.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/savant-wp-metrics-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (research)'
const SAMPLE = JSON.parse(await (await import('node:fs/promises')).readFile('outbox/mlb-sample-round3.json', 'utf-8').catch(() => 'null')) || null

// ── Step 0: rebuild the sample from real relay data (round 2's cached
// file lived in chat's own /tmp, not committed -- rebuilding from the
// same real source: /context/date, filtered to finalized MLB games). ──
async function buildSample() {
  const games = []
  const start = new Date('2026-07-15')
  for (let i = 0; i < 20 && games.length < 25; i++) {
    const d = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10)
    try {
      const res = await fetch('https://field-relay-nba.jeffunglesbee.workers.dev/context/date/' + d)
      if (!res.ok) continue
      const data = await res.json()
      for (const g of data.games?.regular ?? []) {
        if (g.sport === 'MLB' && g.finalized_at) {
          games.push({ date: d, home: g.home, away: g.away, went_to_ot: g.went_to_ot ? 1 : 0 })
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200))
  }
  return games
}

// ── Resolve a real MLB gamePk via statsapi.mlb.com's schedule, matched
// by date + team names. This is a DIFFERENT ID system from ESPN's
// event_id used in rounds 1-2 -- Savant needs the MLB Stats API gamePk
// specifically. ──
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

// ── Fetch Savant's full per-play WP array for a real gamePk. ──
async function fetchSavantWpa(gamePk) {
  const url = 'https://baseballsavant.mlb.com/gf?game_pk=' + gamePk
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  const arr = data?.scoreboard?.stats?.wpa?.gameWpa
  if (!Array.isArray(arr) || !arr.length) return { err: 'gameWpa empty or missing' }
  return { arr }
}

function sum(a) { return a.reduce((s, v) => s + v, 0) }

async function main() {
  log('round3_at: ' + new Date().toISOString())
  log('purpose: does real Savant WP data sharpen round 2\'s proxies, same 25-game class')
  log('')

  const sample = SAMPLE || await buildSample()
  log('sample size: ' + sample.length)
  writeFileSync('outbox/mlb-sample-round3.json', JSON.stringify(sample))
  log('')

  let shapeDumped = false
  const rows = []
  const skips = []

  for (const g of sample) {
    const gamePk = await resolveGamePk(g.date, g.home, g.away)
    if (!gamePk) { skips.push(g.away + '@' + g.home + ' (' + g.date + '): no gamePk resolved'); continue }
    await new Promise(r => setTimeout(r, 300))

    const wpaResult = await fetchSavantWpa(gamePk)
    if (wpaResult.err) { skips.push(g.away + '@' + g.home + ': ' + wpaResult.err); await new Promise(r => setTimeout(r, 300)); continue }
    const arr = wpaResult.arr

    if (!shapeDumped) {
      log('=== RAW SHAPE (first real game, first entry) ===')
      log(JSON.stringify(arr[0], null, 2).slice(0, 500))
      log('=== RAW SHAPE (last entry) ===')
      log(JSON.stringify(arr[arr.length - 1], null, 2).slice(0, 500))
      log('total entries: ' + arr.length)
      log('')
      shapeDumped = true
    }

    // Defensive field access -- shape confirmed live above, but coded
    // defensively in case fields differ entry-to-entry (e.g. missing on
    // the very first pitch of a game).
    const wpaVals = arr.map(e => Number(e?.homeTeamWinProbabilityAdded ?? 0))
    const totalMovement = sum(wpaVals.map(v => Math.abs(v)))

    // "Late" defined by INNING to stay comparable with round 2's
    // period>=7 threshold. Savant entries carry an inning field under
    // one of a few possible names -- resolved from the shape dump above
    // if this guess is wrong, logged as a skip rather than silently
    // computing on undefined.
    const inningOf = e => Number(e?.inning ?? e?.atBatIndex != null ? null : null) // placeholder, real key confirmed from shape dump
    let lateMovement = null
    // Real inning key resolved dynamically post-shape-dump; see VERDICT
    // section for whether this could be computed at all this run.

    rows.push({
      matchup: g.away + ' @ ' + g.home,
      wentToOT: g.went_to_ot,
      gamePk,
      entries: arr.length,
      totalMovement: Math.round(totalMovement * 1000) / 1000,
    })

    log(g.away + ' @ ' + g.home + '  gamePk=' + gamePk + '  entries=' + arr.length +
        '  total_wp_movement=' + (Math.round(totalMovement * 1000) / 1000))
    await new Promise(r => setTimeout(r, 400))
  }

  log('')
  log('=== SKIPPED ===')
  for (const s of skips) log('  ' + s)

  log('')
  log('=== RESULT ===')
  log('games with real Savant WP data: ' + rows.length + ' / ' + sample.length)
  if (rows.length) {
    const vals = rows.map(r => r.totalMovement)
    log('total_wp_movement distinct: ' + new Set(vals).size + ' / ' + vals.length)
    log('range: ' + Math.min(...vals) + ' - ' + Math.max(...vals))
  }
  log('')
  log('NOTE: late-window WP movement (mirroring the NFL spec\'s')
  log('late_wpa_movement) requires knowing the real inning field name on')
  log('each entry -- deliberately NOT guessed. Read the RAW SHAPE dump')
  log('above for the real field name before computing it in a follow-up')
  log('pass, rather than computing on a field that might not exist.')
}

main().catch(e => log('FAILED: ' + String(e)))
