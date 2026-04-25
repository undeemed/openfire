# OpenFire 🔥 — Implementation Plan

> "We don't fire people. We *open fire* on them. Subtle distinction. Legally important."

## Context

The repo contains only a README (still saying "OpenClaw" — to be updated as part of this build) describing OpenFire: an autonomous HR termination agent that monitors employee performance, decides who gets fired, and sends professionally passive-aggressive termination emails — all via an agentic loop. The stack is Next.js + **Convex** + Nozomio Nia API + AgentMail + Claude + Google Calendar. The repo is empty; this plan builds the entire application from scratch.

Convex is chosen over Supabase for its TypeScript-first schema, real-time reactive queries (dashboard auto-updates when the agent decides Greg in accounting has to go), and actions that can safely call external APIs (Nozomio, Claude, AgentMail) from the same codebase.

**Implementation approach:** Test-first (TDD) with **idempotency guards** baked into every mutating operation. We accidentally fire Greg once. Twice is a lawsuit. The agent loop, approval flow, email webhook, and criteria seeding must all be safely retriable — running the same operation twice with the same input must not produce duplicate decisions, duplicate emails, duplicate inbound message processing, or duplicate calendar events. This matters because: (a) AgentMail webhooks may be retried by their delivery system; (b) the agent loop may be triggered repeatedly while a decision is still pending review; (c) a panicked manager may rage-click "Approve" four times before the spinner finishes.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Next.js App                             │
│                                                              │
│  Dashboard (useQuery = live)     API Routes (thin wrappers)  │
│  ┌────────────────────┐         ┌───────────────────────┐   │
│  │ / pending decisions│         │ POST /api/agent/run   │   │
│  │ /employees/[id]    │         │ POST /api/email/webhook│   │
│  │ /history           │         │ POST /api/decisions/  │   │
│  └────────────────────┘         │       [id]/approve    │   │
└──────────────────────┬──────────┴───────────┬─────────────┘
                       │                      │
                  useQuery /           fetchAction
                  useMutation          (server-side)
                       │                      │
           ┌───────────▼──────────────────────▼──────────────┐
           │                  Convex Backend                   │
           │                                                   │
           │  convex/schema.ts    (type-safe schema)           │
           │  convex/employees.ts (queries + mutations)        │
           │  convex/decisions.ts (queries + mutations)        │
           │  convex/criteria.ts  (queries)                    │
           │  convex/emailMessages.ts (queries + mutations)    │
           │  convex/agent.ts     (action → Nozomio + Claude) │
           │  convex/emailHandler.ts (action → Claude + AM)   │
           └───────────────────────────────────────────────────┘
```

**Agent loop flow:**
```
POST /api/agent/run
  → Convex action: runFireAgent
      → fetch active employees (Convex query)
      → for each: Nozomio profile → Claude scores
      → if flagged: insert termination_decision + set employee status='pending'
  → dashboard auto-updates (Convex real-time)

Manager approves in dashboard
  → useMutation → Convex action: approveDecision
      → AgentMail.sendEmail → store thread_id
      → employee status → 'terminated'

Employee replies → AgentMail webhook → POST /api/email/webhook
  → Convex action: handleInboundEmail
      → store inbound message
      → Claude drafts reply → AgentMail.replyToThread
      → if interview requested → Google Calendar schedules
