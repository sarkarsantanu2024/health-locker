"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/ui/field";

/**
 * Password field with a show/hide toggle.
 *
 * Typing a password blind on a phone keyboard is where people give up or fall
 * back to something short and guessable — being able to check what you typed is
 * a security feature, not a compromise. Default stays hidden.
 */
export function PasswordInput({ className, ...props }: ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn("pr-12", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // The label announces the ACTION, and aria-pressed carries the state, so
        // a screen-reader user is never told the password itself.
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  );
}
