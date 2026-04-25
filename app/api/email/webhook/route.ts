/**
 * POST /api/email/webhook
 *
 * AgentMail inbound webhook. Verifies the HMAC signature, parses the
 * event, and forwards to the Convex `handleInbound` action which owns
 * dedup-by-message_id, Claude reply drafting, and AgentMail send-back.
 */
import { NextResponse } from "next/server";
import { getConvex } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { parseInboundEvent, verifyWebhookSignature } from "@/lib/agentmail";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig =
    req.headers.get("x-agentmail-signature") ??
    req.headers.get("x-signature") ??
    req.headers.get("x-webhook-signature");

  if (!verifyWebhookSignature(raw, sig)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const event = parseInboundEvent(payload);
  if (!event) {
    return NextResponse.json(
      { ok: true, ignored: "could not parse event" },
      { status: 200 }
    );
  }

  const convex = getConvex();
  try {
    const result = await convex.action(api.emailHandler.handleInbound, {
      thread_id: event.thread_id,
      message_id: event.message_id,
      from: event.from,
      subject: event.subject,
      body: event.body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error("[email/webhook] handler failed:", e);
    // Return 200 anyway so AgentMail doesn't infinite-retry — the inbound
    // is logged via Convex's normal error reporting.
    return NextResponse.json({ ok: true, error: "handler failed" });
  }
}