```

---

## Idempotency Strategy

| Operation | Idempotency key | Guard |
|---|---|---|
| `seedDefaultCriteria` mutation | `metric_key` (unique per criterion) | Skip insert if a criterion with that `metric_key` already exists |
| `employees.create` mutation | `email` (unique per employee) | If employee with email exists, return existing `_id` instead of inserting |
| `runFireAgent` action — per-employee decision creation | `(employee_id, status ∈ {pending, sent})` | Skip evaluation entirely if the employee has any non-rejected open decision |
| `approveDecision` action | `decision._id` + current `status` | Only proceed if `status === 'pending'`; if `'sent'` return existing `agentmail_thread_id` |
| `handleInbound` action | `agentmail_message_id` (unique per inbound message) | Look up `email_messages` by `agentmail_message_id` first; if exists, return early without calling Claude or replying |
| Exit interview scheduling | `decision.exit_interview_event_id` | Already in plan — skip if non-null |
| AgentMail webhook signature | HMAC of raw body | Reject before any DB write if signature invalid |

**Schema additions for idempotency:**
- Add `agentmail_message_id` index on `email_messages` (`by_message_id`) so dedup lookups are O(log n).
- Add `metric_key` index on `fire_criteria` (`by_metric_key`) for upsert on seed.
- The `by_email` index on `employees` already supports the `create` upsert.

---

## Testing Strategy (TDD)

**Stack:** Vitest + `convex-test` (in-memory Convex) + React Testing Library + MSW for HTTP mocking.

```bash
npm install -D vitest @vitest/ui convex-test @edge-runtime/vm \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  msw jsdom
```

`vitest.config.ts` — two projects so Convex tests run under `edge-runtime` (required by `convex-test`) and component tests run under `jsdom`:
```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    server: { deps: { inline: ['convex-test'] } },
    projects: [
      { test: { name: 'convex',  environment: 'edge-runtime', include: ['tests/convex/**/*.test.ts'] } },
      { test: { name: 'unit',    environment: 'node',         include: ['tests/unit/**/*.test.ts'] } },
      { test: { name: 'ui',      environment: 'jsdom',        include: ['tests/components/**/*.test.tsx'], setupFiles: ['tests/setup.ts'] } },
    ],
  },
});
```

**Test file layout:**
```
tests/
  unit/
    nozomio.test.ts          # MSW-mocked Nozomio HTTP
    agentmail.test.ts        # MSW-mocked AgentMail + HMAC sig verify
    claude.test.ts           # mocked Anthropic SDK; tool-use parsing
    calendar.test.ts         # mocked googleapis
  convex/
    employees.test.ts        # create-is-upsert, list filtering
    decisions.test.ts        # listPending, byThreadId, status transitions
    criteria.test.ts         # seedDefaultCriteria idempotency
    emailMessages.test.ts    # byMessageId dedup
    agent.test.ts            # runFireAgent: skips already-flagged employees
    emailHandler.test.ts     # handleInbound: dedup by message_id
  components/
    PendingDecisionCard.test.tsx
  setup.ts                   # @testing-library/jest-dom
