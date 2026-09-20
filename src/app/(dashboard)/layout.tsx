import { cookies } from "next/headers";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { parseSidebarWidth, SIDEBAR_WIDTH_COOKIE } from "@/components/layout/sidebar-width";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SidebarInset } from "@/components/ui/sidebar";
import { env } from "@/lib/env";
import { latestSnapshot } from "@/lib/queries";
import { nextRun } from "@/lib/schedule";
import { formatIstDateTime, formatRelative } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [latest, cookieStore] = await Promise.all([latestSnapshot(), cookies()]);
  const status = {
    repo: env.repo,
    updated: latest ? formatRelative(latest.captured_at) : "never",
    updatedTitle: latest ? formatIstDateTime(latest.captured_at) : "No snapshot yet",
    next: formatIstDateTime(nextRun()).replace(/^.*?, /, ""),
  };
  // The sidebar remembers its collapsed state and dragged width in cookies it writes itself.
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const defaultWidth = parseSidebarWidth(cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value);

  return (
    <SidebarShell defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
      <AppSidebar {...status} />
      <SidebarInset className="min-w-0">
        <SiteHeader {...status} />
        <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-6">{children}</div>
      </SidebarInset>
    </SidebarShell>
  );
}
