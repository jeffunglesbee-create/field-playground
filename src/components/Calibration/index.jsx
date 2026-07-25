import { For, Show, createMemo, createSignal } from 'solid-js'
import { outcomes, confidence, setConfidence } from '../../data/outcomes'
import styles from './Calibration.module.css'

// Calibration score: is the user's own stated confidence actually
// predictive? Tier calibration (History component) answers a similar
// question but for FIELD's editorial tier (A/B/C), not a user-supplied
// confidence percentage -- there's no way to compute a Brier score from
// three discrete tiers. This adds the missing input (a confidence % per
// already-marked pick, captured retroactively rather than at pick time,
// so it works on outcomes marked before this feature existed) and the
// missing metric (Brier score = mean squared error between stated
// probability and the binary W/L outcome; 0 = perfect, 0.25 = "always
// guess 50%", 1 = maximally overconfident and wrong).

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

function useCalibration() {
  return createMemo(() => {
    const buckets = {}
    let sqErrSum = 0
    let n = 0
    for (const [gameId, pct] of Object.entries(confidence())) {
      const result = outcomes()[gameId]
      if (result !== 'W' && result !== 'L') continue
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
  })
}

function ConfidenceCapture(props) {
  const [draft, setDraft] = createSignal(50)
  return (
    <div class={styles.captureRow}>
      <span class={styles.captureGame}>{props.gameId}</span>
      <span class={`${styles.captureResult} ${props.result === 'W' ? styles.resultW : styles.resultL}`}>
        {props.result}
      </span>
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

export function Calibration() {
  const pending = useMarkedWithoutConfidence()
  const cal = useCalibration()

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Calibration</span>
        <span class={styles.sublabel}>Brier score over your own confidence</span>
      </header>

      <Show when={cal().n > 0} fallback={<p class={styles.empty}>Rate confidence on at least one marked pick below.</p>}>
        <div class={styles.brierRow}>
          <span class={styles.brierLabel}>Brier score</span>
          <span class={styles.brierValue}>{cal().brier.toFixed(3)}</span>
          <span class={styles.brierNote}>lower is better · 0.25 = coin flip · {cal().n} rated</span>
        </div>
        <div class={styles.bucketList}>
          <For each={cal().buckets}>{b => <BucketBar bucket={b} />}</For>
        </div>
      </Show>

      <Show when={pending().length}>
        <div class={styles.captureSection}>
          <div class={styles.captureLabel}>rate your confidence ({pending().length} pending)</div>
          <For each={pending().slice(0, 5)}>
            {p => <ConfidenceCapture gameId={p.gameId} result={p.result} />}
          </For>
        </div>
      </Show>
    </div>
  )
}
