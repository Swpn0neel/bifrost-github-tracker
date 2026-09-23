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
      const json = (await res.json()) as { status?: string; apiCalls?: number; error?: string; detail?: { syncErrors?: string[]; compare?: { errors?: string[] } } };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      const warningCount = (json.detail?.syncErrors?.length ?? 0) + (json.detail?.compare?.errors?.length ?? 0);
      const warnings = warningCount ? ` · ${warningCount} warning(s)` : "";
      toast.success("New reading taken", { description: `${json.apiCalls ?? "?"} API calls${warnings}` });
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
      text="Take a new reading now. Today and the open 6-hour window follow the latest reading; past days keep their midnight (12 AM IST) readings."
    >
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={state === "running"}>
        <RefreshCw className={state === "running" ? "animate-spin" : undefined} aria-hidden />
        {state === "running" ? "Fetching…" : "Refresh now"}
      </Button>
    </Hint>
  );
}