```

**TDD order — write the test, watch it fail, implement, watch it pass:**

1. **Schema + types** (`convex/schema.ts`, `lib/types.ts`) — no tests; foundational
2. **`tests/unit/nozomio.test.ts`** → implement `lib/nozomio.ts`
3. **`tests/unit/agentmail.test.ts`** → implement `lib/agentmail.ts` (incl. `verifyWebhookSignature`)
4. **`tests/unit/claude.test.ts`** → implement `lib/claude.ts` (mock `Anthropic.messages.create` to return tool_use blocks)
5. **`tests/unit/calendar.test.ts`** → implement `lib/calendar.ts`
6. **`tests/convex/criteria.test.ts`** → implement `convex/criteria.ts` (seed is idempotent)
7. **`tests/convex/employees.test.ts`** → implement `convex/employees.ts` (create upserts on email)
8. **`tests/convex/decisions.test.ts`** → implement `convex/decisions.ts`
9. **`tests/convex/emailMessages.test.ts`** → implement `convex/emailMessages.ts` (incl. `byMessageId`)
10. **`tests/convex/agent.test.ts`** → implement `convex/agent.ts` (skip-if-already-flagged guard)
11. **`tests/convex/emailHandler.test.ts`** → implement `convex/emailHandler.ts` (skip-if-already-processed guard)
12. **`tests/components/PendingDecisionCard.test.tsx`** → implement component
13. Wire API routes (thin wrappers — covered by Convex action tests; smoke-test only)

**Key test cases for idempotency:**
- `criteria.test.ts`: call `seedDefaultCriteria` twice → `fire_criteria` has 4 rows, not 8
- `employees.test.ts`: call `create` twice with same email → returns same `_id`, only one row
- `agent.test.ts`: run `runFireAgent` twice with same Nozomio data → only one `termination_decisions` row per flagged employee, Claude called only once on second run for already-flagged employees (via skip)
- `emailHandler.test.ts`: call `handleInbound` twice with same `message_id` → only one inbound `email_messages` row, AgentMail `replyToThread` mock called only once
- `agent.test.ts` approval: call `approveDecision` twice on same decision → AgentMail `sendEmail` mock called only once, `agentmail_thread_id` unchanged on second call

**Mocking external libs in Convex tests** — use `convex-test`'s ability to swap modules. Pattern:
```typescript
const t = convexTest(schema, import.meta.glob('../../convex/**/*.ts'));
// Stub the lib import inside the action
vi.mock('../../lib/nozomio', () => ({ getEmployeeMetrics: vi.fn().mockResolvedValue({...}) }));
vi.mock('../../lib/claude',  () => ({ evaluateEmployee: vi.fn().mockResolvedValue({...}) }));
```

---

## File Structure

```
convex/
  schema.ts              # TypeScript-first schema (all tables)
  employees.ts           # queries: list, byId; mutations: create, updateStatus
  decisions.ts           # queries: pending, byEmployee; mutations: create, updateStatus
  criteria.ts            # query: listEnabled
  emailMessages.ts       # query: byDecision; mutation: insert
  agent.ts               # action: runFireAgent (Nozomio + Claude)
  emailHandler.ts        # action: handleInboundEmail (Claude + AgentMail)
  _generated/            # auto-generated by Convex CLI
app/
  (dashboard)/
    page.tsx             # "Pending Departures" — useQuery, real-time
    employees/[id]/page.tsx
    pyre/page.tsx        # The Pyre (formerly /history)
    criteria/page.tsx
    layout.tsx
  api/
    agent/run/route.ts   # thin: calls Convex action
    email/webhook/route.ts  # thin: verifies sig, calls Convex action
    decisions/[id]/approve/route.ts
    decisions/[id]/reject/route.ts
  layout.tsx
  globals.css
components/
  ConvexClientProvider.tsx
  PendingDecisionCard.tsx
  EmailThreadViewer.tsx
  CriteriaBreakdown.tsx
lib/
  nozomio.ts    # Nozomio API client (used from Convex actions)
  agentmail.ts  # AgentMail client (used from Convex actions)
  claude.ts     # Claude decision engine + reply handler
  calendar.ts   # Google Calendar exit interview scheduler
  types.ts      # shared TypeScript types (mirrors Convex doc types)
.env.local.example
```

---

## Step-by-Step Implementation

### 0. Rename in README

The existing `README.md` still says "OpenClaw 🦞". As the very first step, rewrite it for OpenFire 🔥: replace the lobster references with flame ones, update the tagline ("The AI agent that fires your employees so you don't have to feel bad about it" still works — that one's evergreen), and swap "claw criteria" for "fire criteria". Keep the disclaimer; it has aged into prophecy.

---

### 1. Bootstrap Project

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
npm install convex @anthropic-ai/sdk googleapis
npx convex dev   # initializes convex/ directory, sets NEXT_PUBLIC_CONVEX_URL
```

`.env.local.example`:
```
NEXT_PUBLIC_CONVEX_URL=          # set by `npx convex dev`
NOZOMIO_API_KEY=                 # set via `npx convex env set`
NOZOMIO_BASE_URL=https://api.nozomio.com/v1
AGENTMAIL_API_KEY=               # set via `npx convex env set`
AGENTMAIL_INBOX_ID=              # set via `npx convex env set`
AGENTMAIL_WEBHOOK_SECRET=        # set via `npx convex env set`
ANTHROPIC_API_KEY=               # set via `npx convex env set`
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
```

Note: API keys used in Convex actions are set via `npx convex env set KEY value`, not `.env.local`. Google Calendar keys stay in `.env.local` since they're used in a Next.js API route.

