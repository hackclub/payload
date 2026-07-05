import sharp from "sharp";

/** The default Hack Club–themed VM wallpaper artwork (1920x1080). */
function buildSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <pattern id="dots" width="40" height="40" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="1.5" fill="#ffffff" fill-opacity="0.04"/>
      </pattern>
      <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff8c37"/>
        <stop offset="0.55" stop-color="#ec3750"/>
        <stop offset="1" stop-color="#d82a41"/>
      </linearGradient>
    </defs>

    <rect width="1920" height="1080" fill="#17171d"/>
    <rect width="1920" height="1080" fill="url(#dots)"/>
    <rect x="0" y="0" width="1920" height="6" fill="#ec3750"/>

    <!-- terminal prompt + gradient wordmark + blinking-style cursor block -->
    <text x="912" y="560" text-anchor="middle"
          font-family="'DejaVu Sans Mono','SFMono-Regular',Menlo,monospace"
          font-size="150" font-weight="700" letter-spacing="1">
      <tspan fill="#8492a6">~ </tspan><tspan fill="url(#brand)">payload</tspan>
    </text>
    <rect x="1305" y="452" width="58" height="118" rx="6" fill="#33d6a6"/>

    <text x="1872" y="988" text-anchor="end"
          font-family="'DejaVu Sans Mono',Menlo,monospace"
          font-size="22" letter-spacing="2"
          fill="#8492a6" fill-opacity="0.6">Made with <tspan fill="#ec3750" fill-opacity="1">♥</tspan> by Floppy</text>
  </svg>`;
}

let cached: Buffer | null = null;

/**
 * The default Hack Club–themed VM wallpaper, rendered to a 1080p JPEG (matching
 * the format uploaded wallpapers are normalized to). Rasterized once from the
 * SVG above and memoized for the process lifetime.
 */
export async function getDefaultWallpaper(): Promise<Buffer> {
  if (cached) return cached;
  cached = await sharp(Buffer.from(buildSvg()))
    .jpeg({ quality: 88 })
    .toBuffer();
  return cached;
}

/** Raw SVG source — handy for previewing/regenerating the artwork. */
export function defaultWallpaperSvg(): string {
  return buildSvg();
}
