"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { isActivePath, METRIC_LINKS, SYSTEM_LINKS, type NavItem } from "./nav-items";

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      {/* Keeps its row when collapsed (label fades to a hairline), so the icons below never move vertically. */}
      <SidebarGroupLabel className="relative group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-100">
        <span className="sidebar-fade">{label}</span>
        <span aria-hidden className="sidebar-rail-rule absolute top-1/2 left-2 h-px w-4 bg-sidebar-border" />
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={active} tooltip={label}>
                  <Link href={href} aria-current={active ? "page" : undefined} onClick={() => setOpenMobile(false)}>
                    <Icon />
                    <span className="sidebar-fade">{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function NavMain() {
  return (
    <>
      <NavGroup label="Metrics" items={METRIC_LINKS} />
      <NavGroup label="Collector" items={SYSTEM_LINKS} />
    </>
  );
}
