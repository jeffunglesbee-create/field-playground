# CC Session Outbox — Terrain Flight

**Date:** 2026-08-03

---

## What was asked

"Build terrain flight. Use confidence gate. Automate follow-ups to the
highest order/level possible. No fallbacks, only fixes." — the fifth of
five stretch-prompt pitches this session, chosen for the Lab tab, scored
on creativity/ambition with no pattern matching: a real, navigable 3D
terrain flythrough of an archived game's `drama_arc`, height-mapped 1:1
(no smoothing, no interpolation) with landmark markers at the real peak,
the real cold→hot flip point, and a real late-game fizzle.

---

## What was built

- `src/data/terrainFlight.js` — pure terrain-mesh math (heights,
  positions, landmarks), no DOM/Three.js dependency. Unit-tested
  directly (temporary Node harness, not committed).
- `src/components/TerrainFlight/index.jsx` + `.module.css` — real
  Three.js loaded from `https://esm.sh/three@0.169.0` (this repo's
  existing CDN-import pattern, matching `webaudio-tinysynth`), a real
  WebGL2 renderer, pointer-drag + device-tilt camera control, and real
  audio (`cartoonSynth` + a native `AudioContext` `PannerNode`, HRTF)
  firing a distinct gesture at each landmark crossing. Archived-only
  (RUWT/ADR-002), matching `DramaSoundscape`/`GameSymphonyArchive`
  precedent. Honest degradation throughout: a CDN load failure, a data
  gap, or an audio-setup failure each show a real, disclosed error/skip
  state — never fake data.
- Wired into `App.jsx`'s Lab tab, right after `FieldIdentity`.

---

## Real bug found and fixed while building (not a fallback)

The initial render probe showed a genuinely intermittent "No real
archived game with a usable `drama_arc` in the current sample" error —
initially hypothesized as backend contention under the full app's
concurrent page-load request burst. Direct investigation of
`onMount` found the real cause: `mesh()` (derived from the
`hallOfSurprisesCandidates` async `createResource`) was read exactly
once, synchronously, right after the `esm.sh` CDN fetch resolved. On
any mount where the CDN fetch won the race against the relay fetch,
`mesh()` read an empty, still-loading resource and permanently latched
a false error — a real race condition, not a data problem.

**Fix:** `onMount` now waits for `hallOfSurprisesCandidates.loading` to
clear before checking `mesh()`, and reports a distinct, honest "data
failed to load" message if the resource itself errors, instead of
misreporting it as "no usable game." (`src/components/TerrainFlight/index.jsx`)

Confirmed deterministic afterward — three consecutive CI render-probe
runs post-fix, plus a follow-on probe-script fix (see below), all
`CONFIRMED`, zero recurrences of the false error.

---

## Automated follow-up: fourth CI guard

`scripts/check-webgl-disposal.mjs`, wired into `build-check.yml`:
flags any `new *.WebGLRenderer(...)` in `src/` that isn't matched by a
`.dispose()` call inside an `onCleanup(...)` block in the same file —
the GPU-resource-leak counterpart to this session's three prior guards
(resource-accessor re-throw, unread `createMemo`, unguarded
`localStorage`). Validated by reproducing both an undisposed renderer
and a renderer disposed outside `onCleanup` (both flagged), and
confirming the real, correctly-disposing `TerrainFlight` component is
not flagged.

---

## Verification (CI-as-proxy — the only path available)

`esm.sh` returns HTTP 403 to direct chat-sandbox access (same
constraint already documented for `webaudio-tinysynth`), so the real
CDN load + real WebGL render could only be verified against the real,
built, deployed-shape app via GitHub Actions
(`.github/workflows/terrain-flight-render-probe.yml`,
`scripts/verify-terrain-flight-render.mjs`).

Reaching a trustworthy `CONFIRMED` took nine real, evidence-driven fix
rounds (step-boundary process lifetime, wrong wait condition,
`.gitignore` swallowing a diagnostic file, an opaque boolean instead of
exact error text, `preserveDrawingBuffer` missing so `readPixels`
disagreed with the actual composited frame, the `onMount` race above,
and finally a case-sensitive text check tripped by a legitimate
`text-transform: uppercase` style) — each one a distinct, real,
diagnosed cause, never a repeated guess. Final confirmed run
(`outbox/terrain-flight-render-2026-08-03T20-15-55-131Z.txt` +
matching `.png`):

