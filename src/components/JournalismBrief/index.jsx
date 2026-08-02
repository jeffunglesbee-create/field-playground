import { Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js'
import { journalismBrief, refetchBrief } from '../../data/relay'
import { safeResource } from '../../data/safeResource'
import styles from './JournalismBrief.module.css'

const POLL_MS = 5 * 60 * 1000

// Two things this component tests that nothing else in the repo does:
// 1. A resource on its own polling cadence (5m), independent of deskStore's 15s
//    cycle -- both live simultaneously in the same app, never stepping on each other.
// 2. Detecting content regeneration via cycleId diff. The relay regenerates the
//    brief when game context changes (new scores, games starting). cycleId is the
//    stable signal for "this is a new brief" -- not generatedAt, which could update
//    for other reasons.
//
// Every field below (brief/generatedAt/cycleId/proseScore/clicheCount/gameCount)
// is the REAL response shape of GET /journalism/brief, confirmed via a direct
// live probe 2026-07-27 -- see relay.js's own comment on the journalismBrief
// resource for the full story of how an earlier version of this file got that
// wrong (twice) before settling here.
export function JournalismBrief() {
  const [prevCycleId, setPrevCycleId] = createSignal(null)
  const [freshlyUpdated, setFreshlyUpdated] = createSignal(false)
  // Ticking clock, read (not just called for side effect) inside `age` below --
  // Date.now() itself isn't a tracked dependency, so without this the memo would
  // only ever re-run when `data()` changes, freezing "Xm ago" between polls.
  const [now, setNow] = createSignal(Date.now())

  // Reads the resource only when it's NOT in error state -- calling the
  // accessor while errored throws (same posture as StandingRoom/DayComparison/
  // MultiDayStreak). Canonical helper now (src/data/safeResource.js) --
  // this exact guard has been independently hand-written 4+ times.
  const data = safeResource(journalismBrief)

  const age = createMemo(() => {
    const d = data()
    if (!d?.generatedAt) return null
    const s = Math.floor((now() - d.generatedAt) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    return `${Math.floor(s / 3600)}h ago`
  })

  // Detect when the relay genuinely regenerated the brief, not just a refetch
  // that returned the same content. cycleId is stable across polls of the same
  // generation; a new one means real new content.
  let updatedTimer
  createMemo(() => {
    const d = data()
    if (!d?.cycleId) return
    const prev = prevCycleId()
    if (prev && prev !== d.cycleId) {
      setFreshlyUpdated(true)
      clearTimeout(updatedTimer)
      updatedTimer = setTimeout(() => setFreshlyUpdated(false), 4000)
    }
    setPrevCycleId(d.cycleId)
  })

  onMount(() => {
    const pollHandle = setInterval(refetchBrief, POLL_MS)
    const clockHandle = setInterval(() => setNow(Date.now()), 30000)
    onCleanup(() => {
      clearInterval(pollHandle)
      clearInterval(clockHandle)
      clearTimeout(updatedTimer)
    })
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Brief</span>
        <Show when={age()}>
          <span class={styles.age}>{age()}</span>
        </Show>
        <Show when={freshlyUpdated()}>
          <span class={styles.updated}>↻ updated</span>
        </Show>
        <button class={styles.refreshBtn} onClick={refetchBrief} aria-label="refresh brief">↻</button>
      </header>
      <Show when={journalismBrief.error}>
        <p class={styles.error}>{String(journalismBrief.error)}</p>
      </Show>
      <Show when={!journalismBrief.error}>
        <Show when={data()} fallback={<p class={styles.loading}>Loading…</p>}>
          <p class={`${styles.brief} ${freshlyUpdated() ? styles.briefFlash : ''}`}>
            {data().brief}
          </p>
          <footer class={styles.meta}>
            <span class={styles.metaItem} title="prose quality score">q{data().proseScore}</span>
            <Show when={data().clicheCount > 0}>
              <span class={styles.metaItem} title="cliché count">{data().clicheCount} cliché{data().clicheCount > 1 ? 's' : ''}</span>
            </Show>
            <span class={styles.metaItem} title="game count">{data().gameCount} games</span>
          </footer>
        </Show>
      </Show>
    </div>
  )
}
