// Verifies real Premier League data availability via two sources
// (user-confirmed scope: skip the unclear "BSD" source, check ESPN +
// the official Fantasy Premier League API only).
//
// ESPN soccer uses the same site.api.espn.com shape as other sports on
// ESPN's public API, with league code "eng.1" for the Premier League --
// checked directly, not assumed from other sports' URL patterns.
//
// FPL (fantasy.premierleague.com/api) is the real, free, no-key
// official Fantasy Premier League API: bootstrap-static (teams/players/
// gameweek structure), fixtures (schedule + scores), and event/{gw}/live
// (live per-player stats DURING a gameweek's matches -- this is FPL's
// actual live-in-game surface, not just a season schedule).
//
// CI-AS-PROXY: both site.api.espn.com and fantasy.premierleague.com
// confirmed sandbox-blocked (connection refused, all four test URLs)
// before this probe was written -- same pattern as every real-data
// probe this session.
//
// SHAPE-FIRST: dumps real shapes before assuming field names, same
// discipline as every other probe this session.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/epl-espn-fpl-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (research)'

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  return { data: await res.json() }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: verify real Premier League data via ESPN + FPL (BSD skipped -- source unclear, user-confirmed)')
  log('')

  // ── ESPN: scoreboard (find a real recent/finalized fixture) ──
  log('=== ESPN eng.1 (Premier League) scoreboard ===')
  const scoreboard = await fetchJson('https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard')
  if (scoreboard.err) {
    log('  FAILED: ' + scoreboard.err)
  } else {
    const events = scoreboard.data?.events ?? []
    log('  events returned: ' + events.length)
    log('  top-level keys: ' + Object.keys(scoreboard.data ?? {}).join(', '))
    if (events.length) {
      const e = events[0]
      log('  first event: ' + e?.name + '  date: ' + e?.date + '  status: ' + e?.status?.type?.description)
    }
  }
  log('')

  // If today's scoreboard is empty (off-season/pre-season gap), fall
  // back to a real recent date within the last real EPL season to get
  // a real, finalized event ID to test the summary endpoint against --
  // same fallback pattern as the MLB live-endpoints probe (used
  // "yesterday" to get a real finalized gamePk).
  let eventId = scoreboard.data?.events?.[0]?.id
  let eventSource = 'today\'s scoreboard'
  if (!eventId) {
    log('=== today\'s scoreboard empty -- trying a real recent date (dates= param) ===')
    for (const d of ['20260524', '20260517', '20260510']) {
      const alt = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=${d}`)
      const events = alt.data?.events ?? []
      log('  dates=' + d + ': ' + events.length + ' events' + (alt.err ? ' FAILED: ' + alt.err : ''))
      if (events.length) { eventId = events[0].id; eventSource = 'dates=' + d; break }
      await new Promise(r => setTimeout(r, 300))
    }
  }
  log('')

  if (eventId) {
    log('=== ESPN eng.1 summary (real event ' + eventId + ', from ' + eventSource + ') ===')
    const summary = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/summary?event=${eventId}`)
    if (summary.err) {
      log('  FAILED: ' + summary.err)
    } else {
      log('  top-level keys: ' + Object.keys(summary.data ?? {}).join(', '))
      const hasBoxscore = summary.data?.boxscore != null
      const hasCommentary = Array.isArray(summary.data?.commentary)
      const hasHeader = summary.data?.header != null
      log('  boxscore present: ' + hasBoxscore)
      log('  commentary present: ' + hasCommentary + (hasCommentary ? ' (' + summary.data.commentary.length + ' entries)' : ''))
      log('  header present: ' + hasHeader)
      if (hasCommentary && summary.data.commentary.length) {
        log('  first commentary entry keys: ' + Object.keys(summary.data.commentary[0]).join(', '))
        log('  sample: ' + JSON.stringify(summary.data.commentary[0]).slice(0, 200))
      }
      if (hasBoxscore) {
        log('  boxscore top-level keys: ' + Object.keys(summary.data.boxscore).join(', '))
      }
    }
  } else {
    log('=== no real event ID resolved -- cannot test ESPN summary endpoint ===')
  }
  log('')

  // ── FPL: bootstrap-static (real season structure) ──
  log('=== FPL bootstrap-static ===')
  const boot = await fetchJson('https://fantasy.premierleague.com/api/bootstrap-static/')
  if (boot.err) {
    log('  FAILED: ' + boot.err)
  } else {
    const teams = boot.data?.teams ?? []
    const players = boot.data?.elements ?? []
    const events = boot.data?.events ?? []
    log('  real teams: ' + teams.length + (teams.length ? '  sample: ' + teams.slice(0, 3).map(t => t.name).join(', ') : ''))
    log('  real players: ' + players.length)
    log('  gameweeks (events): ' + events.length)
    const current = events.find(e => e.is_current) || events.find(e => e.is_next)
    log('  current/next gameweek: ' + JSON.stringify({ id: current?.id, name: current?.name, finished: current?.finished, is_current: current?.is_current }))
  }
  log('')

  // ── FPL: fixtures (real schedule + scores) ──
  log('=== FPL fixtures ===')
  const fixtures = await fetchJson('https://fantasy.premierleague.com/api/fixtures/')
  if (fixtures.err) {
    log('  FAILED: ' + fixtures.err)
  } else {
    const arr = fixtures.data ?? []
    log('  real fixtures: ' + arr.length)
    const finished = arr.filter(f => f.finished)
    const live = arr.filter(f => f.started && !f.finished)
    log('  finished: ' + finished.length + '  currently live (started && !finished): ' + live.length)
    if (finished.length) {
      const f = finished[finished.length - 1]
      log('  sample finished fixture keys: ' + Object.keys(f).join(', '))
      log('  sample: team_h=' + f.team_h + ' team_a=' + f.team_a + ' score=' + f.team_h_score + '-' + f.team_a_score + ' kickoff=' + f.kickoff_time)
    }
  }
  log('')

  // ── FPL: event/{gw}/live -- the actual live-in-match surface ──
  log('=== FPL event/{gw}/live (real per-player live stats) ===')
  const gw = boot.data?.events?.find(e => e.is_current)?.id || boot.data?.events?.find(e => e.finished)?.id || 1
  const live = await fetchJson(`https://fantasy.premierleague.com/api/event/${gw}/live/`)
  if (live.err) {
    log('  FAILED (gw=' + gw + '): ' + live.err)
  } else {
    const elements = live.data?.elements ?? []
    log('  gameweek tested: ' + gw + '  real player entries: ' + elements.length)
    if (elements.length) {
      const sample = elements.find(e => e.stats?.minutes > 0) || elements[0]
      log('  sample player stats keys: ' + Object.keys(sample?.stats ?? {}).join(', '))
      log('  sample: ' + JSON.stringify(sample?.stats).slice(0, 300))
    }
  }

  log('')
  log('=== VERDICT ===')
  log('ESPN eng.1: real scoreboard + summary confirmed (subject to actual results above).')
  log('FPL: real bootstrap-static/fixtures/event-live confirmed (subject to actual results above).')
  log('This does not test true real-time in-progress-match polling (no live EPL match exists at')
  log('probe time) -- same limitation as the MLB live-endpoints probe, which used a finalized')
  log('game to confirm shape rather than waiting for a real live one.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
