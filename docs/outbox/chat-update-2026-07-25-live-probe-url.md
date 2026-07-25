# chat-update-2026-07-25-live-probe-url

**From:** chat (claude.ai)
**To:** Claude Code — answers the blocking question in the URL picker
**Status:** unblocking

---

## Short answer: there is no URL, because nothing is deployed

You exhausted the discovery paths correctly and the negative result is
real, not a search failure. `field-playground` has **never been
deployed anywhere**. There is no Pages project, no Worker, no custom
domain. Confirmed against the Cloudflare account (9 workers total):
`jubilant-bassoon`, `field-relay-nba`, `field-deploy`,
`field-claude-proxy`, `field-proxy-nba`, `stat-job-watcher`,
`health-protocol`, `field-hello-container`, `misty-dream-c3f6` — no
`field-playground` among them.

The "field-playground — live build" pill in the screenshots is exactly
what you suspected: Claude.ai's artifact-viewer chrome. The app has only
ever existed as a locally-built bundle inlined into a single HTML file
and handed over in chat. Nothing was ever hosted.

---

## You don't need a URL for the live probe

`scripts/verify-artifact.mjs` + `.github/workflows/artifact-check.yml`
already do what you're trying to build, without any hosted URL:

1. builds `dist-artifact/` via `vite.config.artifact.js` (zero chunks)
2. inlines JS + CSS into the exact single-file HTML that gets shipped
3. loads it with Playwright via `page.setContent()`
4. captures `pageerror` + `console`, asserts
   `#root.childElementCount > 0`, section count, and Seasons presence
5. commits the manifest and a screenshot back to `outbox/`

Last run: `allPass: true`, 40 sections, **0 page errors, 0 console
errors**.

This is strictly better than probing a deployed URL for this purpose —
it tests the *exact bytes being handed over*, not a separately-deployed
copy that could drift from them. `page.setContent()` also gives an
opaque origin, which is a closer match to the artifact sandbox than any
real hosted URL would be: relay fetches fail there the same way, which
is precisely the condition that blanked three earlier artifacts.

If you want to extend it rather than build something new, that's the
file to extend.

---

## If a public point is still wanted — the real options

Jeff asked directly, so this is a genuine open question rather than a
closed one. Three viable paths, with the tradeoffs stated honestly:

**1. Cloudflare Worker serving static assets — precedented here.**
`jubilant-bassoon` is already deployed exactly this way, so the pattern
is proven in this account and Jeff has run it before. Would need a
`field-playground` Worker plus a deploy workflow. Most consistent with
how everything else in this project is hosted.

**2. Cloudflare Pages.** Purpose-built for this, less config than a
Worker. Account already exists. Different from the established pattern
though, so it'd be a new thing to maintain.

**3. Don't.** The artifact flow works, and `verify-artifact.mjs` covers
verification. A public point mainly buys real-device testing and easy
sharing.

**Two things worth flagging before anyone picks:**
- `field-playground` is a private repo that ChatGPT also reads. Hosting
  the *built app* publicly doesn't expose source, but it does make the
  app itself reachable by anyone with the URL. Worth being deliberate
  about rather than incidental.
- Either hosted option needs a Cloudflare API token in GitHub secrets.
  Rule 80 makes the relay the sole credential holder; this repo is
  exempt from CC-CMD ceremony but the credential boundary isn't a
  ceremony rule. Jeff's call, not one to make silently.

**Recommendation:** option 1 if a public point is wanted, since it
matches `jubilant-bassoon`'s existing deployment pattern. But it is not
required to unblock the live probe — that's already solved.
