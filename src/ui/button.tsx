import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Follows shadcn/ui conventions (cva variants + `cn`), written by hand so we
 * vendor only what we use. `pnpm dlx shadcn@latest add …` remains compatible.
 *
 * Focus rings are never removed — keyboard users need to see where they are
 * (WCAG 2.4.7), and `min-h-11` keeps the touch target above the 44px guidance.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:opacity-90",
        secondary: "border border-border bg-background hover:bg-muted",
        ghost: "hover:bg-muted",
        danger: "bg-danger text-background hover:opacity-90",
      },
      size: {
        sm: "min-h-9 px-3 py-1.5 text-xs",
        md: "min-h-11 px-4 py-2",
        lg: "min-h-12 px-6 py-3 text-base",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", full: false },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, full, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, full }), className)} {...props} />;
}

export { buttonVariants };
