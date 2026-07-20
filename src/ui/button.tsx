import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * shadcn/ui conventions (cva + `cn`), hand-written so we vendor only what we use.
 *
 * `size` carries the density split: `md` is the console default, `lg` the
 * patient-facing default. Both clear the 44px touch-target guidance.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,box-shadow,opacity] disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
        secondary:
          "border border-border-strong bg-surface text-foreground shadow-sm hover:bg-surface-2",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        subtle: "bg-primary-subtle text-primary hover:brightness-95",
        danger: "bg-danger text-white shadow-sm hover:brightness-110",
        link: "text-primary underline underline-offset-4 hover:text-primary-hover",
      },
      size: {
        xs: "h-8 rounded-md px-2.5 text-xs",
        sm: "h-9 rounded-md px-3 text-sm",
        md: "h-11 rounded-lg px-4 text-sm",
        lg: "h-12 rounded-xl px-6 text-base",
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
