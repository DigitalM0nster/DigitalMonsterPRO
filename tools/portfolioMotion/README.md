# Portfolio films вЂ” correction after the rejected first cut

## Current direction: Ostankino presentation v6

The user rejected pulse v5 and explicitly changed the format to a quiet,
longer presentation. Work on one project first: Ostankino. The approved design
references are `hubarch-digital-monster-v5.mp4` (blue frames and wave background)
and `hubarch-motion-v1.mp4` (sequential presentation of a project and its details).
There is no detached top or bottom HUD. The other four projects remain untouched.

Run `ostankinoPresentation.py --inspect`, then `--part 0` through `--part 3`,
then `--assemble --ffmpeg <path>`. The film is 46 seconds at 1920x1080/60 fps in
`output/showreels/ostankino/presentation-v6`. Parts use one continuous global
clock, so concatenation does not restart animation. Source frames are prepared
stills; UI movement is rebuilt from native pixels at 60 fps (desktop room slide
and mobile panel). No low-cadence screenshot sequences play inside the cards.
Original source recordings and all rejected exports remain available.

`presentationStyle.py` owns prepared blue corner frames without browser chrome;
`presentationAudio.py` adds quiet original harmony, stereo wave noise and
movement-timed Foley at native playback pitch. Motion uses continuous poses,
separated depth handoffs and dense short-shutter translation blur on fast moves.
The mobile block runs from 25.2 to 36.4 seconds, showing the native responsive
catalogue, apartment/office detail and menu. Rental floor cutaway, filtering,
catalogue and native individual plan cards have separate presentation scenes.

## Rejected revision: pulse v5

Use `pulseFilms.py --project <id> --render --ffmpeg <path>` for the current
1920 x 1080 / 60 fps exports. `--package` collects all five checked movies into
`output/showreels/ready-pulse-v5` and `portfolio-pulse-v5.zip`. Earlier sections
below describe historical iterations, including rejected directions.

Most website surfaces now have rounded corners with no browser toolbar. The
four shared films retain their distinct arrangements; short minimum-jerk moves
finish on measured low/mid percussion rather than an arbitrary delayed arrival.
SFX placement measures the filtered, trimmed, resampled sound's envelope peak.
Every movie retains its own original-speed user-selected music track.

Ostankino is separately authored in `ostankinoMotion.py` / `ostankinoShots.py`:
native transparent building, exact SVG wordmark without a white rectangle,
original floor buttons, slider, floor card and plan cards. Its story includes
recorded desktop building cutaways, catalogue/room transitions, homepage/service
motion and the actual responsive phone catalogue, room panel and menu. The real
mobile site disables the building view, so a desktop building was not invented
inside a phone. Real actions were captured through CUA with wall-clock frame
timestamps in `ostankino/sources/rental-v5`. Native recordings have variable
cadence (about 18-34 fps); graphic plane motion and the output timeline are 60 fps.
Playback uses timestamps, never an assumed uniform source frame index.

The room panel's horizontal slide is restored at 60 fps using an unchanged
native panel crop and monotone interpolation of its measured positions. The
original recording remains in `room-open`; processed frames are in
`room-smooth`. This avoids optical-flow text doubling. Its settled position at
source frame 26 (0.773333 s) lands on beat 21; this exact timestamp avoids
ambiguous nearest-frame ties at 60 fps. Generation and comparison are retained in
`ostankino/qa/v5-interpolation/nativePanelExperiment.py` and `review.md`.

The old 10-11 second section is replaced by native plan cards and an actual room
panel opening. Three contact-sheet rows move in alternating directions. Source
pixels are never enlarged; all scene boundaries retain continuous transforms
and opacity. Final exports receive full audio/video decode, exact frame counts,
black/silent ending checks and sampled visual inspection. Technical checks do
not imply subjective artistic approval or audio audition.

## Historical development notes

The user rejected v1 on 2026-09-10: rhythm, music, visuals and inaccurate treatment
of the original website. **Do not reuse the v1 direction or generated score.**
The old MP4 identifies the rejected result in the discussion.

## What went wrong

- Whole page screenshots were passed through a photographic cover crop. This
  removed meaningful interface content, especially in the narrow page cards.
- The hero was re-typeset with separately measured letters instead of keeping the
  website's actual shaping, spacing and responsive positioning.
