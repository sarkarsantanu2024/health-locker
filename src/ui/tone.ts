/**
 * TONES
 *
 * A tone is a hue plus the four ways we ever apply it: as text, as a subtle
 * chip, as a gradient, and as a border. Components take `tone="violet"` and
 * look the answer up here, so a card, a stat tile, a badge and a nav icon
 * showing the same kind of thing are the same colour by construction rather
 * than by someone remembering.
 *
 * Adding a hue means adding it in three places: the CSS variables in
 * globals.css, the `@theme inline` mapping beside them, and this table.
 *
 * Colour never carries meaning alone — every tinted element in the app also
 * has an icon or a text label (WCAG 1.4.1).
 */

export const TONES = [
  "teal",
  "violet",
  "rose",
  "amber",
  "sky",
  "emerald",
  "neutral",
] as const;

export type Tone = (typeof TONES)[number];

type ToneStyle = {
  /** Foreground weight: icons and small text. AA on `surface` and on `chip`. */
  text: string;
  /** Tinted chip background — the square behind an icon, a badge fill. */
  chip: string;
  /** Chip and its foreground together, which is how it is used 90% of the time. */
  chipSolid: string;
  /** Border in the hue, for cards that want an outline rather than a fill. */
  border: string;
  /**
   * Custom properties consumed by `.bg-hue-gradient`, `.text-hue-gradient`,
   * `.bg-hue-wash` and `.border-t-brand` in globals.css.
   */
  gradientVars: string;
};

export const TONE_STYLES: Record<Tone, ToneStyle> = {
  teal: {
    text: "text-teal",
    chip: "bg-teal-subtle",
    chipSolid: "bg-teal-subtle text-teal",
    border: "border-teal/25",
    gradientVars: "[--g-from:var(--hue-teal)] [--g-to:var(--hue-teal-bright)]",
  },
  violet: {
    text: "text-violet",
    chip: "bg-violet-subtle",
    chipSolid: "bg-violet-subtle text-violet",
    border: "border-violet/25",
    gradientVars: "[--g-from:var(--hue-violet)] [--g-to:var(--hue-violet-bright)]",
  },
  rose: {
    text: "text-rose",
    chip: "bg-rose-subtle",
    chipSolid: "bg-rose-subtle text-rose",
    border: "border-rose/25",
    gradientVars: "[--g-from:var(--hue-rose)] [--g-to:var(--hue-rose-bright)]",
  },
  amber: {
    text: "text-amber",
    chip: "bg-amber-subtle",
    chipSolid: "bg-amber-subtle text-amber",
    border: "border-amber/25",
    gradientVars: "[--g-from:var(--hue-amber)] [--g-to:var(--hue-amber-bright)]",
  },
  sky: {
    text: "text-sky",
    chip: "bg-sky-subtle",
    chipSolid: "bg-sky-subtle text-sky",
    border: "border-sky/25",
    gradientVars: "[--g-from:var(--hue-sky)] [--g-to:var(--hue-sky-bright)]",
  },
  emerald: {
    text: "text-emerald",
    chip: "bg-emerald-subtle",
    chipSolid: "bg-emerald-subtle text-emerald",
    border: "border-emerald/25",
    gradientVars: "[--g-from:var(--hue-emerald)] [--g-to:var(--hue-emerald-bright)]",
  },
  neutral: {
    text: "text-muted-foreground",
    chip: "bg-muted",
    chipSolid: "bg-muted text-muted-foreground",
    border: "border-border",
    gradientVars: "[--g-from:var(--border-strong)] [--g-to:var(--muted-foreground)]",
  },
};

/**
 * WHAT EACH KIND OF THING IS COLOURED
 *
 * The point of the palette is that a patient learns "violet means a report"
 * once and it holds on the timeline, in the console, on the marketing site and
 * in a notification. Assignments are semantic where a semantic reading exists
 * (rose for medicines because it is the one that hurts to miss, emerald for
 * vaccinations because they are the completed/protected kind), and stable
 * otherwise.
 */
export const DOMAIN_TONE = {
  prescription: "teal",
  report: "violet",
  medicine: "rose",
  vaccination: "emerald",
  insurance: "sky",
  expense: "amber",

  appointment: "teal",
  admission: "violet",
  patient: "sky",
  billing: "amber",
  inventory: "emerald",
  staff: "rose",
  department: "violet",
  alert: "rose",
  document: "sky",
  family: "violet",
} as const satisfies Record<string, Tone>;

export type DomainKey = keyof typeof DOMAIN_TONE;

/** `toneFor("report")` → `"violet"`, falling back to teal for anything new. */
export function toneFor(domain: string): Tone {
  return (DOMAIN_TONE as Record<string, Tone>)[domain] ?? "teal";
}

/**
 * A stable tone for an arbitrary string — used for org avatars and staff
 * initials, where the colour only needs to be consistent for a given name, not
 * meaningful. Neutral is excluded so nothing lands grey by accident.
 */
export function toneFromString(value: string): Tone {
  const hues = TONES.filter((t) => t !== "neutral");
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hues[Math.abs(hash) % hues.length];
}
