// WP Estimator Validation Lab, Task 1 (docs/CC-CMD-2026-07-31-wp-
// estimator-validation-lab.md): "Re-verify from HEAD before writing
// anything (Rule 87)." The CC-CMD proposes estimateWinProb({scoreDiff,
// periodProgress}) as the estimator's input set -- but Savant's
// gameWpa array (the only source read so far, in probe-savant-wp-
// metrics.mjs and drama-round3-wpa.py) was only ever shape-dumped for
// its WP fields. Its first entry, confirmed live 2026-07-30:
//   { homeTeamWinProbability, awayTeamWinProbability,
//     homeTeamWinProbabilityAdded, hwp, awp, atBatIndex, i, capIndex }
// NO score field. scoreDiff is not sitting there for the taking --
// this probe finds out where it actually is, and whether it can be
// joined back to Savant's array, BEFORE any estimator code is written.
//
// THIS PROBE, for a small number of real games (shape discovery, not
// full metrics -- no need for all 28):
//   1. Dump Savant's FULL /gf response shape (not just
//      scoreboard.stats.wpa.gameWpa) -- score data may already live
//      elsewhere in the SAME response, which would need no second host.
//   2. Fetch MLB Stats API's live feed (statsapi.mlb.com/api/v1.1/game/
//      {gamePk}/feed/live), the well-documented source for real
//      per-play score state -- shape-dumped, not assumed.
//   3. Check whether atBatIndex lines up between the two sources for
//      the SAME game -- a shared index is only a usable join key if
//      it's confirmed to mean the same play in both, not assumed.
//
// CI-AS-PROXY: both statsapi.mlb.com and baseballsavant.mlb.com are
// sandbox-blocked (confirmed repeatedly this session, host_not_allowed).

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/wp-estimator-inputs-probe-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const SAMPLE = JSON.parse(readFileSync('outbox/mlb-sample-round3.json', 'utf-8'))
// Shape discovery only needs a handful of real games, not all 28.
const GAMES_TO_CHECK = 3

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

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: find real scoreDiff/periodProgress inputs for the WP estimator,')
  log('  confirmed by shape, before writing any estimator code')
  log('')

  let checked = 0
  for (const g of SAMPLE) {
    if (checked >= GAMES_TO_CHECK) break
    const pk = await resolveGamePk(g.date, g.home, g.away)
    if (!pk) { log('SKIP ' + g.away + ' @ ' + g.home + ': no gamePk resolved'); continue }
    checked++
    log('=== ' + g.away + ' @ ' + g.home + '  (' + g.date + ', gamePk=' + pk + ') ===')
    await new Promise(r => setTimeout(r, 300))

    // ── 1. Savant's FULL /gf response -- top-level keys, and a search
    // for anything score-shaped anywhere in the tree. ──
    let savantJson = null
    try {
      const res = await fetch('https://baseballsavant.mlb.com/gf?game_pk=' + pk, { headers: { 'User-Agent': UA } })
      if (res.ok) savantJson = await res.json()
      else log('  Savant HTTP ' + res.status)
    } catch (e) { log('  Savant fetch failed: ' + String(e).slice(0, 100)) }

    if (savantJson) {
      log('  Savant top-level keys: ' + Object.keys(savantJson).join(', '))
      const sb = savantJson.scoreboard
      if (sb) log('  Savant scoreboard keys: ' + Object.keys(sb).join(', '))
      // Recursive search for any key name containing "score" (case-insensitive),
      // reporting the path so a hit can be inspected directly rather than guessed at.
      const scoreHits = []
      const walk = (obj, path, depth) => {
        if (depth > 4 || obj == null || typeof obj !== 'object') return
        for (const k of Object.keys(obj)) {
          const p = path + '.' + k
          if (/score/i.test(k)) scoreHits.push(p)
          if (scoreHits.length < 30) walk(obj[k], p, depth + 1)
        }
      }
      walk(savantJson, 'root', 0)
      log('  keys anywhere matching /score/i (first 30): ' + (scoreHits.length ? scoreHits.slice(0, 30).join(', ') : '(none found)'))

      const wpaArr = sb?.stats?.wpa?.gameWpa
      if (Array.isArray(wpaArr) && wpaArr.length) {
        log('  gameWpa[0]: ' + JSON.stringify(wpaArr[0]))
        log('  gameWpa[' + Math.floor(wpaArr.length / 2) + '] (mid-game): ' + JSON.stringify(wpaArr[Math.floor(wpaArr.length / 2)]))
      }
    }
    await new Promise(r => setTimeout(r, 300))

    // ── 2. MLB Stats API's live feed -- the documented real source for
    // per-play score state. Shape-dumped, not assumed. ──
    let liveJson = null
    try {
      const res = await fetch('https://statsapi.mlb.com/api/v1.1/game/' + pk + '/feed/live', { headers: { 'User-Agent': UA } })
      if (res.ok) liveJson = await res.json()
      else log('  MLB live feed HTTP ' + res.status)
    } catch (e) { log('  MLB live feed fetch failed: ' + String(e).slice(0, 100)) }

    if (liveJson) {
      const plays = liveJson?.liveData?.plays?.allPlays
      if (Array.isArray(plays) && plays.length) {
        log('  liveData.plays.allPlays.length: ' + plays.length)
        const first = plays[0], mid = plays[Math.floor(plays.length / 2)], last = plays[plays.length - 1]
        for (const [label, p] of [['first', first], ['mid', mid], ['last', last]]) {
          log('  allPlays[' + label + ']: atBatIndex=' + p?.about?.atBatIndex +
              '  inning=' + p?.about?.inning + ' halfInning=' + p?.about?.halfInning +
              '  homeScore=' + p?.result?.homeScore + '  awayScore=' + p?.result?.awayScore +
              '  isComplete=' + p?.about?.isComplete)
        }
      } else {
        log('  liveData.plays.allPlays: missing or empty')
        log('  liveData keys: ' + Object.keys(liveJson?.liveData ?? {}).join(', '))
      }
    }

    log('')
    await new Promise(r => setTimeout(r, 400))
  }

  log('=== VERDICT ===')
  log('If /score/i hits appeared in the Savant response above, score data may')
  log('already live in the SAME response as the WP array -- no second host or')
  log('join needed, re-read those exact fields before assuming anything further.')
  log('If not, and MLB Stats API\'s allPlays entries show real homeScore/')
  log('awayScore alongside atBatIndex, that confirms the real join key: match')
  log('Savant\'s gameWpa[i].atBatIndex to allPlays[j].about.atBatIndex for the')
  log('SAME gamePk to attach a real score state to each real WP reading.')
  log('Compare a few atBatIndex values by inning between the two dumps above')
  log('to confirm they actually correspond to the same plays, not just the same')
  log('field name by coincidence, before building anything on this join.')
}

main().catch(e => log('FAILED: ' + String(e)))
