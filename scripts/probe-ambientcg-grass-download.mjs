// Verifies ambientCG's real, documented v2 API actually returns a real,
// downloadable, CC0-licensed grass texture asset -- ambientcg.com is
// sandbox-blocked from chat (confirmed: direct curl gets a connection-level
// failure, not even a 403), so this is CI-as-proxy, same pattern as every
// prior probe this session.
//
// Real candidate: Grass001 (confirmed via WebSearch to be a real, listed
// ambientCG asset tagged Cover/Dense/Fresh/Garden/Grass/Green/Ground/Lawn/
// Natural/Park/Short/Soft -- a real turf/lawn fit for Terrain Flight,
// replacing the ice-themed asset already bundled in three.js's own repo).
// License: ambientCG's own official docs confirm ALL of their 2,800+
// assets are CC0 1.0 Universal (public domain, no attribution required) --
// verified via WebSearch against docs.ambientcg.com before this probe was
// written, not assumed.

import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/ambientcg-grass-download-probe-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const ASSET_ID = 'Grass001'
const API_URL = `https://ambientcg.com/api/v2/full_json?id=${ASSET_ID}&include=downloadData`

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('asset: ' + ASSET_ID)

  const res = await fetch(API_URL)
  log('API HTTP status: ' + res.status)
  if (!res.ok) { log('FAILED: API request failed'); process.exit(1) }
  const data = await res.json()
  log('top-level response keys: ' + JSON.stringify(Object.keys(data ?? {})))
  const assets = data?.foundAssets ?? []
  log('assets returned: ' + assets.length)
  if (!assets.length) {
    log('FAILED: no asset found for id ' + ASSET_ID + ' -- raw response (first 1000 chars): ' + JSON.stringify(data).slice(0, 1000))
    process.exit(1)
  }
  log('first asset keys: ' + JSON.stringify(Object.keys(assets[0] ?? {})))

  const asset = assets[0]
  log('real asset name: ' + JSON.stringify(asset.displayName ?? asset.assetId))
  log('real tags: ' + JSON.stringify(asset.tags ?? []))

  const downloadFolders = asset.downloadFolders ?? {}
  const folderKeys = Object.keys(downloadFolders)
  log('download folders: ' + JSON.stringify(folderKeys))
  if (!folderKeys.length) {
    log('FAILED: no downloadFolders on this asset -- raw asset object (first 1500 chars): ' + JSON.stringify(asset).slice(0, 1500))
    process.exit(1)
  }

  // Prefer a 1K JPG folder -- smallest real download, sufficient for a
  // real-time terrain material.
  let chosenFolder = folderKeys.find(k => downloadFolders[k]?.attribute?.includes('1K') && downloadFolders[k]?.attribute?.includes('JPG'))
    ?? folderKeys[0]
  log('chosen folder object keys: ' + JSON.stringify(Object.keys(downloadFolders[chosenFolder] ?? {})))
  const files = downloadFolders[chosenFolder]?.downloadFiletypeCategories?.zip?.downloads ?? []
  log('chosen folder: ' + chosenFolder + ', zip download entries: ' + files.length)
  if (!files.length) {
    log('FAILED: no zip download entries in chosen folder -- raw folder object (first 1500 chars): ' + JSON.stringify(downloadFolders[chosenFolder]).slice(0, 1500))
    process.exit(1)
  }

  log('first download entry, full object: ' + JSON.stringify(files[0]))
  // The 8 entries in the single "default" folder are per resolution/format
  // (1K/2K/4K x JPG/PNG etc), not separate folders as first assumed --
  // real shape, corrected after seeing the actual API response rather than
  // guessing a second time. Prefer a real 1K JPG entry by inspecting each
  // entry's own attribute/name field for those substrings.
  const chosen = files.find(f => /1k/i.test(JSON.stringify(f)) && /jpg/i.test(JSON.stringify(f))) ?? files[0]
  log('chosen download entry: ' + JSON.stringify(chosen))
  const rawLink = chosen?.rawLink ?? chosen?.downloadLink ?? chosen?.link ?? chosen?.url
  log('real rawLink: ' + rawLink)
  if (!rawLink) { log('FAILED: no usable link field present on the real download entry'); process.exit(1) }

  const zipPath = '/tmp/' + ASSET_ID + '.zip'
  const dl = await fetch(rawLink)
  log('download HTTP status: ' + dl.status)
  if (!dl.ok) { log('FAILED: download request failed'); process.exit(1) }
  const buf = Buffer.from(await dl.arrayBuffer())
  writeFileSync(zipPath, buf)
  log('downloaded real zip bytes: ' + buf.length)

  const looksLikeZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b // 'PK' zip magic
  log('real ZIP file signature present: ' + looksLikeZip)

  let listing = ''
  try {
    listing = execSync(`unzip -l ${zipPath}`, { encoding: 'utf-8' })
  } catch (e) {
    log('unzip listing failed: ' + String(e))
  }
  log('zip contents:\n' + listing)

  const hasColor = /color/i.test(listing)
  const hasNormal = /normal/i.test(listing)
  const hasRoughness = /roughness/i.test(listing)
  log('has Color map: ' + hasColor + ', Normal map: ' + hasNormal + ', Roughness map: ' + hasRoughness)

  log('')
  log('=== VERDICT ===')
  if (looksLikeZip && buf.length > 50000 && hasColor) {
    log('CONFIRMED: real, downloadable CC0 grass texture asset (' + ASSET_ID + ', ' + buf.length + ' bytes) fetched successfully via ambientCG\'s real public API. Safe to commit into the repo and use.')
  } else {
    log('FAILED OR PARTIAL: report exactly what was observed -- do not assume this asset is usable.')
  }
}

main().catch(e => { log('FAILED: ' + String(e?.stack ?? e)); process.exit(1) })
