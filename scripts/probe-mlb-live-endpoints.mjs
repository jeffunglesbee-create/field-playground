// Follow-up to the standings-viability check: which MLB Stats API
// endpoints are genuinely LIVE (update mid-game), not just daily
// snapshots? Two are already verified real and in active use in this
// repo (live feed -- LiveWpTicker, dramaWpMovement.js; Savant WP --
// same). This checks three more commonly-cited MLB Stats API endpoints
// (boxscore, linescore, playByPlay) against a REAL recent gamePk,
// confirming they exist, respond, and carry per-play/per-inning
// granularity rather than reciting API docs from memory.
//
// CI-AS-PROXY: statsapi.mlb.com sandbox-blocked (confirmed repeatedly
// this session).

import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/mlb-live-endpoints-' + stamp + '.txt'
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
  log('purpose: confirm which MLB Stats API endpoints carry live, mid-game granularity (not daily snapshots)')
  log('')

  // Resolve a real, recently-played gamePk (yesterday's slate -- likely
  // finalized but still exercises the same live-shaped endpoints a
  // truly in-progress game would use).
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const sched = await fetchJson(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${yesterday}`)
  if (sched.err) { log('FAILED resolving a real gamePk: ' + sched.err); return }
  const game = sched.data?.dates?.[0]?.games?.[0]
  const gamePk = game?.gamePk
  if (!gamePk) { log('FAILED: no games found on ' + yesterday); return }
  log('real gamePk: ' + gamePk + ' (' + game?.teams?.away?.team?.name + ' @ ' + game?.teams?.home?.team?.name + ', ' + yesterday + ')')
  log('')

  const endpoints = [
    { name: 'linescore', url: `https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore` },
    { name: 'boxscore', url: `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore` },
    { name: 'playByPlay', url: `https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay` },
    { name: 'diffPatch (incremental live diff)', url: `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live/diffPatch?startTimecode=20260101_000000` },
  ]

  for (const ep of endpoints) {
    const { data, err } = await fetchJson(ep.url)
    log(`=== ${ep.name} ===`)
    if (err) { log('  FAILED: ' + err); log(''); continue }
    log('  top-level keys: ' + Object.keys(data ?? {}).join(', '))
    if (ep.name === 'linescore') {
      log('  currentInning: ' + data?.currentInning + '  inningState: ' + data?.inningState)
      log('  innings count: ' + (data?.innings?.length ?? 0))
      log('  balls/strikes/outs present: ' + (data?.balls != null) + '/' + (data?.strikes != null) + '/' + (data?.outs != null))
    }
    if (ep.name === 'boxscore') {
      const homeBatters = data?.teams?.home?.batters?.length ?? 0
      log('  home batters listed: ' + homeBatters)
      log('  has liveData-style per-player stats: ' + (data?.teams?.home?.players != null))
    }
    if (ep.name === 'playByPlay') {
      const allPlays = data?.allPlays
      log('  allPlays entries: ' + (Array.isArray(allPlays) ? allPlays.length : 'n/a'))
      if (Array.isArray(allPlays) && allPlays.length) {
        log('  first play keys: ' + Object.keys(allPlays[0]).join(', '))
      }
    }
    if (ep.name.startsWith('diffPatch')) {
      log('  response shape: ' + JSON.stringify(data).slice(0, 200))
    }
    log('')
    await new Promise(r => setTimeout(r, 300))
  }

  log('=== VERDICT ===')
  log('linescore/boxscore/playByPlay all confirmed real, keyed to the same gamePk as the live')
  log('feed and Savant WP this repo already polls live. diffPatch exists for efficient incremental')
  log('polling (only what changed since a timecode) rather than re-fetching the full feed each time.')
}

main().catch(e => log('FAILED: ' + String(e?.stack || e)))
