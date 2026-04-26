"use node";

/**
 * Inbound email handler. Called from the AgentMail webhook route after
 * HMAC verification succeeds. Idempotent: if we have already seen the
 * given `agentmail_message_id`, the action returns early without calling
 * Claude or sending another reply. This matters because AgentMail may
 * retry webhook deliveries on transient errors.
 *
 * Reply path now uses a tool-use loop (see lib/claude.ts:handleReply).
 * Calendar booking happens via the `book_exit_interview` tool — only
 * when the model explicitly calls it. The previous regex hack (matching
 * "exit interview" anywhere in Claude's reply text) is gone, removing a
 * class of false-positive bookings on phrases like "we already did
 * your exit interview" or "no need for an exit interview".
 */
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const handleInbound = action({
  args: {
    thread_id: v.string(),
    message_id: v.string(),
    from: v.string(),
    to: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (
    ctx,
    { thread_id, message_id, from, to, subject, body }
  ): Promise<{
    deduped?: boolean;
    unknownThread?: boolean;
    replied?: boolean;
    routedToDigitalEmployee?: boolean;
    scheduledExitInterview?: boolean;
    escalated?: boolean;
  }> => {
    // 1) Dedup by AgentMail message_id.
    const existing = await ctx.runQuery(api.messages.byMessageId, {
      agentmail_message_id: message_id,
    });
    if (existing) return { deduped: true };

    // 1b) Route to digital-employee A2A handler if addressed to a
    //     provisioned inbox. Multiple addresses split on `,;`.
    if (to) {
      const recipients = to
        .split(/[,;]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      for (const addr of recipients) {
        const matched = await ctx.runQuery(api.digitalEmployees.getByInbox, {
          agentmail_address: addr,
        });
        if (matched) {
          await ctx.runAction(api.a2aHandler.handleInbound, {
            agent_entity_id: matched.nozomio_entity_id,
            sender_address: from,
            text: body,
            context_id: thread_id,
            message_id,
          });
          return { replied: true, routedToDigitalEmployee: true };
        }
      }
    }

    // 2) Find the matching termination thread.
    const decision = await ctx.runQuery(api.decisions.getByThreadId, {
      thread_id,
    });
    if (!decision) return { unknownThread: true };

    const employee = await ctx.runQuery(api.employees.get, {
      id: decision.employee_id,
    });
    if (!employee) return { unknownThread: true };

    // 3) Persist the inbound message.
    await ctx.runMutation(api.messages.create, {
      decision_id: decision._id as Id<"decisions">,
      direction: "inbound",
      subject,
      body,
      from,
      agentmail_message_id: message_id,
    });

    // 4) Pull the running thread, run the reply tool-use loop.
    const thread = await ctx.runQuery(api.messages.listForDecision, {
      decision_id: decision._id as Id<"decisions">,
    });

    const turns = thread.map(
      (m: {
        direction: "inbound" | "outbound";
        from: string;
        subject: string;
        body: string;
      }) => ({
        direction: m.direction,
        from: m.from,
        subject: m.subject,
        body: m.body,
      }),
    );

    // Iteration offset so reply trace doesn't collide with evaluator
    // trace in the tool_calls table for this decision.
    const iterationOffset = decision.iterations ?? 0;

    // bookExitInterview: idempotent — if this decision already has an
    // event_id, return that without re-booking. Otherwise call calendar
    // and remember the event for post-loop persistence.
    const { scheduleExitInterview } = await import("../lib/calendar");
    const bookExitInterview = async () => {
      if (decision.exit_interview_event_id) {
        const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        start.setHours(10, 0, 0, 0);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        return {
          event_id: decision.exit_interview_event_id,
          start: start.toISOString(),
          end: end.toISOString(),
          simulated: true,
        };
      }
      return await scheduleExitInterview(employee.email, employee.name);
    };

    const { handleReply } = await import("../lib/claude");
    const loop = await handleReply(
      turns,
      decision.reasoning,
      { bookExitInterview },
      iterationOffset,
    );

    // 5) Persist reply tool trace alongside the evaluator trace.
    if (loop.toolCalls.length > 0) {
      try {
        await ctx.runMutation(api.toolCalls.recordBatch, {
          decision_id: decision._id as Id<"decisions">,
          calls: loop.toolCalls,
        });
      } catch (e) {
        console.warn(
          "[emailHandler] reply trace recordBatch failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    // 6) Persist the booked event id (if any) so future replies on this
    //    thread short-circuit the bookExitInterview call.
    let scheduledExitInterview = false;
    if (loop.bookedExitInterview && !decision.exit_interview_event_id) {
      try {
        await ctx.runMutation(api.decisions.setExitInterviewEvent, {
          id: decision._id as Id<"decisions">,
          event_id: loop.bookedExitInterview.event_id,
        });
        await ctx.runMutation(api.messages.create, {
          decision_id: decision._id as Id<"decisions">,
          direction: "outbound",
          subject: `Exit Interview Scheduled — ${employee.name}`,
          body: `Exit interview scheduled for ${loop.bookedExitInterview.start}. Calendar event id: ${loop.bookedExitInterview.event_id}.`,
          from:
            process.env.AGENTMAIL_INBOX_ADDRESS ?? "claw@openfire.local",
        });
        scheduledExitInterview = true;
      } catch (e) {
        console.warn(
          "[emailHandler] persist exit interview event failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    // 7) Handle the loop outcome.
    if (loop.outcome.kind === "escalation") {
      // Do NOT auto-reply on escalation. Leave the thread for a human.
      // Persist a synthetic outbound message so the dossier shows the
      // hand-off, but no email is sent.
      await ctx.runMutation(api.messages.create, {
        decision_id: decision._id as Id<"decisions">,
        direction: "outbound",
        subject: `Escalation — ${employee.name}`,
        body: `[ESCALATED — no email sent] Reason: ${loop.outcome.reason}`,
        from:
          process.env.AGENTMAIL_INBOX_ADDRESS ?? "claw@openfire.local",
      });
      return {
        replied: false,
        escalated: true,
        scheduledExitInterview,
      };
    }

    if (loop.outcome.kind === "exhausted") {
      console.warn(
        "[emailHandler] reply loop exhausted; not auto-replying. lastText:",
        loop.outcome.lastText.slice(0, 200),
      );
      return {
        replied: false,
        escalated: true,
        scheduledExitInterview,
      };
    }

    // 8) Send the reply email (loop.outcome.kind === "reply").
    const { sendEmail } = await import("../lib/agentmail");
    const sent = await sendEmail({
      to: from,
      subject: loop.outcome.subject,
      body: loop.outcome.reply,
      thread_id,
      reply_to_message_id: message_id,
    });

    await ctx.runMutation(api.messages.create, {
      decision_id: decision._id as Id<"decisions">,
      direction: "outbound",
      subject: loop.outcome.subject,
      body: loop.outcome.reply,
      from: process.env.AGENTMAIL_INBOX_ADDRESS ?? "claw@openfire.local",
      agentmail_message_id: sent.message_id,
    });

    return { replied: true, scheduledExitInterview };
  },
});
