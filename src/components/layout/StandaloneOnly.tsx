"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

/**
 * Shows its children only when the dashboard is opened on its own. Inside the GTM Hub's frame they'd
 * repeat what the hub's own sidebar already has (the account and Sign out), so they're left out. The
 * server can't tell which it is, so it renders nothing and the browser adds them once it knows.
 */
export function StandaloneOnly({ children }: { children: ReactNode }) {
  const standalone = useSyncExternalStore(
    subscribe,
    () => window.self === window.top,
    () => false,
  );
  return standalone ? <>{children}</> : null;
}
