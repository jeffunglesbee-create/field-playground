import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { broadcastCallCandidates, refetchBroadcastCallCandidates } from '../../data/relay'
import { buildCallScript, fetchCloudTts } from '../../data/broadcastCall'
import styles from './BroadcastCall.module.css'

// The Broadcast Call -- real generative audio narration, reading a real
// script built entirely from real archived-game fields (team names, final
// score, drama_peak, the same flip/fizzle signals Terrain Flight uses as
// landmarks). No filler play-by-play this data doesn't contain -- every
// sentence in the script maps to one real field, see
// src/data/broadcastCall.js.
//
// Two real voice engines, tried in order, always honestly labeled which one
// actually spoke:
//   1. Cloudflare Workers AI (Deepgram aura-2-en) via field-relay-nba's real
//      /audio/tts route -- a real neural voice, free tier (Workers AI's own
//      10,000 neurons/day, no separate account). Confirmed live 2026-08-04.
//   2. Browser SpeechSynthesis -- always-available fallback if the cloud
//      voice fails for any real reason (network, relay's free daily budget
//      exhausted, AI binding not yet propagated). The fallback is never
//      silent: the real failure reason is shown, not hidden.
export function BroadcastCall() {
  const call = createMemo(() => {
    const data = broadcastCallCandidates.error ? undefined : broadcastCallCandidates()
    for (const g of data?.games ?? []) {
      const c = buildCallScript(g)
      if (c) return c
    }
    return null
  })

  const browserSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = createSignal(false)
  const [loadingCloud, setLoadingCloud] = createSignal(false)
  const [voiceSource, setVoiceSource] = createSignal(null) // null | 'cloud' | 'browser'
  const [cloudFailReason, setCloudFailReason] = createSignal(null)
  const [error, setError] = createSignal(null)

  let disposed = false
  let currentAudio = null
  let currentAudioUrl = null

  function releaseAudio() {
    if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl)
    currentAudio = null
    currentAudioUrl = null
  }

  onCleanup(() => {
    disposed = true
    if (currentAudio) currentAudio.pause()
    releaseAudio()
    if (browserSupported) window.speechSynthesis.cancel()
  })

  function speakBrowser(text) {
    if (!browserSupported) {
      setError('Cloudflare voice unavailable (' + cloudFailReason() + ') and this browser has no speech synthesis either.')
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.onstart = () => { setSpeaking(true); setVoiceSource('browser') }
    utter.onend = () => setSpeaking(false)
    utter.onerror = e => { setSpeaking(false); setError('Speech synthesis failed: ' + (e?.error ?? 'unknown error')) }
    window.speechSynthesis.speak(utter)
  }

  async function speak() {
    const c = call()
    if (!c) return
    setError(null)
    setCloudFailReason(null)
    stop()

    setLoadingCloud(true)
    try {
      const blob = await fetchCloudTts(c.text)
      if (disposed) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudio = audio
      currentAudioUrl = url
      audio.onplay = () => { setSpeaking(true); setVoiceSource('cloud') }
      audio.onended = () => { setSpeaking(false); releaseAudio() }
      audio.onerror = () => { setSpeaking(false); releaseAudio() }
      await audio.play()
    } catch (e) {
      if (disposed) return
      setCloudFailReason(String(e?.message ?? e))
      speakBrowser(c.text)
    } finally {
      if (!disposed) setLoadingCloud(false)
    }
  }

  function stop() {
    if (currentAudio) currentAudio.pause()
    releaseAudio()
    if (browserSupported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>The Broadcast Call</span>
        <button class={styles.refreshBtn} onClick={refetchBroadcastCallCandidates} aria-label="refresh">↻</button>
      </header>
      <p class={styles.note}>
        A real generated call, read aloud by a real neural voice (Cloudflare Workers AI) with your browser's own
        speech synthesis as an honest fallback -- every line built from one real field of an archived game, no
        invented play-by-play.
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
                    when={loadingCloud()}
                    fallback={
                      <Show
                        when={!speaking()}
                        fallback={<button class={styles.stopBtn} onClick={stop}>■ Stop</button>}
                      >
                        <button class={styles.callBtn} onClick={speak}>▶ Call the game</button>
                      </Show>
                    }
                  >
                    <button class={styles.callBtn} disabled>⏳ Calling…</button>
                  </Show>
                  <Show when={voiceSource() === 'cloud'}>
                    <span class={styles.voiceBadge}>🔊 Cloudflare AI voice</span>
                  </Show>
                  <Show when={voiceSource() === 'browser'}>
                    <span class={styles.voiceBadgeFallback}>
                      🔊 Browser voice{cloudFailReason() ? ' — Cloudflare unavailable: ' + cloudFailReason() : ''}
                    </span>
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
