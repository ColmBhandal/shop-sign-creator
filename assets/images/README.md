# Theme images

Photo-based themes read their image from this folder (or from `assets/images/` beside the
executable). Drop a PNG or JPG here with the filename the theme expects.

| Theme | File | Placement | Suggested image |
| --- | --- | --- | --- |
| `snowscape` | `snowscape.png` | full background | Portrait (~2:3) festive scene, calm centre for text |
| `frame-high` | `frame-high.png` | full background + `safeArea` | Dark frame/panel (2048×3072) |
| `frame-medium` | `frame-medium.png` | full background + `safeArea` | White panel, dark frame |
| `frame-low` | `frame-low.png` | full background + `safeArea` | White panel, pale frame |

Optional `image.safeArea` (`top/right/bottom/left`, page fractions) confines text to a panel
baked into a background image.

Guidelines for new images:
- Portrait, roughly A4 proportions (about 2:3). ~1024×1536 is fine for a sign.
- No people, no brands/logos, no recognizable characters, no text in the image.
- For a **background** theme, keep the centre calm so overlaid text stays readable (the
  renderer also lays a dark scrim behind the text).
- For a **band** or **footer** theme, the image sits in a strip and text goes in the clear
  area, so a horizontal/edge composition works best.

Images added here are picked up automatically. When building the standalone exe, any images
in this folder at build time are embedded into it; images added beside the exe afterwards
are also found at runtime.