---

### 2. Convex Schema (`convex/schema.ts`)

```typescript
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  employees: defineTable({
    name: v.string(),
    email: v.string(),
    department: v.optional(v.string()),
    role: v.optional(v.string()),
    hire_date: v.optional(v.string()),
    nozomio_entity_id: v.optional(v.string()),
    status: v.union(v.literal('active'), v.literal('pending'), v.literal('terminated')),
  })
    .index('by_status', ['status'])
    .index('by_email', ['email']),

  fire_criteria: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    metric_key: v.string(),
    weight: v.number(),
    threshold: v.number(),
    enabled: v.boolean(),
  }).index('by_metric_key', ['metric_key']),

  termination_decisions: defineTable({
    employee_id: v.id('employees'),
    composite_score: v.number(),
    reasoning: v.string(),
    criteria_breakdown: v.any(),
    status: v.union(
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
      v.literal('sent'),
    ),
    email_subject: v.optional(v.string()),
    email_body: v.optional(v.string()),
    agentmail_thread_id: v.optional(v.string()),
    approved_at: v.optional(v.number()),
    sent_at: v.optional(v.number()),
    exit_interview_event_id: v.optional(v.string()),
  })
    .index('by_employee', ['employee_id'])
    .index('by_status', ['status'])
    .index('by_thread', ['agentmail_thread_id']),

  email_messages: defineTable({
    decision_id: v.id('termination_decisions'),
    direction: v.union(v.literal('outbound'), v.literal('inbound')),
    subject: v.optional(v.string()),
    body: v.string(),
    agentmail_message_id: v.optional(v.string()),
  })
    .index('by_decision', ['decision_id'])
    .index('by_message_id', ['agentmail_message_id']),
});
```

---

### 3. Convex Functions

**`convex/employees.ts`**
```typescript
import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    if (status) return ctx.db.query('employees').withIndex('by_status', q => q.eq('status', status as any)).collect();
    return ctx.db.query('employees').collect();
  },
});

export const byId = query({
  args: { id: v.id('employees') },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const updateStatus = mutation({
  args: { id: v.id('employees'), status: v.string() },
  handler: async (ctx, { id, status }) => ctx.db.patch(id, { status: status as any }),
});

export const create = mutation({
  args: { name: v.string(), email: v.string(), department: v.optional(v.string()), role: v.optional(v.string()), nozomio_entity_id: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('employees')
      .withIndex('by_email', q => q.eq('email', args.email))
      .first();
    if (existing) return existing._id;
    return ctx.db.insert('employees', { ...args, status: 'active' });
  },
});

export const hasOpenDecision = query({
  args: { employee_id: v.id('employees') },
  handler: async (ctx, { employee_id }) => {
    const all = await ctx.db.query('termination_decisions')
      .withIndex('by_employee', q => q.eq('employee_id', employee_id)).collect();
    return all.some(d => d.status === 'pending' || d.status === 'sent' || d.status === 'approved');
  },
});
```

**`convex/criteria.ts`**
```typescript
import { query, mutation } from './_generated/server';

export const listEnabled = query({
  handler: async (ctx) => ctx.db.query('fire_criteria').filter(q => q.eq(q.field('enabled'), true)).collect(),
});

const DEFAULTS = [
  { name: 'Code Quality',       description: 'PR rejection rate',           metric_key: 'pr_rejection_rate',     weight: 2.0, threshold: 0.4, enabled: true },
  { name: 'Deadline Adherence', description: 'Missed sprint commitments',   metric_key: 'missed_deadlines_rate', weight: 2.5, threshold: 0.3, enabled: true },
  { name: 'Communication',      description: 'Slack/email response',        metric_key: 'communication_score',   weight: 1.0, threshold: 0.2, enabled: true },
  { name: 'Output Volume',      description: 'Commits, docs, deliverables', metric_key: 'output_score',          weight: 1.5, threshold: 0.3, enabled: true },
];

export const seedDefaultCriteria = mutation({
  handler: async (ctx) => {
    let inserted = 0;
    for (const c of DEFAULTS) {
      const exists = await ctx.db.query('fire_criteria')
        .withIndex('by_metric_key', q => q.eq('metric_key', c.metric_key)).first();
      if (!exists) { await ctx.db.insert('fire_criteria', c); inserted++; }
    }
    return { inserted };
  },
});
```

