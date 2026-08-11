import { For, Show, createMemo, createSignal } from 'solid-js'
import { outcomes, confidence, setConfidence, confidenceModeFor, FORWARD } from '../../data/outcomes'
import { deskStore } from '../../data/relay'
import styles from './Calibration.module.css'

// Calibration score: is the user's own stated confidence actually
// predictive? Tier calibration (History component) answers a similar
// question but for FIELD's editorial tier (A/B/C), not a user-supplied
// confidence percentage -- there's no way to compute a Brier score from
// three discrete tiers. This adds the missing input (a confidence % per
// pick) and the missing metric (Brier score = mean squared error between
// stated probability and the binary W/L outcome; 0 = perfect, 0.25 =
// "always guess 50%", 1 = maximally overconfident and wrong).
//
// CORRECTION, 2026-08-11 -- the headline number was measuring the wrong
// thing. Confidence was captured retroactively, on picks already marked
// W or L, with the result rendered in the same row as the slider. A Brier
// score over that is not calibration: the forecast was made after the
// event, so 0.25 ("a coin flip") is not the right null and beating it is
// not evidence of skill. The component asked "is your confidence actually
// predictive" and then displayed a figure that could not answer it.
//
// The fix is not to delete the retrospective ratings. They are a real
// record of something -- how consistently you recall your own reads --
// just not of forecasting. So outcomes.js now records WHICH KIND each
// rating is at write time (forward = no outcome existed yet), and this
// component scores the two populations separately and refuses to fold
// them together. Only the forward set gets a Brier score and the 0.25
// comparison; the retrospective set is reported as hindsight, by name.
//
// Same shape as the CFL score at 100% fill and the marginal-vs-conditional
// error before it: a number that looked measured while meaning something
// other than its label.

function BUCKET(pct) {
  return Math.min(90, Math.floor(pct / 10) * 10)
}

function useMarkedWithoutConfidence() {
  // Reuse the same {gameId, result} object across recomputes for a gameId
  // whose result hasn't changed -- <For> keys rows by item reference, so
  // handing it a fresh object every time (even for untouched rows) remounts
  // every ConfidenceCapture row whenever ANY confidence value changes,
  // resetting each row's own in-progress slider draft. Scoped to this call
  // (not module scope) so each hook instance gets its own cache.
  const cache = new Map()
  return createMemo(() => {
    const currentIds = new Set()
    const list = []
    for (const [gameId, result] of Object.entries(outcomes())) {
      if ((result === 'W' || result === 'L') && confidence()[gameId] === undefined) {
        currentIds.add(gameId)
        let entry = cache.get(gameId)
        if (!entry || entry.result !== result) {
          entry = { gameId, result }
          cache.set(gameId, entry)
        }
        list.push(entry)
      }
    }
    for (const id of cache.keys()) {
      if (!currentIds.has(id)) cache.delete(id)
    }
    return list
  })
}

// Scores ONE population. Called twice -- once for forward-stated confidence,
// once for retrospective -- and the two results are never summed. Folding them
// was the defect: a Brier score is only a forecasting metric if the forecast
// preceded the outcome.
function scoreSet(entries) {
  const buckets = {}
  let sqErrSum = 0
  let n = 0
  for (const { pct, result } of entries) {
    const outcome01 = result === 'W' ? 1 : 0
    const p = pct / 100
    sqErrSum += (p - outcome01) ** 2
    n++
    const b = BUCKET(pct)
    if (!buckets[b]) buckets[b] = { w: 0, l: 0 }
    if (result === 'W') buckets[b].w++
    else buckets[b].l++
  }
  const bucketList = Object.entries(buckets)
    .map(([b, rec]) => ({
      bucket: Number(b),
      ...rec,
      total: rec.w + rec.l,
      winRate: rec.w / (rec.w + rec.l),
    }))
    .sort((a, b) => a.bucket - b.bucket)
  return { brier: n > 0 ? sqErrSum / n : null, n, buckets: bucketList }
}

function useCalibration() {
  return createMemo(() => {
    const fwd = []
    const retro = []
    for (const [gameId, pct] of Object.entries(confidence())) {
      const result = outcomes()[gameId]
      if (result !== 'W' && result !== 'L') continue
      const entry = { gameId, pct, result }
      if (confidenceModeFor(gameId) === FORWARD) fwd.push(entry)
      else retro.push(entry)
    }
    return { forward: scoreSet(fwd), retro: scoreSet(retro) }
  })
}

function ConfidenceCapture(props) {
  const [draft, setDraft] = createSignal(50)
  return (
    <div class={styles.captureRow}>
      <span class={styles.captureGame}>{props.gameId}</span>
      <Show when={props.result}>
        <span class={`${styles.captureResult} ${props.result === 'W' ? styles.resultW : styles.resultL}`}>
          {props.result}
        </span>
      </Show>
      <input
        type="range"
        min="0"
        max="100"
        value={draft()}
        class={styles.slider}
        onInput={e => setDraft(Number(e.currentTarget.value))}
      />
      <span class={styles.draftPct}>{draft()}%</span>
      <button class={styles.commitBtn} onClick={() => setConfidence(props.gameId, draft())}>
        set
      </button>
    </div>
  )
}

