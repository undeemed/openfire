import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import {
  createInbox,
  parseInboundEvent,
  sendEmail,
  verifyWebhookSignature,
} from "@/lib/agentmail";

describe("createInbox (demo mode)", () => {
  test("returns synthetic address with slugged local part", async () => {
    const result = await createInbox("Ada Lovelace");
    expect(result.address).toBe("ada-lovelace.openfire@demo.agentmail.to");
    expect(result.inbox_id).toMatch(/^inbox_sim_/);
  });

  test("strips emoji and special chars from local part", async () => {
    const result = await createInbox("Ada Lovelace 🦊!#$");
    const local = result.address.split(".openfire@")[0];
    expect(local).toMatch(/^ada-lovelace/);
    expect(local).not.toMatch(/[🦊!#$]/u);
  });

  test("clamps long local parts to 48 chars", async () => {
    const result = await createInbox("a".repeat(120));
    const local = result.address.split(".openfire@")[0];
    expect(local.length).toBeLessThanOrEqual(48);
  });
});

describe("sendEmail (demo mode)", () => {
  test("returns simulated message and thread ids", async () => {
    const result = await sendEmail({
      to: "test@example.com",
      subject: "hi",
      body: "hello",
    });
    expect(result.message_id).toMatch(/^msg_sim_/);
    expect(result.thread_id).toMatch(/^thr_sim_/);
  });

  test("preserves explicit thread_id when provided", async () => {
    const result = await sendEmail({
      to: "x@y.z",
      subject: "s",
      body: "b",
      thread_id: "thr_existing",
    });
    expect(result.thread_id).toBe("thr_existing");
  });
});

describe("verifyWebhookSignature", () => {
  test("returns true when no secret is set (demo mode)", () => {
    expect(verifyWebhookSignature("body", "sha256=abc")).toBe(true);
  });

  test("rejects bad sig and accepts good sig when secret is set", () => {
    const original = process.env.AGENTMAIL_WEBHOOK_SECRET;
    process.env.AGENTMAIL_WEBHOOK_SECRET = "secret";
    try {
      const body = '{"a":1}';
      const good = crypto
        .createHmac("sha256", "secret")
        .update(body)
        .digest("hex");
      expect(verifyWebhookSignature(body, `sha256=${good}`)).toBe(true);
      expect(verifyWebhookSignature(body, "sha256=bad")).toBe(false);
      expect(verifyWebhookSignature(body, null)).toBe(false);
    } finally {
      if (original === undefined) {
        delete process.env.AGENTMAIL_WEBHOOK_SECRET;
      } else {
        process.env.AGENTMAIL_WEBHOOK_SECRET = original;
      }
    }
  });
});

describe("parseInboundEvent", () => {
  test("parses flat object", () => {
    const evt = parseInboundEvent({
      message_id: "m1",
      thread_id: "t1",
      from: "a@b.c",
      to: "d@e.f",
      subject: "s",
      text: "body",
      created_at: "2026-01-01",
    });
    expect(evt).not.toBeNull();
    expect(evt!.message_id).toBe("m1");
    expect(evt!.thread_id).toBe("t1");
    expect(evt!.body).toBe("body");
  });

  test("parses {message:{...}} envelope", () => {
    const evt = parseInboundEvent({
      message: {
        id: "m2",
        thread_id: "t2",
        from: { email: "x@y.z" },
        to: [{ email: "agent@d.e" }],
        subject: "hello",
        text: "yo",
      },
    });
    expect(evt).not.toBeNull();
    expect(evt!.message_id).toBe("m2");
    expect(evt!.from).toBe("x@y.z");
    expect(evt!.to).toBe("agent@d.e");
  });

  test("returns null on malformed input", () => {
    expect(parseInboundEvent(null)).toBeNull();
    expect(parseInboundEvent("nope")).toBeNull();
    expect(parseInboundEvent({ foo: "bar" })).toBeNull();
  });
});
