# Portfolio films — correction after the rejected first cut

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

- Native 1280 × 720 viewport, whole frame retained.
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

## Directed visual study v3

The user accepted v2's fidelity but found it uninteresting. `direction.py` creates
`hubarch-direction-v3.mp4`: a separate silent direction study, approximately
11 seconds. It starts with complementary macro shots of the actual Architecture
and Interiors headings, pulls back to their complete composition, cuts into the
project selector, follows the native selection, then enters that actual project.

The entire authentic viewport stays one rigid camera plane. Typography, imagery,
spacing and source colours are never reconstructed. Detail shots deliberately
use closer framing; wide and concluding shots show the original complete page.
Camera movement is sampled at 60 fps, without temporal glyph blending or
optical-flow interpolation. The flat film background matches the site's pixel
colour. This renderer does not touch the portfolio scene or the accepted v2 proof.

```powershell
python tools/portfolioMotion/direction.py --ffmpeg <ffmpeg-path>
```

Requires Pillow and NumPy. Camera motion is rendered at 60 fps; native website
animation still has the variable cadence of the original screenshots. The board
and timing manifest are exported alongside the film. Music remains unselected;
this is a visual direction trial, not a finished music-led showreel.

## Still required

Select music/mood, author a new coherent sequence around the site's interactions,
establish reliable high-frame-rate capture, review actual motion and audio together,
then finish the remaining project films. Do not claim the technical proof fulfils
those creative requirements. No portfolio runtime changes or video replacements
have been made by this correction.
