import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(
    "min-h-12 w-full rounded-lg border border-input bg-white px-4 py-3 text-base text-foreground shadow-xs placeholder:text-neutral-400 focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
    className,
  )} {...props} />;
}