function BucketBar(props) {
  const b = () => props.bucket
  // Well-calibrated: winRate should land near the bucket's own midpoint
  // (a 70-79% bucket should win ~75% of the time). The midpoint tick
  // marks the target; the fill shows the actual win rate.
  const midpoint = () => b().bucket + 5
  return (
    <div class={styles.bucketRow}>
      <span class={styles.bucketLabel}>{b().bucket}–{b().bucket + 9}%</span>
      <div class={styles.bucketTrack}>
        <div class={styles.bucketTarget} style={{ left: `${midpoint()}%` }} />
        <div class={styles.bucketFill} style={{ width: `${b().winRate * 100}%` }} />
      </div>
      <span class={styles.bucketPct}>{Math.round(b().winRate * 100)}% ({b().total})</span>
    </div>
  )
}

// Games with no outcome marked yet -- the only place a genuine forecast can
// be made. Without this the forward set could never be populated, and
// "calibration" would be a permanently empty panel: a correct metric nobody
// can feed is not an improvement on a wrong one.
function useUnresolvedGames() {
  return createMemo(() => {
    const all = [
      ...(deskStore.games?.regular ?? []),
      ...(deskStore.games?.postseason ?? []),
    ]
    return all.filter(g => outcomes()[g.id] === undefined && confidence()[g.id] === undefined)
  })
}

export function Calibration() {
  const pending = useMarkedWithoutConfidence()
  const unresolved = useUnresolvedGames()
  const cal = useCalibration()

  // States the reader's own number against the stated null -- but only for the
  // forward set, because 0.25 is only the right null for a real forecast.
  const verdict = createMemo(() => {
    const c = cal().forward
    if (c.n === 0) return null
    const diff = 0.25 - c.brier
    const n = c.n
    const scope = `over ${n} pick${n === 1 ? '' : 's'} rated BEFORE the result was known`
    if (diff === 0) return `Your real Brier score is exactly 0.25 -- no better than a coin flip, ${scope}.`
    const verb = diff > 0 ? 'better' : 'worse'
    return `Your real Brier score is ${c.brier.toFixed(3)} -- ${Math.abs(diff).toFixed(3)} ${verb} than a coin flip (0.25), ${scope}.`
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Calibration</span>
        <span class={styles.sublabel}>Brier score over confidence stated in advance</span>
      </header>

      <Show
        when={cal().forward.n > 0}
        fallback={
          <p class={styles.empty}>
            No forecasts yet. Rate a game below <em>before</em> its outcome is
            marked — confidence stated after the fact is recorded separately and
            is not scored as calibration.
          </p>
        }
      >
        <p class={styles.verdict}>{verdict()}</p>
        <div class={styles.brierRow}>
          <span class={styles.brierLabel}>Brier score</span>
          <span class={styles.brierValue}>{cal().forward.brier.toFixed(3)}</span>
          <span class={styles.brierNote}>lower is better · 0.25 = coin flip · {cal().forward.n} rated in advance</span>
        </div>
        <div class={styles.bucketList}>
          <For each={cal().forward.buckets}>{b => <BucketBar bucket={b} />}</For>
        </div>
      </Show>

      {/* Retrospective ratings are shown, never folded into the score above.
          They record how consistently the reader recalls their own reads --
          worth keeping, and not evidence of forecasting skill. */}
      <Show when={cal().retro.n > 0}>
        <div class={styles.retroSection}>
          <div class={styles.retroLabel}>
            hindsight — {cal().retro.n} rating{cal().retro.n === 1 ? '' : 's'} entered after the result was known
          </div>
          <p class={styles.retroNote}>
            Not scored as calibration: the outcome was already visible when these
            were set, so a Brier score over them measures recall, not prediction.
            Their spread is {cal().retro.brier.toFixed(3)}, shown for comparison only.
          </p>
        </div>
      </Show>

      <Show when={unresolved().length}>
        <div class={styles.captureSection}>
          <div class={styles.captureLabel}>
            forecast — rate before the result ({unresolved().length} available)
          </div>
          <For each={unresolved().slice(0, 5)}>
            {g => <ConfidenceCapture gameId={g.id} result={null} />}
          </For>
        </div>
      </Show>

      <Show when={pending().length}>
        <div class={styles.captureSection}>
          <div class={styles.captureLabel}>
            hindsight — already decided ({pending().length} pending)
          </div>
          <For each={pending().slice(0, 5)}>
            {p => <ConfidenceCapture gameId={p.gameId} result={p.result} />}
          </For>
        </div>
      </Show>
    </div>
  )
}
