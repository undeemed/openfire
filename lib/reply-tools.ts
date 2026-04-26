/**
 * Tool definitions and dispatcher for the reply-handling agent.
 *
 * Separate from `lib/agent-tools.ts` (which is the evaluator's surface)
 * because reply-time has different concerns: the agent's job is to
 * compose an empathetic-but-firm response and, if asked, book an exit
 * interview. The previous `handleReply` was a single-shot JSON producer
 * that triggered calendar booking via a brittle regex match in
 * `convex/emailHandler.ts`. This module replaces that with explicit
 * tools so the agent must decide to book — no more false-positive
 * scheduling on phrases like "we already did your exit interview".
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { ScheduleResult } from "./calendar";

export const REPLY_TOOL_NAMES = [
  "book_exit_interview",
  "escalate_reply",
  "propose_reply",
] as const;

export type ReplyToolName = (typeof REPLY_TOOL_NAMES)[number];

export const REPLY_TOOL_SCHEMAS: Anthropic.Tool[] = [
  {
    name: "book_exit_interview",
    description:
      "Book a 30-minute exit interview on the employee's calendar. Idempotent — if one is already booked for this thread, returns the existing event. Use ONLY when the employee explicitly asks for an interview, time slot, or human conversation. Do NOT call when the employee says they already had one or refuses one.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "escalate_reply",
    description:
      "Bail out of the auto-reply. Use when the employee mentions legal action, medical emergency, threats, abuse, or anything that needs a human. The system will NOT send an auto-reply when this is called — a human is paged instead.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "1-2 sentence rationale for paging a human.",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "propose_reply",
    description:
      "Emit the final reply email. Terminal tool. Subject should typically prefix with 'Re:'. Reply body must follow the system prompt rules (under 180 words, sign off as 'The Claw, on behalf of OpenFire HR'). After this is called, the loop ends and the email is dispatched.",
    input_schema: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Email subject. Usually starts with 'Re:'.",
        },
        reply: {
          type: "string",
          description:
            "Body of the reply email. Plain text. Under 180 words.",
        },
      },
      required: ["subject", "reply"],
    },
  },
];

export interface ReplyToolDeps {
  /**
   * Book an exit interview if not already booked for this decision.
   * Implementation should idempotently cache the booking and persist
   * the event_id post-loop.
   */
  bookExitInterview: () => Promise<ScheduleResult>;
}

export interface ProposeReplyInput {
  subject: string;
  reply: string;
}

export interface EscalateReplyInput {
  reason: string;
}

export type ReplyTerminalResult =
  | { kind: "reply"; value: ProposeReplyInput }
  | { kind: "escalation"; reason: string };

export interface ReplyToolRunResult {
  output: unknown;
  is_error: boolean;
  terminal?: ReplyTerminalResult;
}

export async function runReplyTool(
  name: string,
  rawInput: unknown,
  deps: ReplyToolDeps,
): Promise<ReplyToolRunResult> {
  switch (name) {
    case "book_exit_interview": {
      const result = await deps.bookExitInterview();
      return {
        output: {
          event_id: result.event_id,
          start: result.start,
          end: result.end,
          simulated: result.simulated,
        },
        is_error: false,
      };
    }

    case "escalate_reply": {
      const input = rawInput as EscalateReplyInput | undefined;
      if (!input?.reason || typeof input.reason !== "string") {
        return errorOut("reason is required");
      }
      return {
        output: { escalated: true, reason: input.reason },
        is_error: false,
        terminal: { kind: "escalation", reason: input.reason },
      };
    }

    case "propose_reply": {
      const input = rawInput as Partial<ProposeReplyInput> | undefined;
      if (
        !input ||
        typeof input.subject !== "string" ||
        typeof input.reply !== "string"
      ) {
        return errorOut(
          "propose_reply requires { subject: string, reply: string }",
        );
      }
      return {
        output: { accepted: true },
        is_error: false,
        terminal: {
          kind: "reply",
          value: { subject: input.subject, reply: input.reply },
        },
      };
    }

    default:
      return errorOut(`unknown reply tool: ${name}`);
  }
}

function errorOut(message: string): ReplyToolRunResult {
  return { output: { error: message }, is_error: true };
}
