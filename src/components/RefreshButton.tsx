"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type State = "idle" | "running" | "done" | "error";

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function run() {
    setState("running");
    setMessage("");
    try {
      const res = await fetch("/api/collect", { method: "POST" });
      const json = (await res.json()) as { status?: string; apiCalls?: number; error?: string; detail?: { syncErrors?: string[] } };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const warnings = json.detail?.syncErrors?.length ? ` · ${json.detail.syncErrors.length} sync warning(s)` : "";
      setMessage(`Snapshot saved · ${json.apiCalls ?? "?"} API calls${warnings}`);
      setState("done");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed");
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      {message && <span className={state === "error" ? "text-bad" : "text-ink-2"}>{message}</span>}
      <button
        type="button"
        onClick={run}
        disabled={state === "running"}
        className="rounded border border-line bg-surface px-2.5 py-1 font-medium text-ink hover:bg-grid disabled:opacity-60"
      >
        {state === "running" ? "Fetching…" : "Refresh now"}
      </button>
    </div>
  );
}
