"use client";

import { useEffect } from "react";

/**
 * Wires the app to Android when it is running inside the Capacitor shell.
 *
 * Three things a WebView does wrong out of the box, each of which is the sort of
 * detail that makes an app feel like a web page in a frame:
 *
 *  1. **The hardware back button closes the app** instead of going back a
 *     screen. Losing your place because you wanted to leave a sub-page is the
 *     single most jarring difference from a real app.
 *  2. **The splash screen hangs** until a fixed timeout, rather than until the
 *     first screen is actually ready to show.
 *  3. **The status bar** keeps its own colour, so it does not match the app bar
 *     underneath it.
 *
 * Everything is behind a native-platform check and a dynamic import, so the
 * browser build neither runs nor downloads any of it.
 *
 * Renders nothing.
 */
export function NativeBridge() {
  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];

    async function bridge() {
      const { Capacitor } = await import("@capacitor/core");

      // In a browser — including an installed PWA — there is nothing to do.
      if (!Capacitor.isNativePlatform()) return;

      const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/splash-screen"),
        import("@capacitor/status-bar"),
      ]);

      if (disposed) return;

      // 1. Back button walks in-app history, and only exits from the top.
      const backHandle = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else void App.exitApp();
      });
      cleanups.push(() => void backHandle.remove());

      // 2. The first screen is rendered by the time this effect runs, so this is
      //    the honest moment to drop the splash.
      await SplashScreen.hide();

      // 3. Match the status bar to the app bar, and follow the theme when the
      //    user switches it.
      const media = window.matchMedia("(prefers-color-scheme: dark)");

      const applyTheme = (dark: boolean) => {
        void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
        void StatusBar.setBackgroundColor({ color: dark ? "#070d0f" : "#f7f9fa" });
      };

      applyTheme(media.matches);
      const onThemeChange = (event: MediaQueryListEvent) => applyTheme(event.matches);
      media.addEventListener("change", onThemeChange);
      cleanups.push(() => media.removeEventListener("change", onThemeChange));
    }

    void bridge().catch((error: unknown) => {
      // A broken bridge must never take the app down with it — the web view
      // itself is perfectly usable without any of the above.
      console.warn("[native] bridge failed", error);
    });

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
