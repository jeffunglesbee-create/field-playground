import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(
  `outbox/reusable-probe-template-test-${stamp}.txt`,
  `Reusable probe template verification\nran at: ${new Date().toISOString()}\nIf this file exists and is committed, the template's checkout + tolerant-execution + commit-with-retry all worked correctly, end to end, on a real first attempt.\n`
)
console.log('wrote test output')
