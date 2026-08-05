// Vendors three real texture maps (Color, NormalGL, Roughness) from
// ambientCG's real Grass001 asset into public/textures/terrain-grass/, for
// Terrain Flight's terrain material. Real download verified 2026-08-05 via
// scripts/probe-ambientcg-grass-download.mjs (real API, real 10.7MB zip,
// real ZIP signature, real file listing). License: CC0 1.0 Universal,
// confirmed via ambientCG's own official docs (site-wide policy covering
// all 2,800+ assets, no attribution required) -- verified before this
// script was written, not assumed.
//
// Committed UNMODIFIED from the real download (no recompression) to keep
// asset provenance exact and inspectable. These are served from public/ --
// Vite serves that directory as static files, not bundled into the JS
// chunk, so they only load when Terrain Flight actually mounts, not on
// initial page load.
//
// ambientcg.com is sandbox-blocked from chat -- this script only runs via
// CI-as-proxy (.github/workflows/vendor-terrain-flight-grass-texture.yml).

import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ASSET_ID = 'Grass001'
const ZIP_URL = 'https://ambientcg.com/get?file=Grass001_1K-JPG.zip'
const OUT_DIR = 'public/textures/terrain-grass'
const WANTED = {
  'Grass001_1K-JPG_Color.jpg': 'color.jpg',
  'Grass001_1K-JPG_NormalGL.jpg': 'normal.jpg',
  'Grass001_1K-JPG_Roughness.jpg': 'roughness.jpg',
}

async function main() {
  console.log('Fetching real zip: ' + ZIP_URL)
  const res = await fetch(ZIP_URL)
  if (!res.ok) throw new Error('download failed: HTTP ' + res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log('real zip bytes: ' + buf.length)
  writeFileSync('/tmp/grass.zip', buf)

  mkdirSync('/tmp/grass-extract', { recursive: true })
  execSync('unzip -o /tmp/grass.zip -d /tmp/grass-extract', { stdio: 'inherit' })

  mkdirSync(OUT_DIR, { recursive: true })
  for (const [src, dest] of Object.entries(WANTED)) {
    execSync(`cp /tmp/grass-extract/${src} ${OUT_DIR}/${dest}`)
    console.log('vendored: ' + OUT_DIR + '/' + dest)
  }

  writeFileSync(OUT_DIR + '/SOURCE.md', `# Terrain Flight grass texture

Source: ambientCG, asset "Grass 001" (https://ambientcg.com/view?id=${ASSET_ID})
License: CC0 1.0 Universal (public domain) -- ambientCG's site-wide policy
covers all assets, no attribution required. Verified against ambientCG's
own official docs before this asset was vendored (2026-08-05).

Vendored unmodified from the real 1K-JPG download
(${ZIP_URL}), 3 of the 11 real files in that archive:
- color.jpg     <- Grass001_1K-JPG_Color.jpg
- normal.jpg    <- Grass001_1K-JPG_NormalGL.jpg (OpenGL convention, matches Three.js)
- roughness.jpg <- Grass001_1K-JPG_Roughness.jpg

Regenerate via: node scripts/vendor-terrain-flight-grass-texture.mjs
(CI-as-proxy only -- ambientcg.com is sandbox-blocked from chat).
`)
  console.log('done')
}

main().catch(e => { console.error('FAILED: ' + String(e?.stack ?? e)); process.exit(1) })
