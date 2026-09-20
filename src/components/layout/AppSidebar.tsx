import { ArrowUpRight, LogOut, Rainbow } from "lucide-react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NavMain } from "./NavMain";
import { SnapshotStatus } from "./SnapshotStatus";

interface AppSidebarProps {
  repo: string;
  updated: string;
  updatedTitle: string;
  next: string;
}

export function AppSidebar({ repo, updated, updatedTitle, next }: AppSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Bifrost · GitHub tracker">
              <Link href="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Rainbow className="size-4" />
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Bifrost</span>
                  <span className="truncate text-xs text-muted-foreground">GitHub tracker</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                <span>{repo}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action="/api/logout" method="post">
              <SidebarMenuButton type="submit" tooltip="Log out">
                <LogOut />
                <span>Log out</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
