"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInt } from "@/lib/format";

interface AddResponse {
  error?: string;
  repo?: { full_name: string };
  created?: boolean;
  counts?: { stars: number };
  history?: { days: number; months: number } | null;
  historyWarning?: string | null;
}

/**
 * "owner/name" (or a GitHub URL) in, a first reading out; with a Trendshift link the repo's
 * history comes along too. The page refreshes with the new row.
 */
export function AddRepoForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [trendshift, setTrendshift] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const repo = value.trim();
    if (!repo || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/repos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo, trendshift: trendshift.trim() }) });
      const json = (await res.json()) as AddResponse;
      if (!res.ok || !json.repo) throw new Error(json.error ?? `HTTP ${res.status}`);
      const stars = json.counts ? `${formatInt(json.counts.stars)} stars right now.` : "";
      const history = json.history
        ? ` History from Trendshift: ${json.history.days} days and ${json.history.months} months.`
        : json.historyWarning
          ? ` ${json.historyWarning}`
          : " No Trendshift link, so its star history starts with today's reading.";
      toast[json.historyWarning ? "warning" : "success"](json.created ? `Added ${json.repo.full_name}` : `${json.repo.full_name} is back on the page`, {
        description: `${stars}${history} Readings continue four times a day.`,
        duration: 8000,
      });
      setValue("");
      setTrendshift("");
      router.refresh();
    } catch (err) {
      toast.error("Could not add repository", { description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="owner/name or GitHub URL"
        aria-label="Repository to add"
        autoComplete="off"
        spellCheck={false}
        className="h-9 min-w-0 sm:w-56"
        disabled={busy}
      />
      <Input
        value={trendshift}
        onChange={(e) => setTrendshift(e.target.value)}
        placeholder="Trendshift link (optional)"
        aria-label="Trendshift link, optional"
        title="trendshift.io/repositories/… — brings about 60 days and 24 months of history with it"
        autoComplete="off"
        spellCheck={false}
        className="h-9 min-w-0 sm:w-56"
        disabled={busy}
      />
      <Button type="submit" size="sm" className="h-9" disabled={busy || !value.trim()}>
        <Plus aria-hidden />
        {busy ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
