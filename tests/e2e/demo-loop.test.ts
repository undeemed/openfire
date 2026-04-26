/**
 * In-process e2e: walks through the hire flow + an A2A reply turn + an
 * orchestrator dispatch using only the lib layer in demo mode. Mimics
 * what convex/hireAgent.ts and convex/a2aHandler.ts do, without spinning
 * up Convex or Next.
 *
 * This proves that the lib contract (createInbox → ingest → buildAgentCard
 * → onboarding email → unifiedSearch → reply with citations) holds end
 * to end and is fast enough to run in CI.
 */
import { describe, expect, test } from "bun:test";
import { createInbox, sendEmail } from "@/lib/agentmail";
import {
  getEntityContext,
  ingestSourcesForEntity,
  unifiedSearch,
} from "@/lib/nozomio";
import { buildAgentCard } from "@/lib/a2a";
import {
  generateAgentReply,
  generateOnboardingEmail,
} from "@/lib/claude";
import {
  runOrchestrator,
  type OrchestratorAgent,
} from "@/lib/orchestrator";

interface DigitalEmployeeRecord {
  name: string;
  role: string;
  agentmail_address: string;
  a2a_endpoint_url: string;
  nozomio_entity_id: string;
  knowledge_stats: { sources_indexed: number; last_indexed_at: number };
}

interface ThreadMessage {
  thread_id: string;
  transport: "email" | "a2a";
  direction: "inbound" | "outbound";
  sender: string;
  recipients: string[];
  subject?: string;
  body: string;
  citations: Array<{ source_id: string; label: string; freshness?: number }>;
  external_id?: string;
}

class FakeConvex {
  digitalEmployees = new Map<string, DigitalEmployeeRecord>();
  thread_messages: ThreadMessage[] = [];
  participants = new Map<string, Set<string>>();

  async hireReplacement(input: { firedName: string; firedRole: string }) {
    const baseName = "Ada";
    const shortId = "abcd";
    const localPart = `${baseName.toLowerCase()}-${shortId}`;
    const inbox = await createInbox(localPart);

    // 1. Predecessor evidence.
    const predecessor = await getEntityContext(input.firedName);

    // 2. Knowledge transfer into a fresh entity namespace.
    const newEntityId = `de_${baseName.toLowerCase()}_${shortId}`;
    const ingest = await ingestSourcesForEntity(
      newEntityId,
      predecessor.sources.map((s) => ({
        type: s.type,
        name: s.name,
        body: s.summary,
      }))
    );

    // 3. Build A2A card.
    const a2a_endpoint_url = `http://localhost:3000/api/a2a/${newEntityId}`;
    const card = buildAgentCard({
      name: `${baseName} (replaces ${input.firedName})`,
      description: `Digital employee for ${input.firedRole}.`,
      url: a2a_endpoint_url,
    });
    expect(card.url).toBe(a2a_endpoint_url);

    // 4. Persist.
    const record: DigitalEmployeeRecord = {
      name: baseName,
      role: input.firedRole,
      agentmail_address: inbox.address,
      a2a_endpoint_url,
      nozomio_entity_id: newEntityId,
      knowledge_stats: {
        sources_indexed: ingest.sources_indexed,
        last_indexed_at: ingest.last_indexed_at,
      },
    };
    this.digitalEmployees.set(inbox.address, record);

    // 5. Onboarding email.
    const onboarding = await generateOnboardingEmail(
      {
        name: baseName,
        role: input.firedRole,
        agentmail_address: inbox.address,
        knowledge_stats: { sources_indexed: ingest.sources_indexed },
        replaces_name: input.firedName,
      },
      predecessor
    );

    const sent = await sendEmail({
      to: "manager@openfire.local",
      from: inbox.address,
      subject: onboarding.subject,
      body: onboarding.email,
    });

    this.thread_messages.push({
      thread_id: sent.thread_id,
      transport: "email",
      direction: "outbound",
      sender: inbox.address,
      recipients: ["manager@openfire.local"],
      subject: onboarding.subject,
      body: onboarding.email,
      citations: [],
      external_id: sent.message_id,
    });
    this.participants.set(
      sent.thread_id,
      new Set([inbox.address, "manager@openfire.local"])
    );

    return { record, onboarding_thread_id: sent.thread_id };
  }

