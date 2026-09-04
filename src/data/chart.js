// src/data/chart.js — one chart renderer for field-playground.
//
// Ported from jubilant-bassoon's src/utils/chart.js, deliberately. This repo's
// job is to probe against production, and a probe whose charts read differently
// from production's is a confounded comparison. Same renderer, same fixed-domain
// discipline, same setData-not-remount update path.
//
// The Solid difference: mounting happens in onMount and teardown in onCleanup,
// so the caller owns the lifecycle rather than a sweep. destroyChart is
// therefore the normal path here, not the exceptional one.

import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name)
    return (v || '').trim() || fallback
  } catch (_) { return fallback }
}

/**
 * Render or update a chart.
 *
 * @param {HTMLElement} el      mount point; its width drives the chart's
 * @param {Array<Array<number>>} data  uPlot format: [xs, ...series]
 * @param {Object} opts
 * @param {number}   opts.height        px, default 64
 * @param {string[]} opts.colors        one per series
 * @param {string[]} opts.labels        one per series, for the aria summary
 * @param {[number,number]} [opts.range]  FIXED y-domain. Strongly preferred:
 *        auto-scaling to the series maximum makes every chart look identical,
 *        which is the failure field-laboratory's spark-check.mjs exists to
 *        catch ("renders every game as a wall topping out at 100%").
 * @param {boolean} [opts.axes=false]
 */
export function fieldChart(el, data, opts = {}) {
  if (!el || !Array.isArray(data) || data.length < 2) return null
  const ink = token('--ink', '#e8e8e8')
  const muted = token('--muted', 'rgba(232,232,232,.45)')
  const height = opts.height || 64
  const width = Math.max(el.clientWidth || 0, 80)
  const colors = opts.colors || []
  const labels = opts.labels || []

  // Same element and same series count -> setData. A chart rebuilt on every
  // reactive update drops hover state and churns canvases; Solid re-runs
  // effects far more often than a 30s poll does, so this matters more here.
  if (el._uplot && el._uplotSeriesCount === data.length) {
    try {
      el._uplot.setData(data)
      if (width !== el._uplotWidth) { el._uplot.setSize({ width, height }); el._uplotWidth = width }
      return el._uplot
    } catch (_) { /* fall through to a fresh mount */ }
  }
  if (el._uplot) { try { el._uplot.destroy() } catch (_) {} el._uplot = null }

  const series = [{}]
  for (let i = 1; i < data.length; i++) {
    series.push({
      label: labels[i - 1] || `series ${i}`,
      stroke: colors[i - 1] || ink,
      width: 1.5,
      points: { show: false },
    })
  }

  const scales = { x: { time: false } }
  if (opts.range) scales.y = { range: () => opts.range }

  let u = null
  try {
    u = new uPlot({
      width, height,
      padding: [4, 4, 4, 4],
      cursor: { show: !!opts.axes, y: false },
      legend: { show: false },
      scales,
      axes: opts.axes
        ? [{ stroke: muted, grid: { stroke: 'rgba(255,255,255,.08)', width: 1 }, size: 22 },
           { stroke: muted, grid: { stroke: 'rgba(255,255,255,.08)', width: 1 }, size: 30 }]
        : [{ show: false }, { show: false }],
      series,
    }, data, el)
  } catch (_) { return null }

  el._uplot = u
  el._uplotSeriesCount = data.length
  el._uplotWidth = width

  // The canvas is unreadable to assistive tech, so the mount carries a summary.
  try {
    el.setAttribute('role', 'img')
    const parts = []
    for (let i = 1; i < data.length; i++) {
      const vals = data[i].filter(v => typeof v === 'number' && !Number.isNaN(v))
      if (!vals.length) continue
      parts.push(`${labels[i - 1] || 'series ' + i}: ${Math.min(...vals).toFixed(1)} to ${Math.max(...vals).toFixed(1)}`)
    }
    el.setAttribute('aria-label', `${data[0].length} points. ${parts.join('; ')}`)
  } catch (_) {}

  return u
}

/** Destroy a chart and release its canvas. Call from onCleanup. */
export function destroyChart(el) {
  if (el && el._uplot) {
    try { el._uplot.destroy() } catch (_) {}
    el._uplot = null
    el._uplotSeriesCount = 0
  }
}
