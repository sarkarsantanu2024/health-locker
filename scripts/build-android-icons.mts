/**
 * Renders the Android launcher icons and the splash artwork from the one SVG
 * that defines the brand — `public/icon.svg`.
 *
 * Android 8 and up uses the adaptive icon in `res/mipmap-anydpi-v26/`, which is
 * already vector and needs nothing from this script. These PNGs are for
 * everything else: devices on API 24–25 (our minSdk), the Play Store listing,
 * and the launcher's own fallbacks. Generating them keeps a hand-drawn icon
 * from drifting away from the SVG the web app uses.
 *
 *   pnpm android:icons
 *
 * Run it after changing `public/icon.svg`, then `pnpm android:apk`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "android", "app", "src", "main", "res");

/** Launcher icon sizes, in px, per density bucket. */
const LAUNCHER = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
} as const;

/**
 * Splash artwork. Capacitor's splash screen centre-crops a single image per
 * orientation, so these are generous — a phone in landscape is wider than any
 * icon needs to be, and scaling up a small source shows.
 */
const SPLASH = {
  port: { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] },
  land: { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] },
} as const;

/** Matches --background in globals.css, so the handover to the web view is invisible. */
const SPLASH_BACKGROUND = "#f7f9fa";

async function main() {
  const svg = await readFile(path.join(root, "public", "icon.svg"));

  /* Square launcher icons. */
  for (const [density, size] of Object.entries(LAUNCHER)) {
    const dir = path.join(res, `mipmap-${density}`);
    await mkdir(dir, { recursive: true });

    const square = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
    await writeFile(path.join(dir, "ic_launcher.png"), square);

    /*
     * The round variant is a real circular crop rather than the same square:
     * launchers that ask for `ic_launcher_round` draw it without masking, so a
     * square here shows up as a square among circles.
     */
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
    );
    const round = await sharp(square)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    await writeFile(path.join(dir, "ic_launcher_round.png"), round);

    /*
     * Adaptive-icon foreground for the legacy path: the mark on transparency,
     * inset to the 66% safe zone the launcher mask guarantees.
     */
    const fgSize = Math.round(size * 1.5); // 108dp canvas for a 72dp icon
    const art = await sharp(svg, { density: 384 })
      .resize(Math.round(fgSize * 0.62), Math.round(fgSize * 0.62))
      .png()
      .toBuffer();
    const foreground = await sharp({
      create: {
        width: fgSize,
        height: fgSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: art, gravity: "centre" }])
      .png()
      .toBuffer();
    await writeFile(path.join(dir, "ic_launcher_foreground.png"), foreground);
  }

  /* Splash: the mark centred on the app background. */
  for (const [orientation, densities] of Object.entries(SPLASH)) {
    for (const [density, [width, height]] of Object.entries(densities)) {
      const dir = path.join(res, `drawable-${orientation}-${density}`);
      await mkdir(dir, { recursive: true });

      const mark = Math.round(Math.min(width, height) * 0.28);
      const art = await sharp(svg, { density: 384 }).resize(mark, mark).png().toBuffer();

      const splash = await sharp({
        create: { width, height, channels: 4, background: SPLASH_BACKGROUND },
      })
        .composite([{ input: art, gravity: "centre" }])
        .png()
        .toBuffer();

      await writeFile(path.join(dir, "splash.png"), splash);
    }
  }

  /* The density-less fallback Capacitor points at by default. */
  const fallbackDir = path.join(res, "drawable");
  await mkdir(fallbackDir, { recursive: true });
  const fallbackArt = await sharp(svg, { density: 384 }).resize(320, 320).png().toBuffer();
  await writeFile(
    path.join(fallbackDir, "splash.png"),
    await sharp({ create: { width: 1280, height: 1920, channels: 4, background: SPLASH_BACKGROUND } })
      .composite([{ input: fallbackArt, gravity: "centre" }])
      .png()
      .toBuffer(),
  );

  console.log("Wrote Android launcher icons and splash artwork from public/icon.svg");
}

await main();