**`convex/decisions.ts`**
```typescript
export const byId = query({ args: { id: v.id('termination_decisions') }, handler: async (ctx, { id }) => ctx.db.get(id) });
export const listPending = query({ handler: async (ctx) => ctx.db.query('termination_decisions').withIndex('by_status', q => q.eq('status', 'pending')).collect() });
export const byEmployee = query({ args: { employee_id: v.id('employees') }, handler: async (ctx, { employee_id }) => ctx.db.query('termination_decisions').withIndex('by_employee', q => q.eq('employee_id', employee_id)).collect() });
export const byThreadId = query({ args: { thread_id: v.string() }, handler: async (ctx, { thread_id }) => ctx.db.query('termination_decisions').withIndex('by_thread', q => q.eq('agentmail_thread_id', thread_id)).first() });
export const create = mutation({ args: { employee_id: v.id('employees'), composite_score: v.number(), reasoning: v.string(), criteria_breakdown: v.any(), email_subject: v.optional(v.string()), email_body: v.optional(v.string()) }, handler: async (ctx, args) => ctx.db.insert('termination_decisions', { ...args, status: 'pending' }) });
export const updateStatus = mutation({ args: { id: v.id('termination_decisions'), status: v.string(), patch: v.optional(v.any()) }, handler: async (ctx, { id, status, patch }) => ctx.db.patch(id, { status: status as any, ...(patch ?? {}) }) });
```

**`convex/emailMessages.ts`**
```typescript
export const byDecision = query({ args: { decision_id: v.id('termination_decisions') }, handler: async (ctx, { decision_id }) => ctx.db.query('email_messages').withIndex('by_decision', q => q.eq('decision_id', decision_id)).collect() });
export const byMessageId = query({ args: { agentmail_message_id: v.string() }, handler: async (ctx, { agentmail_message_id }) => ctx.db.query('email_messages').withIndex('by_message_id', q => q.eq('agentmail_message_id', agentmail_message_id)).first() });
export const insert = mutation({ args: { decision_id: v.id('termination_decisions'), direction: v.union(v.literal('outbound'), v.literal('inbound')), body: v.string(), subject: v.optional(v.string()), agentmail_message_id: v.optional(v.string()) }, handler: async (ctx, args) => ctx.db.insert('email_messages', args) });
```

---

### 4. API Clients (`lib/`)

