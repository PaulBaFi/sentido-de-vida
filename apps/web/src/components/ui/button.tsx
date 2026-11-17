import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Button({ className, ...props }: ComponentProps<"button">) {
  return <button className={cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60",
    className,
  )} {...props} />;
}
