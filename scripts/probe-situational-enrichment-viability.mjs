// Can non-MLB sports get a real situational-bonus term in the relay's
// drama scoring -- and if so, from which REAL fields?
//
// WHY THIS EXISTS (measured, not assumed). The 2026-08-06 hygiene probe
// found a stark real cross-sport gap in drama_peak resolution over a real
// 30-day corpus:
//     MLB              312 games, 28 distinct values, range 0-100
//     WNBA              73 games,  7 distinct values, range 52-74
//     FIFA World Cup    59 games,  7 distinct values, range 52-78
//     golf / PGA Tour   26 games,  1 distinct value  (all exactly 0)
//
// Reading field-relay-nba/scripts/drama-backfill.mjs explains it exactly:
// dramaScoreLive() computes `base * 52 + timeBonus + sitBonus + upsetBonus`,
// and ONLY the MLB branch has a real sitBonus -- five situational rules
// reading onFirst/onSecond/onThird, outs, balls, strikes, RISP. The WNBA
// and AFL branches have no situational term at all; soccer has a single
// +8 for stoppage time. With only 4-5 discrete `base` values and few
// bonus levels, those sports mathematically CANNOT produce many distinct
// scores. That is a scoring-model gap in code this project controls, not
// an external data limitation -- which is what makes it worth probing.
//
// THE ACTUAL QUESTION: fetchWNBAHistoricalStates() currently keeps only
// FOUR fields per play -- homeScore, awayScore, period, clock -- and
// discards the rest of each real ESPN play object. Is there anything else
// real in there that could support a situational term? Same question for
// the soccer fetcher (where red cards and penalties would be genuinely
// dramatic and are currently ignored entirely).
//
// This probe does NOT design a scoring change. It answers only: what real
// fields actually exist in the real ESPN play objects, with what real
// fill rates. Designing a bonus on fields that turn out to be absent or
// mostly-null is exactly the mistake this repo keeps writing probes to
// avoid.
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is sandbox-blocked
// from chat -- same pattern as every prior probe this session.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/situational-enrichment-viability-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY = 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS_BACK = 14
const MAX_GAMES_PER_SPORT = 4

function shiftDate(base, d) {
  const x = new Date(base + 'T00:00:00Z')
  x.setUTCDate(x.getUTCDate() + d)
  return x.toISOString().split('T')[0]
}

