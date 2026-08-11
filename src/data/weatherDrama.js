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
// A DIVERGENCE FROM PRODUCTION THAT IS DELIBERATE, and the only one in this
// file. Production compares `(wx.snowfall||0) > 0.5` where wx.snowfall is
// Open-Meteo's hourly snowfall -- which this repo's own e2e probe measured as
// CENTIMETRES on all five sampled venues. Its own spec calls that band
// "Snow (>0.5mm)". Those cannot both be true: comparing a centimetre value
// against 0.5 means production's snow band actually fires at 0.5cm = 5mm, ten
// times heavier than the documented intent.
//
// This file keeps the DOCUMENTED intent (0.5mm, after converting cm->mm in
// normalizeOpenMeteo) rather than reproducing the discrepancy, because
// mirroring a suspected unit bug would bake it in here too. Recorded in the
// claims ledger as `production-snow-band-may-be-10x` rather than silently
// "fixed" upstream -- production is not this session's to change, and the
// alternative reading (that 0.5cm is the real intent and the doc's "mm" is the
// typo) is not ruled out from here.
export const SNOW_MM = 0.5
export const RAIN_MM = 2
export const RAIN_SEVERE_MM = 5
export const AQI_UNHEALTHY = 150
export const AQI_VERY_UNHEALTHY = 200

// THE GATE, and it is the single most important thing about this function:
// in production weatherDramaModifier is NOT called on every venue.
//
// Measured from Drive 2026-08-11, "FIELD App - May 22 2026 Session
// Documentation (Weather Intelligence)", item 7, quoted verbatim:
//
//     Old: Object.values(wxCache).find(wx=>wx?.alert) -> if found, sitBonus += 10
//     New: Object.values(wxCache).find(wx=>wx?.alert||(wx?.aqi||0)>100)
//          -> sitBonus += weatherDramaModifier(wxEntry)
//
// So the delta only reaches a drama score when some cached venue trips
// wxAlert() OR carries AQI above 100. Two consequences, both counterintuitive,
// both invisible if you only read the band table:
//
//   1. THE DEAD ZONE. The alert thresholds sit ABOVE the first scoring band in
//      both wind and rain, so there is a range where the modifier returns a
//      real number and the gate never opens. wxAlert fires on gusts > 30mph;
//      the modifier already scores +6 at gusts > 20mph. wxAlert fires on rain
//      > 5mm; the modifier already scores +8 at rain > 2mm. So a 25mph-gusting
//      40°F night, or 3mm of rain, produces a non-zero band total that
//      contributes exactly ZERO because nothing admitted it.
//
//      (An earlier version of this comment said the two read DIFFERENT FIELDS
//      -- sustained wind for the modifier, gusts for the alert. That was taken
//      from the session doc's paraphrase and is wrong: production's modifier
//      reads `wx.gusts || wx.wind || 0`, the same gusts-first expression
//      wxAlert uses. The dead zone is real either way, but it is a threshold
//      gap on one field, not a mismatch between two.)
//
//   2. AQI 101-150 IS A KEY THAT SCORES NOTHING. It opens the gate but sits
//      below the -15 band, so its whole effect is to let the OTHER terms
//      through. Moderate smoke over a cold windy park is what makes that
//      park's cold and wind count at all.
//
// The 100 here and the 150 in AQI_UNHEALTHY are therefore not a contradiction
// to reconcile -- they are sequential. 100 admits, 150 penalises.
export const AQI_GATE = 100

// wxAlert()'s own thresholds, which are a DIFFERENT SET from the modifier's.
// Quoted from the same doc: "wxAlert(wx) -- true when conditions materially
// affect gameplay (rain >5mm, gusts >30mph, temp <28F/>100F, snowfall >0.5mm,
// AQI >150)".
//
// HOT_F has no counterpart in the modifier at all. A 105F afternoon opens the
// gate and then contributes 0, because every temperature term in the band
// table is a COLD term. That asymmetry is production's, not a porting slip,
// and it is recorded rather than quietly "fixed" -- inventing a heat band here
// would make this module disagree with the thing it claims to mirror.
export const HOT_F = 100
export const GUST_ALERT_MPH = 30
export const RAIN_ALERT_MM = 5

