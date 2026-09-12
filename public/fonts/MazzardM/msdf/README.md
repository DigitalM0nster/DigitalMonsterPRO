# Portfolio Medium font atlas

`film-regular.png` and `film-regular.json` are generated from the existing
`../MazzardM-Regular.woff`. They preserve the portfolio's Mazzard font.
Latin, Cyrillic, digits and navigation chevrons share one immutable 512×512
MSDF texture. Chinese labels retain their prepared CanvasTexture fallback.

Generator: msdf-atlas-gen 1.4 (MSDFgen 1.13, Skia build).
Run from the repository root; the executable is an offline build tool and is
not shipped with the site:

```text
msdf-atlas-gen -font public/fonts/MazzardM/MazzardM-Regular.woff -chars "[0x0020,0x007E], [0x0410,0x044F], 0x0401, 0x0451, 0x2039, 0x203A" -type msdf -size 48 -pxrange 6 -outerpxpadding 1 -potr -nokerning -yorigin bottom -imageout public/fonts/MazzardM/msdf/film-regular.png -json public/fonts/MazzardM/msdf/film-regular.json
```

RGB stores contour distances, not display colour: use NoColorSpace, linear
filtering and no mipmaps. FilmHud prepares glyph instances and uploads this
atlas before Start. Scrolling, project selection and locale changes only
change existing uniforms. High and Low keep their original text renderer.
