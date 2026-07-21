import Image from "next/image";

import { cn } from "@/lib/utils";
import { Illustration, type IllustrationName } from "@/ui/illustration";
import { TONE_STYLES, type Tone } from "@/ui/tone";

/**
 * PHOTOGRAPHY ON THE PUBLIC SITE
 *
 * The marketing site is the one surface where a real photograph beats an
 * illustration: an anonymous visitor deciding whether to trust a health company
 * with their family's records responds to faces, not to vector art.
 *
 * We cannot ship photographs we do not have a licence for, and a stock photo of
 * a smiling doctor with a stethoscope is worse than nothing. So the site ships
 * with illustrated placeholders, and every photo slot is a one-line swap:
 *
 *   1. put the file in `public/photos/` (e.g. `public/photos/hero.jpg`)
 *   2. fill in that slot's entry in PHOTOS below with its path, alt text and
 *      dimensions
 *
 * Nothing else changes — layout, rounding, aspect ratio and the dark-mode
 * treatment are already handled here. Until a slot is filled it renders its
 * illustrated stand-in, which is a finished-looking design rather than a grey
 * box saying "image".
 *
 * Alt text is mandatory and is not decorative: these images carry meaning about
 * who the product is for (WCAG 1.1.1).
 */

export type PhotoSlot = "hero" | "patients" | "providers" | "security" | "cta";

type PhotoEntry = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

/**
 * Real photography, once you have it. Licensed images only — this is a public
 * health product and an unlicensed stock photo is a legal problem, not a design
 * one. Prefer Indian subjects and Indian clinical settings; the product is
 * built for India and generic Western stock reads as imported.
 */
export const PHOTOS: Partial<Record<PhotoSlot, PhotoEntry>> = {
  // hero: { src: "/photos/hero.jpg", alt: "A family looking at their health records together on a phone", width: 1200, height: 900 },
  // patients: { src: "/photos/patients.jpg", alt: "A woman photographing a prescription with her phone", width: 1000, height: 750 },
  // providers: { src: "/photos/providers.jpg", alt: "A receptionist at a clinic front desk using HealthLocker", width: 1000, height: 750 },
  // security: { src: "/photos/security.jpg", alt: "A patient reviewing who has access to their records", width: 1000, height: 750 },
};

/** What each slot falls back to while there is no photograph for it. */
const FALLBACK: Record<PhotoSlot, { art: IllustrationName; tone: Tone; caption: string }> = {
  hero: { art: "records", tone: "teal", caption: "Every record, one timeline" },
  patients: { art: "medicine", tone: "rose", caption: "Doses you will not miss" },
  providers: { art: "people", tone: "sky", caption: "Your clinic, in order" },
  security: { art: "shield", tone: "emerald", caption: "You decide who sees it" },
  cta: { art: "upload", tone: "violet", caption: "Start with one prescription" },
};

export function Photo({
  slot,
  className,
  priority = false,
  /** Tailwind aspect utility — the slot's frame stays the same either way. */
  aspect = "aspect-[4/3]",
}: {
  slot: PhotoSlot;
  className?: string;
  priority?: boolean;
  aspect?: string;
}) {
  const photo = PHOTOS[slot];
  const frame = cn(
    "relative overflow-hidden rounded-consumer border border-border shadow-lg",
    aspect,
    className,
  );

  if (photo) {
    return (
      <div className={frame}>
        <Image
          src={photo.src}
          alt={photo.alt}
          width={photo.width}
          height={photo.height}
          priority={priority}
          sizes="(max-width: 768px) 100vw, 50vw"
          className="size-full object-cover"
        />
      </div>
    );
  }

  const { art, tone, caption } = FALLBACK[slot];

  return (
    <div className={cn(frame, "bg-mesh bg-surface")}>
      <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Illustration name={art} tone={tone} className="h-36 sm:h-44" />
        <p className={cn("text-sm font-medium", TONE_STYLES[tone].text)}>{caption}</p>
      </div>
    </div>
  );
}
