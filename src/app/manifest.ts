import type { MetadataRoute } from "next";

/**
 * Web app manifest — the part of PWA that makes HealthLocker installable and
 * makes it open without browser chrome, so it reads as an app rather than a
 * website.
 *
 * Offline caching, the service worker and the install prompt are Phase 12; this
 * is the presentation layer of the same feature and costs nothing now.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HealthLocker — your health records",
    short_name: "HealthLocker",
    description:
      "Prescriptions, reports, medicines, vaccinations and insurance for your whole family, in one place.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f9",
    theme_color: "#0d7266",
    lang: "en-IN",
    dir: "ltr",
    categories: ["health", "medical", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