- Arbitrary image/layout substitutions presented invented compositions as the work.
- Slogans and interior shots shifted focus away from the user's website design.
- The procedural score and uniform beat schedule were not an approved direction.
  Correct video decoding did not establish creative quality.

## Current deliverable: source-fidelity proof

`output/showreels/hubarch/hubarch-source-proof-v2.mp4` is a short **silent technical
proof**, not the replacement finished showreel. It captures the real live website:
homepage image changes, gallery selection and opening the Kirov case.

- Native 1280 Г— 720 viewport, whole frame retained.
- Original typography, layout, colours and interactions.
- No re-typesetting, crop, perspective distortion, invented text or music.
- Screenshots have variable cadence. They are selected by recorded timestamps for
  25 fps output, without optical-flow interpolation. This is a fidelity check,
  not a promise of a final high-frame-rate master.

Captures and timing manifests: `output/showreels/hubarch/sources/capture-v2`.
The rejected authoring implementation was replaced to prevent accidental reuse.

## Render

Requires Python with Pillow and FFmpeg with libx264.

```powershell
python tools/portfolioMotion/showreel.py --silent --ffmpeg <ffmpeg-path>
```

`--music <local-track>` creates a separately named audition after track selection.
It does not make the provisional visual cuts an approved musical edit. The user
was asked for one music reference while source fidelity was corrected.

## Current direction: browser mockups and detached native elements, no HUD (v9)

The user **rejected v3's macro/camera treatment**: enlarging the website degraded
its quality and spoiled the composition. Do not reuse those closeups. The agreed
instruction is to put the real, complete website design inside attractive cards
and animate the cards. Reduction is allowed; enlargement is not.

The user found v4's full-page cards better, but its neutral satin presentation did
not fit Digital Monster. **Every project film must retain Digital Monster's visual
identity**, regardless of the showcased website's own palette or character.

The user rejected v5's blocky animation and explicitly removed the lower caption.
Do not restore the bottom project name, description, section labels or rules.

The user liked v6's improved motion but found its literal site HUD frames
unsuitable for a polished motion film. Preserve that choreography; do not restore
corner brackets, segmented rails, bright corner anchors or perimeter packets.

The user's twelve visual references clarified that "frames" means rounded
presentation cards and dimensional mockups, not decorative luminous outlines.
V8 uses the browser window in reference 10 and the dimensional cards in reference
5 as its frame direction, in Digital Monster's graphite/blue palette. The user
also explicitly requested occasional elements separating from the page in 3D.

The user accepted v8, then explicitly removed the entire upper HUD: Digital
Monster wordmark, portfolio label, progress dots and horizontal rules. V9 removes
that overlay and its authoring code. Do not restore a top or bottom HUD. Browser
toolbars belong to the accepted mockups and remain.

`direction.py` now creates `hubarch-browser-clean-v9.mp4`, an 11-second silent
motion study at 1920 x 1080, 60 fps. The accepted full-page card treatment is kept:
three actual homepage/gallery/case recordings move through the composition with a
fixed camera. `digitalMonsterStyle.py` owns the surrounding brand presentation.

V6 replaced independent eased keyframes and held poses with one shared continuous
orbit. Its harmonic clock slows near the featured page and accelerates through
the handoff without stopping. Position, inclination, size and depth order follow
the same angle. Cards move along a common curved path instead of making unrelated
diagonal moves; the final static row has been removed. V8 keeps the same motion
clock, poses and source timing. The card is 48 source pixels taller to hold its
browser toolbar outside the original viewport.

The style was checked against the running site and its sources:

- `filmPalette.js` / `style.scss`: #00a9ff accent, white typography.
- `SiteTopHud`: actual Aquire Light brand font and Manifold Extended HUD font.
- `FilmHud`: deliberate spacing and broken rules (its lower caption is omitted).
- `FilmProjection` and the live Home: luminous corner anchors, perimeter scatter,
  dark space, blue flowing light and particles.

Windows have rounded
graphite bodies, quiet browser controls, the actual source domain, projected side
walls and soft shadows between cards. No luminous border surrounds the window.
The outer corner radius does not mask the original square page. Particle ribbons
and orbital traces animate behind the cards. No external text, logo, progress
indicator or decorative HUD rules remain. The source page itself
gets no colour grade, scanlines, glitch distortion or invented site interface.

