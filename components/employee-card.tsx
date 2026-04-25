"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Loader2, ExternalLink } from "lucide-react";

type Status = "active" | "pending" | "fired" | "spared";

export interface EmployeeCardData {
  _id: string;
  name: string;
  email: string;
  role: string;
  nozomio_entity_id: string;
  status: Status;
}

const statusVariant: Record<Status, "active" | "pending" | "fired" | "spared"> = {
  active: "active",
  pending: "pending",
  fired: "fired",
  spared: "spared",
};

const statusLabel: Record<Status, string> = {
  active: "Active",
  pending: "Awaiting Your Approval",
  fired: "Fired",
  spared: "Spared",
};

export function EmployeeCard({
  employee,
  onLightFuse,
}: {
  employee: EmployeeCardData;
  onLightFuse?: (id: string) => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  const handleFuse = async () => {
    if (!onLightFuse) return;
    setBusy(true);
    try {
      await onLightFuse(employee._id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="group transition hover:border-orange-700/40">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {employee.name}
            <Badge variant={statusVariant[employee.status]}>
              {statusLabel[employee.status]}
            </Badge>
          </CardTitle>
          <CardDescription>{employee.role}</CardDescription>
        </div>
        <Link
          href={`/employees/${employee._id}`}
          className="text-zinc-500 hover:text-orange-400 transition"
          aria-label="View detail"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-xs text-zinc-500 font-mono break-all">
          {employee.email}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-600">
          nozomio: {employee.nozomio_entity_id}
        </div>

        {employee.status === "active" && onLightFuse ? (
          <Button
            variant="fire"
            onClick={handleFuse}
            disabled={busy}
            className="mt-2"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                The Claw deliberates…
              </>
            ) : (
              <>
                <Flame className="h-4 w-4" />
                Light The Fuse 🔥
              </>
            )}
          </Button>
        ) : null}

        {employee.status === "pending" ? (
          <Link href={`/employees/${employee._id}`} className="mt-2">
            <Button variant="secondary" className="w-full">
              Review pending decision →
            </Button>
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
