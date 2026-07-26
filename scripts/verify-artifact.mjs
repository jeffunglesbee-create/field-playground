// The test that should have existed before three blank artifacts shipped.
// See docs/OPERATING-MODE.md's "verify the deliverable, not the thing
// upstream of it" rule, and
// docs/outbox/chat-update-2026-07-25-blank-artifact-bug.md.
//
// Every prior artifact was "verified" via clean build + module count +
// well-formed HTML -- all preconditions, none of which measure whether
// the page renders. This exercises the actual shipped deliverable.
//
// page.setContent() gives the page an opaque/about:blank origin, which
// is a close analogue of Claude.ai's sandboxed iframe -- relay fetches
// will fail CORS exactly as they do there. That's deliberate: it tests
// whether the app survives total fetch failure, which is precisely the
// condition that blanked it.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'

mkdirSync('outbox', { recursive: true })
const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
const manifest = { timestamp, checks: [] }

function findAssets() {
  // Prefer dist-artifact: that's the zero-chunk build actually shipped as
  // the standalone single-file artifact. Falls back to dist/ so this still
  // works if only the main build has been run.
  const dir = existsSync('dist-artifact/assets') ? 'dist-artifact/assets' : 'dist/assets'
  if (!existsSync(dir)) throw new Error('no assets dir found -- a build must run first')
  const files = readdirSync(dir)
  const css = files.filter(f => f.endsWith('.css'))
  // Main entry bundle = the largest .js that is not a lazy chunk.
  const js = files
    .filter(f => f.endsWith('.js') && f.startsWith('index-'))
    .map(f => ({ f, size: readFileSync(`${dir}/${f}`).length }))
    .sort((a, b) => b.size - a.size)
  if (!js.length) throw new Error(`no index-*.js found in ${dir}`)
  return { mainJs: `${dir}/${js[0].f}`, cssFiles: css.map(f => `${dir}/${f}`), dir }
}

