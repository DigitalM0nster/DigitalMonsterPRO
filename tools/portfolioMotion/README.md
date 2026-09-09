# Portfolio films — editorial development

The YouTube references establish a craft threshold, not an approved visual style.
Do not copy their scenes, music, colour palettes or template choreography.

## First motion study: Hubarch / «Пространство в движении»

An architectural grid becomes a moving editorial system. Photography introduces
space, the site's Panama typography gives it character, and the composition
resolves into the real website. The hero, gallery and project material are the
subject of the film. No device mockups or holographic treatment are baked in:
the portfolio's Three.js scene already owns that presentation.

- 1920 × 1080, 30 fps, 30 seconds, 128 BPM.
- An original instrumental sketch: four-on-the-floor kick, syncopated bass,
  stereo percussion, restrained chord stabs, a break and a final return.
- Cuts and major motion cues sit on musical beats. Several quieter holds allow
  the interface to be read.
- Actual Hubarch fonts and project assets come from the local Hubarch repository.
  The home and gallery were also inspected on https://hubarch.ru/ru.
- Captured UI stills are clearly distinguished from authored motion: this film
  is an editorial reconstruction, not a continuous screen recording.
- This is a first cut for judging direction, not an approved final campaign.

## Other project directions to develop from their real source material

- Nipigas: a journey through dates and memories; a contemporary pulse with
  deliberate pauses around historical material, rather than a celebratory dance ad.
- Ostankino: the signal becomes an image; studio selection, broadcast graphics,
  architectural scale and a percussive electronic rhythm.
- MMK-1: lift, weight, precision; crane detail and the real interactive model,
  product selection and a heavier bass groove.
- Belka Production: playful editorial cuts, character, expressive colour and
  syncopated percussion, with its actual case studies driving the story.
- Globtravlink: routes, discovery and booking decisions; use public interfaces
  and approved demo content, never private customer/financial records.
- Universe-travel: destinations and the feeling of departure; more spacious
  electronic music and a destination-led narrative.

## Rendering the first cut

Requires Python with Pillow + NumPy and FFmpeg with libx264 + AAC. No browser
automation, application dependency or runtime scene change is needed to render.

```powershell
python tools/portfolioMotion/showreel.py --preview --ffmpeg <ffmpeg-path>
python tools/portfolioMotion/showreel.py --ffmpeg <ffmpeg-path>
```

Optional flags: `--hubarch-root`, `--capture-root`, `--output`, `--width`.
The two captures in `output/showreels/hubarch/sources` are `hubarch-home.png` and
`hubarch-projects.png`; without them,
the renderer uses the existing portfolio image assets as a fallback.

Generated films stay in `output/showreels/hubarch`. They are not yet installed in
`FilmMedia`: its current single-decoder path must be extended and verified before
adding several independently scored project videos to the live portfolio.
