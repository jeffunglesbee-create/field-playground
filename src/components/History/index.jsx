import { For, Show, createMemo, createResource } from 'solid-js'
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

const RELAY_BASE = import.meta.env.DEV ? '' : 'https://field-relay-nba.jeffunglesbee.workers.dev'

async function fetchStreakBoardForDate(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) return null
  const json = await res.json()
  return json.record_streak_board ?? null
}

function lastNDates(n) {
  const dates = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

// Multi-day streak across the relay -- NOT the relay's own
// record_streak_board (that's a single-day snapshot, already rendered
// in StreakBoard). This is client-computed from 7 SEPARATE
// createResource calls at 7 different dates, alive concurrently --
// scaling past DayComparison's two independent contexts to seven. For
// each team, counts how many of the last 7 days it appeared in that
// day's own "hot" list -- a real cross-day pattern the relay itself
// never assembles, built entirely client-side from repeated single-day
// snapshots.
function MultiDayStreak() {
  const dates = lastNDates(7)
  // Seven independent resource instances, not one resource over an
  // array -- each date genuinely gets its own async context, same
  // pattern as createDayContext but not wrapped in that factory since
  // this needs all seven alive at once rather than two swappable ones.
  const resources = dates.map(date => {
    const [data] = createResource(() => date, fetchStreakBoardForDate)
    return { date, data }
  })

  const allLoaded = createMemo(() => resources.every(r => !r.data.loading))

  const teamAppearances = createMemo(() => {
    const counts = {}
    for (const r of resources) {
      // Reads each resource only when it's NOT in error state -- calling
      // the accessor while errored throws (confirmed under the artifact's
      // simulated total-fetch-failure), same posture as StandingRoom.
      const board = r.data.error ? undefined : r.data()
      if (!board?.hot) continue
      for (const s of board.hot) {
        counts[s.team] = (counts[s.team] || 0) + 1
      }
    }
    return Object.entries(counts)
      .filter(([, count]) => count >= 2) // appeared hot on at least 2 of 7 days
      .sort(([, a], [, b]) => b - a)
  })

  return (
    <section class={styles.section}>
      <h3 class={styles.sectionLabel}>Multi-Day Streak (7-day window)</h3>
      <p class={styles.note}>client-computed across 7 concurrent fetches, not the relay's own single-day signal</p>
      <Show when={allLoaded()} fallback={<p class={styles.empty}>Loading 7 days…</p>}>
        <Show when={teamAppearances().length} fallback={<p class={styles.empty}>No team appeared hot on 2+ of the last 7 days.</p>}>
          <div class={styles.streakDaysList}>
            <For each={teamAppearances()}>
              {([team, count]) => (
                <div class={styles.streakDaysRow}>
                  <span class={styles.streakDaysTeam}>{team}</span>
                  <span class={styles.streakDaysCount}>hot on {count}/7 days</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  )
}

// Real, plain-language payoff -- states the reader's own real all-time
// record and which real drama tier has actually been their best/worst
// real read, instead of leaving the tier list and the day-by-day record
// for the reader to cross-reference themselves. Reuses the same two
// memos TierCalibration/MultiDayRecord already compute -- no new fetch,
// no new derivation, just called again here to combine them into one
// sentence.
function useVerdict() {
  const tiers = useTierCalibration()
  const record = useMultiDayRecord()
  return createMemo(() => {
    const rec = record().running
    const recordText = `${rec.w}-${rec.l}-${rec.p}`
    const rated = tiers().filter(t => t.hitRate !== null)
    if (rec.w + rec.l + rec.p === 0) return null
    if (!rated.length) return `Your real all-time record is ${recordText}.`
    const best = rated.reduce((a, b) => (b.hitRate > a.hitRate ? b : a))
    const worst = rated.reduce((a, b) => (b.hitRate < a.hitRate ? b : a))
    if (best.tier === worst.tier) {
      return `Your real all-time record is ${recordText}. Tier ${best.tier} is your only rated tier so far, hitting ${Math.round(best.hitRate * 100)}%.`
    }
    return `Your real all-time record is ${recordText}. Tier ${best.tier} has been your best real read at ${Math.round(best.hitRate * 100)}%, Tier ${worst.tier} your worst at ${Math.round(worst.hitRate * 100)}%.`
  })
}

export function History() {
  const verdict = useVerdict()
  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>History</span>
        <span class={styles.note}>from your own marked outcomes, no fetch</span>
      </header>
      <Show when={verdict()}>
        <p class={styles.verdict}>{verdict()}</p>
      </Show>
      <TierCalibration />
      <MultiDayRecord />
      <PickCalendar />
      <MultiDayStreak />
    </div>
  )
}
