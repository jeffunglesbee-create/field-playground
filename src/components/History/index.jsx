import { For, Show, createMemo } from 'solid-js'
import { outcomes, pickMeta } from '../../data/outcomes'
import styles from './History.module.css'

// Everything here reads outcomes()/pickMeta() -- localStorage, already
// committed by the time this renders, zero new fetch. Every gameId
// carries a date prefix (YYYY-MM-DD-...), which is what makes all three
// views below possible without any new storage.

function parseDate(gameId) {
  const m = gameId.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// Tier calibration: is FIELD's own tiering actually predictive? Groups
// every marked outcome by its stored tier (from pickMeta, only present
// for picks marked AFTER the tier param was added to setOutcome -- older
// marks won't have a tier and are excluded, not guessed at).
function useTierCalibration() {
  return createMemo(() => {
    const byTier = {}
    for (const [gameId, result] of Object.entries(outcomes())) {
      const meta = pickMeta()[gameId]
      if (!meta || meta.tier === undefined) continue
      const t = meta.tier
      if (!byTier[t]) byTier[t] = { w: 0, l: 0, p: 0 }
      if (result === 'W') byTier[t].w++
      else if (result === 'L') byTier[t].l++
      else if (result === 'P') byTier[t].p++
    }
    return Object.entries(byTier)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([tier, rec]) => ({
        tier,
        ...rec,
        total: rec.w + rec.l + rec.p,
        hitRate: rec.w + rec.l > 0 ? rec.w / (rec.w + rec.l) : null,
      }))
  })
}

// Multi-day record: same outcomes, grouped by the date prefix instead
// of tier. Sorted most-recent-first.
function useMultiDayRecord() {
  return createMemo(() => {
    const byDate = {}
    for (const [gameId, result] of Object.entries(outcomes())) {
      const date = parseDate(gameId)
      if (!date) continue
      if (!byDate[date]) byDate[date] = { w: 0, l: 0, p: 0 }
      if (result === 'W') byDate[date].w++
      else if (result === 'L') byDate[date].l++
      else if (result === 'P') byDate[date].p++
    }
    const entries = Object.entries(byDate).sort(([a], [b]) => b.localeCompare(a))
    const running = entries.reduce((acc, [, rec]) => ({ w: acc.w + rec.w, l: acc.l + rec.l, p: acc.p + rec.p }), { w: 0, l: 0, p: 0 })
    return { entries: entries.map(([date, rec]) => ({ date, ...rec })), running }
  })
}

// Pick calendar: last 30 days, one pip each, colored by that day's
// record (green=more W than L, red=more L than W, amber=tied/split,
// dim=no marks that day). Built entirely from the same date-grouped
// data above, just rendered as a strip instead of a list.
function usePickCalendar() {
  const dayRecord = useMultiDayRecord()
  return createMemo(() => {
    const byDate = {}
    for (const e of dayRecord().entries) byDate[e.date] = e
    const days = []
    const today = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const rec = byDate[dateStr]
      let state = 'empty'
      if (rec) {
        if (rec.w > rec.l) state = 'good'
        else if (rec.l > rec.w) state = 'bad'
        else state = 'split'
      }
      days.push({ date: dateStr, state, rec })
    }
    return days
  })
}

function TierCalibration() {
  const tiers = useTierCalibration()
  return (
    <section class={styles.section}>
      <h3 class={styles.sectionLabel}>Tier Calibration</h3>
      <Show when={tiers().length} fallback={<p class={styles.empty}>No tiered outcomes marked yet.</p>}>
        <div class={styles.tierList}>
          <For each={tiers()}>
            {t => (
              <div class={styles.tierRow}>
                <span class={styles.tierNum}>Tier {t.tier}</span>
                <span class={styles.tierRecord}>{t.w}-{t.l}-{t.p}</span>
                <Show when={t.hitRate !== null}>
                  <div class={styles.hitRateTrack}>
                    <div class={styles.hitRateFill} style={{ width: `${t.hitRate * 100}%` }} />
                  </div>
                  <span class={styles.hitRatePct}>{Math.round(t.hitRate * 100)}%</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}

function MultiDayRecord() {
  const record = useMultiDayRecord()
  return (
    <section class={styles.section}>
      <h3 class={styles.sectionLabel}>Multi-Day Record</h3>
      <Show when={record().entries.length} fallback={<p class={styles.empty}>No outcomes marked yet.</p>}>
        <div class={styles.dayList}>
          <For each={record().entries}>
            {e => (
              <div class={styles.dayRow}>
                <span class={styles.dayDate}>{e.date}</span>
                <span class={styles.dayRecord}>{e.w}-{e.l}-{e.p}</span>
              </div>
            )}
          </For>
        </div>
        <div class={styles.runningTotal}>
          running total: {record().running.w}-{record().running.l}-{record().running.p}
        </div>
      </Show>
    </section>
  )
}

function PickCalendar() {
  const days = usePickCalendar()
  return (
    <section class={styles.section}>
      <h3 class={styles.sectionLabel}>Pick Calendar</h3>
      <div class={styles.calendarStrip}>
        <For each={days()}>
          {d => (
            <span
              class={`${styles.calPip} ${styles['cal_' + d.state]}`}
              title={d.rec ? `${d.date}: ${d.rec.w}-${d.rec.l}-${d.rec.p}` : d.date}
            />
          )}
        </For>
      </div>
    </section>
  )
}

export function History() {
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>History</span>
        <span class={styles.note}>from your own marked outcomes, no fetch</span>
      </header>
      <TierCalibration />
      <MultiDayRecord />
      <PickCalendar />
    </div>
  )
}
