"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface RemoveRepoButtonProps {
  id: number;
  fullName: string;
  /** Where to go once it is gone (the chips stay put; a repo's own page cannot). */
  afterRemove?: string;
  /** Icon-only, for a chip; otherwise a labelled button. */
  compact?: boolean;
}

/** Two clicks to remove: the first turns the control into a short confirmation that times out on its own. */
export function RemoveRepoButton({ id, fullName, afterRemove, compact = false }: RemoveRepoButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/repos/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Removed ${fullName}`, { description: "Its readings are kept; add it again to bring the history back." });
      if (afterRemove) router.push(afterRemove);
      router.refresh();
    } catch (err) {
      toast.error("Could not remove repository", { description: err instanceof Error ? err.message : "Failed" });
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button type="button" variant="destructive" size="xs" onClick={remove} disabled={busy}>
          {busy ? "Removing…" : "Remove"}
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={() => setConfirming(false)} disabled={busy}>
          Keep
        </Button>
      </span>
    );
  }
  if (compact) {
    return (
      <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${fullName}`} title="Remove from Compare" onClick={() => setConfirming(true)}>
        <X aria-hidden />
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
      <X aria-hidden />
      Remove from Compare
    </Button>
  );
}
