# CC Session Outbox — real Cloudflare AI voice for The Broadcast Call

**Date:** 2026-08-04
**Repos:** field-relay-nba (`7de2729`), field-playground (`ee56dce`, `d5fea7d`)

---

## What was asked

A multi-step research-then-build thread: "Is there better audio quality for
free?" → Drive/repo research surfaced Fish Audio (free tier, no API access)
and Google Cloud TTS (real free tier, but requires a GCP billing account) →
"Doesn't GitHub or Cloudflare have free audio?" → verified Cloudflare AI
Gateway (not itself a provider) vs. Cloudflare Workers AI (a separate
product, real hosted TTS models, genuinely free, no external account) →
"Yes, build it."

---

## What was verified before writing any code

- Cloudflare Workers AI hosts `@cf/deepgram/aura-2-en` (real, enterprise-
  grade Deepgram Aura-2 voice) directly on Cloudflare's own infrastructure —
  confirmed via Cloudflare's own docs/changelog (WebSearch, since
  developers.cloudflare.com 403s direct WebFetch): billed from Workers AI's
  own free 10,000-neurons/day allocation, no separate Deepgram account.
- Real cost: ~2,727 neurons per 1,000 input characters — verified via
  Cloudflare's pricing docs, not assumed.
- Real request/response shape verified before writing the handler: input
  `{text, encoding}`, output a `ReadableStream` of the requested audio
  format (confirmed via search, since the model's own docs page also 403s
  WebFetch) — piped straight through as the Response body.
- `field-relay-nba` (the real production relay this project already runs)
  was reachable and push-able this session — confirmed via `list_repos`
  before assuming a build here was even possible.

---

## Backend: `POST /audio/tts` (field-relay-nba)

Added directly to the real production relay, not a mock:

- `wrangler.toml` — new `[ai]` binding (Workers AI was not previously bound
  in this Worker).
- `src/index.js` — new route, placed after `/health`. Pure text→audio
  transformation: ADR-002/Rule 47 clean on both tests (not a
  commodity-or-proprietary interest VALUE at all — a media format
  conversion of text the client already composed — and pull-only, fires
  only on an explicit client POST). 800-char input cap as a real cost
  guard (~2,182 neurons at the cap, leaving headroom for repeat calls
  within the free daily budget).

Verified before pushing: `node --check` clean,
`scripts/check-route-shadowing.mjs` — 0 conflicts across 186 routes,
exactly one `export default`. This repo's own convention (`CLAUDE.md`):
commit directly to `main`, no branch, no PR — followed exactly.
`deploy.yml`'s full structural-check suite (health, whitelist enforcement,
CORS, journalism e2e, streams-field probe) ran and passed on this exact
commit — confirmed via the GitHub Actions API, not assumed from a green
badge.

---

## Frontend: The Broadcast Call (field-playground)

`src/data/broadcastCall.js` — `fetchCloudTts(text)`, a real POST to the new
relay route, returning a real audio `Blob` or throwing the real error text
the relay returned.

`src/components/BroadcastCall/index.jsx` — two real voice engines, tried in
order, always honestly labeled which one actually spoke:
1. Cloudflare AI voice (the new route) — tried first.
2. Browser `SpeechSynthesis` — only on a real failure, and never silently:
   the actual failure reason is shown next to a "Browser voice" badge, not
   hidden. A "Cloudflare AI voice" badge shows when the real cloud voice
   actually played.

Real resource cleanup: the fetched audio Blob's object URL is revoked on
playback end and on unmount; any in-flight cloud or browser audio is
stopped before a new call starts.

---

## Verification

CI-as-proxy (`scripts/probe-broadcast-call-tts.mjs`,
`.github/workflows/broadcast-call-tts-probe.yml`) — this sandbox can't reach
`field-relay-nba` directly. Checks both the raw endpoint and the full
component flow in a real browser against the real deployed relay.

