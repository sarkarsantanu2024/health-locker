# Design system

Read this before adding a screen. It is short because most of the decisions are
already encoded in code — the point of the list below is to say *where*, so the
next screen inherits them instead of inventing its own.

## One rule

**Never write a hex value outside `src/app/globals.css`.** Every colour in the
product is a CSS variable declared there, mapped into Tailwind by the
`@theme inline` block beside it. A hard-coded colour is a colour that will be
wrong in dark mode and will not move when the palette does.

## The palette

Three layers, in order of how often you should reach for them.

**Surfaces and text** — `background`, `surface`, `surface-2`, `foreground`,
`muted`, `muted-foreground`, `border`, `border-strong`. Most of any screen is
these.

**Brand** — `primary` (teal) with `primary-hover`, `primary-subtle` and
`primary-bright`. `primary-bright` is for gradients and artwork only; it does
not pass contrast as text.

**The six hues** — `teal`, `violet`, `rose`, `amber`, `sky`, `emerald`, each a
triple of `--hue-x`, `--hue-x-subtle`, `--hue-x-bright`.

The hues exist so that colour carries meaning rather than decoration. A locker
full of identical teal cards has to be *read*; one where reports are always
violet and medicines are always rose can be *scanned*. The mapping lives in
`src/ui/tone.ts` as `DOMAIN_TONE`, and it is the same on the marketing site, in
the patient app and in every provider console:

| Kind                                    | Hue     |
| --------------------------------------- | ------- |
| Prescriptions, appointments             | teal    |
| Reports, admissions, departments        | violet  |
| Medicines, staff, alerts                | rose    |
| Expenses, billing                       | amber   |
| Patients, insurance, documents          | sky     |
| Vaccinations, inventory                 | emerald |

Semantic colours (`success`, `warning`, `danger`, `info`) are a separate axis and
still mean what they say. A row is `danger` because something is wrong with it,
never because of what kind of row it is.

## Using a hue

Do not spell hue classes by hand. Ask `src/ui/tone.ts`:

```tsx
import { TONE_STYLES, toneFor } from "@/ui/tone";

const tone = toneFor("report");               // "violet"
const style = TONE_STYLES[tone];

<span className={style.chipSolid}>…</span>     // tint + matching foreground
<div className={cn("bg-hue-gradient", style.gradientVars)}>…</div>
```

`gradientVars` sets `--g-from` / `--g-to`, which drive four utilities in
`globals.css`: `.bg-hue-gradient`, `.text-hue-gradient`, `.bg-hue-wash` (a soft
corner tint for cards) and `.border-t-brand` (a gradient hairline). `.bg-mesh`
is the multi-hue backdrop for heroes and empty states.

`toneFromString(name)` gives a stable hue for an arbitrary string — org avatars,
staff initials — where the colour needs to be consistent but not meaningful.

## Accessibility, which is not optional here

- Every hue is declared twice: light, and again inside the
  `@media (prefers-color-scheme: dark)` block. If you add one, add both.
- Each `--hue-x` passes AA on `surface` and on its own `-subtle`. `-bright` does
  not; it is for gradients and illustration only.
- **Colour is never the only signal** (WCAG 1.4.1). Every tinted chip, badge or
  row also carries an icon or a text label. Check by imagining the screen in
  greyscale — if it stops making sense, it is not finished.
- The focus ring in `globals.css` is never removed.

## The mark

`src/ui/logo.tsx` exports `<LogoMark>` (artwork only) and `<Logo>` (mark plus
wordmark, with an optional portal subtitle). Use them; do not draw the "H"
square again.

The same drawing exists in four places and they must be edited together:

- `src/ui/logo.tsx` — themed, uses CSS variables
- `public/icon.svg` — favicon and PWA icon, literal hex
- `public/icon-maskable.svg` — Android/PWA maskable, artwork inside the safe zone
- `android/app/src/main/res/drawable*/ic_launcher_*.xml` — adaptive launcher icon,
  plus a monochrome layer for Android 13 themed icons

The PNG fallbacks under `android/app/src/main/res/mipmap-*` are generated —
`pnpm android:icons` renders them from `public/icon.svg`. Never hand-edit them.

## Illustration and photography

`src/ui/illustration.tsx` is a set of inline SVG spot drawings
(`calendar`, `records`, `upload`, `medicine`, `report`, `search`, `shield`,
`wallet`, `people`, `bell`). They take a `tone` and inherit its colours, so one
drawing serves every hue and follows light/dark automatically. Every empty state
should have one: a blank panel with a line of grey text looks exactly like a
failed request.

Photography is marketing-only, and the site ships without it. Slots are declared
in `src/modules/marketing/photo.tsx`; each renders an illustrated stand-in until
you add a real image. To add one: drop a **licensed** file in `public/photos/`
and fill in its entry in `PHOTOS`. Prefer Indian subjects and Indian clinical
settings — generic Western stock reads as imported, and an unlicensed stock
photo on a health product is a legal problem rather than a design one.

## Density

Two rhythms, chosen by surface, not by preference:

- **Console** — `rounded-console` (10px), `p-4`, `shadow-sm`, `size="md"`
  buttons, `max-w-7xl`. Dense because someone uses it all day.
- **Consumer** — `rounded-consumer` (20px), `p-5`+, `shadow-md`, `size="lg"`
  buttons, `max-w-3xl`. Generous because someone uses it rarely, on a phone,
  often while worried.

The marketing site uses the consumer rhythm plus the `text-display` sizes.
