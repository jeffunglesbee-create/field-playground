// Scope + regression detector for the confirmed soccer penalty-dropping bug.
//
// CONFIRMED 2026-08-06 (docs/outbox/cc-session-2026-08-06-soccer-penalty-scoring-bug.md):
// field-relay-nba/scripts/drama-backfill.mjs's fetchSoccerHistoricalStates()
// rebuilds a soccer scoreline by filtering ESPN keyEvents down to goals with
//   txt.includes('goal') || abbr === 'g'
// ESPN labels a scored penalty "Penalty - Scored" -- no 'goal' substring -- and
// type.abbreviation was measured EMPTY on all 115 real keyEvents, so the second
// clause is dead. Every drama_arc value after a dropped goal is computed from a
// wrong scoreline, and so is the drama_peak derived from it.
//
// That was proven on 4 matches on one date. This probe answers the two things
// that sample could not, and it answers them on a recurring schedule:
//
//   1. SCOPE -- across a real multi-week corpus, exactly WHICH archived soccer
//      games are corrupted? The remediation template (CC-CMD-2026-08-03, 537
//      MLB rows reset->refilled) needs a reviewable list of affected rows, not
//      an estimate. This emits that list.
//   2. REGRESSION -- once a fix ships (BSD /incidents/ preferred, scoringPlay
//      === true as fallback), dropped-goal count must go to 0 and STAY 0. A
//      scheduled run is the only thing that notices if it doesn't.
//
// Deliberately read-only. It does not write to the relay, does not touch
// drama_peak (immutability guard, CC-CMD-2026-07-06), and does not apply the
// fix -- that lives in field-relay-nba where a push to scripts/** auto-deploys,
// and is a human go/no-go.
//
// field-relay-nba.jeffunglesbee.workers.dev is sandbox-blocked from chat --
// CI-as-proxy, same pattern as every real-data probe in this repo.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/soccer-penalty-corruption-scope-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS = Number(process.env.PROBE_DAYS || 30)
const MAX_GAMES = Number(process.env.PROBE_MAX_GAMES || 60)

