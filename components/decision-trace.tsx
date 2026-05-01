"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ChevronRight, ChevronDown, AlertTriangle, Loader2, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallRow {
  _id: string;
  iteration: number;
  tool_name: string;
  input_json: string;
  output_json: string;
  is_error: boolean;
  duration_ms: number;
  created_at: number;
}

const toolPalette: Record<string, { label: string; color: string; terminal?: boolean }> = {
  fetch_nozomio_context: { label: "Nozomio · Full", color: "var(--blue)" },
  fetch_nozomio_source: { label: "Nozomio · Source", color: "var(--blue)" },
  search_employee_history: { label: "Search History", color: "var(--blue)" },
  escalate_to_human: { label: "Escalate", color: "var(--amber)", terminal: true },
  propose_decision: { label: "Propose Decision", color: "var(--accent)", terminal: true },
  book_exit_interview: { label: "Book Interview", color: "var(--green)" },
  escalate_reply: { label: "Escalate Reply", color: "var(--amber)", terminal: true },
  propose_reply: { label: "Propose Reply", color: "var(--accent)", terminal: true },
};

export function DecisionTrace({ decisionId }: { decisionId: string }) {
  const calls = useQuery(api.toolCalls.listForDecision, {
    decision_id: decisionId as Id<"decisions">,
  });

  if (calls === undefined) {
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto mb-2 text-[var(--text-dim)]" />
        <p className="text-[10px] font-mono text-[var(--text-dim)] tracking-[0.2em] uppercase">
          Loading trace…
        </p>
      </div>
    );
  }

  const list = (calls ?? []) as ToolCallRow[];

  if (list.length === 0) {
    return (
      <div className="border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-[10px] font-mono text-[var(--text-dim)] leading-relaxed">
          No agent trace recorded — this decision predates the tool-use loop or
          ran in demo mode (no <span className="text-[var(--text-muted)]">ANTHROPIC_API_KEY</span>).
        </p>
      </div>
    );
  }

  const totalMs = list.reduce((acc, c) => acc + c.duration_ms, 0);
  const errorCount = list.filter((c) => c.is_error).length;
  const lastIteration = Math.max(...list.map((c) => c.iteration));

  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Summary header */}
      <div className="border-b border-[var(--border)] px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-[8px] font-mono tracking-[0.2em] uppercase">
          <Stat label="Calls" value={list.length} />
          <Sep />
          <Stat label="Iters" value={lastIteration} />
          <Sep />
          <Stat label="Time" value={`${(totalMs / 1000).toFixed(2)}s`} />
          {errorCount > 0 ? (
            <>
              <Sep />
              <Stat label="Errors" value={errorCount} accent />
            </>
          ) : null}
        </div>
      </div>

      {/* Calls timeline */}
      <ol className="divide-y divide-[var(--border-dim)]">
        {list.map((call, idx) => (
          <ToolCallRow key={call._id} call={call} index={idx} />
        ))}
      </ol>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          accent ? "text-[var(--accent)]" : "text-[var(--text)]",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function Sep() {
  return <span className="text-[var(--text-dim)]">·</span>;
}

function ToolCallRow({ call, index }: { call: ToolCallRow; index: number }) {
  const [open, setOpen] = useState(false);
  const palette =
    toolPalette[call.tool_name] ?? {
      label: call.tool_name,
      color: "var(--text-dim)",
    };

  const inputPretty = prettyJson(call.input_json);
  const outputPretty = prettyJson(call.output_json);

  return (
    <li className="px-4 py-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-left group"
      >
        {/* Step number */}
        <span className="text-[7px] font-mono tracking-[0.18em] text-[var(--text-dim)] tabular-nums w-7 shrink-0">
          {String(index + 1).padStart(2, "0")}
          <span className="text-[var(--text-dim)]">·</span>i{call.iteration}
        </span>

        {/* Color dot */}
        <span
          className="w-1.5 h-1.5 shrink-0 rounded-full"
          style={{ background: palette.color, opacity: call.is_error ? 0.4 : 1 }}
        />

        {/* Tool name */}
        <Wrench className="h-3 w-3 text-[var(--text-dim)] shrink-0" />
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.08em] flex-1 truncate",
            call.is_error
              ? "text-[var(--accent)] line-through opacity-70"
              : "text-[var(--text)]",
          )}
        >
          {palette.label}
          {palette.terminal ? (
            <span className="ml-2 text-[7px] tracking-[0.2em] text-[var(--text-dim)] uppercase">
              terminal
            </span>
          ) : null}
        </span>

        {/* Error glyph */}
        {call.is_error ? (
          <AlertTriangle className="h-3 w-3 text-[var(--accent)] shrink-0" />
        ) : null}

        {/* Duration */}
        <span className="text-[9px] font-mono tabular-nums text-[var(--text-muted)] shrink-0">
          {formatDuration(call.duration_ms)}
        </span>

        {/* Disclosure */}
        {open ? (
          <ChevronDown className="h-3 w-3 text-[var(--text-dim)] shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-[var(--text-dim)] shrink-0" />
        )}
      </button>

      {open ? (
        <div className="mt-2.5 ml-10 grid sm:grid-cols-2 gap-2.5">
          <JsonBlock label="Input" content={inputPretty} />
          <JsonBlock
            label="Output"
            content={outputPretty}
            error={call.is_error}
          />
        </div>
      ) : null}
    </li>
  );
}

function JsonBlock({
  label,
  content,
  error,
}: {
  label: string;
  content: string;
  error?: boolean;
}) {
  return (
    <div>
      <div className="text-[7px] font-mono tracking-[0.22em] text-[var(--text-dim)] uppercase mb-1.5">
        {label}
      </div>
      <pre
        className={cn(
          "border bg-[var(--surface-raised)] p-2 text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-auto",
          error
            ? "border-[var(--accent)]/40 text-[var(--accent)]/80"
            : "border-[var(--border-dim)] text-[var(--text-muted)]",
        )}
      >
        {content}
      </pre>
    </div>
  );
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
