import { For, Show, createMemo, createSignal, createEffect } from 'solid-js'
import { createStore } from 'solid-js/store'
import { deskStore } from '../../data/relay'
import styles from './LocalNoteLayer.module.css'

// local_note is a confirmed relay field on games (separate from `note`,
// the individual-sport scoreline substitute DeskCard already reads).
// This is a different pattern from the optimistic score editor: that one
// overwrites a value that's expected to CONVERGE with the relay on the
// next poll. A local_note override is meant to persist indefinitely --
// UNLESS the relay's own value moves, which is a signal an editor
// upstream changed it, at which point the local edit is stale and gets
// dropped automatically rather than silently shadowing new content.

const STORAGE_KEY = 'field-local-note-overrides'

function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    // Valid JSON like `null`, `42`, or an array would otherwise bypass the
    // catch below and get handed to createStore as-is.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// gameId -> { note: string, relaySnapshot: string|null } -- relaySnapshot
// pins what the relay's local_note read AT THE MOMENT the override was
// set, so a later mismatch is detectable.
const [overrides, setOverrides] = createStore(loadOverrides())

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...overrides })) } catch { /* best effort */ }
}

function setOverride(gameId, note, relaySnapshot) {
  setOverrides(gameId, { note, relaySnapshot })
  persist()
}

function clearOverride(gameId) {
  setOverrides(gameId, undefined)
  persist()
}

function useNotedGames() {
  const games = createMemo(() => [
    ...(deskStore.games?.regular ?? []),
    ...(deskStore.games?.postseason ?? []),
  ].filter(g => g.local_note != null || overrides[g.id]))

  // Side effect (dropping stale overrides) belongs in createEffect, not
  // the memo above -- mutating the store during a memo's own computation
  // risks re-triggering that same computation mid-flush.
  createEffect(() => {
    for (const g of games()) {
      const ov = overrides[g.id]
      if (ov && ov.relaySnapshot !== (g.local_note ?? null)) {
        clearOverride(g.id)
      }
    }
  })

  return createMemo(() =>
    games().map(g => {
      const ov = overrides[g.id]
      const isOverride = !!ov && ov.relaySnapshot === (g.local_note ?? null)
      return {
        game: g,
        text: isOverride ? ov.note : (g.local_note ?? null),
        isOverride,
      }
    })
  )
}

function NoteRow(props) {
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal(props.entry.text ?? '')

  const commit = () => {
    setOverride(props.entry.game.id, draft(), props.entry.game.local_note ?? null)
    setEditing(false)
  }

  return (
    <div class={styles.row}>
      <div class={styles.rowHead}>
        <span class={styles.matchup}>{props.entry.game.away} @ {props.entry.game.home}</span>
        <Show when={props.entry.isOverride}>
          <span class={styles.overrideTag} title="locally overridden -- clears automatically if the relay's own note changes">
            local
          </span>
        </Show>
      </div>
      <Show
        when={editing()}
        fallback={
          <button
            type="button"
            class={styles.noteDisplay}
            onClick={() => { setDraft(props.entry.text ?? ''); setEditing(true) }}
          >
            <span class={styles.noteText}>{props.entry.text || <em class={styles.noteEmpty}>(no note — click to add)</em>}</span>
            <span class={styles.editHint}>edit</span>
          </button>
        }
      >
        <div class={styles.editRow}>
          <input
            type="text"
            class={styles.noteInput}
            aria-label={`local note for ${props.entry.game.away} at ${props.entry.game.home}`}
            value={draft()}
            onInput={e => setDraft(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Enter' && commit()}
          />
          <button class={styles.saveBtn} onClick={commit}>save</button>
          <button class={styles.cancelBtn} onClick={() => setEditing(false)}>cancel</button>
        </div>
      </Show>
    </div>
  )
}

export function LocalNoteLayer() {
  const notedGames = useNotedGames()

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Local Notes</span>
        <span class={styles.sublabel}>overrides clear if the relay note changes</span>
      </header>
      <Show when={notedGames().length} fallback={<p class={styles.empty}>No games carry a local_note today.</p>}>
        <div class={styles.list}>
          <For each={notedGames()}>{entry => <NoteRow entry={entry} />}</For>
        </div>
      </Show>
    </div>
  )
}