**`lib/nozomio.ts`**
```typescript
export interface NozomioMetrics {
  pr_rejection_rate: number;
  missed_deadlines_rate: number;
  communication_score: number;
  output_score: number;
  activity_summary: string;
}

export async function getEmployeeMetrics(entityId: string): Promise<NozomioMetrics> {
  const res = await fetch(`${process.env.NOZOMIO_BASE_URL}/entities/${entityId}/metrics`, {
    headers: { Authorization: `Bearer ${process.env.NOZOMIO_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Nozomio metrics: ${res.status}`);
  const data = await res.json();
  return {
    pr_rejection_rate:     data.metrics.pr_rejection_rate     ?? 0,
    missed_deadlines_rate: data.metrics.missed_deadlines_rate ?? 0,
    communication_score:   data.metrics.communication_score   ?? 0.5,
    output_score:          data.metrics.output_score          ?? 0.5,
    activity_summary:      data.summary ?? '',
  };
}
```

**`lib/agentmail.ts`**
```typescript
const BASE = 'https://api.agentmail.to/v1';

async function amPost(path: string, body: object) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.AGENTMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AgentMail ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function sendEmail(to: string, subject: string, body: string): Promise<string> {
  const data = await amPost('/messages/send', { inbox_id: process.env.AGENTMAIL_INBOX_ID, to, subject, body });
  return data.thread_id as string;
}

export async function replyToThread(threadId: string, body: string): Promise<void> {
  await amPost('/messages/reply', { thread_id: threadId, inbox_id: process.env.AGENTMAIL_INBOX_ID, body });
}

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const { createHmac, timingSafeEqual } = require('crypto');
  const expected = createHmac('sha256', process.env.AGENTMAIL_WEBHOOK_SECRET!).update(payload).digest('hex');
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

**`lib/claude.ts`**
```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SYSTEM = `You are OpenFire, an AI HR performance evaluator. Assess employees objectively. When writing termination emails, be warm, empathetic, professional, and just passive-aggressive enough — friendly enough to avoid a lawsuit, honest enough to avoid perjury, vague enough to avoid HR hauling you back in for "a quick conversation". Never use the word "fired". Prefer: "transitioning out of your role", "pursuing opportunities outside the company", "the conclusion of our journey together".`;

export async function evaluateEmployee(employee: { name: string; role?: string; department?: string }, metrics: any, criteria: any[]) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: [{
      name: 'submit_evaluation',
      description: 'Submit final evaluation and draft termination email if warranted.',
      input_schema: {
        type: 'object' as const,
        properties: {
          should_terminate: { type: 'boolean' },
          composite_score: { type: 'number' },
          criteria_scores: { type: 'object', additionalProperties: { type: 'number' } },
          reasoning: { type: 'string' },
          email_subject: { type: 'string' },
          email_body: { type: 'string' },
        },
        required: ['should_terminate', 'composite_score', 'criteria_scores', 'reasoning'],
      },
    }],
    tool_choice: { type: 'any' },
    messages: [{
      role: 'user',
      content: `Evaluate ${employee.name} (${employee.role ?? 'unknown'}, ${employee.department ?? 'unknown dept'}).

Criteria (metric_key, weight, flag_threshold):
${criteria.map((c: any) => `- ${c.name}: key=${c.metric_key}, weight=${c.weight}, threshold=${c.threshold}`).join('\n')}

Metrics (communication_score and output_score are "higher=better", invert before weighting):
${JSON.stringify(metrics, null, 2)}

Composite score > 0.5 → terminate. Compute weighted average of (inverted where needed) scores.`,
    }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude did not call submit_evaluation');
  const input = toolUse.input as any;
  return {
    shouldTerminate: input.should_terminate as boolean,
    compositeScore: input.composite_score as number,
    criteriaBreakdown: input.criteria_scores as Record<string, number>,
    reasoning: input.reasoning as string,
    emailSubject: input.email_subject ?? '',
    emailBody: input.email_body ?? '',
  };
}

export async function handleEmailReply(
  employeeName: string,
  originalEmailBody: string,
  incomingMessage: string,
  history: { direction: string; body: string }[],
): Promise<{ reply: string; shouldScheduleInterview: boolean }> {
  const historyText = history.map(m => `[${m.direction.toUpperCase()}]: ${m.body}`).join('\n\n');
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{
      role: 'user',
      content: `Original termination email sent to ${employeeName}:\n---\n${originalEmailBody}\n---\n\nThread:\n${historyText}\n\nNew message from ${employeeName}: "${incomingMessage}"\n\nWrite a reply. Answer "why me?" if asked. Offer exit interview if distressed or requested. Stay legally safe. Do NOT apologize for the decision.\n\nReturn JSON only: { "reply": "...", "schedule_interview": true|false }`,
    }],
  });
  const text = response.content.find(b => b.type === 'text')?.text ?? '{}';
  const match = text.match(/\{[\s\S]*\}/);
  const parsed = match ? JSON.parse(match[0]) : { reply: text, schedule_interview: false };
  return { reply: parsed.reply, shouldScheduleInterview: parsed.schedule_interview };
}
```

**`lib/calendar.ts`**
```typescript
import { google } from 'googleapis';

