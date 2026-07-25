import { For, Show, createMemo, createResource } from 'solid-js'
import { createDayContext } from '../../data/relay'
import styles from './MultiDateTrend.module.css'

// Fixed-size fleet fan-out, different shape from everything else that
// uses createDayContext: MultiDayStreak (App-level) creates 5 contexts
// for one fixed team; this creates 7, and pairs EACH day's context with
// a second, independent resource (the day's own newspaper pick) that
// createDayContext doesn't cover on its own. 14 concurrent resources,
// not one.

const RELAY_BASE = import.meta.env.DEV ? '' : 'https://field-relay-nba.jeffunglesbee.workers.dev'
const DAYS = 7

function dayOffset(n) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().split('T')[0]
}

// Same implied-side parse as CompareToRelay: the editorial score string
// ("2–1") encodes home/away favorite, not an explicit side field.
function impliedSide(scoreStr) {
  const m = String(scoreStr ?? '').match(/(\d+)\D+(\d+)/)
  if (!m) return null
  const [homeNum, awayNum] = [Number(m[1]), Number(m[2])]
  if (homeNum === awayNum) return null
  return homeNum > awayNum ? 'home' : 'away'
}

async function fetchTopPick(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) throw new Error(`newspaper fetch failed: ${res.status}`)
  const json = await res.json()
  return json.pick?.ranked?.[0] ?? null
}

export function MultiDateTrend() {
  const days = Array.from({ length: DAYS }, (_, i) => dayOffset(DAYS - 1 - i))
  const entries = days.map(date => {
    const ctx = createDayContext(date)
    const [topPick] = createResource(() => date, fetchTopPick)
    return { date, ctx, topPick }
  })

  const allLoaded = createMemo(() => entries.every(e => !e.ctx.data.loading && !e.topPick.loading))

  const trend = createMemo(() =>
    entries.map(e => {
      const pick = e.topPick()
      if (!pick) return { date: e.date, result: null, pick: null }
      const games = [
        ...(e.ctx.data()?.games?.regular ?? []),
        ...(e.ctx.data()?.games?.postseason ?? []),
      ]
      const g = games.find(gm => gm.id === pick.game_id)
      const implied = impliedSide(pick.score)
      if (!g || g.home_score == null || !implied) return { date: e.date, result: null, pick }
      const actual = g.home_score > g.away_score ? 'home' : 'away'
      return { date: e.date, result: implied === actual ? 'W' : 'L', pick }
    })
  )

  const record = createMemo(() => {
    let w = 0, l = 0
    for (const t of trend()) {
      if (t.result === 'W') w++
      else if (t.result === 'L') l++
    }
    return { w, l }
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>7-Day Trend</span>
        <span class={styles.sublabel}>editorial top pick vs. real results</span>
      </header>
      <Show when={allLoaded()} fallback={<p class={styles.empty}>Loading 7 days…</p>}>
        <div class={styles.trendRow}>
          <For each={trend()}>
            {t => (
              <span
                class={`${styles.pip} ${t.result ? styles['pip_' + t.result] : styles.pip_none}`}
                title={t.pick ? `${t.date}: ${t.pick.away} @ ${t.pick.home} — ${t.result ?? 'pending'}` : t.date}
              >
                {t.result ?? '·'}
              </span>
            )}
          </For>
        </div>
        <div class={styles.recordLine}>
          {record().w}-{record().l} over the last {DAYS} days
        </div>
      </Show>
    </div>
  )
}
