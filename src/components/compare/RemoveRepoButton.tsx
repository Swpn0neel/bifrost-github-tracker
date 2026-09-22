"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RemoveRepoButtonProps {
  id: number;
  fullName: string;
  /** Where to go once it is gone (the chips stay put; a repo's own page cannot). */
  afterRemove?: string;
  /** Icon-only, for a chip; otherwise a labelled button. */
  compact?: boolean;
}

/** Removing takes a dialog and the repository's name typed out, so a stray click on the × does nothing. */
export function RemoveRepoButton({ id, fullName, afterRemove, compact = false }: RemoveRepoButtonProps) {
  const router = useRouter();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim().toLowerCase() === fullName.toLowerCase();

  function setOpenState(next: boolean) {
    if (busy) return;
    setOpen(next);
    if (!next) setTyped("");
  }

  async function remove() {
    if (!matches || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/repos/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`Removed ${fullName}`, { description: "Its readings are kept; add it again to bring the history back." });
      setOpen(false);
      if (afterRemove) router.push(afterRemove);
      router.refresh();
    } catch (err) {
      toast.error("Could not remove repository", { description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpenState}>
      <DialogTrigger asChild>
        {compact ? (
          <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${fullName}`} title="Remove from Compare">
            <X aria-hidden />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm">
            <X aria-hidden />
            Remove from Compare
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {fullName} from Compare?</DialogTitle>
          <DialogDescription>
            It leaves the page and the collector stops reading it. Its readings are kept, so adding it again later brings the history straight back.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void remove();
          }}
          className="space-y-2"
        >
          <Label htmlFor={inputId}>
            Type <span className="font-mono text-foreground">{fullName}</span> to confirm
          </Label>
          <Input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" spellCheck={false} placeholder={fullName} disabled={busy} className="h-9" />
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpenState(false)} disabled={busy}>
            Keep it
          </Button>
          <Button type="button" variant="destructive" onClick={remove} disabled={!matches || busy}>
            {busy ? "Removing…" : "Remove"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
