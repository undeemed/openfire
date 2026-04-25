/**
 * Orchestrator-worker pattern (Anthropic multi-agent research, 2024;
 * arXiv:2511.03841). The orchestrator decomposes a manager request into
 * scoped subtasks, dispatches each to a worker via A2A with FRESH scoped
 * context (never the raw thread), collects worker summaries, and the
 * caller composes the final reply.
 *
 * Pure-ish: the dispatch function is injected so this file stays testable
 * and free of Convex/network plumbing.
 */

import { orchestratorPlan, orchestratorAggregate } from "./claude";

export interface OrchestratorAgent {
  name: string;
  role: string;
  skills: string[];
  a2a_endpoint_url: string;
  agentmail_address: string;
}

export interface DispatchedResult {
  agent: string;
  output: string;
  sources: string[];
}

export interface RunOrchestratorParams {
  managerRequest: string;
  directory: OrchestratorAgent[];
  thread_id: string;
  dispatch: (
    agent: OrchestratorAgent,
    instruction: string,
    thread_id: string
  ) => Promise<DispatchedResult | null>;
}

export interface RunOrchestratorResult {
  rationale: string;
  results: DispatchedResult[];
  reply: { subject: string; reply: string };
}

export async function runOrchestrator(
  params: RunOrchestratorParams
): Promise<RunOrchestratorResult> {
  const plan = await orchestratorPlan(
    params.managerRequest,
    params.directory.map((a) => ({
      name: a.name,
      role: a.role,
      skills: a.skills,
    }))
  );

  // Dispatch in parallel — each worker gets only its scoped instruction.
  const dispatched = await Promise.all(
    plan.subtasks.map(async (st) => {
      const target = params.directory.find((a) => a.name === st.agent_name);
      if (!target) return null;
      return params.dispatch(target, st.instruction, params.thread_id);
    })
  );
  const results = dispatched.filter((r): r is DispatchedResult => Boolean(r));

  const reply = await orchestratorAggregate(params.managerRequest, results);

  return { rationale: plan.rationale, results, reply };
}