function auth() {
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return a;
}

export async function scheduleExitInterview(email: string, name: string): Promise<string> {
  const cal = google.calendar({ version: 'v3', auth: auth() });
  const start = new Date(Date.now() + 3 * 86400000);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 3600000);
  const ev = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `Exit Interview — ${name}`,
      start: { dateTime: start.toISOString() },
      end:   { dateTime: end.toISOString() },
      attendees: [{ email }],
    },
  });
  return ev.data.id!;
}
```

---

### 5. Convex Actions

**`convex/agent.ts`**
```typescript
import { action } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';

export const runFireAgent = action({
  handler: async (ctx): Promise<{ processed: number; flagged: number; skipped: number }> => {
    const employees = await ctx.runQuery(api.employees.list, { status: 'active' });
    const criteria = await ctx.runQuery(api.criteria.listEnabled);
    let flagged = 0;
    let skipped = 0;

    for (const employee of employees) {
      if (!employee.nozomio_entity_id) { skipped++; continue; }
      const hasOpen = await ctx.runQuery(api.employees.hasOpenDecision, { employee_id: employee._id });
      if (hasOpen) { skipped++; continue; }

      const { getEmployeeMetrics } = await import('../lib/nozomio');
      const { evaluateEmployee } = await import('../lib/claude');
      const metrics = await getEmployeeMetrics(employee.nozomio_entity_id);
      const decision = await evaluateEmployee(employee, metrics, criteria);

      if (decision.shouldTerminate) {
        await ctx.runMutation(api.decisions.create, {
          employee_id: employee._id,
          composite_score: decision.compositeScore,
          reasoning: decision.reasoning,
          criteria_breakdown: decision.criteriaBreakdown,
          email_subject: decision.emailSubject,
          email_body: decision.emailBody,
        });
        await ctx.runMutation(api.employees.updateStatus, { id: employee._id, status: 'pending' });
        flagged++;
      }
    }
    return { processed: employees.length, flagged, skipped };
  },
});

export const approveDecision = action({
  args: { decision_id: v.id('termination_decisions') },
  handler: async (ctx, { decision_id }) => {
    const decision = await ctx.runQuery(api.decisions.byId, { id: decision_id });
    if (!decision) throw new Error('decision not found');
    if (decision.status === 'sent') return { threadId: decision.agentmail_thread_id, alreadySent: true };
    if (decision.status === 'rejected') throw new Error('cannot approve a rejected decision');

    const employee = await ctx.runQuery(api.employees.byId, { id: decision.employee_id });
    if (!employee) throw new Error('employee not found');

    const { sendEmail } = await import('../lib/agentmail');
    const threadId = await sendEmail(employee.email, decision.email_subject!, decision.email_body!);

    await ctx.runMutation(api.emailMessages.insert, {
      decision_id, direction: 'outbound', subject: decision.email_subject, body: decision.email_body!,
    });
    await ctx.runMutation(api.decisions.updateStatus, {
      id: decision_id, status: 'sent',
      patch: { agentmail_thread_id: threadId, approved_at: Date.now(), sent_at: Date.now() },
    });
    await ctx.runMutation(api.employees.updateStatus, { id: decision.employee_id, status: 'terminated' });
    return { threadId, alreadySent: false };
  },
});
```

**`convex/emailHandler.ts`**
```typescript
import { action } from './_generated/server';
import { v } from 'convex/values';
import { api } from './_generated/api';

