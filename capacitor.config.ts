import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android wrapper for HealthLocker.
 *
 * **This is a native shell over the deployed server, not a static bundle**, and
 * that is a deliberate constraint rather than a shortcut. HealthLocker is server
 * rendered: every screen runs a database query behind an auth guard, and server
 * actions are HTTP round trips. `next export` cannot produce any of that, so an
 * APK containing "the app" is not a thing that can exist here — what ships is a
 * WebView pinned to the real origin.
 *
 * What that buys, versus a browser tab:
 *   - a home-screen icon and a native splash screen;
 *   - no address bar, no browser chrome, no accidental navigation away;
 *   - the Android back button wired to in-app history;
 *   - a real package you can sideload or put on Play.
 *
 * What it does NOT buy: offline. The service worker still serves the offline
 * page, but health records are never cached — see `public/sw.js` for why.
 *
 * `CAP_SERVER_URL` must point at the deployed origin. It defaults to the
 * development machine's LAN address only when explicitly set; there is no
 * localhost default, because an APK built against localhost silently shows a
 * blank screen on a real phone and the cause is not obvious.
 */
const serverUrl = process.env.CAP_SERVER_URL ?? process.env.APP_URL;

if (!serverUrl) {
  throw new Error(
    "CAP_SERVER_URL (or APP_URL) must be set to the deployed origin before building the Android app.\n" +
      "  Production:  CAP_SERVER_URL=https://healthlocker.example pnpm android:sync\n" +
      "  On a LAN:    CAP_SERVER_URL=http://192.168.1.5:3000 pnpm android:sync",
  );
}

const isPlainHttp = serverUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: "com.healthlocker.app",
  appName: "HealthLocker",
  // Capacitor insists on a web directory even when loading a remote URL. Ours
  // holds only the "cannot reach the server" fallback — see scripts/build-android.mts.
  webDir: "android-shell",

  server: {
    url: serverUrl,
    // Lets the WebView treat the site as first-party, which is what keeps the
    // httpOnly session cookie working.
    hostname: new URL(serverUrl).host,
    androidScheme: "https",
    // Only ever enabled for a LAN address during development. Android blocks
    // cleartext by default, and for a health app that default is correct.
    cleartext: isPlainHttp,
  },

  android: {
    // Stops Android's "content is being loaded over an insecure connection"
    // mixed-content behaviour from silently degrading anything.
    allowMixedContent: false,
    // A physical back press should walk in-app history, not close the app.
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      // Matches --background in globals.css, so the handover to the web view is
      // invisible rather than a white flash.
      backgroundColor: "#f7f9fa",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      // Dark glyphs on our light background.
      style: "LIGHT",
      backgroundColor: "#f7f9fa",
      overlaysWebView: false,
    },
  },
};

export default config;
