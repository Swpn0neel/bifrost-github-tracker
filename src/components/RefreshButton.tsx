"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Hint } from "./Hint";

type State = "idle" | "running" | "done" | "error";

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");

  async function run() {
    setState("running");
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const json = (await res.json()) as { status?: string; apiCalls?: number; error?: string; detail?: { syncErrors?: string[] } };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const warnings = json.detail?.syncErrors?.length ? ` · ${json.detail.syncErrors.length} sync warning(s)` : "";
      toast.success("Live numbers updated", { description: `${json.apiCalls ?? "?"} API calls${warnings}` });
      setState("done");
      router.refresh();
    } catch (err) {
      toast.error("Refresh failed", { description: err instanceof Error ? err.message : "Failed" });
      setState("error");
    }
  }

  return (
    <Hint
      side="bottom"
      text="Fetch the latest numbers now. Daily and 6-hour window figures only use the scheduled runs at 12 AM, 6 AM, 12 PM and 6 PM IST."
    >
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={state === "running"}>
        <RefreshCw className={state === "running" ? "animate-spin" : undefined} aria-hidden />
        {state === "running" ? "Fetching…" : "Refresh now"}
      </Button>
    </Hint>
  );
}
