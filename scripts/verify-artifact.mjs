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
  const dir = 'dist/assets'
  if (!existsSync(dir)) throw new Error('dist/assets not found -- npm run build must run first')
  const files = readdirSync(dir)
  const css = files.filter(f => f.endsWith('.css'))
  // Main entry bundle = the largest .js that is not a lazy chunk.
  const js = files
    .filter(f => f.endsWith('.js') && f.startsWith('index-'))
    .map(f => ({ f, size: readFileSync(`${dir}/${f}`).length }))
    .sort((a, b) => b.size - a.size)
  if (!js.length) throw new Error('no index-*.js found in dist/assets')
  return { mainJs: `${dir}/${js[0].f}`, cssFiles: css.map(f => `${dir}/${f}`) }
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
  // means the tree survived, not just an error message.
  manifest.checks.push({
    name: 'multiple_sections_rendered',
    pass: sectionCount >= 5,
    sectionCount,
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