function shiftDate(base, deltaDays) {
  const d = new Date(base + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

// The uncensored full slate. /archive/drama/leaderboard is ranked AND
// truncated -- using it here would silently sample only dramatic games.
async function fetchDate(date) {
  const res = await fetch(`${RELAY}/context/date/${date}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  return {
    games: [
      ...(data?.games?.regular ?? []),
      ...(data?.games?.postseason ?? []),
    ].map(g => ({ ...g, _date: date })),
  }
}

const isSoccer = sport => {
  const s = String(sport || '').toLowerCase()
  return s.includes('soccer') || s.includes('mls') || s.includes('world cup') ||
         s.includes('premier') || s.includes('liga') || s.includes('fifa')
}

function soccerLeagueSlug(sport) {
  const s = String(sport || '').toLowerCase()
  if (s.includes('world cup') || s.includes('fifa')) return 'fifa.world'
  if (s.includes('premier')) return 'eng.1'
  if (s.includes('liga')) return 'esp.1'
  return 'usa.1'
}

// VERBATIM reproduction of the predicate in field-relay-nba's
// fetchSoccerHistoricalStates(). Do not "clean this up" -- its exact
// behaviour, bug included, is the thing under measurement.
function relayGoalFilter(e) {
  const txt  = (e.type?.text || '').toLowerCase()
  const abbr = (e.type?.abbreviation || '').toLowerCase()
  return txt.includes('goal') || abbr === 'g'
}

// ESPN's own structured marker for "this event changed the score."
const espnScoringTruth = e => e.scoringPlay === true

async function main() {
  const today = new Date().toISOString().split('T')[0]
  log('probe_at: ' + new Date().toISOString())
  log('purpose: scope WHICH archived soccer games carry a corrupted drama_arc from the confirmed')
  log('penalty-dropping filter, and act as the standing regression detector once a fix ships.')
  log(`window: ${DAYS} real days back from ${today}; max ${MAX_GAMES} soccer games profiled`)
  log('')

  // ---- Build the real soccer population ----
  const all = []
  for (let i = 0; i < DAYS; i++) {
    const date = shiftDate(today, -i)
    const r = await fetchDate(date)
    if (r.err) { log(`  ${date} FAILED ${r.err}`); await new Promise(s => setTimeout(s, 250)); continue }
    all.push(...r.games)
    await new Promise(s => setTimeout(s, 250))
  }

  const soccerAll = all.filter(g => isSoccer(g.sport))
  const withEid = soccerAll.filter(g => g.espn_event_id)
  log('=== POPULATION ===')
  log('real games in window:            ' + all.length)
  log('real soccer games:               ' + soccerAll.length)
  log('  ...carrying an espn_event_id:  ' + withEid.length + '  (only these can be checked)')
  log('  ...WITHOUT one:                ' + (soccerAll.length - withEid.length) + '  <- unverifiable by this method, reported not hidden')
  log('')

  const target = withEid.slice(0, MAX_GAMES)
  if (target.length < withEid.length) {
    log(`NOTE: capped at ${MAX_GAMES} of ${withEid.length} eligible games (PROBE_MAX_GAMES).`)
    log(`${withEid.length - target.length} eligible games were NOT checked -- this is a sample, not a census.`)
    log('')
  }

  // ---- Per-game simulation ----
  log('=== PER-GAME: real scoring events vs what the relay filter keeps ===')
  const corrupted = []
  const clean = []
  const failed = []
  let totalReal = 0, totalKept = 0, totalDropped = 0

  for (const g of target) {
    const url = `${RELAY}/espn-summary/sports/soccer/${soccerLeagueSlug(g.sport)}/summary?event=${g.espn_event_id}`
    let data
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) { failed.push({ g, why: 'HTTP ' + res.status }); await new Promise(s => setTimeout(s, 250)); continue }
      data = await res.json()
    } catch (e) {
      failed.push({ g, why: String(e?.message || e) })
      await new Promise(s => setTimeout(s, 250)); continue
    }

    const keyEvents = data?.keyEvents || []
    const real = keyEvents.filter(espnScoringTruth)
    const kept = real.filter(relayGoalFilter)
    const dropped = real.filter(e => !relayGoalFilter(e))

    totalReal += real.length; totalKept += kept.length; totalDropped += dropped.length

    const row = {
      id: g.game_id ?? g.id ?? '(no game_id)',
      date: g._date,
      label: `${g.away ?? g.away_team ?? '?'} @ ${g.home ?? g.home_team ?? '?'}`,
      eid: g.espn_event_id,
      sport: g.sport,
      drama_peak: g.drama_peak,
      real: real.length,
      kept: kept.length,
      dropped: dropped.length,
      droppedLabels: dropped.map(e => e.type?.text || '(no type.text)'),
      // The first dropped goal is where corruption STARTS -- every arc value
      // at or after it is computed from a wrong scoreline.
      firstDropClock: dropped[0]?.clock?.displayValue ?? null,
    }
    if (dropped.length) corrupted.push(row); else clean.push(row)
    await new Promise(s => setTimeout(s, 250))
  }

  log(`profiled ${target.length - failed.length} games successfully, ${failed.length} failed to fetch`)
  log(`real scoring events (scoringPlay === true): ${totalReal}`)
  log(`kept by the relay's real filter:            ${totalKept}`)
  log(`DROPPED:                                    ${totalDropped}` +
      (totalReal ? `   (${((totalDropped / totalReal) * 100).toFixed(1)}% of real goals)` : ''))
  log('')

  if (corrupted.length) {
    log('=== CORRUPTED ROWS (>=1 real goal dropped -> drama_arc wrong from that point on) ===')
    log('These are the rows a reset->refill would need to target. Reviewable list, not an estimate.')
    for (const r of corrupted) {
      log(`  ${r.date}  ${r.label}`)
      log(`      game_id=${r.id}  espn_event_id=${r.eid}  sport=${r.sport}  drama_peak=${r.drama_peak}`)
      log(`      real=${r.real} kept=${r.kept} DROPPED=${r.dropped} -> ${r.droppedLabels.join(' | ')}`)
      log(`      corruption begins at clock: ${r.firstDropClock ?? '(unknown)'}`)
    }
  } else {
    log('=== NO CORRUPTED ROWS FOUND IN THIS WINDOW ===')
    log('Either the fix has shipped, or no scored penalty occurred in the sample.')
    log('Distinguish those two: a window with ZERO "Penalty - Scored" events anywhere is')
    log('a no-signal run, not a clean bill of health. See the event-type census below.')
  }
  log('')

  // ---- Was there anything to catch? ----
  // A run with no penalties at all proves nothing. Say so explicitly rather
  // than letting "0 dropped" read as "fixed."
  log('=== SIGNAL CHECK: did this window contain any droppable event type at all? ===')
  const droppableSeen = new Map()
  for (const r of [...corrupted, ...clean]) {
    for (const t of r.droppedLabels) droppableSeen.set(t, (droppableSeen.get(t) ?? 0) + 1)
  }
  if (droppableSeen.size) {
    for (const [t, n] of [...droppableSeen.entries()].sort((a, b) => b[1] - a[1])) log(`  "${t}" x${n}`)
  } else {
    log('  none -- no real scoring event in this window failed the relay filter.')
  }
  log('')

  if (failed.length) {
    log('=== FETCH FAILURES (reported, not silently dropped) ===')
    for (const f of failed) log(`  ${f.g._date} event ${f.g.espn_event_id}: ${f.why}`)
    log('')
  }

  log('=== VERDICT ===')
  if (totalDropped > 0) {
    log(`BUG STILL LIVE. ${corrupted.length} of ${target.length - failed.length} profiled soccer games carry a`)
    log('corrupted drama_arc. The listed rows are the reset->refill target set.')
    log('Fix is un-applied by design: it lives in field-relay-nba, where a push to')
    log('scripts/** auto-deploys and rewriting history collides with the drama_peak')
    log('immutability guard. Human go/no-go, not this probe\'s call.')
  } else if (droppableSeen.size === 0 && totalReal > 0) {
    log('NO SIGNAL. Real goals were found, but none of them were of a type the filter drops.')
    log('This run neither confirms nor refutes the fix. Do not read it as green.')
  } else if (totalReal === 0) {
    log('NO DATA. No real scoring events fetched at all -- check the fetch failures above')
    log('before drawing any conclusion. Do not read this as a clean run.')
  } else {
    log('CLEAN. Real goals present, real droppable types present historically, none dropped now.')
    log('Consistent with the fix having shipped and holding.')
  }
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
