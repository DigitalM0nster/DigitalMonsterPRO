# Home Medium services-line MSDF trial

Generated from the existing `../Jura-VariableFont_wght.ttf`, variable axis **wght=600**.
No new font or runtime generator dependency. The Chinese locale keeps its prepared raster fallback.

Generator: [msdf-atlas-gen v1.4](https://github.com/Chlumsky/msdf-atlas-gen/releases/tag/v1.4)
(MSDFgen v1.13, Skia). Run from the repository root:

```powershell
msdf-atlas-gen -varfont 'public/fonts/Jura/Jura-VariableFont_wght.ttf?Weight=600' -chars '[0x0020,0x007E], [0x0410,0x044F], 0x0401, 0x0451' -type msdf -size 48 -pxrange 6 -outerpxpadding 1 -potr -nokerning -yorigin bottom -imageout public/fonts/Jura/msdf/jura-600.png -json public/fonts/Jura/msdf/jura-600.json
```

This generator matches the FreeType axis **name `Weight`**, not its OpenType tag `wght`.
Using `?wght=600` silently leaves this font at its default 300 weight.

The RGB channels encode signed distances, **not sRGB colour**. Read with `NoColorSpace`,
linear filtering and no mipmaps. JSON bounds use a bottom Y origin. Geometry retains the
existing per-letter Canvas advance and top-baseline placement for an equal-size A/B comparison.
Median reconstruction and derivative antialiasing run in the existing text shader;
the replacement-symbol atlas, reveal, locale playhead and hex ownership are unchanged.
