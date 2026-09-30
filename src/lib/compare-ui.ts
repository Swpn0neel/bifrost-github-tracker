// Bits of the Compare page shared by server and client components (no database access here).
import type { TrendMetric } from "./trends";

/** Repo colours by position (the primary repo is always the first): blue, orange, green, violet, magenta, red, teal, gold. */
const REPO_COLORS = Array.from({ length: 8 }, (_, i) => `var(--repo-${i + 1})`);

export function repoColor(index: number): string {
  return REPO_COLORS[index % REPO_COLORS.length];
}

export const COMPARE_METRICS: { key: TrendMetric; label: string; noun: string }[] = [
  { key: "stars", label: "Stars", noun: "new stars" },
  { key: "forks", label: "Forks", noun: "new forks" },
  { key: "issues_opened", label: "Issues opened", noun: "issues opened" },
  { key: "issues_closed", label: "Issues closed", noun: "issues closed" },
  { key: "prs_opened", label: "PRs opened", noun: "PRs opened" },
  { key: "prs_merged", label: "PRs merged", noun: "PRs merged" },
  { key: "commits", label: "Commits", noun: "commits" },
];
