import { Activity, CalendarDays, CircleDot, Clock4, GitCompareArrows, HeartPulse, LayoutDashboard, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const METRIC_LINKS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/daily", label: "Daily", icon: CalendarDays },
  { href: "/quarters", label: "Quarters", icon: Clock4 },
  { href: "/issues", label: "Issues & PRs", icon: CircleDot },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
];

export const SYSTEM_LINKS: NavItem[] = [{ href: "/status", label: "Status", icon: HeartPulse }];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
