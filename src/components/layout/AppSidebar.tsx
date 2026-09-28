import { ArrowUpRight, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NavMain } from "./NavMain";
import { SidebarBrand } from "./SidebarBrand";
import { SidebarResizeHandle } from "./SidebarResizeHandle";
import { SnapshotStatus } from "./SnapshotStatus";

interface AppSidebarProps {
  repo: string;
  updated: string;
  updatedTitle: string;
  next: string;
  email: string | null;
  /** The hub's sign-out page; signing out ends the session for every dashboard. */
  signOutUrl: string;
}

export function AppSidebar({ repo, updated, updatedTitle, next, email, signOutUrl }: AppSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      {/* The outer box is cut off by the moving sidebar edge; the inner one keeps the expanded width in both
          states, so opening and closing never reflows or squeezes anything in here. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 w-full flex-1 flex-col md:w-[calc(var(--sidebar-width)-1rem)]">
          <SidebarHeader>
            <SidebarBrand />
          </SidebarHeader>
          <SidebarContent>
            <NavMain />
          </SidebarContent>
          <SidebarFooter>
            {/* The top bar hides the snapshot status on phones, so the drawer carries it there. */}
            <SnapshotStatus updated={updated} updatedTitle={updatedTitle} next={next} className="px-2 pb-1 sm:hidden" />
            <SidebarSeparator className="mx-0 sm:hidden" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={`${repo} on GitHub`}>
                  <a href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">
                    <ArrowUpRight />
                    <span className="sidebar-fade">{repo}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={email ? `Sign out ${email}` : "Sign out"}>
                  {/* _top leaves the hub's iframe when the dashboard is shown inside it. */}
                  <a href={signOutUrl} target="_top">
                    <LogOut />
                    <span className="sidebar-fade">
                      Sign out
                      {email && <span className="text-muted-foreground"> · {email}</span>}
                    </span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </div>
      </div>
      <SidebarResizeHandle />
    </Sidebar>
  );
}
