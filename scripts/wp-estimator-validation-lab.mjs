// WP Estimator Validation Lab (docs/CC-CMD-2026-07-31-wp-estimator-
// validation-lab.md), Tasks 2-3. Task 1's own probe
// (probe-wp-estimator-inputs.mjs, outbox/wp-estimator-inputs-probe-
// 2026-07-31T01-53-08-004Z.txt) confirmed the real join: Savant's
// gameWpa[k].atBatIndex lines up 1:1 with MLB Stats API's
// allPlays[k].about.atBatIndex for the same gamePk (array lengths,
// indices, and inning/halfInning all matched exactly on 3 real games
// checked) -- allPlays carries real result.homeScore/awayScore, which
// gameWpa itself does not.
//
// BUILD: a minimal, sport-agnostic input pair -- scoreDiff (home -
// away) and periodProgress (0-1, inning+half normalized) -- fit via
// logistic regression (gradient descent, no external ML dependency)
// against real (scoreDiff, periodProgress) -> real Savant WP pairs.
// The fitting approach itself was verified on synthetic data first
// (recovers the expected "a late lead matters more than an early one"
// shape) before being trusted on real CI-fetched data here.
//
// VALIDATE HONESTLY: split by GAME (not by individual play -- adjacent
// plays from the same game are highly correlated, so a play-level
// split would leak and overstate accuracy) into train/test. Fit on
// train only. Report real mean absolute error against real Savant WP
// on the held-out test games. No tuning against the test set.
//
// CI-AS-PROXY: statsapi.mlb.com and baseballsavant.mlb.com are both
// sandbox-blocked (confirmed repeatedly this session).

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/wp-estimator-validation-lab-' + stamp + '.txt'
const out = []
const log = s => {
  out.push(s); console.log(s)
  try { writeFileSync(outPath, out.join('\n')) } catch {}
}

const UA = 'field-playground-probe/1.0 (github.com/jeffunglesbee-create/field-playground; research)'
const SAMPLE = JSON.parse(readFileSync('outbox/mlb-sample-round3.json', 'utf-8'))

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

// Confirmed via probe-wp-estimator-inputs.mjs: 0 at T1, approaching 1
// through B9. Extra innings clamp at 1.0 -- the model's job is to
// represent "how late," not to distinguish the 10th from the 15th.
function periodProgress(inning, halfBottom) {
  const p = (inning - 1 + (halfBottom ? 0.5 : 0)) / 9
  return Math.min(p, 1.0)
}

function sigmoid(x) {
  const c = Math.max(-30, Math.min(30, x))
  return 1 / (1 + Math.exp(-c))
}

// estimateWinProb: the actual deliverable function. Minimal input set
// (scoreDiff, periodProgress) by design -- generalizes to any sport
// with a score and a clock/period, not just MLB's inning structure.
function estimateWinProb({ scoreDiff, periodProgress }, weights) {
  const { w1, w2, w3, b } = weights
  return sigmoid(w1 * scoreDiff + w2 * scoreDiff * periodProgress + w3 * periodProgress + b)
}