function buildArtifactHtml() {
  const { mainJs, cssFiles } = findAssets()
  const js = readFileSync(mainJs, 'utf-8')
  const css = cssFiles.map(p => readFileSync(p, 'utf-8')).join('\n')
  if (js.includes('</script')) throw new Error('bundle contains </script -- would break inlining')
  if (css.includes('</style')) throw new Error('css contains </style -- would break inlining')
  return {
    html: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>field-playground — live build</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { background: #0a0a0a; color: #f0f0f0; font-family: system-ui, sans-serif; }
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
${js}
    </script>
  </body>
</html>
`,
    mainJs,
    cssFiles,
  }
}

async function main() {
  const { html, mainJs, cssFiles } = buildArtifactHtml()
  manifest.mainJs = mainJs
  manifest.cssFiles = cssFiles
  manifest.htmlBytes = html.length
  writeFileSync(`outbox/artifact-under-test-${timestamp}.html`, html)

  const browser = await chromium.launch()
  const page = await browser.newPage()

  const consoleErrors = []
  const pageErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => pageErrors.push({ message: String(e.message), stack: String(e.stack ?? '') }))

  await page.setContent(html, { waitUntil: 'load' })
  // Give SolidJS time to render, resources time to fail, boundaries time
  // to catch. Failure here is the point of the test, not a problem.
  await page.waitForTimeout(6000)

  const rootChildCount = await page.evaluate(() => {
    const r = document.getElementById('root')
    return r ? r.childElementCount : -1
  })
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600))
  const sectionCount = await page.evaluate(() => document.querySelectorAll('section').length)

  // --- Walk every top-level tab ---
  //
  // The app groups surfaces behind type-based top-level tabs, so only the
  // active tab's panel is mounted. The previous version of this script
  // asserted against a flat layout where all ~56 sections rendered at
  // once; after the reorg that assumption was simply wrong, and the
  // script reported allPass:false on a perfectly healthy build. The old
  // `sectionCount >= 20` fallback for Seasons was the specific culprit.
  //
  // Walking the tabs is not just a fix -- it's better coverage than
  // before. Each tab mounts its own subtree, so this now exercises code
  // paths the flat check never reached, and a component that throws only
  // when its tab is activated is now caught rather than missed.
  // Uses the locator API rather than the query-selector-all shorthand.
  // Real bug this replaces: an earlier version called page dot-dollar
  // (single) instead of the double form, because the doubled character
  // was mangled to a single one in a patch. A single query returns ONE
  // element handle, not an array -- so .length was undefined, the loop
  // never executed, and the manifest silently reported 0 tabs walked on
  // a healthy build. locator().count() has no such ambiguity.
  //
  // Deliberately NOT scoped to the top-level nav: the inner tab bars
  // (Seasons, PickEm, DayComparison, Stats) each mount their own subtree
  // and are worth walking too.
  const tabLocator = page.locator('[role="tab"]')
  const tabCount = await tabLocator.count()
  const tabResults = []
  let maxSections = sectionCount
  let deadSections = 0
  const deadSectionMessages = []

  for (let i = 0; i < tabCount; i++) {
    // Re-resolve each iteration: activating a tab remounts panels, so a
    // handle captured earlier can go stale.
    const btn = page.locator('[role="tab"]').nth(i)
    let label = ''
    let clicked = true
    try {
      label = ((await btn.textContent()) ?? '').trim()
      await btn.click({ timeout: 3000 })
    } catch {
      // A tab detached by a sibling's remount is recorded, not fatal.
      clicked = false
    }
    await page.waitForTimeout(2000) // let lazy chunks + resources settle

    const secs = await page.evaluate(() => document.querySelectorAll('section').length)
    if (secs > maxSections) maxSections = secs

    // Detect DEAD SECTIONS structurally, not by name.
    //
    // App.jsx's per-section ErrorBoundary fallback renders a "Retry"
    // button. Its presence means a section threw and its subtree was
    // replaced -- exactly the WeatherPoll failure, which the old
    // whole-tab check could not see because sibling sections still
    // rendered and the tab looked healthy.
    //
    // This replaces a check that asserted a component LABEL was present.
    // That broke TWICE in one day for reasons unrelated to app health:
    // first the type-based tab reorg (the label moved behind a tab),
    // then the Seasons -> StandingRoom merge (the label ceased to
    // exist). A structural marker cannot be invalidated by a rename.
    const dead = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent.trim() === 'Retry')
      return btns.map(b => (b.parentElement?.textContent ?? '').replace('Retry', '').trim().slice(0, 160))
    })
    if (dead.length) {
      deadSections += dead.length
      for (const m of dead) if (!deadSectionMessages.includes(m)) deadSectionMessages.push(m)
    }

    tabResults.push({
      tab: label,
      clicked,
      sections: secs,
      deadSections: dead.length,
      // A tab mounting nothing is the real regression signal -- that
      // panel's subtree died while others survived.
      rendered: secs > 0,
      pageErrorsSoFar: pageErrors.length,
    })
  }

  // Diagnostic: zero here means the SELECTOR or API call is wrong, not
  // the app. Recorded explicitly so that failure mode is never silent.
  manifest.tabButtonsFound = tabCount

  manifest.tabResults = tabResults
  manifest.tabCount = tabResults.length
  manifest.maxSectionsInAnyTab = maxSections
  manifest.deadSectionCount = deadSections
  manifest.deadSectionMessages = deadSectionMessages

  manifest.rootChildCount = rootChildCount
  manifest.sectionCount = sectionCount
  manifest.bodyTextSample = bodyText
  manifest.consoleErrors = consoleErrors
  manifest.pageErrors = pageErrors

  await page.screenshot({ path: `outbox/artifact-render-${timestamp}.png`, fullPage: false })
  await browser.close()

  // THE check: did anything actually render?
  manifest.checks.push({
    name: 'root_has_rendered_children',
    pass: rootChildCount > 0,
    rootChildCount,
  })
  // Sections are the app's top-level layout units -- more than a couple
  // means the tree survived, not just an error message. Threshold is per
  // TAB now, not for the whole app, since tabs mount one panel at a time.
  manifest.checks.push({
    name: 'multiple_sections_rendered',
    pass: sectionCount >= 5,
    sectionCount,
  })
  // Every top-level tab must mount something. A tab rendering zero
  // sections means that panel's subtree died -- the per-section
  // ErrorBoundary case, which the old whole-app check couldn't see.
  manifest.checks.push({
    name: 'every_tab_renders_content',
    pass: tabResults.length > 0 && tabResults.every(t => t.rendered),
    tabResults,
  })
  // No section may be showing an ErrorBoundary fallback. This is the
  // check that would have caught the WeatherPoll incident at the section
  // level rather than only when it took the whole app down -- a single
  // dead section is invisible to every other assertion here.
  manifest.checks.push({
    name: 'no_dead_sections',
    pass: deadSections === 0,
    deadSectionCount: deadSections,
    deadSectionMessages,
    note: 'a rendered Retry button means a section threw and its subtree was replaced',
  })
  // A hard throw at module scope means nothing else is trustworthy.
  manifest.checks.push({
    name: 'no_uncaught_page_errors',
    pass: pageErrors.length === 0,
    pageErrors,
  })

  manifest.allPass = manifest.checks.every(c => c.pass)
  console.log(`Result: ${manifest.allPass ? 'ALL PASS ✓' : 'FAILURES DETECTED ✗'}`)
  console.log(JSON.stringify(manifest, null, 2))
  writeFileSync(`outbox/artifact-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
  if (!manifest.allPass) process.exitCode = 1
}

main().catch(err => {
  manifest.error = String(err)
  manifest.stack = String(err?.stack ?? '')
  writeFileSync(`outbox/artifact-check-manifest-${timestamp}.json`, JSON.stringify(manifest, null, 2))
  console.error('FAILED:', err)
  process.exitCode = 1
})
