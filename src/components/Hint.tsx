import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HintProps {
  /** Tooltip text; when empty the child renders bare. */
  text?: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

/** Hover/focus tooltip around a single element (the child must accept a ref, e.g. a span or td). */
export function Hint({ text, children, side = "top" }: HintProps) {
  if (!text) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-72 text-pretty">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