function fitLogistic(points, epochs, lr) {
  let w1 = 0, w2 = 0, w3 = 0, b = 0
  const n = points.length
  for (let epoch = 0; epoch < epochs; epoch++) {
    let g1 = 0, g2 = 0, g3 = 0, gb = 0
    for (const { scoreDiff, periodProgress: p, wp } of points) {
      const pred = sigmoid(w1 * scoreDiff + w2 * scoreDiff * p + w3 * p + b)
      const err = pred - wp
      g1 += err * scoreDiff
      g2 += err * scoreDiff * p
      g3 += err * p
      gb += err
    }
    w1 -= lr * g1 / n
    w2 -= lr * g2 / n
    w3 -= lr * g3 / n
    b -= lr * gb / n
  }
  return { w1, w2, w3, b }
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: build + honestly validate a minimal client-side WP estimator against real Savant data')
  log('sample: ' + SAMPLE.length + ' real MLB games (round 3\'s sample, re-used)')
  log('')

  const perGame = []
  const skips = []

  for (const g of SAMPLE) {
    const pk = await resolveGamePk(g.date, g.home, g.away)
    if (!pk) { skips.push(g.away + ' @ ' + g.home + ': no gamePk'); continue }
    await new Promise(r => setTimeout(r, 250))

    const wpaResult = await fetchSavantWpa(pk)
    if (wpaResult.err) { skips.push(g.away + ' @ ' + g.home + ': Savant ' + wpaResult.err); await new Promise(r => setTimeout(r, 250)); continue }
    await new Promise(r => setTimeout(r, 250))

    const playsResult = await fetchMlbPlays(pk)
    if (playsResult.err) { skips.push(g.away + ' @ ' + g.home + ': MLB live feed ' + playsResult.err); await new Promise(r => setTimeout(r, 250)); continue }

    // Join by atBatIndex, confirmed 1:1 in Task 1 -- built as a map
    // rather than assumed to be positionally aligned, so a genuine
    // mismatch (a game where the two sources drift) fails safe by
    // producing fewer joined points, not silently wrong ones.
    const playByIndex = new Map()
    for (const p of playsResult.plays) {
      if (p?.about?.atBatIndex != null) playByIndex.set(p.about.atBatIndex, p)
    }

    const points = []
    for (const e of wpaResult.arr) {
      const play = playByIndex.get(e?.atBatIndex)
      if (!play) continue
      const homeScore = play.result?.homeScore
      const awayScore = play.result?.awayScore
      const inning = play.about?.inning
      const halfBottom = play.about?.halfInning === 'bottom'
      if (homeScore == null || awayScore == null || inning == null) continue
      const wp = Number(e.homeTeamWinProbability) / 100 // same scale fix as round 3
      if (!Number.isFinite(wp)) continue
      points.push({
        scoreDiff: homeScore - awayScore,
        periodProgress: periodProgress(inning, halfBottom),
        wp,
        inning,
        atBatIndex: e.atBatIndex,
      })
    }

    if (!points.length) { skips.push(g.away + ' @ ' + g.home + ': 0 points joined'); continue }
    perGame.push({ matchup: g.away + ' @ ' + g.home, wentToOT: g.went_to_ot, points })
    log(g.away + ' @ ' + g.home + '  gamePk=' + pk + '  joined ' + points.length + '/' + wpaResult.arr.length + ' plays')
    await new Promise(r => setTimeout(r, 300))
  }

  log('')
  log('=== SKIPPED ===')
  for (const s of skips) log('  ' + s)
  log('')
  log('games with joined real data: ' + perGame.length + ' / ' + SAMPLE.length)

  if (perGame.length < 6) {
    log('')
    log('Too few games resolved to do a meaningful train/test split -- stopping')
    log('here rather than fitting on a handful of games and calling it validated.')
    return
  }

  // Split BY GAME, not by play -- adjacent plays in the same game are
  // highly correlated (similar score, similar inning), so a play-level
  // split would let the model "cheat" by training on near-duplicates
  // of its own test points.
  const shuffled = [...perGame]
  // Deterministic shuffle (no Math.random() -- disallowed in this
  // environment's workflow scripts) via a fixed-seed LCG, so re-runs
  // are reproducible rather than silently different each time.
  let seed = 20260731
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const testCount = Math.max(2, Math.round(shuffled.length * 0.2))
  const testGames = shuffled.slice(0, testCount)
  const trainGames = shuffled.slice(testCount)

  log('')
  log('train games: ' + trainGames.length + '  test games (held out): ' + testGames.length)
  log('test set: ' + testGames.map(g => g.matchup).join(' | '))

  const trainPoints = trainGames.flatMap(g => g.points)
  const testPoints = testGames.flatMap(g => g.points)
  log('train points: ' + trainPoints.length + '  test points: ' + testPoints.length)

  const weights = fitLogistic(trainPoints, 3000, 0.05)
  log('')
  log('=== FITTED WEIGHTS ===')
  log('estimateWinProb({scoreDiff, periodProgress}) = sigmoid(' +
      weights.w1.toFixed(4) + '*scoreDiff + ' + weights.w2.toFixed(4) + '*scoreDiff*periodProgress + ' +
      weights.w3.toFixed(4) + '*periodProgress + ' + weights.b.toFixed(4) + ')')

  // Honest validation: real error on held-out real games, never seen during fitting.
  let sumAbsErr = 0
  const byInningErr = new Map() // inning -> [errors]
  const extraInningErrs = []
  for (const p of testPoints) {
    const pred = estimateWinProb(p, weights)
    const absErr = Math.abs(pred - p.wp)
    sumAbsErr += absErr
    const bucket = byInningErr.get(p.inning) ?? []
    bucket.push(absErr)
    byInningErr.set(p.inning, bucket)
    if (p.inning > 9) extraInningErrs.push(absErr)
  }
  const mae = sumAbsErr / testPoints.length

  log('')
  log('=== VALIDATION (held-out test games, never used for fitting) ===')
  log('mean absolute error vs real Savant WP: ' + mae.toFixed(4) + '  (on a 0-1 scale)')
  log('')
  log('=== ERROR BY INNING (does the estimator fail in an identifiable situation?) ===')
  const innings = [...byInningErr.keys()].sort((a, b) => a - b)
  for (const inn of innings) {
    const errs = byInningErr.get(inn)
    const avg = errs.reduce((s, v) => s + v, 0) / errs.length
    log('  inning ' + inn + ':  n=' + errs.length + '  mean_abs_err=' + avg.toFixed(4))
  }
  if (extraInningErrs.length) {
    const avgExtra = extraInningErrs.reduce((s, v) => s + v, 0) / extraInningErrs.length
    log('  extra innings (>9) specifically: n=' + extraInningErrs.length + '  mean_abs_err=' + avgExtra.toFixed(4))
  } else {
    log('  no extra-inning points in the test set')
  }

  log('')
  log('=== PLAIN VERDICT ===')
  log('MAE ' + mae.toFixed(4) + ' on a 0-1 probability scale, on real held-out MLB games,')
  log('never seen while fitting. Read this against what "trustworthy" should mean:')
  log('an MAE under ~0.05-0.08 would put the estimator within a few percentage')
  log('points of real Savant WP on average -- plausibly usable as a stand-in for')
  log('NBA/MLS/EPL where no real ground truth exists at all. A materially larger')
  log('MAE, or a clear per-inning pattern above (e.g. much worse early or in extra')
  log('innings), means the estimator needs rethinking before it goes near any UI --')
  log('report exactly what the numbers above show, not a rounded-up impression.')
}

main().catch(e => log('FAILED: ' + String(e)))
