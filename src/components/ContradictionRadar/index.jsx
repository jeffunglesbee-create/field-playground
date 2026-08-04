import { For, Show, createSignal, createMemo } from 'solid-js'
import manifest from '../../data/contradictionRadarManifest.json'
import styles from './ContradictionRadar.module.css'

// Contradiction Radar -- meta-analysis of this repo's OWN outbox doc
// corpus (docs/outbox/*.md, 89 real session docs). A resolved
// contradiction (an old claim vs. the corrected claim, both real, both
// in this project's own written history) is a genuine finding here --
// surfaced by an exact-keyed scan (scripts/build-contradiction-radar-
// manifest.mjs) against a fixed, closed vocabulary already confirmed
// present in the corpus before it was written into code, not fuzzy NLP
// or an LLM re-reading the docs at runtime.
//
// Precomputed at build time, not bundled as raw markdown: the full
// corpus is 628KB, which would roughly double this app's JS payload
// for a handful of real findings. src/data/contradictionRadarManifest.json
// (16KB) is the generated, committed output -- re-run the generator
// script when new outbox docs are added.
const RESULT_LIMIT = 20

export function ContradictionRadar() {
  const [query, setQuery] = createSignal('')

  const filtered = createMemo(() => {
    const q = query().trim().toLowerCase()
    const all = manifest.findings ?? []
    const matched = q ? all.filter(f => f.sentence.toLowerCase().includes(q) || f.file.toLowerCase().includes(q)) : all
    return matched.slice(0, RESULT_LIMIT)
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Contradiction Radar</span>
      </header>
      <p class={styles.note}>
        Every place this project's own outbox docs document catching and correcting a wrong assumption --
        an exact-keyed scan of {manifest.generatedFrom}, matched against a fixed vocabulary
        ({manifest.phrases.length} real phrases), not a re-read by a model. {manifest.findingCount} real findings.
      </p>

      <input
        class={styles.search}
        type="text"
        placeholder="filter by doc name or text…"
        value={query()}
        onInput={e => setQuery(e.currentTarget.value)}
      />

      <Show when={filtered().length} fallback={<p class={styles.empty}>No findings match that filter.</p>}>
        <ol class={styles.rows}>
          <For each={filtered()}>
            {f => (
              <li class={styles.row}>
                <div class={styles.rowHead}>
                  <span class={styles.phraseBadge}>{f.phrase}</span>
                  <span class={styles.fileNote} title={f.file}>{f.date ?? '—'} · {f.title}</span>
                </div>
                <p class={styles.sentence}>{f.sentence}</p>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <Show when={manifest.findingCount > RESULT_LIMIT && !query()}>
        <p class={styles.more}>+{manifest.findingCount - RESULT_LIMIT} more — filter to narrow down.</p>
      </Show>
    </div>
  )
}
