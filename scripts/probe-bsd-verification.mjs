// Independent re-verification of the BSD findings a concurrent session
// reported building BsdXgPanel around (per user-provided chat
// screenshots, not itself verifiable evidence on its own -- re-checked
// here with fresh real data before trusting it):
//   1. /bsd/events/season's season= param does not filter (claimed:
//      identical result counts across season values).
//   2. /bsd/events/by-date's date= param does not reliably filter
//      (claimed: a July 25 request returned a November-dated match).
//   3. Direct event-ID lookup (/bsd/events/{id}/shotmap) IS reliable.
//
// All three routed through field-relay-nba (not a direct external
// host) -- confirmed sandbox-blocked by direct curl before writing
// this (http_code=000 on /health). CI-as-proxy, same pattern as every
// real-data probe this session.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/bsd-verification-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const UA = 'field-playground-probe/1.0 (research)'

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  return { data: await res.json() }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: independently re-verify BSD claims (season= / date= broken, event-ID reliable) before trusting a chat-reported finding')
  log('')

  // ── Claim 1: season= doesn't filter ──
  log('=== TEST 1: does /bsd/events/season season= actually filter? ===')
  const seasons = ['2023', '2024', '2025']
  const rows = []
  for (const s of seasons) {
    const { data, err } = await fetchJson(`${RELAY}/bsd/events/season?league_id=1&season=${s}&limit=10&offset=0`)
    if (err) { log('  season=' + s + ': FAILED -- ' + err); rows.push(null); continue }
    const results = data?.results ?? []
    const firstDates = results.slice(0, 3).map(r => r.date || r.kickoff_time || r.event_date).join(', ')
    rows.push({ season: s, count: results.length, firstDates })
    log('  season=' + s + ': count=' + results.length + '  first dates: ' + firstDates)
    await new Promise(r => setTimeout(r, 300))
  }
  const validRows = rows.filter(Boolean)
  const distinctCounts = new Set(validRows.map(r => r.count)).size
  const distinctFirstDates = new Set(validRows.map(r => r.firstDates)).size
  log('  distinct result counts across seasons: ' + distinctCounts + ' / ' + validRows.length)
  log('  distinct first-page date sets across seasons: ' + distinctFirstDates + ' / ' + validRows.length)
  log('')

  // ── Claim 2: date= doesn't reliably filter ──
  log('=== TEST 2: does /bsd/events/by-date date= return the requested date? ===')
  const testDate = '2026-07-25'
  const { data: byDateData, err: byDateErr } = await fetchJson(`${RELAY}/bsd/events/by-date?date=${testDate}&league_id=1`)
  if (byDateErr) {
    log('  FAILED: ' + byDateErr)
  } else {
    const results = byDateData?.results ?? byDateData ?? []
    const arr = Array.isArray(results) ? results : []
    log('  requested date=' + testDate + '  results: ' + arr.length)
    if (arr.length) {
      const returnedDates = arr.slice(0, 5).map(r => r.date || r.kickoff_time || r.event_date)
      log('  actual dates returned: ' + returnedDates.join(', '))
      const allMatchRequested = returnedDates.every(d => String(d).startsWith(testDate))
      log('  all returned dates match the requested date: ' + allMatchRequested)
    }
  }
  log('')

  // ── Claim 3: direct event-ID lookup is reliable (use event 209914, the ID BsdXgPanel's own commit history cites as confirmed) ──
  log('=== TEST 3: does direct event-ID lookup work? (event 209914, cited as confirmed in prior work) ===')
  const { data: shotmapData, err: shotmapErr } = await fetchJson(`${RELAY}/bsd/events/209914/shotmap`)
  if (shotmapErr) {
    log('  FAILED: ' + shotmapErr)
  } else {
    log('  top-level keys: ' + Object.keys(shotmapData ?? {}).join(', '))
    log('  stats present: ' + (shotmapData?.stats != null))
    if (shotmapData?.stats) {
      log('  stats keys: ' + Object.keys(shotmapData.stats).join(', '))
    }
  }

  log('')
  log('=== VERDICT ===')
  log('season= filtering: ' + (distinctCounts <= 1 ? 'CONFIRMED BROKEN (all season values returned the same count)' : 'appears to filter (distinct counts found) -- does NOT match the reported finding, worth re-checking'))
  log('date= filtering: see TEST 2 above for whether returned dates actually matched the request')
  log('event-ID lookup: ' + (shotmapErr ? 'FAILED to reproduce -- ' + shotmapErr : 'reproduced successfully, real data returned'))
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
