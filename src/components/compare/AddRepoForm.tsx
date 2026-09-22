"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInt } from "@/lib/format";

/** "owner/name" (or a GitHub URL) in, a first reading out; the page refreshes with the new row. */
export function AddRepoForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const repo = value.trim();
    if (!repo || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/repos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo }) });
      const json = (await res.json()) as { error?: string; repo?: { full_name: string }; created?: boolean; counts?: { stars: number } };
      if (!res.ok || !json.repo) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(json.created ? `Added ${json.repo.full_name}` : `${json.repo.full_name} is back on the page`, {
        description: json.counts ? `${formatInt(json.counts.stars)} stars right now. Readings continue four times a day.` : undefined,
      });
      setValue("");
      router.refresh();
    } catch (err) {
      toast.error("Could not add repository", { description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full items-center gap-2 sm:w-auto">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="owner/name or GitHub URL"
        aria-label="Repository to add"
        autoComplete="off"
        spellCheck={false}
        className="h-9 min-w-0 flex-1 sm:w-64"
        disabled={busy}
      />
      <Button type="submit" size="sm" className="h-9" disabled={busy || !value.trim()}>
        <Plus aria-hidden />
        {busy ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