// Find real recent games per sport, with their real espn_event_id -- the
// same join key drama-backfill.mjs itself uses.
async function findGames() {
  const today = new Date().toISOString().split('T')[0]
  const found = { wnba: [], soccer: [] }
  for (let i = 0; i < DAYS_BACK; i++) {
    const date = shiftDate(today, -i)
    const res = await fetch(`${RELAY}/context/date/${date}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) { await new Promise(s => setTimeout(s, 200)); continue }
    const data = await res.json()
    const games = [...(data?.games?.regular ?? []), ...(data?.games?.postseason ?? [])]
    for (const g of games) {
      const sport = String(g.sport ?? '').toLowerCase()
      const eid = g.espn_event_id ?? g.espnEventId ?? g.espn_id
      if (!eid) continue
      if (sport === 'wnba' && found.wnba.length < MAX_GAMES_PER_SPORT) found.wnba.push({ ...g, eid, date })
      const isSoccer = sport.includes('mls') || sport.includes('fifa') || sport.includes('world cup')
      if (isSoccer && found.soccer.length < MAX_GAMES_PER_SPORT) found.soccer.push({ ...g, eid, date, sport })
    }
    if (found.wnba.length >= MAX_GAMES_PER_SPORT && found.soccer.length >= MAX_GAMES_PER_SPORT) break
    await new Promise(s => setTimeout(s, 200))
  }
  return found
}

function soccerLeagueSlug(sport) {
  const s = (sport || '').toLowerCase()
  if (s.includes('mls')) return 'usa.1'
  if (s.includes('fifa') || s.includes('world cup')) return 'fifa.world'
  return 'usa.1'
}

// Union of every real key seen across real play objects, with real fill
// rates -- fill rate is the point, since a field present but null on 98%
// of plays cannot carry a bonus.
function profilePlays(plays) {
  const keyStats = new Map()
  for (const p of plays) {
    for (const [k, v] of Object.entries(p ?? {})) {
      if (!keyStats.has(k)) keyStats.set(k, { present: 0, nonNull: 0, truthy: 0, samples: new Set() })
      const e = keyStats.get(k)
      e.present++
      if (v !== null && v !== undefined) e.nonNull++
      if (v === true) e.truthy++
      if (e.samples.size < 5 && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
        e.samples.add(String(v).slice(0, 40))
      }
    }
  }
  return keyStats
}

// CORRECTED 2026-08-06 after run #1. Run #1 profiled `data.plays` for BOTH
// sports and reported "0 real plays" for all 4 real MLS games -- which was a
// bug in THIS PROBE, not a finding about the data. The relay's own
// fetchSoccerHistoricalStates() does not read `data.plays` at all; it reads
// `data.keyEvents`, filtered down to goal-type events only. So soccer had to
// be profiled against keyEvents to mean anything. This also sharpens the real
// question for soccer: the fetcher deliberately keeps ONLY goals and discards
// every other key event -- cards, penalties, substitutions -- so the type
// distribution below is the actual inventory of what is being thrown away.
async function profileSoccerKeyEvents(games) {
  log('')
  log('=== SOCCER — real ESPN keyEvents (relay keeps ONLY goal-type events) ===')
  if (!games.length) { log('no real soccer games with an espn_event_id found -- cannot profile.'); return }
  let totalEvents = 0
  const merged = new Map()
  const typeCounts = new Map()
  for (const g of games) {
    const res = await fetch(`${RELAY}/espn-summary/sports/soccer/${soccerLeagueSlug(g.sport)}/summary?event=${g.eid}`, { headers: { 'User-Agent': UA } })
    if (!res.ok) { log(`  ${g.date} ${g.away} @ ${g.home} (event ${g.eid}) -> HTTP ${res.status}`); await new Promise(s => setTimeout(s, 300)); continue }
    const data = await res.json()
    const keyEvents = data.keyEvents || []
    const plays = data.plays || []
    log(`  ${g.date} ${g.away} @ ${g.home} (event ${g.eid}) -> ${keyEvents.length} real keyEvents  (plays: ${plays.length}, confirming the relay's choice of keyEvents)`)
    totalEvents += keyEvents.length
    for (const e of keyEvents) {
      const t = e?.type?.text ?? e?.type?.abbreviation ?? '(no type)'
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
    }
    const stats = profilePlays(keyEvents)
    for (const [k, e] of stats.entries()) {
      if (!merged.has(k)) merged.set(k, { present: 0, nonNull: 0, truthy: 0, samples: new Set() })
      const m = merged.get(k)
      m.present += e.present; m.nonNull += e.nonNull; m.truthy += e.truthy
      for (const s of e.samples) if (m.samples.size < 5) m.samples.add(s)
    }
    await new Promise(s => setTimeout(s, 400))
  }
  if (!totalEvents) { log('  no real keyEvents returned -- nothing to profile.'); return }
  log('')
  log(`  real keyEvent TYPE distribution across ${totalEvents} real events -- this is the`)
  log('  inventory of what the goal-only filter currently discards:')
  for (const [t, n] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const isGoal = /goal/i.test(t)
    log(`    ${t.padEnd(28)} ${String(n).padStart(4)}  ${isGoal ? '<- KEPT today' : '<- DISCARDED today'}`)
  }
  log('')
  log(`  real keyEvent fields across ${totalEvents} real events:`)
  log('  field                     present   non-null   true   sample values')
  for (const [k, e] of [...merged.entries()].sort((a, b) => b[1].nonNull - a[1].nonNull)) {
    const fill = ((e.nonNull / totalEvents) * 100).toFixed(0) + '%'
    log(`  ${k.padEnd(24)} ${String(e.present).padStart(6)}  ${String(e.nonNull).padStart(6)} (${fill.padStart(4)}) ${String(e.truthy || '-').padStart(5)}   ${[...e.samples].join(' | ').slice(0, 70)}`)
  }
}

async function profileSport(label, url, games) {
  log('')
  log('=== ' + label + ' ===')
  if (!games.length) { log('no real games with an espn_event_id found in the window -- cannot profile.'); return }
  let totalPlays = 0
  const merged = new Map()
  for (const g of games) {
    const u = url(g)
    const res = await fetch(u, { headers: { 'User-Agent': UA } })
    if (!res.ok) { log(`  ${g.date} ${g.away} @ ${g.home} (event ${g.eid}) -> HTTP ${res.status}`); await new Promise(s => setTimeout(s, 300)); continue }
    const data = await res.json()
    const plays = data.plays || []
    log(`  ${g.date} ${g.away} @ ${g.home} (event ${g.eid}) -> ${plays.length} real plays`)
    totalPlays += plays.length
    const stats = profilePlays(plays)
    for (const [k, e] of stats.entries()) {
      if (!merged.has(k)) merged.set(k, { present: 0, nonNull: 0, truthy: 0, samples: new Set() })
      const m = merged.get(k)
      m.present += e.present; m.nonNull += e.nonNull; m.truthy += e.truthy
      for (const s of e.samples) if (m.samples.size < 5) m.samples.add(s)
    }
    await new Promise(s => setTimeout(s, 400))
  }
  if (!totalPlays) { log('  no real plays returned -- nothing to profile.'); return }
  log('')
  log(`  real play-object fields across ${totalPlays} real plays:`)
  log('  field                     present   non-null   true   sample values')
  const rows = [...merged.entries()].sort((a, b) => b[1].nonNull - a[1].nonNull)
  for (const [k, e] of rows) {
    const fill = ((e.nonNull / totalPlays) * 100).toFixed(0) + '%'
    const tr = e.truthy ? String(e.truthy) : '-'
    log(`  ${k.padEnd(24)} ${String(e.present).padStart(6)}  ${String(e.nonNull).padStart(6)} (${fill.padStart(4)}) ${String(tr).padStart(5)}   ${[...e.samples].join(' | ').slice(0, 70)}`)
  }
  // What the relay currently keeps, vs what exists.
  const kept = ['homeScore', 'awayScore', 'period', 'clock']
  const unused = rows.map(([k]) => k).filter(k => !kept.includes(k))
  log('')
  log('  currently KEPT by the relay fetcher: ' + kept.join(', '))
  log('  real fields currently DISCARDED: ' + (unused.length ? unused.join(', ') : '(none)'))
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: do real ESPN play objects for WNBA/soccer carry anything that could support a')
  log('real situational-bonus term, the way MLB\'s bases/outs/count already do? Fields + fill rates only.')
  log('')
  log('measured context (2026-08-06 hygiene probe, real 30-day corpus):')
  log('  MLB 312 games / 28 distinct drama_peak | WNBA 73 / 7 | FIFA WC 59 / 7 | golf 26 / 1 (all 0)')
  log('cause (field-relay-nba/scripts/drama-backfill.mjs): only the MLB branch of dramaScoreLive()')
  log('has a real sitBonus; WNBA/AFL have none, soccer has a single +8 for stoppage time.')

  const found = await findGames()
  log('')
  log('real games located: wnba=' + found.wnba.length + '  soccer=' + found.soccer.length)

  await profileSport(
    'WNBA — real ESPN play objects (fetcher keeps only 4 of these fields)',
    g => `${RELAY}/espn-summary/sports/basketball/wnba/summary?event=${g.eid}`,
    found.wnba
  )
  await profileSoccerKeyEvents(found.soccer)

  log('')
  log('=== VERDICT ===')
  log('Read the DISCARDED-field lists above. A situational term is viable for a sport only if')
  log('that sport has real fields with a real fill rate high enough to matter -- a field present')
  log('but null on nearly every play cannot carry a bonus. This probe deliberately stops here:')
  log('it reports what real fields exist, and does NOT propose a scoring formula. Designing')
  log('bonuses against unverified fields is the exact mistake the rest of these probes exist to')
  log('prevent, and any real change to dramaScoreLive() would also need a backfill plan, since')
  log('it would alter every historical drama_peak the app already displays.')
}

main().catch(e => log('FAILED: ' + String(e)))
