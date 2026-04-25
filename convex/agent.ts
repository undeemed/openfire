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

      const context = await getEntityContext(employee.nozomio_entity_id);
      const evaluation = await evaluateEmployee(
        {
          name: employee.name,
          email: employee.email,
          role: employee.role,
        },
        context,
        criteria.map(
          (c: { name: string; description: string; weight: number }) => ({
            name: c.name,
            description: c.description,
            weight: c.weight,
          })
        )
      );

      await ctx.runMutation(api.decisions.create, {
        employee_id: employee._id,
        reasoning: evaluation.reasoning,
        decision: evaluation.decision,
        email_draft: evaluation.emailDraft,
      });

      if (evaluation.decision === "fire") flagged++;
      else skipped++;
    }

    return { processed: employees.length, flagged, skipped };
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
