import { cn } from "@/lib/utils";

/**
 * THE HEALTHLOCKER MARK
 *
 * A padlock shackle over a locker body holding a medical cross: storage plus
 * health, in one shape. The pulse line across the cross is what stops it
 * reading as a generic first-aid icon.
 *
 * Drawn on a 512 grid to match `public/icon.svg` and the maskable PWA icon, so
 * the home-screen icon, the Android launcher and the in-app wordmark are the
 * same artwork rather than three drifting versions of it.
 *
 * Every instance renders the identical gradient, so all instances share one
 * gradient id on purpose — the first definition in the document wins and it is
 * the correct one. Pass `gradientId` if you need to reuse the mark with
 * different colours on the same page.
 */
export function LogoMark({
  className,
  gradientId = "hl-mark-gradient",
  title,
}: {
  className?: string;
  gradientId?: string;
  /** Only set this when the mark stands alone; beside a wordmark it is noise. */
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn("size-9", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--hue-teal)" />
          <stop offset="100%" stopColor="var(--hue-teal-bright)" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="112" fill={`url(#${gradientId})`} />

      {/* The shackle. Deliberately not closed — an open locker you own, not a vault. */}
      <path
        d="M176 216v-40a80 80 0 0 1 160 0v40"
        fill="none"
        stroke="#ffffff"
        strokeWidth="34"
        strokeLinecap="round"
        opacity="0.9"
      />

      <rect x="136" y="216" width="240" height="184" rx="32" fill="#ffffff" />

      {/* Cross. */}
      <path
        d="M256 262v92M210 308h92"
        stroke="var(--hue-teal)"
        strokeWidth="30"
        strokeLinecap="round"
      />
      {/* Pulse, drawn over the cross's lower half — the sign of life in the record. */}
      <path
        d="M168 362h34l16-30 22 52 18-36 14 22h44"
        fill="none"
        stroke="var(--hue-teal-bright)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.65"
      />
    </svg>
  );
}

/**
 * The mark plus the name, and optionally the portal it belongs to ("Hospital",
 * "Patient"). One component for all three shells, so the branding cannot drift
 * between the console, the app and the public site.
 */
export function Logo({
  subtitle,
  size = "md",
  className,
  href,
}: {
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Renders as a link when given — the marketing header and console both want that. */
  href?: string;
}) {
  const mark = { sm: "size-8", md: "size-9", lg: "size-11" }[size];
  const name = {
    sm: "text-sm",
    md: "text-[0.95rem]",
    lg: "text-lg",
  }[size];

  const inner = (
    <>
      <LogoMark className={cn(mark, "shrink-0 rounded-xl shadow-sm")} />
      <span className="min-w-0">
        <span className={cn("block font-semibold leading-tight tracking-tight", name)}>
          Health<span className="text-primary">Locker</span>
        </span>
        {subtitle ? (
          <span className="block truncate text-xs leading-tight text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  );

  const classes = cn("flex items-center gap-2.5", className);

  return href ? (
    <a href={href} className={cn(classes, "press rounded-xl")}>
      {inner}
    </a>
  ) : (
    <span className={classes}>{inner}</span>
  );
}