`elementLift.py` separates the real gallery photograph at 3.95вЂ“5.40 seconds. The
layer includes only the recorded photograph and its existing four-pixel paper
margin. Beneath it is the source site's flat background, sampled from the recording
to preserve JPEG-rounded colour. The photograph lifts in Z with a small independent
tilt and displacement, casts a soft shadow, then settles into its original slot.
Reassembling the split layer at rest reproduces the source pixels exactly. The
timing is limited to the settled gallery: do not apply these coordinates to
arbitrary captures or other projects.

Binding source-fidelity limits:

- Paste original 1280 x 720 frames 1:1 inside the bezel. Preserve all source pixels,
  layout, spacing and colours. No crop, blur, re-typesetting or image replacement.
- The explicitly requested native-element lift is permitted; retain the actual
  element pixels and restore its exact position, with no invented content.
- Validate the perspective Jacobian across the viewport and lifted photo at every
  output frame; their largest source-pixel scales must stay <= 1.
- Keep each card entirely within the output frame. Layer overlap in the deck is
  intentional; the featured card shows its full viewport.
- Change stacking order only when the corresponding cards are separated, avoiding
  visible order pops. Prefilter smaller cards to reduce fine-type shimmer.

The v8 render checks found a maximum local scale of 0.8418 for the page and 0.9319
for the detached photo, at least 37.34 output pixels around card bounds, and a
pixel-identical source paste and photo-layer reassembly before projection.
All six changes in depth order occur with the corresponding cards separated.
Card-centre motion stays between 0.719 and 8.802 px per output frame; no stopped
keyframes. V9 retains the accepted V8 geometry, choreography and photo lift.
Earlier outputs remain separate discussion artifacts, including the accepted v6
motion proof and rejected v3 and v5 motion.
No portfolio scene or runtime assets are replaced by this authoring script.

```powershell
python tools/portfolioMotion/direction.py --ffmpeg <ffmpeg-path>
```

Requires Pillow and NumPy. Card motion is rendered at 60 fps; native website
animation still has the variable cadence of the original screenshots. The board
and timing manifest are exported alongside the film. Music remains unselected;
this is a visual direction trial, not a finished music-led showreel.

## Still required

Review the selected music against the user's taste, establish reliable
high-frame-rate website capture,
then prepare Globtravlink and Universe-travel when their portfolio material is supplied. Do not claim the technical proof fulfils
those creative requirements. No portfolio runtime changes or video replacements
have been made by this correction.

## Five-project batch in the accepted style

`direction.py --project <id> --ffmpeg <path>` supports `hubarch`, `nipigas`,
`ostankino`, `mmk-1` and `belka-production`. `projects.py` records the actual source
of each film and its independently checked element-lift rectangle. The accepted
Hubarch v9 file is retained rather than rendered again.

- Ostankino: live native home, office rental and studios pages. Its native video
  wordmark briefly lifts from the homepage.
- Belka: original local application's home, case gallery and March 8 case. One
  actual gallery image separates from the page.
- MMK-1: original local application's animated 3D crane, catalogue and About.
  The detail page with a broken image was excluded; source application unchanged.
- Nipigas: original 60 fps desktop recording, cropped only to its web viewport
  `(0,120,1904,912)`. Browser tabs, bookmarks and Windows taskbar are excluded.
  The entire webpage is reduced to 1280 x 614 and gets a matching wider mockup.

CUA native export dimensions differ by several pixels. ProjectCaptures retains
every original pixel and extends only the last row/column to the target viewport;
it never enlarges or crops the page to normalize these small differences.
The original capture files and timing records remain in each film's sources.
All films are 11 seconds, 1920 x 1080 at 60 fps, without an external HUD or music.
Browser recordings retain their captured cadence; only Nipigas has a 60 fps
source. Full output decoding and source/projection checks accompany the renders.

Review exports are collected in `output/showreels/ready`. These are offline motion
assets; no production scene, preloader or site playback code is changed.

## Music edit

`musicEdit.py --prepare --ffmpeg <path>` prepares a continuous 59-second edit of
Mixkit's **Tech House vibes**, Alejandro MagaГ±a (A. M.), starting at beat 32.
The downloaded source stays in `output/showreels/music`; its source and license
URLs are recorded in `edit.json`. It is not redistributed as standalone music.
Low-frequency transient analysis measured 122 BPM. A 0.028% tempo adjustment
fits 24 beats to exactly 708 frames / 11.8 seconds at 60 fps.

