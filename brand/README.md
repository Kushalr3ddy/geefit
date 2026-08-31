# GeeFit brand assets

Vector rebuild of the "GF" logo taken from `../posters/image 2.jpeg`, which was the only
source — no original logo file exists in this project. Every shape here is real vector
geometry, not an upscaled bitmap.

## Files

| File | Use |
|---|---|
| `geefit-logo.svg` | Primary lockup (mark + wordmark). Default choice. |
| `geefit-logo-white.svg` | Reversed, for dark backgrounds. |
| `geefit-mark.svg` | Monogram only — crescent + GF. |
| `geefit-wordmark.svg` | "GEEFIT" only, no mark. |
| `geefit-icon.svg` | Monogram on a square canvas with padding — app/social icon. |
| `favicon.ico` | 16, 32, 48, 64, 128, 256 px, each rendered from vector. |
| `geefit-icon-{180,256,512}.png` | 180 = apple-touch-icon. Transparent. |
| `geefit-logo-{1000,2000}.png` | Transparent raster lockup. |
| `geefit-logo-white-2000.png` | Transparent reversed lockup. |
| `geefit-mark-1600.png`, `geefit-wordmark-1600.png` | Transparent components. |
| `geefit-horizontal.svg` | Horizontal lockup — mark left, wordmark right. Best for site headers. |
| `geefit-horizontal-ondark.svg` | Horizontal lockup, brightened for dark backgrounds. |
| `geefit-horizontal-white.svg` | Horizontal lockup, reversed to white. |
| `geefit-logo-ondark.svg`, `geefit-mark-ondark.svg` | Stacked lockup / mark, brightened for dark backgrounds. |
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | Mark on a solid rounded tile — home screens and PWA manifests. |
| `og-image.png` | 1200x630 social share card. |

## Colour

The original artwork runs a single horizontal gradient across the whole lockup, dark on
the left to bright on the right. That is preserved as a `linearGradient` in each SVG.

- Deep maroon `#7A1108` — gradient start
- Bright red `#D8241A` — gradient end
- Crescent orange `#F6A31C` → `#ED7800`

For flat single-colour use, `#B01B12` sits at the middle of the red gradient.

These files are mirrored into `../site/assets/brand/`, which is what the website loads.
Regenerate there and copy across, or copy from here — keep the two in sync.

## On-dark palette

The maroon end of the gradient disappears against a near-black page, so the site uses a
brightened variant of the same ramp:

- `#B81A10` -> `#F0402A` for the mark and wordmark
- `#FFB733` -> `#F9861A` for the crescent

## Notes

- The gradient is defined in `userSpaceOnUse` coordinates and is scoped per file, so the
  mark-only and icon files carry the full dark-to-bright sweep rather than a slice of it.
- Counters (the holes in G and the wordmark's G) rely on `fill-rule="nonzero"`. Keep each
  colour group as one `<path>`; splitting subpaths into separate elements fills the holes in.
- At 16px the monogram is close to unreadable — that is inherent to the mark's detail, not
  the render. If a sharper favicon matters, a simplified glyph-only variant would be needed.
- Source fidelity vs the poster artwork: IoU 0.986 (monogram), 0.971 (wordmark). The
  crescent was replaced with two fitted circles (radii 66.83 / 66.11, fit residual < 0.7px),
  so it is now geometrically exact rather than traced.
- The wordmark's typeface could not be identified, so the letterforms are outlined vector
  shapes. There is no font dependency, and nothing here needs a font licence.
