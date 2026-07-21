import { cn } from "@/lib/utils";

import { TONE_STYLES, type Tone } from "./tone";

/**
 * SPOT ILLUSTRATIONS
 *
 * Empty states used to be a sentence and a button. A drawing does two things a
 * sentence cannot: it tells you at a glance that the screen is *empty* rather
 * than *broken*, and it gives an otherwise blank screen somewhere for the eye
 * to land.
 *
 * These are inline SVG, not files:
 *   - they inherit the tone's colours, so the same drawing is teal on the
 *     appointments screen and violet on reports without a second asset;
 *   - they follow light/dark automatically, because the stops are CSS
 *     variables — an exported PNG would need two files and would still be
 *     wrong at the boundary;
 *   - they cost no request and no layout shift.
 *
 * House style: one soft blob behind, flat rounded shapes in front, a two-stop
 * gradient on the hero shape only, everything else in the subtle tint or in
 * white. No outlines thinner than 8 units at this scale — they disappear on a
 * phone.
 */

export type IllustrationName =
  | "calendar"
  | "records"
  | "upload"
  | "medicine"
  | "report"
  | "search"
  | "shield"
  | "wallet"
  | "people"
  | "bell";

export function Illustration({
  name,
  tone = "teal",
  className,
}: {
  name: IllustrationName;
  tone?: Tone;
  className?: string;
}) {
  const style = TONE_STYLES[tone];
  const g = `url(#hl-ill-${tone})`;

  return (
    <svg
      viewBox="0 0 200 160"
      className={cn("h-32 w-auto", style.gradientVars, className)}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`hl-ill-${tone}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--g-from)" />
          <stop offset="100%" stopColor="var(--g-to)" />
        </linearGradient>
      </defs>

      {/* The blob. Same shape everywhere, which is what makes a set feel like a set. */}
      <path
        d="M39 44c14-24 46-33 74-27 27 6 51 26 55 51 4 26-13 57-38 66-25 8-58-6-83-24C22 92 25 68 39 44Z"
        fill="var(--g-to)"
        opacity="0.13"
      />

      {FIGURES[name](g)}
    </svg>
  );
}

const white = "var(--surface)";
const line = "var(--g-from)";

const FIGURES: Record<IllustrationName, (g: string) => React.ReactNode> = {
  /* An open diary with one slot filled — "there is room here", not "nothing exists". */
  calendar: (g) => (
    <>
      <rect x="52" y="42" width="96" height="86" rx="14" fill={g} />
      <rect x="60" y="58" width="80" height="62" rx="9" fill={white} />
      <path d="M74 36v16M126 36v16" stroke={line} strokeWidth="9" strokeLinecap="round" />
      <rect x="70" y="70" width="34" height="10" rx="5" fill="var(--g-to)" opacity="0.55" />
      <rect x="70" y="88" width="60" height="8" rx="4" fill={line} opacity="0.22" />
      <rect x="70" y="102" width="44" height="8" rx="4" fill={line} opacity="0.22" />
    </>
  ),

  /* Stacked cards in a locker — the product's own metaphor. */
  records: (g) => (
    <>
      <rect x="46" y="62" width="108" height="66" rx="14" fill={g} />
      <rect x="58" y="46" width="84" height="54" rx="11" fill={white} stroke={line} strokeWidth="4" />
      <rect x="70" y="62" width="46" height="8" rx="4" fill={line} opacity="0.3" />
      <rect x="70" y="78" width="60" height="8" rx="4" fill={line} opacity="0.18" />
      <circle cx="100" cy="114" r="9" fill={white} />
    </>
  ),

  /* A sheet lifting into the locker, with the arrow leading the eye upward. */
  upload: (g) => (
    <>
      <rect x="50" y="82" width="100" height="48" rx="14" fill={g} />
      <rect x="66" y="26" width="68" height="72" rx="11" fill={white} stroke={line} strokeWidth="4" />
      <path
        d="M100 82V44m0 0-15 15m15-15 15 15"
        fill="none"
        stroke={line}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="76" y="110" width="48" height="8" rx="4" fill={white} opacity="0.8" />
    </>
  ),

  /* A capsule and a strip — reads as "medicines" faster than a pill bottle does. */
  medicine: (g) => (
    <>
      <rect x="42" y="86" width="76" height="34" rx="17" fill={g} transform="rotate(-16 80 103)" />
      <path
        d="M56 118a17 17 0 0 1 0-24l22-22 24 24-22 22a17 17 0 0 1-24 0Z"
        fill={white}
        opacity="0.55"
      />
      <rect x="106" y="36" width="52" height="62" rx="12" fill={white} stroke={line} strokeWidth="4" />
      <circle cx="121" cy="54" r="6" fill="var(--g-to)" />
      <circle cx="143" cy="54" r="6" fill="var(--g-to)" />
      <circle cx="121" cy="76" r="6" fill={line} opacity="0.3" />
      <circle cx="143" cy="76" r="6" fill={line} opacity="0.3" />
    </>
  ),

  /* A report page with a result line running across it. */
  report: (g) => (
    <>
      <rect x="56" y="30" width="88" height="106" rx="13" fill={white} stroke={line} strokeWidth="4" />
      <rect x="56" y="30" width="88" height="26" rx="13" fill={g} />
      <path
        d="M70 100h12l7-18 10 34 9-24 6 12h16"
        fill="none"
        stroke={line}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="70" y="70" width="42" height="8" rx="4" fill={line} opacity="0.22" />
      <rect x="70" y="118" width="60" height="8" rx="4" fill={line} opacity="0.16" />
    </>
  ),

  /* Magnifier over a list — for "no results", which is not the same as "no data". */
  search: (g) => (
    <>
      <rect x="40" y="44" width="84" height="76" rx="13" fill={white} stroke={line} strokeWidth="4" />
      <rect x="54" y="62" width="50" height="8" rx="4" fill={line} opacity="0.22" />
      <rect x="54" y="80" width="34" height="8" rx="4" fill={line} opacity="0.22" />
      <circle cx="130" cy="86" r="30" fill={g} opacity="0.95" />
      <circle cx="130" cy="86" r="18" fill={white} />
      <path d="M150 108l14 14" stroke={line} strokeWidth="11" strokeLinecap="round" />
    </>
  ),

  /* Shield with a tick — consent, encryption, anything that means "you are safe". */
  shield: (g) => (
    <>
      <path d="M100 26l44 18v34c0 30-19 47-44 56-25-9-44-26-44-56V44l44-18Z" fill={g} />
      <path
        d="M80 84l14 14 28-30"
        fill="none"
        stroke={white}
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),

  /* A rupee note in a wallet — bills, expenses, payments. */
  wallet: (g) => (
    <>
      <rect x="56" y="42" width="88" height="34" rx="8" fill={white} stroke={line} strokeWidth="4" />
      <rect x="44" y="62" width="112" height="60" rx="14" fill={g} />
      <rect x="106" y="82" width="50" height="24" rx="12" fill={white} />
      <circle cx="127" cy="94" r="6" fill={line} />
      <path
        d="M74 78h20m-20 10h20m-14 0c10 0 14 6 14 12m-14 0 16 14"
        fill="none"
        stroke={white}
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.85"
      />
    </>
  ),

  /* Two people — staff, family members, patients on a list. */
  people: (g) => (
    <>
      <circle cx="78" cy="60" r="22" fill={g} />
      <path d="M42 122a36 36 0 0 1 72 0Z" fill={g} />
      <circle cx="130" cy="68" r="17" fill={white} stroke={line} strokeWidth="4" />
      <path
        d="M102 122a28 28 0 0 1 56 0Z"
        fill={white}
        stroke={line}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </>
  ),

  /* A quiet bell — "nothing to tell you", not "notifications are off". */
  bell: (g) => (
    <>
      <path
        d="M100 32a34 34 0 0 1 34 34v22l12 18H54l12-18V66a34 34 0 0 1 34-34Z"
        fill={g}
      />
      <path d="M86 106a14 14 0 0 0 28 0" fill={white} opacity="0.9" />
      <circle cx="100" cy="26" r="8" fill={line} />
    </>
  ),
};