  async a2aReply(input: {
    agentAddress: string;
    sender: string;
    text: string;
    thread_id: string;
  }) {
    const record = this.digitalEmployees.get(input.agentAddress);
    if (!record) throw new Error("agent not found");

    this.thread_messages.push({
      thread_id: input.thread_id,
      transport: "a2a",
      direction: "inbound",
      sender: input.sender,
      recipients: [record.agentmail_address],
      body: input.text,
      citations: [],
      external_id: `in_${Date.now()}`,
    });

    const search = await unifiedSearch(
      [input.thread_id, record.nozomio_entity_id],
      input.text
    );

    const reply = await generateAgentReply({
      agent: {
        name: record.name,
        role: record.role,
        agentmail_address: record.agentmail_address,
      },
      thread: this.thread_messages
        .filter((m) => m.thread_id === input.thread_id)
        .map((m) => ({
          direction: m.direction,
          from: m.sender,
          subject: m.subject ?? "",
          body: m.body,
        })),
      niaCitations: search.citations,
    });

    this.thread_messages.push({
      thread_id: input.thread_id,
      transport: "a2a",
      direction: "outbound",
      sender: record.agentmail_address,
      recipients: [input.sender],
      subject: reply.subject,
      body: reply.reply,
      citations: search.citations.map((c) => ({
        source_id: c.source_id,
        label: c.label,
        freshness: c.freshness,
      })),
      external_id: `out_${Date.now()}`,
    });

    return { reply, search };
  }
}

describe("e2e demo loop", () => {
  test("hire → onboarding email → A2A reply with citations", async () => {
    const c = new FakeConvex();
    const hire = await c.hireReplacement({
      firedName: "Alex Doe",
      firedRole: "Payroll Engineer",
    });

    expect(hire.record.agentmail_address).toMatch(/ada-abcd\.openfire@/);
    expect(hire.record.knowledge_stats.sources_indexed).toBeGreaterThan(0);

    const { reply, search } = await c.a2aReply({
      agentAddress: hire.record.agentmail_address,
      sender: "manager@openfire.local",
      text: "Where did Alex leave off on payroll migration?",
      thread_id: hire.onboarding_thread_id,
    });

    expect(search.citations.length).toBeGreaterThanOrEqual(3);
    expect(reply.cited_source_ids.length).toBe(search.citations.length);
    expect(reply.reply).toContain("--- citations ---");

    const outboundA2A = c.thread_messages.filter(
      (m) => m.transport === "a2a" && m.direction === "outbound"
    );
    expect(outboundA2A.length).toBe(1);
    expect(outboundA2A[0].citations.length).toBeGreaterThanOrEqual(3);
  });

  test("orchestrator dispatch aggregates two workers", async () => {
    const c = new FakeConvex();
    await c.hireReplacement({
      firedName: "Alex Doe",
      firedRole: "Payroll Engineer",
    });

    const directory: OrchestratorAgent[] = [
      {
        name: "Ada",
        role: "Payroll Engineer",
        skills: ["answer", "handoff"],
        a2a_endpoint_url: "http://x/a2a/ada",
        agentmail_address: "ada@d.e",
      },
      {
        name: "Ben",
        role: "Data Engineer",
        skills: ["answer"],
        a2a_endpoint_url: "http://x/a2a/ben",
        agentmail_address: "ben@d.e",
      },
    ];

    const dispatched: string[] = [];
    const result = await runOrchestrator({
      managerRequest: "loop in @ada and @ben for the payroll migration",
      directory,
      thread_id: "thr_orch",
      dispatch: async (agent, instruction) => {
        dispatched.push(agent.name);
        // The dispatch fn must NOT receive the raw thread; only the scoped
        // instruction the orchestrator built.
        expect(instruction).not.toContain("orchestrator demo internals");
        return {
          agent: agent.name,
          output: `${agent.name} handled the subtask.`,
          sources: ["src_demo_1"],
        };
      },
    });

    expect(dispatched.length).toBeGreaterThanOrEqual(1);
    expect(result.reply.reply.length).toBeGreaterThan(0);
  });
});
