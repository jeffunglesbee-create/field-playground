import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { broadcastCallCandidates, refetchBroadcastCallCandidates } from '../../data/relay'
import { buildCallScript } from '../../data/broadcastCall'
import styles from './BroadcastCall.module.css'

// The Broadcast Call -- real generative audio narration. Not
// synthesized instruments (DramaSoundscape/GameSymphonyArchive's
// territory) -- real speech, via the browser's real, standard
// SpeechSynthesis API, reading a real script built entirely from real
// archived-game fields (team names, final score, drama_peak, the same
// flip/fizzle signals Terrain Flight uses as landmarks). No filler
// play-by-play this data doesn't contain -- every sentence in the
// script maps to one real field, see src/data/broadcastCall.js.
export function BroadcastCall() {
  const call = createMemo(() => {
    const data = broadcastCallCandidates.error ? undefined : broadcastCallCandidates()
    for (const g of data?.games ?? []) {
      const c = buildCallScript(g)
      if (c) return c
    }
    return null
  })

  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = createSignal(false)
  const [error, setError] = createSignal(null)

  onCleanup(() => {
    if (supported) window.speechSynthesis.cancel()
  })

  function speak() {
    const c = call()
    if (!c || !supported) return
    setError(null)
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(c.text)
    utter.onstart = () => setSpeaking(true)
    utter.onend = () => setSpeaking(false)
    utter.onerror = e => { setSpeaking(false); setError('Speech synthesis failed: ' + (e?.error ?? 'unknown error')) }
    window.speechSynthesis.speak(utter)
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>The Broadcast Call</span>
        <button class={styles.refreshBtn} onClick={refetchBroadcastCallCandidates} aria-label="refresh">↻</button>
      </header>
      <p class={styles.note}>
        A real generated call, read aloud by your browser's real speech synthesis -- every line built from one
        real field of an archived game, no invented play-by-play.
      </p>

      <Show when={broadcastCallCandidates.error}>
        <p class={styles.error}>{String(broadcastCallCandidates.error)}</p>
      </Show>

      <Show when={!broadcastCallCandidates.error}>
        <Show when={broadcastCallCandidates()} fallback={<p class={styles.loading}>Loading…</p>}>
          <Show when={call()} fallback={<p class={styles.empty}>No real archived game with a usable drama_arc in the current sample.</p>}>
            {c => (
              <>
                <p class={styles.transcript}>{c().text}</p>
                <div class={styles.controls}>
                  <Show
                    when={supported}
                    fallback={<span class={styles.unsupported}>Speech synthesis isn't available in this browser -- transcript above is the real generated call.</span>}
                  >
                    <Show
                      when={!speaking()}
                      fallback={<button class={styles.stopBtn} onClick={stop}>■ Stop</button>}
                    >
                      <button class={styles.callBtn} onClick={speak}>▶ Call the game</button>
                    </Show>
                  </Show>
                  <Show when={error()}>
                    <span class={styles.error}>{error()}</span>
                  </Show>
                </div>
              </>
            )}
          </Show>
        </Show>
      </Show>
    </div>
  )
}
