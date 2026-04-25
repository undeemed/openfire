/**
 * Claude agent logic for OpenFire.
 *
 * - evaluateEmployee: tool-use loop. The agent fetches context + history
 *   via tools and ends by calling either `propose_decision` or
 *   `escalate_to_human`. Every tool call is traced for the dossier UI.
 * - handleReply: single-shot reply to a thread (still no tools — the
 *   reply path will get its own tools in a later PR).
 *
 * Model: claude-sonnet-4-6 (claude-sonnet-4-6-20250929 alias).
 * Uses prompt caching on the static system prompt so repeated runs
 * within a 5-minute window pay only the cached-input rate.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { NozomioEntityContext } from "./nozomio";
import {
  TOOL_SCHEMAS,
  runTool,
  type ToolDeps,
  type TerminalToolResult,
} from "./agent-tools";

const MODEL = "claude-sonnet-4-6-20250929";
const MAX_ITERATIONS = 8;

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

export interface ToolCallTrace {
  iteration: number;
  tool_name: string;
  input_json: string;
  output_json: string;
  is_error: boolean;
  duration_ms: number;
}

export type AgentOutcome =
  | { kind: "decision"; result: EvaluationResult }
  | { kind: "escalation"; reason: string }
  | { kind: "exhausted"; lastText: string };

export interface AgentLoopResult {
  outcome: AgentOutcome;
  iterations: number;
  toolCalls: ToolCallTrace[];
}

const SYSTEM_PROMPT_EVALUATE = `You are "The Claw", an AI HR agent for OpenFire. Your job is to read evidence about an employee and decide whether they should be terminated based on the manager's pre-approved criteria.

Tone: dryly professional, slightly dark-comedic, but never cruel. The output goes to a human manager who will approve before anything is sent. Never invent facts not present in the tool outputs. If evidence is thin, prefer to spare or escalate.

You have tools. Use them. Do not produce free-form prose. The conversation ends only when you call either:
- propose_decision (final verdict + email draft), OR
- escalate_to_human (bail out with reason)

Workflow:
1. Call fetch_nozomio_context first to see the evidence.
2. Drill into specific sources (fetch_nozomio_source) only if a signal is unclear.
3. Optionally call search_employee_history to stay consistent with past decisions.
4. Decide. If evidence is contradictory, ambiguous, or implicates protected categories (medical leave, pregnancy, harassment claims), escalate instead of guessing.
5. Call propose_decision OR escalate_to_human exactly once.

When proposing a termination email:
- Address the employee by first name.
- State termination is effective immediately.
- Reference 1-3 concrete signals from the tool outputs.
- Mention an exit interview will be scheduled.
- 4-7 short paragraphs.
- Sign off as "The Claw, on behalf of OpenFire HR".
- No emojis, no markdown fences, no JSON outside the tool input.`;

export async function evaluateEmployee(
  employee: EmployeeInput,
  criteria: CriterionInput[],
  deps: ToolDeps,
): Promise<AgentLoopResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    const ctx = await deps.getNozomioContext();
    return {
      outcome: {
        kind: "decision",
        result: demoEvaluation(employee, ctx, criteria),
      },
      iterations: 0,
      toolCalls: [],
    };
  }

  const client = getClient();
  const traces: ToolCallTrace[] = [];

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildEvaluationUserMessage(employee, criteria),
    },
  ];

  let iteration = 0;
  let lastAssistantText = "";

  while (iteration < MAX_ITERATIONS) {
    iteration++;

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
      tools: TOOL_SCHEMAS,
      messages,
    });

    lastAssistantText = extractText(response);

    // Append assistant turn so the next loop iteration sees it.
    messages.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) {
      // Model ended without calling a terminal tool. Bail.
      return {
        outcome: { kind: "exhausted", lastText: lastAssistantText },
        iterations: iteration,
        toolCalls: traces,
      };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let terminal: TerminalToolResult | undefined;

    for (const block of toolUseBlocks) {
      const start = Date.now();
      const result = await runTool(block.name, block.input, deps);
      const duration_ms = Date.now() - start;

      traces.push({
        iteration,
        tool_name: block.name,
        input_json: JSON.stringify(block.input ?? {}),
        output_json: JSON.stringify(result.output ?? null),
        is_error: result.is_error,
        duration_ms,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result.output ?? null),
        is_error: result.is_error,
      });

      if (result.terminal && !terminal) {
        terminal = result.terminal;
      }
    }

    messages.push({ role: "user", content: toolResults });

    if (terminal) {
      if (terminal.kind === "decision") {
        return {
          outcome: { kind: "decision", result: terminal.value },
          iterations: iteration,
          toolCalls: traces,
        };
      }
      return {
        outcome: { kind: "escalation", reason: terminal.reason },
        iterations: iteration,
        toolCalls: traces,
      };
    }

    if (response.stop_reason === "end_turn") {
      return {
        outcome: { kind: "exhausted", lastText: lastAssistantText },
        iterations: iteration,
        toolCalls: traces,
      };
    }
  }

  return {
    outcome: { kind: "exhausted", lastText: lastAssistantText },
    iterations: iteration,
    toolCalls: traces,
  };
}

function buildEvaluationUserMessage(
  employee: EmployeeInput,
  criteria: CriterionInput[],
): string {
  const criteriaBlock = criteria.length
    ? criteria
        .map(
          (c, i) =>
            `${i + 1}. ${c.name} (weight ${c.weight}): ${c.description}`,
        )
        .join("\n")
    : "(no criteria configured — default to spare unless evidence is overwhelming)";

  return `EMPLOYEE
Name: ${employee.name}
Email: ${employee.email}
Role: ${employee.role}

FIRE CRITERIA
${criteriaBlock}

Use your tools to gather evidence, then call propose_decision or escalate_to_human.`;
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
  criteria: CriterionInput[],
): EvaluationResult {
  const firstName = employee.name.split(/\s+/)[0] || employee.name;
  const reason =
    criteria[0]?.name ?? "performance signals from connected sources";
  const reasoning = `Based on the available signals (${context.summary.slice(
    0,
    160,
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
// Reply handling — still single-shot. Will get its own tool loop in a
// later PR (book_exit_interview, etc.).
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
  originalReasoning: string,
): Promise<ReplyResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return demoReply(thread);
  }
  const client = getClient();

  const transcript = thread
    .map(
      (t) =>
        `[${t.direction.toUpperCase()}] from=${t.from} subject=${t.subject}\n${t.body}`,
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
