"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send } from "lucide-react";

export interface DecisionModalData {
  _id: string;
  decision: "fire" | "spare";
  reasoning: string;
  email_draft: string;
  status: "pending" | "approved" | "rejected" | "sent";
}

export function DecisionModal({
  open,
  onOpenChange,
  decision,
  employeeName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  decision: DecisionModalData | null;
  employeeName: string;
}) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!decision) return null;

  const act = async (action: "approve" | "reject") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/decisions/${decision._id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Failed to ${action}`);
      }
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const isPending = decision.status === "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Decision for {employeeName}
            <Badge variant={decision.decision === "fire" ? "fired" : "spared"}>
              {decision.decision === "fire" ? "FIRE" : "SPARE"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            The Claw has reviewed the evidence. Approve to send the email, or spare them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          <section>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
              Reasoning
            </div>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {decision.reasoning}
            </p>
          </section>

          <section>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
              Email draft
            </div>
            <pre className="rounded-md bg-zinc-900/80 border border-zinc-800 p-3 text-xs text-zinc-200 whitespace-pre-wrap font-mono">
{decision.email_draft}
            </pre>
          </section>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-800/60 bg-red-950/40 p-3 text-xs text-red-300">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => act("reject")}
            disabled={!isPending || busy !== null}
          >
            {busy === "reject" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Spare Them 🕊️
          </Button>
          <Button
            variant="fire"
            onClick={() => act("approve")}
            disabled={!isPending || busy !== null || decision.decision !== "fire"}
          >
            {busy === "approve" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send It 📤
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
