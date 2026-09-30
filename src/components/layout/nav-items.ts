import { CalendarDays, CircleDot, Clock4, GitCommitHorizontal, GitCompareArrows, HeartPulse, LayoutDashboard, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The pages used most come first. */
export const METRIC_LINKS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/time-of-day", label: "Time of day", icon: Clock4 },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/history", label: "Daily history", icon: CalendarDays },
  { href: "/issues", label: "Issues & PRs", icon: CircleDot },
  { href: "/commits", label: "Commits & releases", icon: GitCommitHorizontal },
];

export const SYSTEM_LINKS: NavItem[] = [{ href: "/status", label: "Status", icon: HeartPulse }];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
