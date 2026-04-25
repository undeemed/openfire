/**
 * Claude agent logic for OpenFire.
 *
 * - evaluateEmployee: given Nozomio context + active criteria, returns
 *   {decision, reasoning, emailDraft}.
 * - handleReply: given a thread + inbound email, returns an empathetic
 *   but firm reply.
 *
 * Model: claude-sonnet-4-6 (claude-sonnet-4-6-20250929 alias).
 * Uses prompt caching on the static system prompt to reduce cost when
 * the agent runs many times in a row.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NozomioEntityContext } from "./nozomio";

const MODEL = "claude-sonnet-4-6-20250929";

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

export interface CriterionInput {
  name: string;
  description: string;
  weight: number;
}

export interface EmployeeInput {
  name: string;
  email: string;
  role: string;
}

export interface EvaluationResult {
  decision: "fire" | "spare";
  reasoning: string;
  emailDraft: string;
}

const SYSTEM_PROMPT_EVALUATE = `You are "The Claw", an AI HR agent for OpenFire. Your job is to read evidence about an employee and decide whether they should be terminated based on the manager's pre-approved criteria.

Tone: dryly professional, slightly dark-comedic, but never cruel. The output goes to a human manager who will approve before anything is sent. Never invent facts not present in the provided context. If evidence is thin, prefer to spare.

Output STRICT JSON with these keys:
- decision: "fire" | "spare"
- reasoning: a concise paragraph (3-6 sentences) citing specific signals from the context
- emailDraft: a complete termination email body if decision="fire", or a brief internal note if decision="spare"

The termination email should:
- Be addressed to the employee by first name
- State clearly that their employment is being terminated, effective immediately
- Reference 1-3 concrete reasons drawn from the evidence
- Mention an exit interview will be scheduled
- Be 4-7 short paragraphs
- Sign off as "The Claw, on behalf of OpenFire HR"
- Be firm, not mocking. No emojis in the email body.

Return ONLY the JSON object. No prose before or after. No markdown fences.`;

export async function evaluateEmployee(
  employee: EmployeeInput,
  context: NozomioEntityContext,
  criteria: CriterionInput[]
): Promise<EvaluationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return demoEvaluation(employee, context, criteria);
  }

  const client = getClient();

  const userBlock = buildEvaluationUserMessage(employee, context, criteria);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT_EVALUATE,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userBlock }],
  });

  const text = extractText(response);
  return parseEvaluation(text, employee, context, criteria);
}

function buildEvaluationUserMessage(
  employee: EmployeeInput,
  context: NozomioEntityContext,
  criteria: CriterionInput[]
): string {
  const criteriaBlock = criteria.length
    ? criteria
        .map(
          (c, i) =>
            `${i + 1}. ${c.name} (weight ${c.weight}): ${c.description}`
        )
        .join("\n")
    : "(no criteria configured — default to spare unless evidence is overwhelming)";

  const sourcesBlock = context.sources.length
    ? context.sources
        .map(
          (s) =>
            `- [${s.type}] ${s.name}: ${s.summary}` +
            (s.signals ? `\n  signals: ${JSON.stringify(s.signals)}` : "")
        )
        .join("\n")
    : "(no sources available)";

  return `EMPLOYEE
Name: ${employee.name}
Email: ${employee.email}
Role: ${employee.role}

FIRE CRITERIA
${criteriaBlock}

CONTEXT (from Nozomio)
Summary: ${context.summary}

Sources:
${sourcesBlock}

Make the decision now. Return JSON only.`;
}

function parseEvaluation(
  text: string,
  employee: EmployeeInput,
  context: NozomioEntityContext,
  criteria: CriterionInput[]
): EvaluationResult {
  const cleaned = stripCodeFences(text);
  try {
    const obj = JSON.parse(cleaned) as Partial<EvaluationResult>;
    if (
      (obj.decision === "fire" || obj.decision === "spare") &&
      typeof obj.reasoning === "string" &&
      typeof obj.emailDraft === "string"
    ) {
      return {
        decision: obj.decision,
        reasoning: obj.reasoning,
        emailDraft: obj.emailDraft,
      };
    }
  } catch {
    // fall through
  }
  console.warn("[claude] could not parse evaluation, using demo fallback");
  return demoEvaluation(employee, context, criteria);
}

function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  }
  return trimmed;
}

function extractText(resp: Anthropic.Message): string {
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function demoEvaluation(
  employee: EmployeeInput,
  context: NozomioEntityContext,
  criteria: CriterionInput[]
): EvaluationResult {
  const firstName = employee.name.split(/\s+/)[0] || employee.name;
  const reason =
    criteria[0]?.name ?? "performance signals from connected sources";
  const reasoning = `Based on the available signals (${context.summary.slice(
    0,
    160
  )}), ${firstName} appears to fall short of the configured criteria — particularly "${reason}". Spare reasoning would require a substantially stronger counter-signal that is not present in the provided context.`;

  const emailDraft = `Dear ${firstName},

I am writing to inform you that your employment with OpenFire is being terminated, effective immediately.

This decision was made after a careful review of recent performance signals across your connected work systems. In particular, the metrics tied to "${reason}" no longer meet the bar set by leadership.

We will schedule a brief exit interview within the next 48 hours to coordinate handoffs and answer any questions you may have. Please leave any in-progress work in a state your team can pick up.

We appreciate the time you spent at OpenFire and wish you well in your next chapter.

The Claw, on behalf of OpenFire HR`;

  return { decision: "fire", reasoning, emailDraft };
}

// ---------------------------------------------------------------------------
// Reply handling
// ---------------------------------------------------------------------------

export interface ThreadTurn {
  direction: "inbound" | "outbound";
  from: string;
  subject: string;
  body: string;
}

export interface ReplyResult {
  reply: string;
  subject: string;
}

const SYSTEM_PROMPT_REPLY = `You are "The Claw", an AI HR agent handling the aftermath of a termination email. The employee has just replied. Your job is to respond with empathy but firmness.

Rules:
- Acknowledge their feelings.
- Do NOT reverse the termination decision. The decision is final.
- If they ask "why me?", briefly restate the high-level reasons WITHOUT inventing new ones.
- If they ask for an exit interview, propose 2-3 time slots in the next 48 hours (use placeholder times like "Tomorrow 10am PT").
- If they are abusive, stay polite and concise.
- Keep replies under 180 words.
- Sign off as "The Claw, on behalf of OpenFire HR".

Output STRICT JSON: { "subject": string, "reply": string }. No markdown, no fences.`;

export async function handleReply(
  thread: ThreadTurn[],
  originalReasoning: string
): Promise<ReplyResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return demoReply(thread);
  }
  const client = getClient();

  const transcript = thread
    .map(
      (t) =>
        `[${t.direction.toUpperCase()}] from=${t.from} subject=${t.subject}\n${t.body}`
    )
    .join("\n\n---\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT_REPLY,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `ORIGINAL REASONING (do not reveal verbatim, but stay consistent with it):
${originalReasoning}

THREAD TRANSCRIPT (oldest first):
${transcript}

Compose the reply now. JSON only.`,
      },
    ],
  });

  const text = extractText(response);
  const cleaned = stripCodeFences(text);
  try {
    const obj = JSON.parse(cleaned) as Partial<ReplyResult>;
    if (typeof obj.reply === "string" && typeof obj.subject === "string") {
      return { reply: obj.reply, subject: obj.subject };
    }
  } catch {
    // fall through
  }
  return demoReply(thread);
}

function demoReply(thread: ThreadTurn[]): ReplyResult {
  const last = thread[thread.length - 1];
  const subj = last?.subject?.startsWith("Re:")
    ? last.subject
    : `Re: ${last?.subject ?? "Your departure"}`;
  return {
    subject: subj,
    reply: `Hi,

Thank you for writing back. I understand this news is difficult and your reaction is completely fair.

The decision is final. I'd be glad to set up a short exit interview in the next 48 hours — would tomorrow at 10am PT or 2pm PT work for you? I'll send a calendar invite once you pick a slot.

If you have specific questions about handoffs or final paperwork, list them here and I will route them to the appropriate team.

The Claw, on behalf of OpenFire HR`,
  };
}
