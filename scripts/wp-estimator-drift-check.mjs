// Automated follow-up for the WP Estimator Validation Lab (docs/CC-
// CMD-2026-07-31-wp-estimator-validation-lab.md) and the Live WP
// Ticker / WP Source Badge features built on top of it.
//
// WHY THIS EXISTS, and why it is NOT just "re-run the validation lab
// on a schedule": scripts/wp-estimator-validation-lab.mjs reads a
// FIXED, static 28-game sample (outbox/mlb-sample-round3.json, all
// from 2026-07-16 to 2026-07-18). Scheduling THAT script would
// recompute byte-identical numbers forever -- zero new information,
// automation theater. A genuine follow-up has to check the FROZEN,
// already-shipped weights (src/data/wpEstimator.js) against GAMES
// THEY HAVE NEVER SEEN, from whenever this actually runs -- the real
// question a live UI depends on: does the estimator still track real
// Savant WP as the season moves on, or has it drifted?
//
// Frozen weights, not refit: this script imports estimateWinProb
// as-shipped and never adjusts it. If drift shows up here, the fix is
// a human decision (re-fit, or flag the UI), not a silent auto-tune.
//
// CI-AS-PROXY: statsapi.mlb.com / baseballsavant.mlb.com sandbox-
// blocked from chat, same as every other probe this session.

import { mkdirSync, writeFileSync } from 'node:fs'
import { estimateWinProb, periodProgress, WP_ESTIMATOR_MAE_REGULATION } from '../src/data/wpEstimator.js'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/wp-estimator-drift-check-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const MAX_GAMES = 10
// "Trustworthy" bar taken verbatim from the validation lab's own
// plain verdict text -- not a new number invented for this check.
const DRIFT_THRESHOLD = 0.08

