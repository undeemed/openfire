"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface EmailMessage {
  _id: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  from: string;
  created_at: number;
}

export function EmailThread({ messages }: { messages: EmailMessage[] }) {
  if (!messages.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-zinc-500">
          No emails in this thread yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <Card
          key={m._id}
          className={
            m.direction === "outbound"
              ? "border-orange-900/30"
              : "border-sky-900/30"
          }
        >
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-sm">{m.subject}</CardTitle>
              <div className="text-xs text-zinc-500 mt-1">
                from{" "}
                <span className="font-mono text-zinc-400">{m.from}</span> ·{" "}
                {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
            <Badge
              variant={m.direction === "outbound" ? "fired" : "active"}
            >
              {m.direction === "outbound" ? "Sent by The Claw" : "Reply"}
            </Badge>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-300 leading-relaxed">
{m.body}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