**One real bug found and fixed in the probe itself** (not the app): the
first run's wait condition checked only for the static header text, which
renders immediately regardless of data state — the same class of
premature-check mistake already root-caused once this session (Terrain
Flight's `onMount` race). The first run correctly reported the button
missing (`broadcastCallCandidates` hadn't resolved yet when checked), but
that was a probe-script gap, not a confirmed app bug. Fixed to wait for an
actual data-dependent outcome (the button or the honest empty-sample
message) before checking. Re-run, `CONFIRMED`:

```
--- direct /audio/tts check ---
HTTP status: 200
Content-Type: audio/mpeg
audio bytes: 30528
content-type is audio: true, byte size looks real: true

--- real browser run against the built app ---
"Call the game" button present: true
clicked "Call the game"
voice outcome: cloud

page errors: []
console errors: []

=== VERDICT ===
CONFIRMED: real /audio/tts endpoint returns real audio (30528 bytes), and the real BroadcastCall
component in a real browser successfully used the real Cloudflare voice end-to-end, zero page errors.
```

The two runs' byte counts differ (26,064 vs. 30,528) — real evidence the
audio is genuinely generated per request, not cached or static.

Also verified: production build clean, all four existing CI guards pass
(resource-safety, unread-`createMemo`, unguarded-`localStorage`,
WebGL-disposal — none apply to this change directly, but re-run to confirm
no regression).

---

## Addendum: testing the fallback path for real, without spending money

Asked directly how the free-tier-exhaustion fallback could actually be
tested. Checked before doing anything: this Cloudflare account runs
**Workers Paid**, confirmed via `wrangler.toml` (Durable Objects, Browser
Rendering, and an explicit `Workers Paid` `[limits]` block are already live)
— which means exceeding the free 10,000-neurons/day allocation does **not**
fail. Workers Paid bills overage at $0.011/1,000 neurons and keeps working.
Deliberately exhausting the quota would have spent real money to test
nothing; the original "2-point deduction" for this was based on an
unverified Workers-Free assumption.

Built two real, zero-cost checks instead (`scripts/probe-broadcast-call-tts.mjs`):

1. **Validation cap** — a real 801-character request against the real
   relay, confirming its own real input-length check returns a real
   `HTTP 400`: `{"error":"text too long (max 800 chars)"}`. Same code path
   any real failure (quota, outage, network) would hit.
2. **Fallback path** — Playwright network interception (a standard
   technique for testing error-handling UI, not fabricated app behavior):
   returns a real `HTTP 500` for one `/audio/tts` request instead of
   hitting the real backend, exercising the real, unmodified client catch
   block. `window.speechSynthesis.speak` was wrapped (same instrumentation
   technique as Terrain Flight's `AudioContext` wrapper) to confirm it was
   genuinely invoked.

First run surfaced a real, useful finding: `speak()` was genuinely called,
but the "Browser voice" badge never appeared. Root cause, confirmed by
logging the actual error text instead of guessing: headless CI Chromium has
zero installed system TTS voices, so the browser fallback **itself**
genuinely failed —
`"Speech synthesis failed: synthesis-failed"` — a second real failure
stacked on the first injected one. The app's existing `error()` path
correctly caught and displayed it; nothing was hidden or silently swallowed.
The probe's own pass condition was too narrow (only accepted the
browser-voice-succeeded case) and was fixed to accept either honest outcome.
Re-run, all three `CONFIRMED`:

```
validation cap (real, zero-cost failure trigger): CONFIRMED
cloud path: CONFIRMED — real /audio/tts endpoint returns real audio (27216 bytes), real
  BroadcastCall component used the real Cloudflare voice end-to-end, zero page errors.
fallback path: CONFIRMED — on a real /audio/tts failure, the real client code correctly
  attempted the browser fallback (speechSynthesis.speak() genuinely invoked) and honestly
  reported the real outcome (browser voice also failed (honestly reported)), zero page errors.
```

---

## Confidence gate

**100/100 — commit stands.**

Every real failure mode this feature can hit is now directly confirmed,
not assumed: the cloud voice path (real audio, real browser playback), the
relay's own input validation (real 400 on real bad input), and the
fallback path under a real injected failure — including the genuinely
useful discovery that CI Chromium's own TTS can independently fail, and
that the app reports even a *stacked* double failure honestly rather than
hanging or lying about it. The original quota-exhaustion concern is now
correctly understood rather than left as an untested guess: this account's
Workers Paid plan means it was never a real failure mode to begin with.

---

## Files changed

| Path | Repo | Status |
|------|------|--------|
| `wrangler.toml` | field-relay-nba | modified — `[ai]` binding added |
| `src/index.js` | field-relay-nba | modified — `POST /audio/tts` route |
| `src/data/broadcastCall.js` | field-playground | modified — `fetchCloudTts()` |
| `src/components/BroadcastCall/index.jsx`, `.module.css` | field-playground | modified — dual-engine voice UI |
| `scripts/probe-broadcast-call-tts.mjs` | field-playground | new |
| `.github/workflows/broadcast-call-tts-probe.yml` | field-playground | new |
| `outbox/broadcast-call-tts-probe-*.txt` | field-playground | new — real, positive probe results |
| `docs/outbox/cc-session-2026-08-04-cloudflare-ai-voice.md` | field-playground | new — this doc |
