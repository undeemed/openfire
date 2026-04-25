"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { EmployeeCard, EmployeeCardData } from "@/components/employee-card";
import { Loader2 } from "lucide-react";

export default function PyrePage() {
  const employees = useQuery(api.employees.list);

  const list = (employees ?? []) as EmployeeCardData[];
  const fired = list.filter((e) => e.status === "fired");
  const spared = list.filter((e) => e.status === "spared");

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">The Pyre 🔥</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Those whose flames have been extinguished. Click any card to view the email thread.
        </p>
      </header>

      {employees === undefined ? (
        <Card>
          <CardContent className="py-16 text-center text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading the ashes…
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm uppercase tracking-widest text-red-400/80">
              Fired ({fired.length})
            </h2>
            {fired.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-zinc-500">
                  No one has been fired yet. The pyre is cold.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {fired.map((e) => (
                  <EmployeeCard key={e._id} employee={e} />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm uppercase tracking-widest text-sky-400/80">
              Spared ({spared.length})
            </h2>
            {spared.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-zinc-500">
                  No survivors yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {spared.map((e) => (
                  <EmployeeCard key={e._id} employee={e} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
