/**
 * POST /api/digital-employees — standalone hire from the UI form.
 * Body: { name, role, template_type, agentmail_address? }
 */
import { NextResponse } from "next/server";
import { getConvex } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";

interface CreateBody {
  name?: string;
  role?: string;
  template_type?:
    | "engineer"
    | "gtm"
    | "recruiter"
    | "cse"
    | "pm"
    | "researcher";
  agentmail_address?: string;
}

export async function POST(req: Request) {
  let payload: CreateBody;
  try {
    payload = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!payload.name || !payload.role || !payload.template_type) {
    return NextResponse.json(
      { error: "name, role, template_type required" },
      { status: 400 }
    );
  }
  const convex = getConvex();
  try {
    const id = await convex.mutation(api.digitalEmployees.createStandalone, {
      name: payload.name,
      role: payload.role,
      template_type: payload.template_type,
      agentmail_address: payload.agentmail_address,
    });
    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: "create failed",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
