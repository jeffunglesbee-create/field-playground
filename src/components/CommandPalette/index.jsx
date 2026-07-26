import { For, Show, createSignal, createMemo, createEffect, onMount, onCleanup } from 'solid-js'
import { currentDate, setCurrentDate, deskStore } from '../../data/relay'
import { setWatched, setHighlightedGameId, setCollapsed, setLiveOnly } from '../DeskCard'
import styles from './CommandPalette.module.css'

// Cmd+K / Ctrl+K opens a modal text input that parses freeform commands
// and runs them against the SAME signals every button in this app already
// writes to (setCurrentDate, setWatched, setHighlightedGameId,
// collapsed/setCollapsed, setLiveOnly). This isn't a shortcut layer
// sitting on top of those buttons -- it's a second, parallel way to reach
// the identical state, proof that a SolidJS signal doesn't care which UI
// surface wrote to it. Because it writes the real signals, every effect
// already wired to them (DeskCard's URL sync, its highlight-scroll) fires
// exactly as if a button had been clicked.
//
// Global (window-level), unlike UndoStackDemo's keyboard listener, which
// is deliberately SCOPED to its own subtree -- that scoping exists to
// avoid hijacking the browser's native Ctrl+Z inside other text inputs on
// the page. Cmd+K has no competing native single-purpose binding to
// protect against, and a command palette is supposed to be reachable from
// anywhere, including while focus is inside another field -- same as
// real command palettes (VS Code, Slack, Linear).

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function allGames() {
  return [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
}

function findGameByFragment(fragment) {
  const f = fragment.trim().toLowerCase()
  if (!f) return null
  return allGames().find(g => g.home?.toLowerCase().includes(f) || g.away?.toLowerCase().includes(f)) ?? null
}

function sportsInSlate() {
  return [...new Set(allGames().map(g => g.sport).filter(Boolean))]
}

const HINTS = [
  'go to YYYY-MM-DD / today / yesterday / tomorrow',
  'watch <team>',
  'unwatch <team>',
  'filter <sport>',
  'clear filter',
  'live only',
  'all games',
]

// Each builder tries to match the raw input; first match wins. Returns
// {label, run} where run is null (not runnable) when the command's shape
// is right but the target (a team, a sport) doesn't resolve to anything
// on today's slate -- Enter shows why instead of silently doing nothing.
const BUILDERS = [
  input => {
    const m = input.match(/^go to (\d{4}-\d{2}-\d{2})$/i)
    return m ? { label: `Go to ${m[1]}`, run: () => setCurrentDate(m[1]) } : null
  },
  input => {
    const m = input.match(/^go to (today|yesterday|tomorrow)$/i)
    if (!m) return null
    const offset = { today: 0, yesterday: -1, tomorrow: 1 }[m[1].toLowerCase()]
    const target = offset === 0 ? todayStr() : shiftDate(todayStr(), offset)
    return { label: `Go to ${m[1].toLowerCase()} (${target})`, run: () => setCurrentDate(target) }
  },
  input => {
    const m = input.match(/^unwatch (.+)$/i)
    if (!m) return null
    const game = findGameByFragment(m[1])
    return game
      ? { label: `Unwatch ${game.away} @ ${game.home}`, run: () => setWatched(game.id, false) }
      : { label: `No game matches "${m[1]}"`, run: null }
  },
  input => {
    const m = input.match(/^watch (.+)$/i)
    if (!m) return null
    const game = findGameByFragment(m[1])
    return game
      ? {
          label: `Watch ${game.away} @ ${game.home}`,
          run: () => { setWatched(game.id, true); setHighlightedGameId(game.id) },
        }
      : { label: `No game matches "${m[1]}"`, run: null }
  },
  input => {
    if (!/^(clear filter|show all)$/i.test(input)) return null
    return { label: 'Clear sport filter', run: () => { for (const s of sportsInSlate()) setCollapsed(s, false) } }
  },
  input => {
    const m = input.match(/^filter (\w+)$/i)
    if (!m) return null
    const sports = sportsInSlate()
    const target = sports.find(s => s.toLowerCase() === m[1].toLowerCase())
    return target
      ? { label: `Filter to ${target} only`, run: () => { for (const s of sports) setCollapsed(s, s !== target) } }
      : { label: `No sport "${m[1]}" on today's slate`, run: null }
  },
  input => (/^live only$/i.test(input) ? { label: 'Show live games only', run: () => setLiveOnly(true) } : null),
  input => (/^all games$/i.test(input) ? { label: 'Show all games', run: () => setLiveOnly(false) } : null),
]

function matchCommand(input) {
  const trimmed = input.trim()
  if (!trimmed) return null
  for (const build of BUILDERS) {
    const result = build(trimmed)
    if (result) return result
  }
  return null
}

export function CommandPalette() {
  const [open, setOpen] = createSignal(false)
  const [input, setInput] = createSignal('')
  const [ranLabel, setRanLabel] = createSignal(null)

  const match = createMemo(() => matchCommand(input()))

  function close() {
    setOpen(false)
    setInput('')
  }

  function runTop() {
    const m = match()
    if (!m || !m.run) return
    m.run()
    setRanLabel(m.label)
    close()
  }

  function handleGlobalKeydown(e) {
    const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
    if (isToggle) {
      e.preventDefault()
      if (open()) close(); else setOpen(true)
      return
    }
    if (open() && e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleGlobalKeydown)
    onCleanup(() => window.removeEventListener('keydown', handleGlobalKeydown))
  })

  createEffect(() => {
    if (!ranLabel()) return
    const timeout = setTimeout(() => setRanLabel(null), 2500)
    onCleanup(() => clearTimeout(timeout))
  })

  return (
    <>
      <Show when={ranLabel()}>
        <div class={styles.toast} role="status">✓ {ranLabel()}</div>
      </Show>
      <Show when={open()}>
        <div class={styles.backdrop} onClick={close}>
          <div
            class={styles.palette}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onClick={e => e.stopPropagation()}
          >
            <input
              ref={el => queueMicrotask(() => el.focus())}
              type="text"
              class={styles.input}
              placeholder="go to 2026-07-20, watch Lakers, filter NBA..."
              aria-label="Command input"
              value={input()}
              onInput={e => setInput(e.currentTarget.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runTop() } }}
            />
            <div class={styles.preview}>
              <Show
                when={input().trim()}
                fallback={
                  <ul class={styles.hintList}>
                    <For each={HINTS}>{h => <li>{h}</li>}</For>
                  </ul>
                }
              >
                <Show when={match()} fallback={<div class={styles.noMatch}>no matching command</div>}>
                  <div class={`${styles.matchLine} ${match().run ? styles.runnable : styles.unrunnable}`}>
                    {match().run ? '↵ ' : '✗ '}{match().label}
                  </div>
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}
