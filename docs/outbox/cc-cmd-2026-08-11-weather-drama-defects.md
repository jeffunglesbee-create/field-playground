# CC-CMD 2026-08-11 — three weather-drama defects in jubilant-bassoon

**Status:** PREPARED, NOT APPLIED. This session has read-only access to
jubilant-bassoon. Every patch below is stated exactly; none has been pushed.

**Evidence:** read directly from `jubilant-bassoon@a4c0e02`, working tree, not
from a doc. That distinction is load-bearing here — the same session had
already shipped a port built from the May 22 session doc's *paraphrase* of this
code, and reading the code refuted three separate things in it. Doc-sourced
claims about this file have a bad track record; every line quoted below is from
the file.

---

## 1. The weather delta is taken from an arbitrary venue, not the game's own

**Severity: highest of the three.** This is not a threshold being off by a
band — it is the wrong venue's weather being applied to a game.

`index.html:27168` (mirrored at `src/legacy/field.js:22115`), inside
`dramaScoreLive()`:

```js
if(isOutdoor && typeof wxCache !== 'undefined'){
  try{
    const wxEntry = Object.values(wxCache||{}).find(wx=>wx?.alert||(wx?.aqi||0)>100);
    if(wxEntry){
      sitBonus += weatherDramaModifier(wxEntry);
    }
  }catch(e){ captureFieldError('drama:live-weather-lookup', e, true); }
}
```

`Object.values(wxCache).find(...)` returns the **first cached venue that
qualifies**, in insertion order. The function has `eData` and `sport` in scope
and never resolves *this game's* venue. `isOutdoor` is a check on the SPORT
string (`mlb`/`nfl`/`soccer`/`league`/`mls`/`liga`/`premier`/`afl`/
`australian`), not on where the game is.

So on any night where one venue qualifies, **every** outdoor game in those
sports receives that venue's delta. A snowstorm at Lambeau adds +10 to a mild
game in Miami. The AQI arm makes it worse, because it admits at >100: one smoky
city contaminates the entire slate.

The fix is to look up the game's own venue, which the codebase already has
helpers for:

```js
if(isOutdoor && typeof wxCache !== 'undefined'){
  try{
    // Was: Object.values(wxCache).find(...) -- an ARBITRARY qualifying venue,
    // applied to every outdoor game on the slate regardless of location.
    const venue  = eData?.venue || eData?._venue || null;
    const coords = venue && isOutdoorVenue(venue) ? getVenueCoords(venue) : null;
    const wxEntry = coords
      ? wxCache[`${coords[0].toFixed(3)}_${coords[1].toFixed(3)}`]
      : null;
    // The gate is unchanged; only WHICH venue it is asked about changes.
    if(wxEntry && (wxEntry.alert || (wxEntry.aqi||0) > 100)){
      sitBonus += weatherDramaModifier(wxEntry);
    }
  }catch(e){ captureFieldError('drama:live-weather-lookup', e, true); }
}
```

The key format `${lat.toFixed(3)}_${lon.toFixed(3)}` is copied from
`fetchWeather` (`index.html:16858`) — it must stay in sync with it.

**Note the behaviour change this is:** far fewer games will get a weather
delta, because most games are not at the one venue with bad weather. That is
the correction, not a regression. Any smoke assertion that counts how many
games receive a non-zero weather bonus will need updating with it.

---

## 2. `wxBadge` labels AQI 101–150 one band too low

`index.html:16801`:

```js
const aqiLabel = (wx.aqi||0)>200 ? 'Very unhealthy' : (wx.aqi||0)>150 ? 'Unhealthy' : 'Moderate AQI';
```

The enclosing `if((wx.aqi||0)>100)` means the final branch is only reached for
**101–150**, which it labels `Moderate AQI`.

By the EPA banding quoted in FIELD's own *Weather API Deep Dive* (May 17):

| Range | EPA label |
|---|---|
| 51–100 | Moderate |
| 101–150 | **Unhealthy for Sensitive Groups** |

So the badge prints "Moderate" over a reading that is one band above Moderate —
and it does so in exactly the range the Deep Dive singles out as the one worth
surfacing: *"101-150: Unhealthy for Sensitive Groups — flag for outdoor games"*.
The label currently tells a reader the opposite of why the badge appeared.

```js
const aqiLabel = (wx.aqi||0)>200 ? 'Very unhealthy'
               : (wx.aqi||0)>150 ? 'Unhealthy'
               : 'Unhealthy for sensitive groups';   // 101-150, per EPA
```

