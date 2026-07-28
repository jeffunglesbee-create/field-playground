// Does closing_odds represent a genuinely later capture than opening_odds,
// or are the two frequently the same cron run's snapshot seconds apart,
// mislabeled as "open" and "close"?
//
// WHY THIS EXISTS: chat found (2026-07-27) that on 2026-07-23 and 07-24,
// every game's "closing" line was captured only ~13 seconds before its
// "opening" line -- both snapshots from the same cron run, not a real
// open-to-close window. A naive line-movement feature comparing the two
// values would report "no movement" on those games, when the honest
// answer is "no closing line was ever captured, so there's nothing to
// compare." Only 2026-07-25's MLS games showed a real ~14-hour gap and
// genuine odds drift (e.g. Seattle Sounders +260 -> +330). This probe
// independently re-verifies that finding against a fresh, wider sample
// of real dates rather than trusting a two-day screenshot.
//
// CI-as-proxy: this sandbox can't reach field-relay-nba directly (same
// egress block as every other external host probed today).

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `outbox/line-movement-probe-${stamp}.txt`
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

function parseOddsField(raw) {
  if (!raw) return null
  let o = raw
  if (typeof raw === 'string') {
    try { o = JSON.parse(raw) } catch { return null }
  }
  if (!o || typeof o !== 'object') return null
  return {
    capturedAt: o.captured_at ?? null,
    ml: o.moneyline ?? null,
    spread: o.spread ?? null,
    total: o.total ?? null,
  }
}

function sameValues(a, b) {
  if (!a || !b) return null
  return JSON.stringify(a.ml) === JSON.stringify(b.ml)
    && JSON.stringify(a.spread) === JSON.stringify(b.spread)
    && JSON.stringify(a.total) === JSON.stringify(b.total)
}

async function fetchDate(dateStr) {
  const res = await fetch(`${RELAY_BASE}/context/date/${dateStr}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) return { err: `HTTP ${res.status}` }
  const j = await res.json()
  const games = [...(j?.games?.regular ?? []), ...(j?.games?.postseason ?? [])]
  return { games }
}

async function main() {
  log(`probe_at: ${new Date().toISOString()}`)
  log(`endpoint: ${RELAY_BASE}/context/date/{date}`)
  log(`method: for every game with both opening_odds and closing_odds, compare`)
  log(`  captured_at timestamps AND whether the actual odds values differ`)
  log('')

  const DELTA_THRESHOLD_SEC = 300 // 5 minutes -- generous floor for "same cron run"
  let totalGames = 0
  let bothPresent = 0
  let sameCronDuplicate = 0
  let genuineWindow = 0
  let valuesChangedCount = 0
  const genuineExamples = []
  const duplicateExamples = []

  // -14 to +2 days: wide enough to catch multiple cron cycles across
  // different sports' scheduling patterns, not just the 3-day window
  // chat happened to screenshot.
  for (let offset = -14; offset <= 2; offset++) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + offset)
    const dateStr = d.toISOString().slice(0, 10)

    let r
    try { r = await fetchDate(dateStr) } catch (e) { r = { err: String(e).slice(0, 60) } }
    if (r.err) {
      log(`${dateStr}: FAILED (${r.err})`)
      await new Promise(res => setTimeout(res, 300))
      continue
    }

    for (const g of r.games) {
      totalGames++
      const open = parseOddsField(g.opening_odds)
      const close = parseOddsField(g.closing_odds)
      if (!open || !close || !open.capturedAt || !close.capturedAt) continue
      bothPresent++

      const openT = Date.parse(open.capturedAt)
      const closeT = Date.parse(close.capturedAt)
      if (Number.isNaN(openT) || Number.isNaN(closeT)) continue

      const deltaSec = (closeT - openT) / 1000
      const changed = sameValues(open, close) === false
      if (changed) valuesChangedCount++

      const label = `${g.away ?? '?'} @ ${g.home ?? '?'}`
      if (Math.abs(deltaSec) < DELTA_THRESHOLD_SEC) {
        sameCronDuplicate++
        if (duplicateExamples.length < 5) {
          duplicateExamples.push(`${dateStr} ${label}: delta ${deltaSec.toFixed(0)}s, values ${changed ? 'DIFFER (real move despite tiny delta)' : 'identical'}`)
        }
      } else {
        genuineWindow++
        if (genuineExamples.length < 8) {
          genuineExamples.push(`${dateStr} ${label}: delta ${(deltaSec / 3600).toFixed(1)}h, values ${changed ? 'CHANGED' : 'identical (stable line)'}`)
        }
      }
    }
    await new Promise(res => setTimeout(res, 300))
  }

  log('')
  log(`RESULT`)
  log(`  total games seen: ${totalGames}`)
  log(`  games with both opening_odds AND closing_odds present: ${bothPresent}`)
  log(`  same-cron duplicates (delta < ${DELTA_THRESHOLD_SEC}s): ${sameCronDuplicate}`)
  log(`  genuine time-separated pairs (delta >= ${DELTA_THRESHOLD_SEC}s): ${genuineWindow}`)
  log(`  of those with both present, values actually differ: ${valuesChangedCount}`)
  log('')
  log('--- same-cron duplicate examples (up to 5) ---')
  for (const e of duplicateExamples) log(`  ${e}`)
  log('')
  log('--- genuinely time-separated examples (up to 8) ---')
  for (const e of genuineExamples) log(`  ${e}`)
  log('')
  log('If sameCronDuplicate is the large majority of bothPresent, chat\'s')
  log('finding holds at the broader sample too: a naive line-movement')
  log('feature comparing open vs close as-is would report noise as "no')
  log('movement" on most games. The fix (gate on captured_at delta, exclude')
  log('games below the threshold rather than reporting them) should apply')
  log('to whatever real feature reads these fields.')
}

main().catch(e => log('FAILED: ' + String(e)))
