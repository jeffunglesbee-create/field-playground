// weatherDramaModifier -- ported from production, 2026-08-11.
//
// SOURCE, quoted rather than paraphrased. "FIELD App - May 22 2026 Session
// Documentation (Weather Intelligence)" (Drive), section "WHAT WAS BUILT":
//
//     weatherDramaModifier(wx) -- signed delta, replaces flat +10:
//       Cold (<0F): +8, (<28F): +8 stacking
//       High wind (>20mph): +6, (>30mph): +4 stacking
//       Snow (>0.5mm): +10
//       Heavy rain (>2mm): +8, (>5mm): +4 stacking
//       AQI >150: -15 (wildfire/smoke negative modifier)
//       AQI >200: -10 stacking
//
// In production this delta is added to `sitBonus` inside dramaScoreLive(),
// which is why a drama_arc is partly a weather series. It replaced an earlier
// flat +10 that -- per the same doc -- never actually fired, because six
// helpers it depended on were called and never defined and the ReferenceError
// was swallowed by a try/catch.
//
// WHAT THIS CAN AND CANNOT SAY, and the distinction is the whole reason this
// module is separate from the archive data.
//
//   CAN: what CURRENT conditions at a venue would contribute to a LIVE drama
//   score computed right now.
//
//   CANNOT: decompose an archived drama_peak. A stored peak was computed from
//   the weather during that game, which is not the weather now. Applying this
//   to a historical row and reporting "weather contributed +10 of that 74"
//   would be inventing a number. Nothing here is joined to drama_peak.
//
// "STACKING" IS READ AS CUMULATIVE, and the reading is stated because the
// source is terse. `<0F: +8, <28F: +8 stacking` means a sub-zero reading
// satisfies both bands and scores +16, not +8. The two bands give the same
// answer under either reading at every temperature except the ambiguity
// itself, so this is recorded as an interpretation rather than a measurement.
//
// UNITS MATTER AND ARE NOT INTERCHANGEABLE: temperature in FAHRENHEIT, wind in
// MPH, precipitation in MILLIMETRES. The Open-Meteo request in weather.js asks
// for fahrenheit and mph explicitly and leaves precipitation at its default,
// which is mm. Changing any of those without changing these thresholds would
// silently rescale every term.
export const COLD_SEVERE_F = 0
export const COLD_F = 28
export const WIND_MPH = 20
export const WIND_SEVERE_MPH = 30
export const SNOW_MM = 0.5
export const RAIN_MM = 2
export const RAIN_SEVERE_MM = 5
export const AQI_UNHEALTHY = 150
export const AQI_VERY_UNHEALTHY = 200

// Returns { delta, reasons[] }. The reasons are the point: a bare signed
// number tells a reader nothing about why, and this repo's standing position
// is that a named condition beats a raw score.
export function weatherDramaModifier(wx) {
  const reasons = []
  let delta = 0
  if (!wx || typeof wx !== 'object') return { delta: 0, reasons }

  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const tempF = num(wx.tempF)
  const windMph = num(wx.windMph)
  const snowMm = num(wx.snowMm)
  const rainMm = num(wx.rainMm)
  const aqi = num(wx.aqi)

  // Each band is checked independently so they stack, matching the source.
  if (tempF !== null && tempF < COLD_F) { delta += 8; reasons.push(`cold (${Math.round(tempF)}°F)`) }
  if (tempF !== null && tempF < COLD_SEVERE_F) { delta += 8; reasons.push('severe cold (below 0°F)') }

  if (windMph !== null && windMph > WIND_MPH) { delta += 6; reasons.push(`wind (${Math.round(windMph)}mph)`) }
  if (windMph !== null && windMph > WIND_SEVERE_MPH) { delta += 4; reasons.push('high wind (over 30mph)') }

  if (snowMm !== null && snowMm > SNOW_MM) { delta += 10; reasons.push('snow') }

  if (rainMm !== null && rainMm > RAIN_MM) { delta += 8; reasons.push('heavy rain') }
  if (rainMm !== null && rainMm > RAIN_SEVERE_MM) { delta += 4; reasons.push('very heavy rain') }

  // The only negative term, and the only one that needs a second endpoint.
  // Wildfire smoke makes a game less worth watching, not more.
  if (aqi !== null && aqi > AQI_UNHEALTHY) { delta -= 15; reasons.push(`unhealthy air (AQI ${Math.round(aqi)})`) }
  if (aqi !== null && aqi > AQI_VERY_UNHEALTHY) { delta -= 10; reasons.push('very unhealthy air') }

  return { delta, reasons }
}
