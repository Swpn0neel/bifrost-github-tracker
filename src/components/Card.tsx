import type { ReactNode } from "react";
import { CardAction, CardContent, CardDescription, CardHeader, CardTitle, Card as UiCard } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Card({ title, subtitle, action, children, className, contentClassName }: CardProps) {
  return (
    <UiCard className={cn("shadow-xs", className)}>
      {(title || action) && (
        <CardHeader>
          {title && <CardTitle className="text-sm font-semibold">{title}</CardTitle>}
          {subtitle && <CardDescription className="text-xs text-pretty">{subtitle}</CardDescription>}
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className={contentClassName}>{children}</CardContent>
    </UiCard>
  );
}