Render each project with `direction.py --beat-sync --project <id> --ffmpeg <path>`.
These are new `*-beat-v1.mp4` exports; approved silent films remain intact.
The shared orbit now settles around beats 0/8/16, accelerates through 4/12/20,
and has a restrained beat-driven speed modulation. Element lifts peak on beat 2
(Ostankino) or 10 (Hubarch/Belka). All changes are continuous and keep source
pixels below 1:1 projected scale. Native page playback uses its own remapped
capture clock, so the music edit cannot run beyond recorded source material.

`musicEdit.py --package --ffmpeg <path>` fully decodes all video/audio streams,
checks frame counts, writes five standalone files with short audio fades, and
builds a combined preview with uninterrupted music. Delivery: `ready-music`
and `portfolio-motion-five-with-music.zip`. No runtime scene or site audio
behavior is modified. Music selection is an editorial proposal, not a claim
that the user's taste has already been approved.

## User music references вЂ” supersedes the Mixkit selection

The user supplied these specific taste references after the first music export.
Do not treat Tech House vibes as approved music or use its generic 122 BPM
timing as the final musical direction.

- **Top priority:** Infraction / Alexi Action вЂ” Until You Disconnect.
  https://www.youtube.com/watch?v=NRxnR9jy3jI
  Official track: https://inaudio.org/track/until-you-disconnect-brazilian-phonk/
  Publisher tempo: 130 BPM. Brazilian phonk; instrumental versions are listed.
- **Top priority:** Infraction вЂ” First Light.
  https://www.youtube.com/watch?v=TpZwt4w9TnM
  Official track: https://inaudio.org/track/first-light-technology/
  Publisher tempo: 100 BPM. Electronic / technology.
- Infraction вЂ” Dance Baby (stylish hip-hop / saxophone).
  https://www.youtube.com/watch?v=xTIOX-_pwvY
- Infraction вЂ” Durban (afrobeat).
  https://www.youtube.com/watch?v=5YNODBlYteI
- https://www.youtube.com/watch?v=kyCdLGCdPGA вЂ” user-selected **7:12вЂ“8:30**.
  The uploader's chapter list identifies this section as **Big Energy
  Instrumental**, beginning at 7:10; Banda Speed Up starts at 8:30.
  Standalone reference: https://www.youtube.com/watch?v=OAWBHnZZMSA

Titles and chapter identification were verified through YouTube metadata;
tempos through official InAudio track pages. Audio itself has not been auditioned
in this session. Direct source retrieval returned HTTP 403; no replacement
soundtracks have been downloaded or rendered from these references yet.
Obtain the actual edit-source files before choosing excerpt starts and mapping
transients. Rework the beat clock and motion cues for the selected music;
do not merely replace audio on the old 122 BPM exports. Keep approved browser
mockups, complete source viewports, restrained depth lifts and no external HUD.

## Hubarch story film and moving fields вЂ” v1 history

The source-audio blocker above is resolved: the user explicitly requested direct
YouTube downloads. All five supplied references and the standalone Big Energy
reference are downloaded in `output/showreels/music/references`, together with
their uploader descriptions and metadata. The two favorites have decoded WAV
copies; the exact 7:12вЂ“8:30 excerpt is also saved. Do not ask the user to upload
these files again. Retain author credits and the commercial-use terms stated
in the uploader descriptions; no subscription was purchased and nothing published.

The user rejected the five short orbit films as incomplete showreels. They are
historical experiments, not final deliverables. Current work is a new Hubarch
film with eight editorial scenes and a resolved ending. The references
specifically request dense, moving, diagonal fields of design cards and screens
staggered in depth, as well as the already approved lifted page elements.

`motionField.py` projects rows through a common perspective plane. Rows travel
in opposing directions, with small depth offsets. The complete native website
texture remains on each card; the movie frame intentionally clips peripheral
cards like the user's wall references. No source pixel is enlarged. A dense
field replaces the sparse multi-card scene and returns for the climax.

`hubarchStory.py` defines eight scenes. Run once without flags for the checked
storyboard, then `--shot 0` through `--shot 7` with `--ffmpeg <path>` to render
independent pieces. `--assemble --ffmpeg <path>` prepares the soundtrack,
concatenates the rendered pieces, muxes AAC, and verifies full video/audio decode
and exactly 1772 frames. Output: `hubarch/story-direction/`.

