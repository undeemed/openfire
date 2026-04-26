"use node";

/**
 * The OpenFire agent loop.
 *
 * `runFireAgent` walks every active employee, gathers context from
 * Nozomio, asks Claude for a verdict against the live criteria, and
 * persists pending decisions. The loop is idempotent at every step:
 * employees with an existing pending/approved/sent decision are skipped
 * so re-running the agent never produces duplicate decisions.
 *
 * `approveDecision` flips a pending decision into "sent" by dispatching
 * the email through AgentMail. It guards on current status so a panicked
 * manager rage-clicking "Approve" only triggers one email.
 */
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const runFireAgent = action({
  args: { employee_id: v.optional(v.id("employees")) },
  handler: async (
    ctx,
    { employee_id }
  ): Promise<{
    processed: number;
    flagged: number;
    skipped: number;
    escalated: number;
  }> => {
    const { getEntityContext } = await import("../lib/nozomio");
    const { evaluateEmployee } = await import("../lib/claude");

    const employees = employee_id
      ? [await ctx.runQuery(api.employees.get, { id: employee_id })].filter(
          (e): e is NonNullable<typeof e> => Boolean(e)
        )
      : await ctx.runQuery(api.employees.listByStatus, { status: "active" });

    const criteria = await ctx.runQuery(api.criteria.listActive, {});

    let flagged = 0;
    let skipped = 0;
    let escalated = 0;

    for (const employee of employees) {
      // Idempotency guard: don't re-evaluate someone who already has an
      // open (non-rejected) decision.
      const hasOpen = await ctx.runQuery(api.decisions.hasOpenDecision, {
        employee_id: employee._id,
      });
      if (hasOpen) {
        skipped++;
        continue;
      }
      if (!employee.nozomio_entity_id) {
        skipped++;
        continue;
      }

      // Promise-based cache: parallel tool calls share one fetch instead of
      // racing on a null check and triggering duplicate Nozomio requests.
      let contextPromise: Promise<
        Awaited<ReturnType<typeof getEntityContext>>
      > | null = null;
      const getNozomioContext = () =>
        (contextPromise ??= getEntityContext(employee.nozomio_entity_id));

      const searchEmployeeHistory = async (q: string) =>
        await ctx.runQuery(api.agentHistory.searchForEmployee, {
          employee_id: employee._id,
          query: q,
        });

      const loop = await evaluateEmployee(
        {
          name: employee.name,
          email: employee.email,
          role: employee.role,
        },
        criteria.map(
          (c: { name: string; description: string; weight: number }) => ({
            name: c.name,
            description: c.description,
            weight: c.weight,
          })
        ),
        { getNozomioContext, searchEmployeeHistory },
      );

      let decisionId: string | null = null;

      if (loop.outcome.kind === "decision") {
        decisionId = await ctx.runMutation(api.decisions.create, {
          employee_id: employee._id,
          reasoning: loop.outcome.result.reasoning,
          decision: loop.outcome.result.decision,
          email_draft: loop.outcome.result.emailDraft,
        });
        if (loop.outcome.result.decision === "fire") flagged++;
        else skipped++;
      } else if (loop.outcome.kind === "escalation") {
        decisionId = await ctx.runMutation(api.decisions.createEscalated, {
          employee_id: employee._id,
          reason: loop.outcome.reason,
        });
        escalated++;
      } else {
        // Loop exhausted without a terminal tool call. Treat as escalation
        // so a human looks at it rather than silently dropping the
        // employee.
        decisionId = await ctx.runMutation(api.decisions.createEscalated, {
          employee_id: employee._id,
          reason:
            "Agent loop exhausted iterations without producing a verdict. Manual review required.",
        });
        escalated++;
      }

      if (decisionId && loop.toolCalls.length > 0) {
        await ctx.runMutation(api.toolCalls.recordBatch, {
          decision_id: decisionId as never,
          calls: loop.toolCalls,
        });
      }

      if (decisionId) {
        await ctx.runMutation(api.decisions.setIterations, {
          id: decisionId as never,
          iterations: loop.iterations,
        });
      }
    }

    return {
      processed: employees.length,
      flagged,
      skipped,
      escalated,
    };
  },
});

export const approveDecision = action({
  args: { decision_id: v.id("decisions") },
  handler: async (
    ctx,
    { decision_id }
  ): Promise<{
    threadId: string | undefined;
    alreadySent: boolean;
  }> => {
    const decision = await ctx.runQuery(api.decisions.get, { id: decision_id });
    if (!decision) throw new Error("decision not found");

    // Idempotent guard: if it was already sent, return the existing
    // thread id without firing another email.
    if (decision.status === "sent") {
      return {
        threadId: decision.agentmail_thread_id,
        alreadySent: true,
      };
    }
    if (decision.status === "rejected") {
      throw new Error("cannot approve a rejected decision");
    }

    const employee = await ctx.runQuery(api.employees.get, {
      id: decision.employee_id,
    });
    if (!employee) throw new Error("employee not found");

    const { sendEmail } = await import("../lib/agentmail");
    const subject = `Notice of Termination — ${employee.name}`;
    const result = await sendEmail({
      to: employee.email,
      subject,
      body: decision.email_draft,
    });

    await ctx.runMutation(api.messages.create, {
      decision_id,
      direction: "outbound",
      subject,
      body: decision.email_draft,
      from: process.env.AGENTMAIL_INBOX_ADDRESS ?? "claw@openfire.local",
      agentmail_message_id: result.message_id,
    });

    await ctx.runMutation(api.decisions.markSent, {
      id: decision_id,
      thread_id: result.thread_id,
    });

    return { threadId: result.thread_id, alreadySent: false };
  },
});
