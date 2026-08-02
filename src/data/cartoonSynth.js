// Shared synth engine, extracted verbatim from DramaSoundscape (the
// six cartoon gestures + webaudio-tinysynth setup) so Game Symphony
// Archive can replay reconstructed cue sequences through the exact
// same real, synthesized sounds instead of re-implementing them --
// same "one source of truth" reasoning as dramaCueEngine.js.
//
// Framework-free factory, not a Solid signal-bound singleton: each
// caller gets its OWN synth instance + audio context (DramaSoundscape
// and GameSymphonyArchive can both have one active without fighting
// over shared state), matching this project's established "neither
// backstops the other" independence pattern.
//
// EVERY SOUND IS SYNTHESIZED, NONE SAMPLED -- see DramaSoundscape's
// own header comment for the full real sourcing/licensing rationale
// (webaudio-tinysynth, Apache-2.0, zero deps, real GM instrument
// programs). Not re-explained here to avoid drift between two copies
// of the same rationale -- DramaSoundscape/index.jsx is the source.

const CDN_URL = 'https://esm.sh/webaudio-tinysynth@1.1.3'
const GM = { WHISTLE: 78, TROMBONE: 57, XYLOPHONE: 13, GLOCKENSPIEL: 9 }
const CH = { boing: 0, trombone: 1, xylo: 2, bell: 3 }

export async function createCartoonSynth({ volume = 0.6 } = {}) {
  const mod = await import(/* @vite-ignore */ CDN_URL)
  const WebAudioTinySynth = mod.default ?? mod.WebAudioTinySynth ?? mod
  const s = new WebAudioTinySynth({ quality: 1, useReverb: 0 })
  await s.getAudioContext().resume()
  s.setProgram(CH.boing, GM.WHISTLE)
  s.setProgram(CH.trombone, GM.TROMBONE)
  s.setProgram(CH.xylo, GM.XYLOPHONE)
  s.setProgram(CH.bell, GM.GLOCKENSPIEL)
  s.setBendRange(CH.boing, 1200)
  s.setBendRange(CH.trombone, 1200)
  s.setBendRange(CH.xylo, 1200)
  s.setMasterVol(volume)

  function playBoing() {
    const t = s.getAudioContext().currentTime
    s.noteOn(CH.boing, 60, 110, t)
    s.setBend(CH.boing, 8192, t)
    s.setBend(CH.boing, 12500, t + 0.03)
    s.setBend(CH.boing, 16383, t + 0.06)
    s.setBend(CH.boing, 14500, t + 0.10)
    s.setModulation(CH.boing, 100, t + 0.10)
    s.noteOff(CH.boing, 60, t + 0.22)
    s.setBend(CH.boing, 8192, t + 0.23)
    s.setModulation(CH.boing, 0, t + 0.23)
  }

  function playWahTrombone() {
    const t = s.getAudioContext().currentTime
    const notes = [55, 53, 50, 48]
    notes.forEach((n, i) => {
      const start = t + i * 0.2
      const dur = i === 3 ? 0.5 : 0.18
      s.noteOn(CH.trombone, n, 100, start)
      s.setBend(CH.trombone, 6800, start)
      s.setBend(CH.trombone, 8192, start + 0.05)
      if (i === notes.length - 1) s.setModulation(CH.trombone, 100, start + 0.15)
      s.noteOff(CH.trombone, n, start + dur)
    })
    const end = t + (notes.length - 1) * 0.2 + 0.5
    s.setModulation(CH.trombone, 0, end)
    s.setBend(CH.trombone, 8192, end)
  }

  function playXyloRun() {
    const t = s.getAudioContext().currentTime
    const notes = [60, 62, 64, 67, 72]
    notes.forEach((n, i) => {
      const start = t + i * 0.06
      s.noteOn(CH.xylo, n, 100, start)
      if (i === notes.length - 1) {
        s.setBend(CH.xylo, 8192, start)
        s.setBend(CH.xylo, 9400, start + 0.02)
        s.setBend(CH.xylo, 8192, start + 0.06)
      }
      s.noteOff(CH.xylo, n, start + 0.08)
    })
  }

  function playDing() {
    const t = s.getAudioContext().currentTime
    s.noteOn(CH.bell, 76, 100, t)
    s.noteOff(CH.bell, 76, t + 0.4)
    s.noteOn(CH.bell, 84, 100, t + 0.12)
    s.noteOff(CH.bell, 84, t + 0.12 + 0.5)
  }

  function playSuspense() {
    const t = s.getAudioContext().currentTime
    const notes = [36, 36, 31]
    notes.forEach((n, i) => {
      const start = t + i * 0.18
      s.noteOn(CH.trombone, n, 100, start)
      if (i === notes.length - 1) s.setModulation(CH.trombone, 80, start)
      s.noteOff(CH.trombone, n, start + 0.2)
    })
    s.setModulation(CH.trombone, 0, t + (notes.length - 1) * 0.18 + 0.2)
  }

  function playTaDa() {
    const t = s.getAudioContext().currentTime
    const notes = [60, 64, 67, 72]
    notes.forEach((n, i) => {
      const start = t + i * 0.1
      const dur = i === 3 ? 0.6 : 0.15
      s.noteOn(CH.bell, n, 100, start)
      if (i === notes.length - 1) s.setModulation(CH.bell, 70, start + 0.15)
      s.noteOff(CH.bell, n, start + dur)
    })
    s.setModulation(CH.bell, 0, t + (notes.length - 1) * 0.1 + 0.6)
  }

  function setVolume(v) { s.setMasterVol(v) }

  function dispose() {
    s.allSoundOff(CH.boing); s.allSoundOff(CH.trombone); s.allSoundOff(CH.xylo); s.allSoundOff(CH.bell)
    s.getAudioContext()?.close?.()
  }

  return { playBoing, playWahTrombone, playXyloRun, playDing, playSuspense, playTaDa, setVolume, dispose }
}

// cue key (dramaCueEngine.js) -> which real gesture plays for it.
export const CUE_TO_GESTURE = {
  leadChange: 'playBoing',
  comeback: 'playXyloRun',
  blowout: 'playWahTrombone',
  extraFrames: 'playSuspense',
  dramaticFinal: 'playTaDa',
}
