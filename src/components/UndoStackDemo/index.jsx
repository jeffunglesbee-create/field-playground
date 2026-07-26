import { For, Show, createSignal, onMount, onCleanup } from 'solid-js'
import { createUndoableSignal } from '../../data/undoable'
import styles from './UndoStackDemo.module.css'

// Two independent undoable signals (a counter, a text field) prove the
// middleware doesn't couple instances -- undoing the counter never
// touches the text field's own stack. `active` tracks which one was
// last written to, so the global Ctrl+Z / Ctrl+Shift+Z keyboard binding
// has something sane to route to, the way a real app's single undo
// shortcut has to pick a target among many editable things on screen.

function Field(props) {
  return (
    <div class={styles.field}>
      <div class={styles.fieldHead}>
        <span class={styles.fieldLabel}>{props.label}</span>
        <span class={styles.depths}>
          <span class={styles.depthChip} title="undo depth">↶{props.controls.undoDepth()}</span>
          <span class={styles.depthChip} title="redo depth">↷{props.controls.redoDepth()}</span>
        </span>
      </div>
      {props.children}
      <div class={styles.fieldButtons}>
        <button
          class={styles.stepBtn}
          disabled={!props.controls.canUndo()}
          onClick={() => { props.onFocus(); props.controls.undo() }}
        >
          undo
        </button>
        <button
          class={styles.stepBtn}
          disabled={!props.controls.canRedo()}
          onClick={() => { props.onFocus(); props.controls.redo() }}
        >
          redo
        </button>
      </div>
    </div>
  )
}

export function UndoStackDemo() {
  const [count, setCount, countControls] = createUndoableSignal(0)
  const [text, setText, textControls] = createUndoableSignal('')
  const [active, setActive] = createSignal('count')
  const [log, setLog] = createSignal([])

  function pushLog(entry) {
    setLog(l => [...l.slice(-19), entry])
  }

  function handleKeydown(e) {
    const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z'
    const isRedo = (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z'
    if (!isUndo && !isRedo) return
    e.preventDefault()
    const controls = active() === 'count' ? countControls : textControls
    const ok = isUndo ? controls.undo() : controls.redo()
    if (ok) pushLog(`${isUndo ? 'undo' : 'redo'} → ${active()}`)
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown)
    onCleanup(() => window.removeEventListener('keydown', handleKeydown))
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Undo Stack</span>
        <span class={styles.sublabel}>createUndoableSignal — Ctrl+Z routes to last-touched field</span>
      </header>
      <p class={styles.note}>
        Two independently undoable signals, one keyboard shortcut. Interception is per-setter,
        not global -- undoing the counter never touches the text field's own history.
      </p>

      <Field label="counter" controls={countControls} onFocus={() => setActive('count')}>
        <div class={styles.counterRow}>
          <button
            class={styles.stepBtn}
            onClick={() => { setActive('count'); setCount(c => c - 1); pushLog(`counter → ${count() - 1}`) }}
          >
            −
          </button>
          <span class={styles.counterValue}>{count()}</span>
          <button
            class={styles.stepBtn}
            onClick={() => { setActive('count'); setCount(c => c + 1); pushLog(`counter → ${count() + 1}`) }}
          >
            +
          </button>
        </div>
      </Field>

      <Field label="text" controls={textControls} onFocus={() => setActive('text')}>
        <input
          type="text"
          class={styles.textInput}
          value={text()}
          placeholder="type here, then Ctrl+Z"
          onFocus={() => setActive('text')}
          onInput={e => { setText(e.currentTarget.value); pushLog(`text → "${e.currentTarget.value}"`) }}
        />
      </Field>

      <Show when={log().length}>
        <div class={styles.logSection}>
          <div class={styles.logLabel}>history ({log().length})</div>
          <div class={styles.logList}>
            <For each={[...log()].reverse()}>{entry => <div class={styles.logEntry}>{entry}</div>}</For>
          </div>
        </div>
      </Show>
    </div>
  )
}
