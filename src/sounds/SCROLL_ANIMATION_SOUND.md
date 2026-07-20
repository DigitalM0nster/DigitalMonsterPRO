# Scroll / animation–driven sounds

Canonical pattern for SFX that must **follow painted motion** (stage mix, mosaic wipe, hex progress, spring rest) — not wheel intent, not one-shot “play on scroll”.

Reference implementations:

| Sound | Controller | Drive signal |
| --- | --- | --- |
| Left HUD mosaic (About + case) | `caseStudyTextTransitionSound.js` | Visual mix / stage-local progress from the same rAF that paints the wipe |
| About front hex dissolve | `aboutFrontDissolveSound.js` (`logo_reveal`) | Painted dissolve `clamp((story01 − 0.5) / 0.5)` — same as `AboutScene` |
| About **Back disappear** | `aboutBackDissolveSound.js` (`text2`, stitched loop + soft edges) | Painted Back dissolve on story 1→2 |
| About **white PCB appear** | `aboutPcbAppearSound.js` (`about_particles.wav`, fixed settle-rate loop) | Painted pcbReveal 1.5→2 — same timbre at any scroll speed |
| About white PCB bed | `aboutParticleSound.js` (quiet loop after appear) | presence × proximity on story 2→4 |
| Hex route mix | `hexTransitionSound.js` | Carousel **smoothed** `progress` (not `progressTarget`) |

Paths live in `SOUND_CATALOG` (`soundDesign.js`). Prefetch/decode follows the preloader contract in `AGENTS.md`. Do **not** add one-line `*SoundSrc.js` files for a single path.

---

## Law

1. **Drive visual progress, not wheel / `progressTarget`.**  
   Sound must track what the user *sees* (`progress`, remapped HUD mix, stage-local). Driving `progressTarget` or raw wheel deltas makes the bed react before (or without) animation.

2. **Scrub, don’t loop at rest.**  
   Position in the buffer follows a playhead derived from motion. When `|d progress / dt|` is near zero → fade out and stop. Do **not** leave a looping bed after the spring settles (About/case rAF often stops at rest — a loop would keep playing with no further `update()`).

3. **Rate from visual speed.**  
   `rate ≈ |d progress / dt| × bufferDuration` (clamped). Fast wipe → faster scrub; crawl → silence below `MIN_SPEED`.

4. **Hard-sync on drift; soft fade on rest.**  
   If expected buffer offset drifts from the playhead beyond ~0.1s → restart at the correct offset (short restart fade). On idle/settle → longer exponential rest fade (~300ms+), not a hard cut.

5. **One fixed timbre for bidirectional scroll (when required).**  
   Left HUD: both wheel-up and wheel-down use the **same** buffer polarity (currently time-reversed = “scroll down” timbre). Advance a **monotonic** playhead with `|Δprogress|` so reverse motion does not flip the sample.  
   Hex may keep true forward/reverse scrub tied to mix direction — that is a different product choice; do not mix the two models in one controller without an explicit reason.

6. **Segment jumps are not scrub.**  
   If progress jumps by a large step (new stage / wrap, e.g. `> 0.8`) → stop + reset playhead, do not seek across the discontinuity.

7. **Respect mute / visibility / page sound gate.**  
   Hook `isSoundAudible`, `isPageSoundAllowed`, and fade-stop on hidden / mute. Route through `masterAudioBus` (pan/gain), `resumeMasterAudioContext` before start.

8. **No circular import of pan constants from `soundDesign.js` into a module that `soundDesign` preloads.**  
   Duplicate the pan number locally if needed (see left HUD / hex), or keep path-only coupling via `SOUND_CATALOG`.

---

## Left HUD model (default for stage / mosaic text)

```
each animation frame:
  progress = painted mix (0…1)
  speed = (progress - last) / dt
  if |speed| < MIN_SPEED → rest fade, stop
  scrubProgress = wrap01(scrubProgress + |progress - last|)
  rate = |speed| × duration
  syncPlayback(rate, scrubProgress)   // single polarity buffer
  last = progress
```

- Buffer: decode once; optionally build a **time-reversed** bed if the design wants “scroll-down” character for all directions.
- API shape: `update*(deltaSeconds, progress, progressTarget?)` — `progressTarget` may be accepted for call-site symmetry but **must not** drive the scrub unless product explicitly wants intent-lead sound.
- Call from the same tick that advances the visual spring/mix (`aboutExperienceRuntime`, `caseExperienceRuntime`, enter/mosaic helpers). Prefer the value that matches the wipe (e.g. About front-half HUD mix), not a softer 3D-only curve, if text and sound must lock.

---

## Hex model (route progress scrub)

- Playhead ≈ carousel `progress` (and direction may select forward vs reversed element).
- Still: visual progress owner, velocity→rate, rest fade, mute/visibility.
- Spatial/pan extras are hex-specific; do not copy into left HUD unless needed.

---

## Do / Don’t

**Do**

- Put the file path in `SOUND_CATALOG`; preload via existing soundDesign prefetch / Start decode path.
- Fade out on settle; exponential rest fade over linear hard mute.
- Keep volume/pan as named constants next to the controller.
- Suppress briefly across route/chrome events that would otherwise double-trigger.

**Don’t**

- One-shot `play()` on every wheel tick for continuous scrub feels.
- Loop bed gated only on “user scrolled recently” while visuals are idle.
- Recreate `AudioContext` / re-decode the file every stage.
- Drive sound from React `useEffect` on route alone when a rAF progress owner already exists.
- Add a micro-module whose only export is one string path.

---

## Verification

- Slow / fast / reverse scroll: bed tracks the wipe; no stuck loop after rest.
- Both scroll directions: timbre matches the chosen polarity (left HUD: always reverse bed today).
- Mute, tab hide, page leave: sound stops cleanly.
- Stage wrap / commit: no scrub across the jump.
- First gesture / Start: decode ready before first interactive scrub (preloader contract).