If the full EPA phrase is too long for the badge, `Sensitive groups` is the
shortest form that is not actively wrong. `Moderate` is not an option — that
label belongs to 51–100, which never reaches this branch.

---

## 3. The snow thresholds are in millimetres; the value is in centimetres

`index.html:16869`, inside `fetchWeather`:

```js
snowfall:  (json.hourly?.snowfall || [])[new Date().getUTCHours()] || 0,
```

No unit conversion. The request asks for `&hourly=...,snowfall` with no unit
parameter, and Open-Meteo serves hourly snowfall in **centimetres** — measured,
not assumed: see `outbox/open-meteo-e2e-*.txt` in field-playground, which
asserts `hourly_units.snowfall` directly against the live API.

Three thresholds consume that value, and they disagree with each other:

| Site | Threshold | As cm | Doc says |
|---|---|---|---|
| `wxBadge` (`index.html:16798`) | `> 0.2` | 2 mm | — |
| `wxDescription`/`wxIcon` (`src/utils/weather.js:6,14`) | `> 0.3` | 3 mm | — |
| `wxAlert` (`src/utils/weather.js:29`) | `> 0.5` | 5 mm | "snowfall >0.5mm" |
| `weatherDramaModifier` (`src/utils/weather.js:42`) | `> 0.5` | 5 mm | "Snow (>0.5mm): +10" |

The May 22 session doc states both of the bottom two as **mm**. If that is the
intent, both fire at ten times the intended snowfall — the snow band and the
snow arm of the alert only engage in genuinely heavy snow, and a light snow
game scores nothing.

**This one needs a human decision, which is why no patch is proposed.** Two
readings survive the evidence:

- *The doc states the intent* → convert at the boundary
  (`snowfall: cm * 10`), and every threshold above becomes a real mm value.
- *0.5 cm was always the intent* and the doc's "mm" is a typo → change the doc,
  leave the code, and 0.2/0.3/0.5 cm are a sensible badge/description/alert
  ladder in their own right.

They are not distinguishable from the code. Whoever wrote the band knows which
it was; nobody else can recover it. Picking one silently would bake a guess
into the drama score.

For reference, field-playground took the first reading — its
`normalizeOpenMeteo` converts cm→mm at the boundary — and recorded the
divergence rather than mirroring it, so the two repos currently disagree here
on purpose.

---

---

## 4. Bundesliga live broadcasts overwrite the rights table with a partial object

Unrelated to weather; found while looking at Bundesliga broadcasters and filed
here because it is the same repo and the same review format.

`index.html:23881`, the tail of `_fetchBundesligaRealBroadcastStreams`:

```js
const names = broadcastsBody.data.broadcasts
  .map(b => b?.name || b?.broadcaster || b?.channel || b?.title || null)
  .filter(Boolean);
if(!names.length) return null;
return names.map(n => ({ name:n, label:n, auth:'tv' }));
```

and its consumer at `index.html:23978`:

```js
if(league === 'ger.1' && games.length){
  const realStreams = await _fetchBundesligaRealBroadcastStreams(dateStr);
  if(realStreams && realStreams.length){
    games.forEach(g => { g.streams = realStreams; });   // replaces, not enriches
  }
}
```

### What a stream object is supposed to be

`expandStreams` (`index.html:6671`) is the one place that builds them, from the
`SR` table:

```js
return s ? {key:k, label:s[0], name:s[0], url:s[1], col:s[2],
            auth:s[3]||"sub", authNote:s[4]||"Subscription required"} : null;
```

Seven fields. The Bundesliga mapper emits three, and **drops `url`** — so a
broadcaster chip produced by this path has nowhere to link. It also drops `key`,
which is what `VALID_SR_KEYS` validates against, so the registry check never
sees these entries.

### The `auth:'tv'` hardcode is wrong for this league specifically

`auth` is a real field with a real vocabulary — measured across the `SR` table:

| value | count | meaning |
|---|---|---|
| `sub` | 42 | subscription |
| `tv` | 30 | TV-provider login |
| `geo` | 8 | region-locked |
| `free` | 7 | no account needed |

So `'tv'` is a legitimate value in general. It is the wrong one here. The
`BUNDESLIGA` bundle is:

```js
BUNDESLIGA: ["usa","fandango","youtubetv","fubo","sling","hulu","directv"]
```

