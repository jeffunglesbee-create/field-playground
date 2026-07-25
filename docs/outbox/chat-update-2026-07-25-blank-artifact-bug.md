# chat-update-2026-07-25-blank-artifact-bug

**From:** chat (claude.ai)
**To:** Claude Code
**Status:** OPEN BUG — three attempted fixes from chat, all failed
**Priority:** blocks producing any working standalone artifact

---

## Symptom

The single-file standalone HTML artifact renders a completely blank page.
No content, no error text, no skeleton. Confirmed twice by Jeff on iPad
Safari (IMG_9660). The repo's own `npm run build` and `npm run dev` are
unaffected — this is specific to the inlined single-file artifact running
inside Claude.ai's sandboxed iframe.

**Important dividing line:** earlier artifacts today DID render. IMG_9645
(~57 kB artifact) rendered fully. IMG_9659 rendered too — that's the
screenshot that produced the DeskCard-truncation and Seasons-disappearance
fixes. Blank pages start with the recent, larger builds (~186-195 kB).

---

## What chat already tried (all failed)

1. **Base64 data-URL embedding** of the two lazy chunks
   (`Seasons`, `HeavyPanel`) into the main bundle. Blank.
2. **Dedicated artifact build target** — `App.artifact.jsx`,
   `main.artifact.jsx`, `index.artifact.html`, `vite.config.artifact.js`,
   using `lazy(() => Promise.resolve({default: C}))` so Vite emits zero
   chunks. Build verified clean (63 modules, 1 JS + 1 CSS, no chunks).
   Blank.
3. **Sandbox API shims** — a classic (non-module) script injected before
   the app providing in-memory `localStorage`/`sessionStorage`, a no-op
   `BroadcastChannel`, and try-wrapped `history.replaceState`/`pushState`,
   plus a `window.onerror`/`unhandledrejection` handler that paints the
   error into `#root`. Blank — **and notably the error surface printed
   nothing**, which is itself a strong clue (see below).

---

## What has been positively ruled out

- Neither bundle contains a `</script>` sequence (would break inlining).
- Neither CSS file contains `</style>`.
- Both bundles contain the real `getElementById("root")` entry.
- Generated HTML is well-formed: correct doctype, closes properly,
  expected script/style tag counts, shim ordered before the app module.
- Not a packaging regression — reverting to the exact packaging that
  rendered earlier today still produced a blank page, which means the
  packaging was never the cause.
- Not a build failure — every build compiles clean.

---

## Leading hypothesis (chat cannot confirm — no browser access)

**Unguarded `createResource` errors removing the entire component tree,
triggered by fetches failing from the artifact's opaque origin.**

This is the exact failure mode Claude Code already documented and fixed
for Seasons in `cc-session-2026-07-25-bugfix-deskcard-seasons.md`:

> "SolidJS propagates unhandled resource errors up the component tree;
> without a boundary to catch the throw, the entire Seasons subtree —
> including the Suspense fallback — is removed silently."

Two things make this plausible app-wide in the artifact specifically:

1. **Opaque origin.** A sandboxed iframe sends `Origin: null`. If the
   relay's CORS handling doesn't return a usable
   `Access-Control-Allow-Origin` for a null origin, *every* relay fetch
   fails — in a normal browser with a real origin, they all succeed.
   That would explain why the same code renders in dev/prod but not here.
2. **Resource count has grown a lot.** `relay.js` alone has 5
   module-level `createResource` calls; `DayComparison` adds 2,
   `MultiDayStreak` adds 5, `DrillDown`, `SuspenseDemo`,
   `TransitionDemo`, and `DateBrowserTransition` add more — roughly
   15+ concurrent requests fire at load. Every fetcher in `relay.js`
   throws on non-200. Any that reach a component without an
   `ErrorBoundary` above them take that subtree down with them, and
   enough of those removes everything.

**Why the error surface stayed silent supports this:** SolidJS handles a
propagating resource error by removing the subtree, not by throwing to
`window.onerror` — so a `window.addEventListener('error')` handler would
never fire. A blank page with no console error is precisely what this
failure mode looks like.

---

## Suggested fix (Claude Code's call, this is chat's best guess)

1. **Top-level `<ErrorBoundary>` wrapping the entire `App` tree**, not
   just Seasons — so no single failing resource can ever remove
   everything, and any failure renders a visible message.
2. **Make `relay.js` fetchers degrade instead of throw** — return a
   documented empty/degraded shape on non-200 rather than
   `throw new Error(...)`. Components already handle empty data
   (`EmptyNight`, `Show` fallbacks); they don't handle a thrown resource.
   This is the more durable fix — boundaries contain the damage, but
   non-throwing fetchers mean there's no damage to contain.
3. **Per-section boundaries** for the demo components, so one broken
   demo doesn't take its neighbors with it.

---

## Please add a real test for this

The core process failure here was mine: I shipped three artifacts on the
strength of "the build compiled," which says nothing about whether the
page runs. There's already a proven Playwright harness in this repo
(`scripts/verify-*.mjs` + the step-level-timeout workflow pattern).

A `verify-artifact.mjs` that:
- builds the artifact HTML exactly as shipped,
- loads it via `page.setContent()` or a `file://`/served URL,
- captures `console` messages and `pageerror` events,
- asserts `document.getElementById('root').childElementCount > 0`,
- writes a manifest to `outbox/`

...would have caught all three of these before they ever reached Jeff,
and would catch the next one. Worth building before the next artifact
attempt rather than after.

---

## Reproduction

```bash
npm install
npm run build
# inline dist/assets/index-*.js + both dist/assets/*.css into a single
# HTML file with <div id="root"></div>, script type="module"
# → open in a sandboxed iframe context (Claude.ai artifact) → blank
```

Current artifact packaging chat used is plain inlining of the main build
output; the `*.artifact.*` files and `vite.config.artifact.js` are an
alternative path that also produced a blank page and can be deleted if
they're not useful to the real fix.
