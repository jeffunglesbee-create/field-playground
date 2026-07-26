import { Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js'
import { journalismBrief, refetchBrief } from '../../data/relay'
import styles from './JournalismBrief.module.css'

const POLL_MS = 5 * 60 * 1000

// Two things this component tests that nothing else in the repo does:
// 1. A resource on its own polling cadence (5m), independent of deskStore's 15s
//    cycle -- both live simultaneously in the same app, never stepping on each other.
// 2. Detecting content regeneration via real content equality, not a synthetic id.
//    The real /analytics/newspaper/{date} payload (confirmed via a live probe,
//    2026-07-26 -- see relay.js's own comment on this resource) has no cycleId
//    field at all; that field, along with the "brief"/proseScore/clicheCount this
//    component used to render, only ever existed in a fabricated dev mock behind
//    a route -- /journalism/brief -- that was never real on field-relay-nba.
//    Comparing pick.brief's actual text between polls is the honest replacement:
//    it answers "did the real content genuinely change" using only a real field.
export function JournalismBrief() {
  const [prevVerdict, setPrevVerdict] = createSignal(null)
  const [prevDate, setPrevDate] = createSignal(null)
  const [freshlyUpdated, setFreshlyUpdated] = createSignal(false)

  // Reads the resource only when it's NOT in error state -- calling the
  // accessor while errored throws (same posture as StandingRoom/DayComparison/
  // MultiDayStreak).
  const data = () => (journalismBrief.error ? undefined : journalismBrief())

  const verdict = createMemo(() => data()?.pick?.brief ?? null)
  const stars = createMemo(() => data()?.night_stars ?? null)
  const briefDate = createMemo(() => data()?.date ?? null)

  const age = createMemo(() => {
    const generatedAt = data()?.generated_at
    if (!generatedAt) return null
    const s = Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    return `${Math.floor(s / 3600)}h ago`
  })

  // Detect when the relay genuinely regenerated the slate verdict, not just a
  // refetch that returned the same content -- and NOT a date change. The
  // resource is keyed on currentDate, so navigating to a different day
  // reloads it; the new day's first verdict will almost always differ from
  // the old day's stored one, which would otherwise flash "updated" for a
  // date change rather than a genuine same-slate regeneration. Only flash
  // when the date the verdict belongs to hasn't moved.
  createMemo(() => {
    const text = verdict()
    const date = briefDate()
    if (text === null) return
    const prevText = prevVerdict()
    const prevD = prevDate()
    if (prevD === date && prevText !== null && prevText !== text) {
      setFreshlyUpdated(true)
      setTimeout(() => setFreshlyUpdated(false), 4000)
    }
    setPrevVerdict(text)
    setPrevDate(date)
  })

  onMount(() => {
    const handle = setInterval(refetchBrief, POLL_MS)
    onCleanup(() => clearInterval(handle))
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
          <Show
            when={verdict() || stars()}
            fallback={<p class={styles.loading}>No slate verdict this cycle.</p>}
          >
            <Show when={verdict()}>
              <p class={`${styles.brief} ${freshlyUpdated() ? styles.briefFlash : ''}`}>
                {verdict()}
              </p>
            </Show>
            <Show when={stars()}>
              <footer class={styles.stars}>
                <span class={styles.starRating} title={`${stars().starScore} / 10`}>
                  {'★'.repeat(stars().stars)}{'☆'.repeat(Math.max(0, 5 - stars().stars))}
                </span>
                <span class={styles.starDetail}>
                  {stars().dramaGames} drama · {stars().closeGames} close · {stars().walkoffs} walkoff{stars().walkoffs === 1 ? '' : 's'}
                </span>
              </footer>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
