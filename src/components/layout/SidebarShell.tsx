"use client";

import { createContext, useCallback, useContext, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { clampSidebarWidth, SIDEBAR_WIDTH_COOKIE } from "./sidebar-width";

interface SidebarWidthContextValue {
  width: number;
  /** Apply a width and remember it in a cookie so the server renders it next time. */
  commitWidth: (px: number) => void;
  setResizing: (resizing: boolean) => void;
}

const SidebarWidthContext = createContext<SidebarWidthContextValue | null>(null);

export function useSidebarWidth(): SidebarWidthContextValue {
  const ctx = useContext(SidebarWidthContext);
  if (!ctx) throw new Error("useSidebarWidth must be used within <SidebarShell />");
  return ctx;
}

interface SidebarShellProps {
  defaultOpen: boolean;
  defaultWidth: number;
  children: ReactNode;
}

/** shadcn's SidebarProvider plus a user-adjustable width, fed to it through the --sidebar-width variable. */
export function SidebarShell({ defaultOpen, defaultWidth, children }: SidebarShellProps) {
  const [width, setWidth] = useState(defaultWidth);
  const [resizing, setResizing] = useState(false);

  const commitWidth = useCallback((px: number) => {
    const next = clampSidebarWidth(px);
    setWidth(next);
    document.cookie = `${SIDEBAR_WIDTH_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, []);

  const value = useMemo(() => ({ width, commitWidth, setResizing }), [width, commitWidth]);

  return (
    <SidebarWidthContext.Provider value={value}>
      <SidebarProvider defaultOpen={defaultOpen} data-resizing={resizing || undefined} style={{ "--sidebar-width": `${width}px` } as CSSProperties}>
        {children}
      </SidebarProvider>
    </SidebarWidthContext.Provider>
  );
}
