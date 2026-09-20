"use client";

import { PanelLeftIcon } from "lucide-react";
import Link from "next/link";
import { BifrostMark, BifrostWordmark } from "@/components/BifrostLogo";
import { Hint } from "@/components/Hint";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

/**
 * Sidebar header: [logo link] [collapse button], two grid cells side by side.
 *
 * The header keeps its expanded width in both states (AppSidebar pins it and the sidebar edge clips it), so
 * neither cell ever moves: on the rail the link narrows to its 32px square inside its own cell, and the
 * collapse button fades out where it stands. There is room for one control on the rail, so the mark becomes
 * the "open" button there and swaps to the panel icon while the pointer is on it.
 *
 * Keep the collapse button in normal flow. Positioning it with a translate breaks it: Button sets its own
 * translate while pressed, which replaces the positioning one and moves the button out from under the pointer
 * between mousedown and mouseup, so the click never reaches it.
 */
export function SidebarBrand() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            asChild
            tooltip="Open sidebar"
            // Same 48px height and 8px padding in both states; only the width changes. No row highlight: when the
            // rail is opened from here the pointer is on this link, and a pill growing under it reads as a glitch.
            className="group/brand hover:bg-transparent active:bg-transparent group-data-[collapsible=icon]:h-12! group-data-[collapsible=icon]:p-2!"
          >
            <Link
              href="/"
              // On the rail this element opens the sidebar instead of navigating, so announce it as a button.
              role={collapsed ? "button" : undefined}
              aria-label={collapsed ? "Open sidebar" : "Bifrost GitHub tracker, overview"}
              onClick={(e) => {
                if (!collapsed) return;
                e.preventDefault();
                toggleSidebar();
              }}
            >
              {/* 16px wide like the nav icons below, so it shares their column; ::before is the 32px hover square.
                  The swap keys off hovering this box, not the whole link: right after "collapse" is clicked the
                  pointer can still be over the (still wide) link, and the icon must not flash in over here. */}
              <span className="group/mark relative flex h-8 w-4 shrink-0 items-center justify-center before:absolute before:-inset-x-2 before:inset-y-0 before:rounded-md before:bg-sidebar-accent before:opacity-0 before:transition-opacity before:duration-150 group-data-[collapsible=icon]:group-hover/mark:before:opacity-100 group-data-[collapsible=icon]:group-focus-visible/brand:before:opacity-100">
                {/* The menu button forces nested svgs to size-4; the logo keeps its own proportions. */}
                <BifrostMark className="relative h-5! w-auto! transition-opacity duration-150 group-data-[collapsible=icon]:group-hover/mark:opacity-0 group-data-[collapsible=icon]:group-focus-visible/brand:opacity-0" />
                <PanelLeftIcon
                  aria-hidden
                  className="absolute text-muted-foreground opacity-0 transition-opacity duration-150 group-data-[collapsible=icon]:group-hover/mark:opacity-100 group-data-[collapsible=icon]:group-focus-visible/brand:opacity-100"
                />
              </span>
              <span className="sidebar-fade grid flex-1 gap-1 text-left leading-tight">
                <BifrostWordmark className="h-3.5! w-auto! justify-self-start" />
                <span className="truncate text-xs text-muted-foreground">GitHub tracker</span>
              </span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <Hint text="Close sidebar (⌘/Ctrl + B)" side="bottom">
        <SidebarTrigger className="sidebar-fade-hide mr-1 text-muted-foreground" />
      </Hint>
    </div>
  );
}
