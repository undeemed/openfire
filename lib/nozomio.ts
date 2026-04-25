/**
 * Nozomio Nia API client.
 *
 * Base URL: https://api.nozomio.com (placeholder - check actual docs).
 * Used to fetch rich employee context from connected sources for the
 * firing decision agent.
 */

const NOZOMIO_BASE_URL = process.env.NOZOMIO_BASE_URL ?? "https://api.nozomio.com";

export interface NozomioSource {
  type: string; // e.g. "github", "jira", "slack", "notion"
  name: string;
  summary: string;
  signals?: Record<string, unknown>;
}

export interface NozomioEntityContext {
  entity_id: string;
  display_name?: string;
  summary: string;
  sources: NozomioSource[];
  raw?: unknown;
}

class NozomioError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "NozomioError";
    this.status = status;
  }
}

function getApiKey() {
  const key = process.env.NOZOMIO_API_KEY;
  if (!key) {
    throw new NozomioError("NOZOMIO_API_KEY is not set");
  }
  return key;
}

/**
 * Fetch rich context for an entity (employee). Returns a normalized
 * shape that the agent can use as evidence for a firing decision.
 *
 * If the API is unavailable (or no key configured during demo), returns
 * a graceful placeholder so the rest of the pipeline still runs.
 */
export async function getEntityContext(
  entityId: string
): Promise<NozomioEntityContext> {
  if (!process.env.NOZOMIO_API_KEY) {
    // Demo fallback so the agent has something to chew on.
    return demoContext(entityId);
  }

  try {
    const res = await fetch(
      `${NOZOMIO_BASE_URL}/v1/entities/${encodeURIComponent(entityId)}/context`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
          "Content-Type": "application/json",
        },
        // Keep responses fresh-ish for the agent
        cache: "no-store",
      }
    );

    if (!res.ok) {
      // Soft-fall back to demo context rather than killing the run
      console.warn(
        `[nozomio] entity ${entityId} returned ${res.status}; using demo context`
      );
      return demoContext(entityId);
    }

    const data = (await res.json()) as Partial<NozomioEntityContext> & {
      sources?: NozomioSource[];
    };

    return {
      entity_id: entityId,
      display_name: data.display_name,
      summary: data.summary ?? "No summary available.",
      sources: data.sources ?? [],
      raw: data,
    };
  } catch (err) {
    console.warn("[nozomio] error fetching context, using demo:", err);
    return demoContext(entityId);
  }
}

function demoContext(entityId: string): NozomioEntityContext {
  // Deterministic-ish demo data so the same entity yields the same context.
  const seed = entityId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const missedDeadlines = (seed % 5) + 1;
  const prRejectRate = ((seed * 7) % 80) + 10;
  const slackChattiness = ["low", "medium", "high"][seed % 3];

  return {
    entity_id: entityId,
    display_name: undefined,
    summary: `Demo context for ${entityId}. ${missedDeadlines} missed deadlines in the last sprint, PR rejection rate ${prRejectRate}%, slack activity ${slackChattiness}.`,
    sources: [
      {
        type: "github",
        name: "GitHub",
        summary: `PR rejection rate: ${prRejectRate}%. ${missedDeadlines} stale PRs.`,
        signals: { pr_rejection_rate: prRejectRate, stale_prs: missedDeadlines },
      },
      {
        type: "jira",
        name: "Jira",
        summary: `${missedDeadlines} missed deadlines in the last sprint.`,
        signals: { missed_deadlines: missedDeadlines },
      },
      {
        type: "slack",
        name: "Slack",
        summary: `Activity level: ${slackChattiness}. Often goes silent during incident channels.`,
        signals: { activity: slackChattiness },
      },
    ],
  };
}
