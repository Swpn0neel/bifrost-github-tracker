"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { clampSidebarWidth, SIDEBAR_WIDTH_DEFAULT, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN } from "./sidebar-width";
import { useSidebarWidth } from "./SidebarShell";

// Dragging narrower than this collapses to the icon rail; dragging back past EXPAND_AT reopens it.
const COLLAPSE_AT = SIDEBAR_WIDTH_MIN - 64;
const EXPAND_AT = SIDEBAR_WIDTH_MIN - 24;
const KEY_STEP = 16;

interface Drag {
  startX: number;
  startWidth: number;
  moved: boolean;
  width: number;
  wrapper: HTMLElement | null;
}

/** The seam between sidebar and content: drag to resize, double-click to reset, arrow keys when focused. */
export function SidebarResizeHandle() {
  const { open, setOpen } = useSidebar();
  const { width, commitWidth, setResizing } = useSidebarWidth();
  const drag = useRef<Drag | null>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const container = e.currentTarget.closest<HTMLElement>("[data-slot=sidebar-container]");
    drag.current = {
      startX: e.clientX,
      // When collapsed, measure from the icon rail so the pointer and the edge stay together.
      startWidth: open ? width : (container?.getBoundingClientRect().width ?? 0),
      moved: false,
      width,
      wrapper: e.currentTarget.closest<HTMLElement>("[data-slot=sidebar-wrapper]"),
    };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < 3) return;
      d.moved = true;
      setResizing(true);
    }
    const raw = d.startWidth + dx;
    if (raw < COLLAPSE_AT) {
      if (open) setOpen(false);
      return;
    }
    if (!open) {
      if (raw < EXPAND_AT) return;
      setOpen(true);
    }
    d.width = clampSidebarWidth(raw);
    // Write the variable straight to the wrapper while dragging; React state catches up on release.
    d.wrapper?.style.setProperty("--sidebar-width", `${d.width}px`);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d.moved) return;
    setResizing(false);
    if (open) {
      commitWidth(d.width);
    } else {
      // Dragged shut: keep the previous width so reopening returns to it.
      d.wrapper?.style.setProperty("--sidebar-width", `${width}px`);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next =
      e.key === "ArrowLeft" ? width - KEY_STEP : e.key === "ArrowRight" ? width + KEY_STEP : e.key === "Home" ? SIDEBAR_WIDTH_MIN : e.key === "End" ? SIDEBAR_WIDTH_MAX : null;
    if (next === null) return;
    e.preventDefault();
    if (!open) setOpen(true);
    commitWidth(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_WIDTH_MIN}
      aria-valuemax={SIDEBAR_WIDTH_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      data-slot="sidebar-resize-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => commitWidth(SIDEBAR_WIDTH_DEFAULT)}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -right-4 z-20 hidden w-4 -translate-x-1/2 cursor-col-resize touch-none outline-none select-none after:absolute after:inset-y-3 after:left-1/2 after:w-[2px] after:-translate-x-1/2 after:rounded-full after:transition-colors hover:after:bg-sidebar-border focus-visible:after:bg-ring in-data-[resizing=true]:after:bg-ring md:block"
    />
  );
}
