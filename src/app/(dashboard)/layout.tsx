import { cookies, headers } from "next/headers";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { parseSidebarWidth, SIDEBAR_WIDTH_COOKIE } from "@/components/layout/sidebar-width";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SidebarInset } from "@/components/ui/sidebar";
import { readHubUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { latestSnapshot } from "@/lib/queries";
import { nextRun } from "@/lib/schedule";
import { formatIstDateTime, formatRelative } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [latest, cookieStore, headerStore] = await Promise.all([latestSnapshot(), cookies(), headers()]);
  const status = {
    repo: env.repo,
    updated: latest ? formatRelative(latest.captured_at) : "never",
    updatedTitle: latest ? formatIstDateTime(latest.captured_at) : "No snapshot yet",
    next: formatIstDateTime(nextRun()).replace(/^.*?, /, ""),
  };
  // The sidebar remembers its collapsed state and dragged width in cookies it writes itself.
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const defaultWidth = parseSidebarWidth(cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value);
  // Set by the proxy once the hub has vouched for the session.
  const email = readHubUser(headerStore)?.email ?? null;

  return (
    <SidebarShell defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
      <AppSidebar {...status} email={email} signOutUrl={`${env.hubUrl}/signout`} />
      <SidebarInset className="min-w-0">
        <SiteHeader {...status} />
        <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-6">{children}</div>
      </SidebarInset>
    </SidebarShell>
  );
}