First Light's downloaded YouTube audio has a strong 130 BPM grid in mid/high
spectral-flux analysis, despite the publisher page's 100 BPM label. The edit
starts at source beat 24; the first dense field arrives on beat 32 where the
drums enter. Sixty-four musical beats become 29.533 seconds at 60 fps with a
0.017% audio tempo adjustment. Editorial cuts and the lifted-photo peak use
this grid. Audio fades only at the beginning/end; no music restart per scene.

## Revision v2 вЂ” calmer motion and measured musical attacks

The user rejected v1's excessive, unnatural motion and weak musical alignment.
The previous `story-direction` export remains intact. `hubarchStory.py` now
wrote to `hubarch/story-refined-v2`; that Hubarch review edit is preserved.

`hubarchMusicCues.py` records individual attacks measured from the downloaded
First Light waveform, including syncopated accents. These replace the uniform
BPM-based cut schedule. The audio starts at 12.931 seconds and plays at its
original speed. Eight scenes occupy 1675 frames / 27.9167 seconds at 60 fps.
Cuts are rounded to the nearest video frame (maximum cue error 7.667 ms).
This is a timing measurement, not a claim of listening-based artistic approval.

Camera angles and scale stay fixed within each shot. The dense field is prepared
once with a 64-pixel guard area, then tracks as one plane at 8 pixels/second
horizontally and 2 vertically. There is no counter-scrolling or camera rocking.
The cascade shares one small eased translation. The photo lift uses 32% of
v1's displacement, with a smooth rise, short hold and return. Catalogue and
lift scenes share the exact camera pose and source frame at their boundary.
The ambient backdrop runs at 16% of its former speed.

Render `--shot 0` and `--shot 1`, then `--assemble --preview --ffmpeg <path>`
for `motion-check-6s.mp4` (346 frames / 5.7667 seconds). Render shots 2вЂ“7 and
run `--assemble --ffmpeg <path>` for `hubarch-showreel-first-light-v2.mp4`.
Assembly checks complete video/audio decoding and the expected frame count.
Geometry validation checks native pixels are never enlarged and the
catalogue-to-lift boundary is continuous. No production runtime is modified.

## Revision v3 вЂ” aligned counter-moving rows

The user clarified that the dense fields must move as three separate rows:
top and bottom in one direction, centre in the opposite direction. The v2
whole-field drift did not satisfy that request. Perspective taper and the
extra row stagger also made the gaps and alignment look uneven.

`motionField.py` now uses equal native-resolution browser cards on three
parallel strips: fixed -8-degree rotation, uniform 0.526 scale and equal
37.872-pixel horizontal/vertical gutters. Top/bottom move right at 64 px/s;
the centre moves left at the same speed along the row axis. The camera stays
fixed. Repeated triplets continue beyond the frame, with no visible wrap,
per-cycle easing, integer-position steps, scale pumping or perspective drift.
Native cards/chrome are cached in premultiplied-alpha strips. A prepared 0.625
Lanczos mip suppresses thin-line aliasing before the single moving warp. It
remains larger than the final 0.526 projection, so native artwork is never
enlarged. Subpixel positions are retained at every output frame.

The motion model follows the continuous linear row-loop pattern from the
official GSAP helper: https://gsap.com/docs/v3/HelperFunctions/helpers/seamlessLoop/
Motion's transition/timing documentation was also consulted:
https://motion.dev/docs/animate
These are offline equivalents; no animation library or site runtime is added.

Render shots 1 and 6 into `hubarch/story-refined-v3`, reusing the unchanged
six v2 shots. Assemble with the existing measured music cues to produce
`hubarch-showreel-first-light-v3.mp4`. `validate_rows` checks the three signed
velocities, equal gaps, parallel edges and unchanging scale. Full export
decoding and frame-count checks remain mandatory.

## Current revision v4 вЂ” resolved ending

The user found the v3 ending abrupt. Extend only the final hero scene by two
seconds; the existing seven shots and their musical edit points remain intact.
The whole image eases to black over 1.75 seconds, followed by 0.6 seconds of
black. The continuous original-speed music fades with a cosine-squared gain
envelope over 2.75 seconds, reaching silence 0.35 seconds before the file ends.
This replaces the old quarter-second audio and picture fades.

Output: `hubarch/story-refined-v4/hubarch-showreel-first-light-v4.mp4`,
1795 frames / 29.9167 seconds. Reuse shots 0вЂ“6 from v3, render `--shot 7`, then
`--assemble`. `hubarchMusicCues.py` now separates original musical cue frames
from the extended final picture boundary; the outro is not claimed as a beat.

