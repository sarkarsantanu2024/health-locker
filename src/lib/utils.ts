import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className joiner used by every shared UI component. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
