// Pre-build check: AmbientPanel's top section (star rating, "sport of
// the week", editorial claim, quality-alert count, streak board) is
// entirely driven by ONE real per-date endpoint, /analytics/newspaper/
// {date} -- confirmed by reading src/data/relay.js's fetchAmbient and
// every render call site in AmbientPanel/index.jsx directly, not
// assumed. There's no client-controllable limit/sample-size param the
// way DramaLeaderboard/HallOfSurprises have -- the only real way to
// give this section "a bigger sample" is to call the SAME real
// endpoint across multiple real dates and aggregate client-side.
//
// Before building that: confirm the endpoint actually returns real,
// genuinely varying content across multiple real recent dates (not a
// cached/repeated single value, and not empty/broken for dates without
// today's live slate).
//
// CI-AS-PROXY: field-relay-nba.jeffunglesbee.workers.dev is
// sandbox-blocked from chat -- confirmed repeatedly this session.

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/ambient-multiday-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

function shiftDate(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().split('T')[0]
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: does /analytics/newspaper/{date} return real, varied data across multiple real dates?')
  log('')

  const today = '2026-08-03'
  const dates = []
  for (let i = 0; i < 10; i++) dates.push(shiftDate(today, -i))

  const rows = []
  for (const date of dates) {
    const res = await fetch(RELAY_BASE + '/analytics/newspaper/' + date)
    if (!res.ok) {
      log(date + ': HTTP ' + res.status)
      rows.push({ date, ok: false })
      await new Promise(r => setTimeout(r, 300))
      continue
    }
    const data = await res.json()
    const stars = data?.night_stars
    const qa = data?.quality_alert
    const sport = data?.sport_of_week
    const claim = data?.truth_is?.headline
    rows.push({
      date, ok: true,
      starScore: stars?.starScore ?? null,
      dramaGames: stars?.dramaGames ?? null,
      alertCount: qa?.alert_count ?? null,
      sport: sport ?? null,
      claim: claim ?? null,
    })
    log(date + ': stars=' + (stars?.starScore ?? 'n/a') + '/10  drama=' + (stars?.dramaGames ?? 'n/a') +
        '  alerts=' + (qa?.alert_count ?? 'n/a') + '  sport=' + (sport ?? 'n/a') +
        '  claim=' + JSON.stringify(claim ?? null))
    await new Promise(r => setTimeout(r, 300))
  }

  log('')
  const oks = rows.filter(r => r.ok)
  log('=== RESULT ===')
  log('dates resolved: ' + oks.length + ' / ' + dates.length)
  const distinctStars = new Set(oks.map(r => r.starScore)).size
  const distinctClaims = new Set(oks.map(r => r.claim)).size
  const distinctAlerts = new Set(oks.map(r => r.alertCount)).size
  log('distinct starScore values: ' + distinctStars + ' / ' + oks.length)
  log('distinct editorial claims: ' + distinctClaims + ' / ' + oks.length)
  log('distinct alert_count values: ' + distinctAlerts + ' / ' + oks.length)

  log('')
  log('=== VERDICT ===')
  if (oks.length >= 7 && distinctClaims >= Math.ceil(oks.length * 0.6)) {
    log('CONFIRMED: the real per-date endpoint resolves across multiple real recent dates with genuinely')
    log('varying real content -- safe to build a client-side multi-day aggregation view on this.')
  } else {
    log('NOT CONFIRMED: either too many dates failed to resolve, or the content does not genuinely vary')
    log('day to day -- report exactly what happened before building a multi-day UI on this.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