## Historical collection v1 вЂ” rejected duplication

The user accepted v4 and requested completion of the remaining four films.
`portfolioStory.py` adapts that approved edit to Nipigas, Ostankino, MMK-1 and
Belka Production. All use the approved First Light excerpt, eight editorial
scenes, original site pixels, opposing rows and the resolved v4 ending.
Project-specific scene clocks avoid blank Nipigas loading frames and retain
the native MMK crane animation. Only verified elements lift: Ostankino's name
and Belka's gallery artwork. No invented UI, detached HUD or captions are added.

Nipigas keeps its 1280Г—614 viewport aspect ratio; the uniform field scale adapts
to its shorter cards so the three row heights stay consistent. Original source
pixels remain below 1:1. Native website frames continue updating independently
of cached fixed mockup shadows/rims; comparison with the uncached renderer
differs by at most 2/255 due to alpha-compositing rounding.

Run `portfolioStory.py --project <id> --render --ffmpeg <path>` for each of
`nipigas`, `ostankino`, `mmk-1`, `belka-production`. Each writes a checked
storyboard, scene metadata, eight parts and a complete 1795-frame film to
`output/showreels/<id>/story-final-v1`. Assembly fully decodes video and audio;
ending checks require the last half-second black and last quarter-second silent.
`--package --ffmpeg <path>` collects all five films (approved Hubarch included)
in `output/showreels/ready-final` and `portfolio-showreels-final.zip`.
The production website and its video assignments remain untouched.

## Individual motion collection v2 вЂ” superseded

The user rejected reusing both the choreography and the music across projects.
Use `individualFilms.py`, `individualMotion.py` and `individualMusic.py` for the
current outputs. Preserve v1 as history; do not package it as the current edit.

- Nipigas: Big Energy from the requested 7:12вЂ“8:30 compilation excerpt;
  unfolding pages, counter-moving vertical archive columns and paired stories.
- Ostankino: Durban; a level broadcast multiview, programme/preview composition
  and the authentic animated word separating from its native page.
- MMK-1: Until You Disconnect; a horizontal rail, weighted module assembly,
  three levels and the original moving crane.
- Belka: Dance Baby; fanned cards, staggered cascade and lifted gallery artwork.
- Hubarch: retain the approved v4 picture and First Light, adding a quiet motion
  SFX mix. Compare encoded picture-packet hashes to ensure visual preservation.

Each edit has its own beat phrases and measured transient cuts, quantized to
60 fps (at most half a frame of rounding). Music remains at its original speed.
Motion SFX use the site's existing recordings, with soft envelopes, movement
pan and restrained mix levels. Store the isolated SFX stem and event list.
Every film keeps the resolved black/silent tail from the approved ending.

Native browser sprites are prepared at 0.86 scale and sampled at fractional
positions from the prepared source, never cumulatively from a previous frame.
Final projected source scale stays below 1.0. Intentional rail/column overscan
is separate from complete hero cards, which retain at least 20 px of margin.

Run `individualFilms.py --project <id> --render --ffmpeg <path>` for the four
projects above. Run `--hubarch-sound --ffmpeg <path>` for its audio-only revision,
then `--package --ffmpeg <path>`. Outputs live in each project's
`individual-motion-v2` folder, collected in `ready-individual-v2` and
`portfolio-individual-motion-v2.zip`. Packaging requires five distinct track IDs
and five distinct audio hashes. Source credits are in the package manifest.

## Current flow v3 вЂ” continuous transitions and native detail scenes

The v2 hero-to-fan change at about 2.55 seconds was a hard composition reset.
The user also rejected long slow movements and uninterrupted browser mockups.
Use `flowFilms.py` for the current five films. It renders one continuous global
playhead; no shot resets position, scale, source clock, opacity or stacking order.
Stable layer identities carry the same browser view across scene boundaries.
Main changes settle over 0.64вЂ“0.78 seconds; short phrase accents take 0.43 seconds.
Original music remains at 1.0 speed, with a tighter selection of musical phrases.

`flowLayouts.py` alternates complete browser views with measured native photo,
illustration, typography and catalogue details without browser chrome. Keep
complete words when extracting typography. The Belka illustration retains its
original light body and paper background; do not colour-key both away. All
artwork stays at or below its original pixel scale, with a minimum visible margin.

