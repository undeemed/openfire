/**
 * AgentMail client.
 *
 * Base URL: https://api.agentmail.to (placeholder; consult real docs).
 * Operations:
 *   - send email (creating a thread)
 *   - reply to thread
 *   - list messages in thread
 *   - verify inbound webhook HMAC
 */

import crypto from "node:crypto";

const AGENTMAIL_BASE_URL =
  process.env.AGENTMAIL_BASE_URL ?? "https://api.agentmail.to";

function getApiKey() {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error("AGENTMAIL_API_KEY not set");
  return key;
}

function getInboxAddress() {
  const addr = process.env.AGENTMAIL_INBOX_ADDRESS;
  if (!addr) throw new Error("AGENTMAIL_INBOX_ADDRESS not set");
  return addr;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string; // plain text or HTML
  thread_id?: string;
  reply_to_message_id?: string;
}

export interface SendEmailResult {
  message_id: string;
  thread_id: string;
}

/**
 * Send a new email. If thread_id provided, reply within that thread.
 * Falls back to a no-op stub if no API key is configured (so demos run).
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  if (!process.env.AGENTMAIL_API_KEY) {
    console.warn("[agentmail] no API key, simulating send");
    const fakeId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      message_id: `msg_${fakeId}`,
      thread_id: params.thread_id ?? `thr_${fakeId}`,
    };
  }

  const res = await fetch(`${AGENTMAIL_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getInboxAddress(),
      to: params.to,
      subject: params.subject,
      text: params.body,
      thread_id: params.thread_id,
      reply_to_message_id: params.reply_to_message_id,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AgentMail send failed (${res.status}): ${txt}`);
  }

  const data = (await res.json()) as {
    id?: string;
    message_id?: string;
    thread_id?: string;
  };

  return {
    message_id: data.message_id ?? data.id ?? `unknown_${Date.now()}`,
    thread_id: data.thread_id ?? `thr_${Date.now()}`,
  };
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  created_at: string;
  direction: "inbound" | "outbound";
}

export async function listThreadMessages(
  thread_id: string
): Promise<ThreadMessage[]> {
  if (!process.env.AGENTMAIL_API_KEY) return [];
  const res = await fetch(
    `${AGENTMAIL_BASE_URL}/v1/threads/${encodeURIComponent(thread_id)}/messages`,
    {
      headers: { Authorization: `Bearer ${getApiKey()}` },
      cache: "no-store",
    }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { messages?: ThreadMessage[] };
  return data.messages ?? [];
}

/**
 * Verify HMAC-SHA256 signature for inbound webhook.
 * Compares against `AGENTMAIL_WEBHOOK_SECRET`. Constant-time compare.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed. Returning true on a missing secret would let any caller
    // POST a forged webhook in any environment that hasn't configured one.
    console.warn(
      "[agentmail] AGENTMAIL_WEBHOOK_SECRET not set; rejecting webhook"
    );
    return false;
  }
  if (!signatureHeader) return false;

  // Accept formats like `sha256=...` or just the hex digest
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(computed, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Best-effort normalization of an inbound AgentMail webhook payload.
 * Different providers wrap the data differently; we read common fields.
 */
export interface InboundWebhookEvent {
  message_id: string;
  thread_id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  created_at: string;
}

export function parseInboundEvent(json: unknown): InboundWebhookEvent | null {
  if (!json || typeof json !== "object") return null;
  // Allow either {message: {...}} envelope or flat object
  const obj = json as Record<string, unknown>;
  const m = (obj.message ?? obj.data ?? obj) as Record<string, unknown>;
  if (!m || typeof m !== "object") return null;

  const message_id =
    (m.id as string) ??
    (m.message_id as string) ??
    (m.messageId as string) ??
    "";
  const thread_id =
    (m.thread_id as string) ??
    (m.threadId as string) ??
    (m.conversation_id as string) ??
    "";
  const from =
    typeof m.from === "string"
      ? (m.from as string)
      : ((m.from as { email?: string })?.email ?? "");
  const to =
    typeof m.to === "string"
      ? (m.to as string)
      : Array.isArray(m.to)
        ? (m.to as Array<string | { email?: string }>)
            .map((x) => (typeof x === "string" ? x : (x?.email ?? "")))
            .join(", ")
        : ((m.to as { email?: string })?.email ?? "");
  const subject = (m.subject as string) ?? "(no subject)";
  const body =
    (m.text as string) ?? (m.body as string) ?? (m.html as string) ?? "";
  const created_at =
    (m.created_at as string) ??
    (m.createdAt as string) ??
    new Date().toISOString();

  if (!message_id || !thread_id) return null;

  return { message_id, thread_id, from, to, subject, body, created_at };
}
