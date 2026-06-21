import { cn } from "@/lib/utils";

/**
 * Loading placeholder. Defaults to a subtle shimmer sweep over the muted
 * base; falls back to a plain pulse when motion is reduced (see globals.css).
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