and `fandango` carries `auth: "free"`:

```js
fandango: ["Fandango", "https://www.fandango.com/sports", "#FF4D00", "free",
           "Free live streaming — no subscription or account required. All Bundesliga
            matches streamed free on Fandango starting 2026-27 season…"]
```

When the live path fires it relabels that as `auth:'tv'`, telling the reader
they need a TV provider for a match the repo's own rights data says is free to
watch. Getting a paywall wrong in that direction is the costly one: the reader
skips a game they could have watched.

### Also: "per-match" is per-date

The block comment says *"Real per-match broadcast enrichment"* and the function
is named `…RealBroadcastStreams`, but the call is made once for the whole date
and assigned with `games.forEach`, so every match that day gets an identical
list. The line immediately above it admits this (*"one call for the whole date
(not per game)"*), which makes the name and the comment above it the misleading
part rather than the behaviour.

### Suggested shape, not a drop-in patch

The fix is to treat the API's broadcaster names as a *lookup* into `SR` rather
than as a replacement for it, so everything downstream keeps the seven-field
contract:

```js
// Build a name -> SR key index once, from the table itself, so it cannot
// drift from SR the way a hand-written mapping would.
const _srByName = new Map(
  Object.entries(SR).map(([k, v]) => [String(v[0]).toLowerCase(), k])
);

const keys = names
  .map(n => _srByName.get(String(n).toLowerCase()))
  .filter(Boolean);

// Only override when every returned name resolved. A partial resolve means
// the API named a broadcaster this table does not carry, and a partial list
// is worse than the curated bundle -- it silently drops the rest.
return keys.length === names.length ? expandStreams(keys) : null;
```

`return null` is already the "unavailable" signal the consumer handles by
keeping the static bundle, so no change is needed at the call site.

**One caveat measured before proposing this, not after.** Parsing the 87 `SR`
rows shows labels are unique except one: `cleguardians.tv` appears twice. A
plain `new Map(...)` keeps the last of a duplicate pair silently. That pair is
an MLB local entry and cannot be reached by the Bundesliga path, so the snippet
is safe as scoped — but it is a footgun if this index is ever lifted somewhere
league-agnostic. Building it once and asserting `map.size === rows.length`
would catch a future duplicate instead of swallowing it.

**How wrong the hardcode is, exactly.** The seven bundle members carry:

| key | auth |
|---|---|
| `usa` | `tv` |
| `fandango` | `free` |
| `youtubetv` | `sub` |
| `fubo` | `sub` |
| `sling` | `sub` |
| `hulu` | `sub` |
| `directv` | `sub` |

`auth:'tv'` is correct for one of seven and wrong for six.

**Open question for whoever applies this:** what should happen when the API
returns a real broadcaster that has no `SR` row — say a German-market channel
with no US rights entry? The snippet above discards the whole response, which
is safe but throws away real data. Adding an `SR` row per missing broadcaster
is the honest fix and needs someone who knows the rights position. Not decided
here.

---

## Also worth a look, not defects

- **`index.html:27160`** — the comment above the block reads *"wxAlert fires
  for: rain > 5mm/hr, temp > 100°F, wind > 30mph"*. It omits the cold arm
  (`temp < 28`), the snow arm and the AQI arm. A reader checking why a cold
  game got a bonus would conclude it shouldn't have.
- **`index.html:16860,16866`** — `temp: Math.round(c.temperature_2m ?? 0)` and
  `feelsLike: Math.round(c.apparent_temperature ?? c.temperature_2m ?? 0)`. A
  200 response missing `temperature_2m` yields 0 °F, which trips both cold
  bands (+16) and `wxAlert`. Defaulting a *measurement* to 0 makes a missing
  reading indistinguishable from a freezing one. `null` would propagate as
  "no data" through every `(x||0)` comparison below it and score nothing.

---

## Verified while writing this, and one correction

`production-never-displays-raw-drama` (claimed here on 2026-08-08 at 0.70,
falsifier never run because the repo was thought unreadable) is **confirmed in
substance**: a grep for a raw drama score interpolated into markup returns
nothing.

The claim's supporting detail was wrong, though: it said "all 8 call sites
bucket through `dramaTier()`". There are 12+ `dramaScoreLive` call sites and
`dramaTier(` appears 4 times. The conclusion stands; the arithmetic behind it
did not, and it was stated as if measured.