export const handleInbound = action({
  args: { thread_id: v.string(), message_id: v.string(), body: v.string() },
  handler: async (ctx, { thread_id, message_id, body }) => {
    const existing = await ctx.runQuery(api.emailMessages.byMessageId, { agentmail_message_id: message_id });
    if (existing) return { deduped: true };

    const decision = await ctx.runQuery(api.decisions.byThreadId, { thread_id });
    if (!decision) return { deduped: false, unknownThread: true };

    const employee = await ctx.runQuery(api.employees.byId, { id: decision.employee_id });
    if (!employee) return { deduped: false, unknownThread: true };

    await ctx.runMutation(api.emailMessages.insert, {
      decision_id: decision._id, direction: 'inbound', body, agentmail_message_id: message_id,
    });

    const history = await ctx.runQuery(api.emailMessages.byDecision, { decision_id: decision._id });
    const { handleEmailReply } = await import('../lib/claude');
    const { reply, shouldScheduleInterview } = await handleEmailReply(
      employee.name, decision.email_body!, body, history,
    );

    const { replyToThread } = await import('../lib/agentmail');
    await replyToThread(thread_id, reply);
    await ctx.runMutation(api.emailMessages.insert, { decision_id: decision._id, direction: 'outbound', body: reply });

    if (shouldScheduleInterview && !decision.exit_interview_event_id) {
      const { scheduleExitInterview } = await import('../lib/calendar');
      const eventId = await scheduleExitInterview(employee.email, employee.name);
      await ctx.runMutation(api.decisions.updateStatus, {
        id: decision._id, status: 'sent', patch: { exit_interview_event_id: eventId },
      });
    }

    return { deduped: false };
  },
});
```

---

### 6. Next.js API Routes

**`app/api/agent/run/route.ts`**
```typescript
import { fetchAction } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { NextResponse } from 'next/server';

export async function POST() {
  const result = await fetchAction(api.agent.runFireAgent, {});
  return NextResponse.json(result);
}
```

**`app/api/decisions/[id]/approve/route.ts`**
```typescript
import { fetchAction } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { NextResponse } from 'next/server';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  await fetchAction(api.agent.approveDecision, { decision_id: params.id as Id<'termination_decisions'> });
  return NextResponse.json({ ok: true });
}
```

**`app/api/email/webhook/route.ts`**
```typescript
import { verifyWebhookSignature } from '@/lib/agentmail';
import { fetchAction } from 'convex/nextjs';
import { api } from '@/convex/_generated/api';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get('x-agentmail-signature') ?? '';
  if (!verifyWebhookSignature(raw, sig)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { thread_id, message_id, body } = JSON.parse(raw);
  await fetchAction(api.emailHandler.handleInbound, { thread_id, message_id, body });
  return NextResponse.json({ ok: true });
}
```

---

### 7. UI

**Color palette (Tailwind config):**
- background: `#0A0A0C`
- surface: `#14141A`
- surface-2: `#1C1C24`
- border: `#2A2A33`
- text: `#F4F4F7`
- text-muted: `#8A8A93`
- ember: `#FF5A1F` (primary CTA)
- flame: `#FFB84A` (warning amber)
- safe: `#5CC68D` (spared)

**Key copy strings:**
- "Light The Fuse 🔥" — run agent
- "Light it up 🔥" — approve
- "Spare them 🕊️" — reject
- "The Pyre 🔥" — fired employees page
- "Pending Departures" — dashboard title
- "Fanning the flames…" — loading
- "The smoke clears… No one is on fire today." — empty state
- "Already toasted." — idempotent retry feedback
- "Awaiting your verdict" — pending badge

**`components/ConvexClientProvider.tsx`**
```typescript
'use client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
```

---

## Dependencies

```bash
# runtime
bun add convex @anthropic-ai/sdk googleapis
# dev/test
bun add -D vitest @vitest/ui convex-test @edge-runtime/vm \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  msw jsdom
```

---

## Verification Checklist

- [ ] `bun test` — all unit + convex + component tests pass
- [ ] `seedDefaultCriteria` twice → exactly 4 rows
- [ ] `employees.create` twice same email → one row, same `_id`
- [ ] `runFireAgent` twice → one decision per employee, second run skips
- [ ] `approveDecision` twice → `sendEmail` called once, second returns `alreadySent: true`
- [ ] `handleInbound` twice same `message_id` → `replyToThread` called once, returns `deduped: true`
- [ ] Dashboard auto-updates when decision created (Convex real-time)
- [ ] Webhook rejects invalid HMAC with 401