// UNIT NORMALISATION AT THE BOUNDARY, and it exists because the e2e probe
// caught a real 10x error on its first run.
//
// Open-Meteo returns snowfall in CENTIMETRES. Measured 2026-08-11 from the
// live `current_units` block on all five sampled venues:
//
//     temperature_2m  "°F"    wind_speed_10m  "mp/h"
//     rain            "mm"    snowfall        "cm"     <-- not mm
//
// The threshold is `snow > 0.5mm` per the production spec. Passing a
// centimetre value straight into it meant the band only fired at 0.5cm = 5mm,
// ten times heavier than intended -- a silent rescale with no error anywhere,
// which is precisely the failure the probe's units assertion was written to
// catch. Temperature and wind are requested explicitly as fahrenheit and mph
// and came back as asked; snowfall has no unit parameter, so it is converted.
//
// Shared by weather.js and probe-open-meteo-e2e.mjs so there is exactly one
// conversion. A second copy is how the two drift.
export function normalizeOpenMeteo(current, aqi = null) {
  const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const c = current ?? {}
  const snowCm = n(c.snowfall)
  return {
    tempF: n(c.temperature_2m),
    windMph: n(c.wind_speed_10m),
    // Sustained wind and gusts are different fields answering different
    // questions, and the two thresholds below read one each -- the modifier
    // uses sustained, wxAlert uses gusts. Collapsing them to one number is
    // what makes the dead zone above invisible.
    gustsMph: n(c.wind_gusts_10m),
    // Apparent temperature, which is what the COLD bands actually read in
    // production. Omitting it silently downgraded every cold band to dry-bulb
    // temperature -- and wind chill moves that number by 5-10°F on exactly the
    // nights the band exists to catch.
    feelsLikeF: n(c.apparent_temperature),
    rainMm: n(c.rain),
    // Precipitation is a SEPARATE field from rain (it includes snow), and the
    // +4 escalation band is keyed to it rather than to rain. Both are mm.
    precipMm: n(c.precipitation),
    snowMm: snowCm === null ? null : snowCm * 10,
    aqi: n(aqi),
  }
}

// Production's wxAlert(), which also drives the amber badge colour. Ported
// because it is half the gate -- without it the gate would collapse to "AQI
// > 100", which is wrong in the common case (a snowy game has no AQI problem
// at all and still fires).
export function wxAlert(wx) {
  if (!wx || typeof wx !== 'object') return false
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const tempF = num(wx.tempF)
  // `(wx.gusts||wx.wind||0) > 30` -- same gusts-first fallback the modifier
  // uses, so sustained wind still reaches the alert when no gust field came
  // back. Reading gustsMph alone would leave the wind arm permanently shut on
  // any response missing wind_gusts_10m.
  const gusts = num(wx.gustsMph) || num(wx.windMph)
  const rainMm = num(wx.rainMm)
  const snowMm = num(wx.snowMm)
  const aqi = num(wx.aqi)
  if (rainMm !== null && rainMm > RAIN_ALERT_MM) return true
  if (gusts !== null && gusts > GUST_ALERT_MPH) return true
  if (tempF !== null && (tempF < COLD_F || tempF > HOT_F)) return true
  if (snowMm !== null && snowMm > SNOW_MM) return true
  if (aqi !== null && aqi > AQI_UNHEALTHY) return true
  return false
}

// The predicate production applies before the modifier is allowed to matter.
// Returns { open, why } rather than a bare boolean: which arm opened the gate
// is the interesting part, and a caller that only gets `true` cannot explain
// why a +14 venue counted while another +14 venue did not.
export function weatherDramaGate(wx) {
  if (wxAlert(wx)) return { open: true, why: 'wxAlert' }
  const aqi = typeof wx?.aqi === 'number' && Number.isFinite(wx.aqi) ? wx.aqi : 0
  if (aqi > AQI_GATE) return { open: true, why: `AQI ${Math.round(aqi)} over ${AQI_GATE}` }
  return { open: false, why: null }
}

