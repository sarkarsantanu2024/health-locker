import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Generates the tiny web directory Capacitor requires.
 *
 * The Android app loads the deployed server, so nothing here is normally shown.
 * This page appears only in the one case that would otherwise be a blank white
 * screen: the app launched, and the server could not be reached at all. A blank
 * screen is indistinguishable from a crash, and it is what makes people
 * uninstall.
 *
 * It is deliberately self-contained — no stylesheet, no font, no script from
 * anywhere — because by definition the network is not working when it renders.
 */

const OUT_DIR = join(process.cwd(), "android-shell");

const html = `<!doctype html>
<html lang="en-IN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>HealthLocker</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      body {
        margin: 0;
        min-height: 100dvh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        text-align: center;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background: #f7f9fa;
        color: #0b1b1f;
      }
      .logo {
        width: 56px; height: 56px; margin: 0 auto 1.25rem;
        display: flex; align-items: center; justify-content: center;
        border-radius: 16px; color: #fff; font-weight: 700; font-size: 1.25rem;
        background: linear-gradient(135deg, #0f7a6c 0%, #22b8a0 100%);
      }
      h1 { font-size: 1.125rem; margin: 0 0 .5rem; letter-spacing: -0.01em; }
      p { margin: 0 auto; max-width: 20rem; font-size: .875rem; line-height: 1.5; color: #55676d; }
      button {
        margin-top: 1.5rem; min-height: 44px; padding: 0 1.25rem;
        border: 0; border-radius: 12px; font: inherit; font-weight: 500;
        color: #fff; background: #0f7a6c;
      }
      button:active { transform: scale(.97); }
      @media (prefers-color-scheme: dark) {
        body { background: #070d0f; color: #e6eff0; }
        p { color: #93a5a9; }
        button { background: #35c9b5; color: #04231f; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="logo" aria-hidden="true">H</div>
      <h1>Cannot reach HealthLocker</h1>
      <p>
        Check your internet connection and try again. Your health records are never stored
        on this device, so there is nothing to show until you are back online.
      </p>
      <button type="button" onclick="location.reload()">Try again</button>
    </main>
  </body>
</html>
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "index.html"), html, "utf8");

process.stdout.write(`Wrote the Android fallback shell to ${OUT_DIR}\n`);
