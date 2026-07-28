// Does the relay's `streams` field still carry real broadcast data
// today, and does Arbitrage's SERVICE_MAP still resolve it correctly?
//
// WHY THIS EXISTS: TonightsPick and Arbitrage's new "My Services" modal
// both depend on `game.streams` being populated. Live verification
// (2026-07-28, this session) checked today back through 6 days and
// found zero games carrying stream data on any of them -- the modal's
// open/toggle/persist path was never exercised against real data as a
// result. This probe checks a much wider window to find out whether
// that was a genuine dry spell or something worse (the field going
// away, or the relay's label format drifting away from what
// SERVICE_MAP expects).
//
// PRICES and SERVICE_MAP are read directly out of
// src/components/Arbitrage/index.jsx at run time (brace-matched
// extraction + Function() eval, same technique
// open-meteo-probe.yml already uses for VENUE_COORDS) rather than
// hand-copied -- a CodeRabbit finding earlier this session called out
// exactly this class of bug (a probe disagreeing with the table it's
// meant to verify) when a prior probe used a copied fixture instead.
//
// CI-as-proxy: this sandbox can't reach field-relay-nba directly (same
// egress block as every other external host probed this session).

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = `outbox/streams-availability-probe-${stamp}.txt`
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const RELAY_BASE = 'https://field-relay-nba.jeffunglesbee.workers.dev'

function extractLiteral(source, name) {
  const re = new RegExp(`(?:export\\s+)?const ${name} = `)
  const m = re.exec(source)
  if (!m) throw new Error(`${name} not found in Arbitrage source`)
  const start = m.index + m[0].length
  const openChar = source[start]
  const closeChar = openChar === '{' ? '}' : ']'
  let depth = 0, i = start
  for (; i < source.length; i++) {
    if (source[i] === openChar) depth++
    else if (source[i] === closeChar) {
      depth--
      if (depth === 0) { i++; break }
    }
  }
  return Function(`return (${source.slice(start, i)})`)()
}

const arbitrageSrc = readFileSync(new URL('../src/components/Arbitrage/index.jsx', import.meta.url), 'utf8')
const PRICES = extractLiteral(arbitrageSrc, 'PRICES')
const SERVICE_MAP = extractLiteral(arbitrageSrc, 'SERVICE_MAP')
log(`Extracted from src/components/Arbitrage/index.jsx: PRICES (${Object.keys(PRICES).length} keys), SERVICE_MAP (${SERVICE_MAP.length} patterns)`)

// Exact reimplementation of Arbitrage's parseStreams -- trivial (4
// lines) so re-deriving it here is lower-risk than the data tables
// above, which are extracted rather than copied for exactly that
// reason.
function parseStreams(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw.split(',').map(s => s.trim()).filter(Boolean).map(label => {
    const hit = SERVICE_MAP.find(([re]) => re.test(label))
    const key = hit ? hit[1] : null
    return { label, key, price: key ? PRICES[key] : null }
  })
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
  log(`method: for every game, check game.streams; parse with the real SERVICE_MAP/PRICES`)
  log('')

  let totalGames = 0
  let gamesWithStreams = 0
  const perDateCounts = []
  const labelCounts = new Map() // raw label -> count
  let matchedCount = 0
  let unmatchedCount = 0
  const unmatchedLabels = new Set()
  const exampleRows = []

  // -21 to +7: wider than the line-movement probe's -14/+2, since the
  // live 6-day-back check found nothing and a genuine dry spell needs
  // more room to rule out before it's treated as a real finding.
  for (let offset = -21; offset <= 7; offset++) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + offset)
    const dateStr = d.toISOString().slice(0, 10)

    let r
    try { r = await fetchDate(dateStr) } catch (e) { r = { err: String(e).slice(0, 60) } }
    if (r.err) {
      log(`${dateStr}: FAILED (${r.err})`)
      await new Promise(res => setTimeout(res, 250))
      continue
    }

    let dateStreamCount = 0
    for (const g of r.games) {
      totalGames++
      if (typeof g.streams === 'string' && g.streams.trim()) {
        gamesWithStreams++
        dateStreamCount++
        const parsed = parseStreams(g.streams)
        for (const s of parsed) {
          labelCounts.set(s.label, (labelCounts.get(s.label) ?? 0) + 1)
          if (s.key) matchedCount++
          else { unmatchedCount++; unmatchedLabels.add(s.label) }
        }
        if (exampleRows.length < 12) {
          const label = `${g.away ?? '?'} @ ${g.home ?? '?'}`
          exampleRows.push(`${dateStr} ${label}: "${g.streams}" -> ${parsed.map(s => s.key ? `${s.key}($${s.price})` : `${s.label}(unmatched)`).join(', ')}`)
        }
      }
    }
    perDateCounts.push(`${dateStr}: ${r.games.length} games, ${dateStreamCount} with streams`)
    await new Promise(res => setTimeout(res, 250))
  }

  log('')
  log('--- per-date counts ---')
  for (const line of perDateCounts) log(`  ${line}`)

  log('')
  log('RESULT')
  log(`  total games seen: ${totalGames}`)
  log(`  games with a non-empty streams field: ${gamesWithStreams}`)
  log(`  distinct raw stream labels seen: ${labelCounts.size}`)
  log(`  label mentions matched to a PRICES key: ${matchedCount}`)
  log(`  label mentions unmatched by SERVICE_MAP: ${unmatchedCount}`)

  log('')
  log('--- most common raw labels (up to 20) ---')
  const topLabels = [...labelCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  for (const [label, count] of topLabels) log(`  ${count}x  "${label}"`)

  log('')
  log('--- unmatched labels (SERVICE_MAP has no pattern for these) ---')
  if (unmatchedLabels.size === 0) log('  none')
  for (const label of unmatchedLabels) log(`  "${label}"`)

  log('')
  log('--- example parsed rows (up to 12) ---')
  for (const row of exampleRows) log(`  ${row}`)

  log('')
  log('If gamesWithStreams is 0 across this whole -21/+7 window, the')
  log('6-day-back live check was not a fluke -- something changed about')
  log('the streams field itself, worth a follow-up. If it is nonzero,')
  log('TonightsPick\'s cost badges and Arbitrage\'s My Services modal')
  log('will actually appear on those real dates, and the unmatched-')
  log('labels list above shows exactly what SERVICE_MAP is currently')
  log('missing against live data, not just the 3 hardcoded examples in')
  log('Arbitrage\'s own header comment.')
}

main().catch(e => log('FAILED: ' + String(e)))
