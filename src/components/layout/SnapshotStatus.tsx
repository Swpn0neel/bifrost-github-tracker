import { Hint } from "@/components/Hint";
import { cn } from "@/lib/utils";

interface SnapshotStatusProps {
  updated: string;
  updatedTitle: string;
  next: string;
  className?: string;
}

/** "Updated 2 h ago · next 6:00 PM" with a live dot; the full timestamp sits in the tooltip. */
export function SnapshotStatus({ updated, updatedTitle, next, className }: SnapshotStatusProps) {
  return (
    <Hint text={updatedTitle} side="bottom">
      <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-50 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-good" />
        </span>
        <span>
          Updated {updated} <span className="text-muted-foreground/60">·</span> next {next}
        </span>
      </span>
    </Hint>
  );
}