Each project still has a distinct composition: Belka fan/cascade, Ostankino
multiview, MMK horizontal rail, Nipigas chronology and Hubarch paired architecture.
Transitions have one stable stacking order and source clock. SFX start with the
motion gesture and finish at its musical arrival; no sounds during static holds.

Run `flowFilms.py --project <id> --preview --ffmpeg <path>` for a seven-second
motion check, or `--render` for a complete film. `--package` gathers the five
checked outputs in `ready-flow-v3` and `portfolio-flow-v3.zip`. Keep older exports.
Checks cover mathematical continuity at every boundary, adjacent rendered frames,
full encoded audio/video decoding, exact frame count, and black/silent tails.
The first Belka cut was also compared in the encoded before/after MP4 files;
the discontinuity at 2.55 seconds was removed without introducing an isolated
frame-change spike. These are technical checks, not a claim of artistic approval.


## Pulse v4 вЂ” dense choreography from the two new motion references

Current authoring entry: `pulseFilms.py`. The previous flow v3 is retained as
history. New files are in `<project>/pulse-v4`, packaged in `ready-pulse-v4`
and `portfolio-pulse-v4.zip`. No production website media URLs are changed.

The two user references were downloaded for frame analysis in
`output/showreels/reference-analysis`. The Wix agency reel informed uniform
contact sheets, extracting a focal card and native-artwork scenes. The second
motion reel informed staggered planar reveals, compact card rearrangements and
motion continuing inside compositions. External title cards/HUDs are excluded.

`pulseLayouts.py` supplies separate 40-beat scores (36вЂ“38 pose arrivals) for
five projects. Hubarch uses counter-moving architectural rows; Belka uses a
fan and diagonal cascade; Ostankino uses broadcast multiview/columns and its
native wordmark; MMK uses an axial rail, hinges and frameless crane diagrams;
Nipigas uses chronology and unframed archive columns. Full original source
colours remain intact. Native home recordings play across pose changes rather
than resetting at the first transition. Source clips restart only after an
instance was absent.

`pulseMotion.py` uses perspective, staggered near-edge-on reveals, short
acceleration/settling gestures, XYZ photo lifts with an actual source hole and
shadow, and continuous alternating conveyor velocities. New objects reveal
quickly and departing objects fold away; no prolonged translucent screen blend.
Positions, transforms, opacity and source instance clocks share one playhead.
The first transition has no hard layout/source reset.

Each film retains its own original-speed track. Quarter-note transients are
measured from the selected recording and half-beat cues interpolate those
attacks. Choreographic motion spans the beat attack, followed by a brief settle;
SFX swishes follow the gesture and assembly sounds land on measured attacks.
The soundtrack retains a resolved fade and silent tail.

Checks: all pose-key boundaries continuous; no projected native pixels enlarged
(including the lifted pieces); motion density measured separately from technical
continuity; final full A/V decode, exact 60 fps frame count and black/silent tail.
These checks establish technical correctness, not subjective artistic approval.

Run `pulseFilms.py --project <id> --render --ffmpeg <path>` and then
`pulseFilms.py --package`. Each render is a complete 1920Г—1080/60 fps picture
plus its own soundtrack and movement SFX. `--preview` renders seven seconds.

Final QA refinements: the card shadow is identical when a native piece starts
lifting, every transform samples the original resolution without a hard mip
threshold, and Nipigas uses native paper/card compositions instead of a flat
fake hole in the textured archive. Complete foreground artwork stays inside
the frame; intentional contact-sheet overscan is confined to field instances.

## Quiet presentations v6 (current direction)

The user approved `ostankino/presentation-v6/ostankino-presentation-v6.mp4`
and requested the remaining four projects in the same presentation format.
This supersedes the beat-led pulse/showreel direction above. The approved
Ostankino movie is preserved, not overwritten by this batch.

`presentationStage.py` contains the extracted 60 fps native-card compositor.
New films enable additional minification filtering for moving contact sheets;
`ostankinoPresentation.py` keeps its original scenes and rendering defaults.
`projectPresentations.py` provides independent narratives for Hubarch (44 s),
MMK-1 (40 s), Belka Production (42 s), and Nipigas (44 s). Blue corner frames,
wave background, native pixel scale limits, short travel blur and resolved
endings are shared. No detached top/bottom HUD or invented project captions.