// Returns { delta, reasons[] }. The reasons are the point: a bare signed
// number tells a reader nothing about why, and this repo's standing position
// is that a named condition beats a raw score.
export function weatherDramaModifier(wx) {
  const reasons = []
  let delta = 0
  if (!wx || typeof wx !== 'object') return { delta: 0, reasons }

  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  // THREE FIELD CHOICES BELOW ARE THE SOURCE'S, NOT THE DOC'S, and all three
  // were wrong in this file until it was read against production directly
  // (jubilant-bassoon src/utils/weather.js, sha 0ecfaf5, read 2026-08-11).
  // The May 22 session doc paraphrases the bands as "Cold (<0F)", "High wind
  // (>20mph)" and "Heavy rain (>2mm), (>5mm)", which reads as three plain
  // measurements. The shipped code uses a different field in each case:
  //
  //   const feels = wx.feelsLike !== undefined ? wx.feelsLike : wx.temp;
  //   const gusts = wx.gusts || wx.wind || 0;
  //   if(feels < 0) ... if(feels < 28) ...
  //   if(gusts > 20) ... if(gusts > 30) ...
  //   if((wx.rain||0)>2) mod += 8;
  //   if((wx.precip||0)>5) mod += 4;
  //
  // So: cold is APPARENT temperature, wind is GUSTS, and the +4 escalation on
  // rain is keyed to PRECIPITATION (which includes snow) rather than to rain.
  // A doc-faithful port gets different answers from production on ordinary
  // nights -- a 30F night that feels like 24F scores 0 under the doc reading
  // and +8 under the real one.
  const feelsLike = num(wx.feelsLikeF)
  const tempF = num(wx.tempF)
  // Mirrors `wx.feelsLike !== undefined ? wx.feelsLike : wx.temp` -- an
  // explicit presence check, so a genuine 0°F "feels like" is respected.
  const feels = feelsLike !== null ? feelsLike : tempF
  const gustsRaw = num(wx.gustsMph)
  const windMph = num(wx.windMph)
  // Mirrors `wx.gusts || wx.wind || 0`, falsiness and all: a gust reading of
  // exactly 0 falls through to sustained wind. That is production's behaviour,
  // not a bug being ported blind -- calm-gust readings are common and the
  // fallback is what keeps a windy-but-ungusty reading from scoring nothing.
  const gusts = gustsRaw || windMph
  const snowMm = num(wx.snowMm)
  const rainMm = num(wx.rainMm)
  const precipMm = num(wx.precipMm)
  const aqi = num(wx.aqi)

  // Each band is checked independently so they stack, matching the source.
  if (feels !== null && feels < COLD_F) { delta += 8; reasons.push(`cold (feels ${Math.round(feels)}°F)`) }
  if (feels !== null && feels < COLD_SEVERE_F) { delta += 8; reasons.push('severe cold (feels below 0°F)') }

  if (gusts !== null && gusts > WIND_MPH) { delta += 6; reasons.push(`gusts (${Math.round(gusts)}mph)`) }
  if (gusts !== null && gusts > WIND_SEVERE_MPH) { delta += 4; reasons.push('high gusts (over 30mph)') }

  if (snowMm !== null && snowMm > SNOW_MM) { delta += 10; reasons.push('snow') }

  if (rainMm !== null && rainMm > RAIN_MM) { delta += 8; reasons.push('heavy rain') }
  if (precipMm !== null && precipMm > RAIN_SEVERE_MM) { delta += 4; reasons.push('heavy precipitation') }

  // The only negative term, and the only one that needs a second endpoint.
  // Wildfire smoke makes a game less worth watching, not more.
  if (aqi !== null && aqi > AQI_UNHEALTHY) { delta -= 15; reasons.push(`unhealthy air (AQI ${Math.round(aqi)})`) }
  if (aqi !== null && aqi > AQI_VERY_UNHEALTHY) { delta -= 10; reasons.push('very unhealthy air') }

  return { delta, reasons }
}

// What a venue would ACTUALLY contribute, gate included. Kept separate from
// weatherDramaModifier so the band arithmetic stays independently testable,
// and so the difference between the two numbers is nameable rather than
// buried: `delta` is what the table says, `applied` is what production would
// add to sitBonus, and when they differ the gate is the reason.
export function weatherDramaContribution(wx) {
  const { delta, reasons } = weatherDramaModifier(wx)
  const gate = weatherDramaGate(wx)
  return { delta, reasons, gate, applied: gate.open ? delta : 0 }
}