function isoDaysAgo(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

async function fetchRecentFinalGames() {
  // Yesterday back 10 days -- avoids "today," where games may still be
  // in progress and Savant's array incomplete.
  const start = isoDaysAgo(10)
  const end = isoDaysAgo(1)
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${start}&endDate=${end}`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error('schedule HTTP ' + res.status)
  const data = await res.json()
  const games = []
  for (const day of data?.dates ?? []) {
    for (const g of day.games ?? []) {
      if (g?.status?.detailedState === 'Final') {
        games.push({
          gamePk: g.gamePk,
          date: day.date,
          home: g.teams?.home?.team?.name,
          away: g.teams?.away?.team?.name,
        })
      }
    }
  }
  return games.slice(0, MAX_GAMES)
}

async function fetchSavantWpa(gamePk) {
  const res = await fetch('https://baseballsavant.mlb.com/gf?game_pk=' + gamePk, { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  const arr = data?.scoreboard?.stats?.wpa?.gameWpa
  if (!Array.isArray(arr) || !arr.length) return { err: 'gameWpa empty or missing' }
  return { arr }
}

async function fetchMlbPlays(gamePk) {
  const res = await fetch('https://statsapi.mlb.com/api/v1.1/game/' + gamePk + '/feed/live', { headers: { 'User-Agent': UA } })
  if (!res.ok) return { err: 'HTTP ' + res.status }
  const data = await res.json()
  const plays = data?.liveData?.plays?.allPlays
  if (!Array.isArray(plays) || !plays.length) return { err: 'allPlays empty or missing' }
  return { plays }
}

async function main() {
  log('drift_check_at: ' + new Date().toISOString())
  log('purpose: check the FROZEN, already-shipped estimator weights against real games')
  log('  it has never seen -- not the static validation-lab sample, real drift detection')
  log('')

  const games = await fetchRecentFinalGames()
  log('candidate real Final games, ' + isoDaysAgo(10) + ' to ' + isoDaysAgo(1) + ': ' + games.length + ' (capped at ' + MAX_GAMES + ')')
  log('')

  const skips = []
  const allPoints = []

  for (const g of games) {
    await new Promise(r => setTimeout(r, 250))
    const wpaResult = await fetchSavantWpa(g.gamePk)
    if (wpaResult.err) { skips.push(g.away + ' @ ' + g.home + ' (' + g.date + '): Savant ' + wpaResult.err); continue }
    await new Promise(r => setTimeout(r, 250))
    const playsResult = await fetchMlbPlays(g.gamePk)
    if (playsResult.err) { skips.push(g.away + ' @ ' + g.home + ' (' + g.date + '): MLB live feed ' + playsResult.err); continue }

    const playByIndex = new Map()
    for (const p of playsResult.plays) {
      if (p?.about?.atBatIndex != null) playByIndex.set(p.about.atBatIndex, p)
    }

    let joined = 0
    for (const e of wpaResult.arr) {
      const play = playByIndex.get(e?.atBatIndex)
      if (!play) continue
      const homeScore = play.result?.homeScore
      const awayScore = play.result?.awayScore
      const inning = play.about?.inning
      const halfBottom = play.about?.halfInning === 'bottom'
      if (homeScore == null || awayScore == null || inning == null) continue
      const wp = Number(e.homeTeamWinProbability) / 100
      if (!Number.isFinite(wp)) continue
      joined++
      allPoints.push({ scoreDiff: homeScore - awayScore, periodProgress: periodProgress(inning, halfBottom), wp, inning })
    }
    log(g.away + ' @ ' + g.home + '  (' + g.date + ', gamePk=' + g.gamePk + ')  joined ' + joined + '/' + wpaResult.arr.length)
  }

  log('')
  log('=== SKIPPED ===')
  for (const s of skips) log('  ' + s)
  log('')
  log('real games with joined data: ' + (games.length - skips.length) + ' / ' + games.length)
  log('total fresh points (never used to fit or validate before): ' + allPoints.length)

  if (allPoints.length < 50) {
    log('')
    log('Too few fresh points to say anything meaningful this run -- not enough')
    log('recent completed MLB games resolved. Stopping here rather than reporting a')
    log('drift number from a handful of points.')
    return
  }

  let sumAbsErr = 0, sumAbsErrReg = 0, regCount = 0
  const byInningErr = new Map()
  for (const p of allPoints) {
    const pred = estimateWinProb(p) // frozen weights, default param -- not refit
    const absErr = Math.abs(pred - p.wp)
    sumAbsErr += absErr
    if (p.inning <= 9) { sumAbsErrReg += absErr; regCount++ }
    const bucket = byInningErr.get(p.inning) ?? []
    bucket.push(absErr)
    byInningErr.set(p.inning, bucket)
  }
  const maeOverall = sumAbsErr / allPoints.length
  const maeRegulation = regCount ? sumAbsErrReg / regCount : null

  log('')
  log('=== DRIFT CHECK (frozen weights vs FRESH real Savant data, never used to fit) ===')
  log('overall MAE: ' + maeOverall.toFixed(4))
  log('regulation-inning MAE: ' + (maeRegulation != null ? maeRegulation.toFixed(4) : 'n/a'))
  log('original validation-lab regulation MAE (baseline): ' + WP_ESTIMATOR_MAE_REGULATION.toFixed(4))
  log('')
  log('=== BY INNING ===')
  const innings = [...byInningErr.keys()].sort((a, b) => a - b)
  for (const inn of innings) {
    const errs = byInningErr.get(inn)
    const avg = errs.reduce((s, v) => s + v, 0) / errs.length
    log('  inning ' + inn + ':  n=' + errs.length + '  mean_abs_err=' + avg.toFixed(4))
  }

  log('')
  log('=== VERDICT ===')
  if (maeRegulation != null && maeRegulation > DRIFT_THRESHOLD) {
    log('DRIFT DETECTED: regulation-inning MAE (' + maeRegulation.toFixed(4) + ') on fresh real games')
    log('exceeds the validation lab\'s own ~' + DRIFT_THRESHOLD.toFixed(2) + ' trustworthy threshold.')
    log('The estimator no longer tracks real Savant WP closely enough to trust as-is --')
    log('this needs a human decision (re-fit against a current sample, or flag the')
    log('live UI), not a silent auto-adjustment.')
  } else {
    log('No drift detected: regulation-inning MAE (' + (maeRegulation != null ? maeRegulation.toFixed(4) : 'n/a') +
        ') on fresh real games stays under the ~' + DRIFT_THRESHOLD.toFixed(2) + ' trustworthy threshold.')
    log('The frozen weights still track real Savant WP on games they have never seen.')
  }
}

main().catch(e => log('FAILED: ' + String(e)))
