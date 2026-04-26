/**
 * POST /api/digital-employees/[id]/link-resource
 * Body: { kind: "github" | "instagram" | "twitter" | "slack" | "linkedin",
 *         config: { ... }, enabled?: boolean }
 *
 * For `github`, config = { owner, repo } OR { url } (URL is parsed).
 * The route validates the github connection against GITHUB_TOKEN before
 * persisting so the user gets immediate feedback if the repo is wrong.
 */
import { NextResponse } from "next/server";
import { getConvex } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { parseRepoRef, checkRepoAccess } from "@/lib/github";

export const runtime = "nodejs";

interface LinkBody {
  kind?: "github" | "instagram" | "twitter" | "slack" | "linkedin";
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  let payload: LinkBody;
  try {
    payload = (await req.json()) as LinkBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!payload.kind || !payload.config) {
    return NextResponse.json(
      { error: "kind and config required" },
      { status: 400 }
    );
  }

  let config = payload.config;
  if (payload.kind === "github") {
    // Accept either {url}, {owner, repo} or {input: "owner/repo"}.
    const rawUrl =
      (config.url as string | undefined) ?? (config.input as string | undefined);
    let ref = rawUrl ? parseRepoRef(rawUrl) : null;
    if (!ref && typeof config.owner === "string" && typeof config.repo === "string") {
      ref = { owner: config.owner, repo: config.repo };
    }
    if (!ref) {
      return NextResponse.json(
        { error: "github config needs owner/repo or a github.com URL" },
        { status: 400 }
      );
    }
    const access = await checkRepoAccess(ref);
    if (!access.ok) {
      return NextResponse.json(
        {
          error: "repo not accessible with current GITHUB_TOKEN",
          details: access.error,
        },
        { status: 400 }
      );
    }
    config = { owner: ref.owner, repo: ref.repo, simulated: access.simulated };
  }

  const convex = getConvex();
  try {
    await convex.mutation(api.digitalEmployees.linkResource, {
      id: id as Id<"digital_employees">,
      kind: payload.kind,
      config,
      enabled: payload.enabled ?? true,
    });
    return NextResponse.json({ ok: true, kind: payload.kind, config });
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: "link failed",
        details: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
