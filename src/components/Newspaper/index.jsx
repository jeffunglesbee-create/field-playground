import { Show, createMemo } from 'solid-js'
import { ambientData, journalismBrief, qualityReport } from '../../data/relay'
import styles from './Newspaper.module.css'

// Newspaper — the assembled front page. Production's renderNewspaper is
// a COMPOSITION layer over pieces the playground already has separately:
// JournalismBrief (today's prose), BriefArchive (history), QualityReport
// (the confidence signal). No new endpoint, no new data model -- this
// is the first time those three are read together rather than each
// living in its own tab.
//
// truth_is and sport_of_week are AmbientPanel's fields, already
// confirmed real and already rendered there. Reused here rather than
// re-fetched -- ambientData is a shared module-level resource, so
// reading it here does not duplicate the request.
//
// TWO REAL BUGS FIXED after the first offline-mode check (0 dead
// sections became 2): every memo below now checks the resource's OWN
// `.error` before calling it as a function. createMemo runs EAGERLY at
// creation, so an errored resource re-throws from inside the memo
// itself -- before the JSX's own <Show when={!error}> guard is ever
// reached. Same eagerness trap as GameDrawerRow's createMemo bug found
// earlier this session, written into fresh code today. Separately,
// the render body was checking `brief.error` -- `brief` is a LOCAL
// wrapper function (`() => journalismBrief()`), not the resource
// itself, so plain functions have no `.error` property and that check
// was always undefined. The real resource is `journalismBrief`.

export function Newspaper() {
  const ambient = () => ambientData()
  const brief = () => journalismBrief()
  const quality = () => qualityReport()

  const masthead = createMemo(() => {
    if (ambientData.error) return ''
    const d = ambient()?.date
    if (!d) return ''
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  })

  // The one genuinely editorial decision this component makes: lead
  // with the CONTRADICTION when one exists (real tension is the most
  // newspaper-like thing FIELD has), fall back to truth_is, then the
  // plain morning report. Never invents a headline when none exists.
  const leadKind = createMemo(() => {
    if (ambientData.error) return null
    if (ambient()?.contradiction) return 'contradiction'
    if (ambient()?.truth_is?.headline) return 'truth_is'
    if (ambient()?.morning_report) return 'morning_report'
    return null
  })

  // A brief's OWN quality standing, cross-referenced against the
  // global quality_report window rather than invented per-brief --
  // /quality/report has no per-brief field, so this is deliberately
  // NOT presented as "this brief's score," only as the surrounding
  // context for the days it covers.
  const qualityContext = createMemo(() => {
    if (qualityReport.error) return null
    const q = quality()
    if (!q?.summary?.length) return null
    const scores = q.summary.map(s => s.avg_score).filter(v => typeof v === 'number')
    if (!scores.length) return null
    return {
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      days: q.days,
    }
  })

  const hasError = createMemo(() =>
    Boolean(ambientData.error || journalismBrief.error || qualityReport.error)
  )

  return (
    <div class={styles.root}>
      <header class={styles.masthead}>
        <h2 class={styles.title}>THE FIELD</h2>
        <div class={styles.mastheadRule} />
        <span class={styles.dateline}>{masthead()}</span>
        <Show when={!ambientData.error && ambient()?.sport_of_week}>
          <span class={styles.sportOfWeek}>{ambient().sport_of_week}</span>
        </Show>
      </header>

      <Show when={hasError()}>
        <p class={styles.empty}>
          Unable to load: {String(
            ambientData.error?.message ?? journalismBrief.error?.message ??
            qualityReport.error?.message ?? ''
          )}
        </p>
      </Show>

      <Show when={!hasError()}>
        <Show when={leadKind() === 'contradiction'}>
          <div class={styles.leadContradiction}>
            <span class={styles.leadKicker}>THE TENSION</span>
            <p class={styles.leadText}>{ambient().contradiction}</p>
          </div>
        </Show>

        <Show when={leadKind() === 'truth_is'}>
          <blockquote class={styles.leadQuote}>{ambient().truth_is.headline}</blockquote>
        </Show>

        <Show when={ambient()?.morning_report}>
          <p class={styles.body}>{ambient().morning_report}</p>
        </Show>

        <Show when={!journalismBrief.error && brief()?.brief}>
          <div class={styles.column}>
            <span class={styles.columnLabel}>Today's Brief</span>
            <p class={styles.body}>{brief().brief}</p>
            <Show when={typeof brief().proseScore === 'number'}>
              <span class={styles.byline}>prose score {brief().proseScore}</span>
            </Show>
          </div>
        </Show>

        <Show when={qualityContext()}>
          <footer class={styles.masthead2}>
            <span class={styles.footNote}>
              {qualityContext().days}-day average quality: {qualityContext().avg}
            </span>
          </footer>
        </Show>
      </Show>
    </div>
  )
}