`projectPresentationAssets.py` reads original desktop captures and newly captured
real mobile viewports. Mobile captures and provenance are stored at each
project's `sources/presentation-v6/`. Native Nipigas date-card PNGs preserve
their alpha; Belka illustrations are rasterized from original SVG assets.
Hubarch gallery transitions keep the native header and filters stationary.
Photo/card lifts start at their original pixel positions, with an underlay
that removes the duplicate photo underneath.

`presentationAudio.py` retains the approved quiet levels: faint original
ambient harmony, stereo wave noise and movement-led Foley. Each new film has
its own harmonic register/sequence, noise seed, and scene-specific cues.

Run `projectPresentations.py --project <id> --inspect`, then `--part 0` through
`--part 3` with `--ffmpeg <path>`, followed by `--assemble`. Use no more than two
simultaneous render processes. Outputs and visual/audio/decode/tail checks live
in `output/showreels/<id>/presentation-v6/`. The batch package contains the four
new MP4s and a manifest; the live website is not changed by this offline workflow.

The September 11 continuation adds `travelPresentations.py`: GlobTravLink (44 s)
and Universe Travel (42 s), with separate scene sequences, original responsive
captures, native UI pieces and audio variants 5/6. Use `--project <id> --inspect`
and `--all --ffmpeg <path>` to render and assemble either film. The original
five masters remain unchanged.

All seven presentations are now wired into `filmProjects.js`, with versioned
1080p and 960x540 files under `public/video/portfolio`. Both variants retain
60 fps and fast-start MP4 indexing. FilmMedia prepares one texture per film
under the preloader; only the selected decoder plays. Pause/seek stay local to
each project, audio follows the site switch, and the full 16:9 composition fits
inside the wider screen without cropping. This is a local site integration;
no production deployment is performed by the render scripts.

`output/showreels/presentations-v6/index.html` previews all seven movies.
`portfolio-manifest.json` records their files, master hashes and export checks;
the earlier four-movie ZIP and its manifest are retained unchanged.

### Music revision and player controls

The next user request replaces the faint harmonic bed with more energetic music.
`presentationMusic.py --ffmpeg <path>` creates `presentation-v7` masters and both
site resolutions by copying the existing v6 video stream. Picture packet hashes
must match, including frame rate, motion and endings. Seven separate tracks are
selected from the saved user references: Big Energy, First Light, Durban, Banda,
Latin Fusion, Until You Disconnect and Dance Baby. First Light is the user's
current reference and accompanies Hubarch. Music stays at its original speed,
with a normalized level, soft intro/outro, and the same wave and movement Foley.
Track sources, offsets and audio checks are recorded in each export folder.
The existing review index and portfolio manifest now point to v7; v6 is preserved.

The film player has a vertical volume rail at its right edge above fullscreen.
Click/drag changes the player gain, and the speaker toggles mute while retaining
the selected level across projects. The global sound switch remains the master
mute. Keyboard M toggles player mute; focused accessibility controls also expose
mute and volume steps. Only prepared shader uniforms and video gain change.
Finished films advance once through the normal project transition, restarting
the next video at zero and wrapping after the last project. Paused/hidden scenes
and an active project selection prevent automatic navigation.

The user's immediate correction is binding: music must remain barely audible
background, even when the track itself has energy. The final `presentation-v8`
exports apply **-24 dB to music only** after normalization (nominal -42 LUFS),
preserving the separate wave/Foley mix and the unchanged video stream. The site,
review index and portfolio manifest point to v8. v7's louder mix is superseded;
do not restore its level or present it as the current result. `presentationMusic.py`
now produces this quiet v8 mix by default.

The subsequent wave-noise correction is `presentation-v9`: reduce only the
wave ambience by a further **20 dB** while retaining v8's quiet music gain and
the movement Foley level. `presentationAudio.make_audio` accepts a separate
wave gain; the current music export script uses 0.1. v9 is the current site
and review version. Do not restore the louder wave bed from v7/v8.

The next user correction is `presentation-v10`: card motion must sound like
short, dry card handling, rather than waves. Replace the long air/silk movement
recordings with 65–230 ms attacks from `card_movement.mp3`, filtered at
700–4200 Hz and followed by a short decay. Retain gesture timing and spatial pan.
Apply a separate **1/3 movement gain** (-9.54 dB) and **1/2 background gain**
(-6.02 dB for both music and the already subdued waves), relative to v9.
The current export script, site paths and review files use v10. Video packets
remain identical to the approved v6 picture; the source music and tempo remain.
