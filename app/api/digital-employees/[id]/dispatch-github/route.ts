/**
 * POST /api/digital-employees/[id]/dispatch-github
 * Body: { brief: string }
 *
 * Runs the engineer template against `brief`, drafts an issue title +
 * body via Claude, posts the issue to the linked github repo, and
 * persists a `github_issues` row. Returns the issue URL.
 */
import { NextResponse } from "next/server";
import { getConvex } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";

interface DispatchBody {
  brief?: string;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  let payload: DispatchBody;
  try {
    payload = (await req.json()) as DispatchBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!payload.brief || payload.brief.trim().length < 5) {
    return NextResponse.json(
      { error: "brief required (min 5 chars)" },
      { status: 400 }
    );
  }
  const convex = getConvex();
  try {
    const result = await convex.action(api.githubAgent.dispatchIssueTask, {
      digital_employee_id: id as Id<"digital_employees">,
      brief: payload.brief,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: "dispatch failed",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