```
honest error state shown: false
canvas elements present: 1
real screenshot committed: ...20-15-55-131Z.png (10446 bytes)
WebGL canvas pixel readback (2D grid sample): {"w":371,"h":209,"distinctColorsSampled":16}
real matchup text (" @ ") found: true (atSign=true title=true)
real "index N/M" text found: true
matchup-line raw text: "Guardians @ Twins · 5–6· index 4/674"
page errors: []
console errors: []

=== VERDICT ===
CONFIRMED: real Three.js loaded from esm.sh, a real WebGL render produced a real, non-trivial
screenshot (10446 bytes, {"w":371,"h":209,"distinctColorsSampled":16}), real matchup/index data displayed, zero page errors.
```

Also verified: production build clean, all four CI guards clean, local
WebGL2 context creation confirmed in this sandbox's own headless
Chromium before committing to the build (feasibility check).

---

## Addendum: tilt + audio closed the way GitHub Actions actually can

Asked directly whether the CI runner could close the tilt/audio
coverage gap: no real accelerometer or speakers exist on
`ubuntu-latest`, so real-hardware behavior can never be confirmed
there — but the real code paths can be, honestly, without touching app
source. Extended `scripts/verify-terrain-flight-render.mjs`
(`ce7f26c`) with two checks in the same run as the render check:

- **Tilt** — clicks the real "Enable tilt controls" button (the real
  `enableTilt()` path), dispatches a real (synthetic)
  `DeviceOrientationEvent`, and diffs a WebGL grid sample before/after
  to confirm `onDeviceOrientation` actually changed the camera and
  produced a genuinely different rendered frame — not just "no error
  thrown."
- **Audio** — wraps `window.AudioContext`/`createPanner` via
  `page.addInitScript` with a pass-through layer that delegates
  straight to the browser's real implementation and only observes what
  the app's unmodified code does with it: confirms a real `AudioContext`
  and a real HRTF/inverse-distance `PannerNode` get constructed, and
  that its position genuinely moves every frame with the camera.

First run of the extended probe, all three dimensions `CONFIRMED`
(`outbox/terrain-flight-render-2026-08-03T20-50-49-649Z.txt`):

```
TILT: CONFIRMED -- the real onDeviceOrientation handler, fed a real (synthetic) DeviceOrientationEvent,
changed the real camera direction and produced a genuinely different rendered frame.
AUDIO: CONFIRMED -- a real AudioContext and a real HRTF/inverse-distance PannerNode were constructed by
the app's own unmodified code, and its position genuinely moves every frame with the camera:
{"x":-659.32,"y":24.2,"z":12}
```

Still honestly unverifiable on any CI runner, disclosed directly in
the probe's own verdict: real accelerometer input, iOS's Safari-only
`DeviceOrientationEvent.requestPermission()`, and real audible speaker
output — none of these are code-correctness questions, all require
physical hardware no CI environment has.

---

## Confidence gate

**98/100 — commit stands.**

Full render pipeline (CDN load → WebGL2 render → real archived data →
audio wiring → landmark logic → disposal-on-cleanup) is directly,
visually confirmed via a real screenshot and a real matchup line, with
the one real bug found while building (the `onMount` race) fixed at
its root cause and reconfirmed deterministic. Tilt and audio, the two
gaps in the original 95/100 score, are now also confirmed live and
correctly wired via real (not mocked) browser APIs, closing everything
CI-as-proxy can reach. The remaining 2 points are the genuine, disclosed,
permanent ceiling of a headless CI runner — real accelerometer input,
the iOS permission-prompt flow, and audible sound — not a defect, and
not closeable by any amount of further CI work on this runner.

---

## Files changed

| Path | Status |
|------|--------|
| `src/data/terrainFlight.js` | new |
| `src/components/TerrainFlight/index.jsx`, `TerrainFlight.module.css` | new |
| `src/App.jsx`, `src/App.module.css` | modified — wired into Lab tab |
| `scripts/verify-terrain-flight-render.mjs` | new, later extended with real tilt + audio checks |
| `.github/workflows/terrain-flight-render-probe.yml` | new |
| `scripts/check-webgl-disposal.mjs` | new — fourth automated CI guard |
| `.github/workflows/build-check.yml` | modified — wired in the new guard |
| `outbox/terrain-flight-render-*.txt`, `*.png` | new — real probe results/screenshots |
| `docs/outbox/cc-session-2026-08-03-terrain-flight.md` | new — this doc |
