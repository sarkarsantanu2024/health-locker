import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Console tables.
 *
 * The wrapper owns the horizontal scroll so a wide table scrolls inside its own
 * box instead of making the whole page scroll sideways on a phone — that is the
 * single most common responsive failure in a dense admin UI.
 */
export function TableWrap({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-console border border-border bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full min-w-[36rem] text-sm", className)} {...props} />;
}

export function Thead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn("border-b border-border bg-surface-2 text-left text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn("px-4 py-2.5 text-xs font-medium uppercase tracking-wide", className)}
      {...props}
    />
  );
}

export function Tbody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-surface-2", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
