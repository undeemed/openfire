"use node";

/**
 * Dispatch a GitHub task to a digital employee.
 *
 * Loads the employee, finds their linked github resource, asks Claude
 * to draft an issue title + body for the brief, posts the issue via
 * the GitHub REST API, and persists a `github_issues` row. When
 * GITHUB_TOKEN is unset, lib/github.createIssue returns a deterministic
 * simulated response so demos still work end-to-end.
 */
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const dispatchIssueTask = action({
  args: {
    digital_employee_id: v.id("digital_employees"),
    brief: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    ok: boolean;
    simulated: boolean;
    issue_url: string;
    issue_number: number;
    title: string;
    issue_record_id?: Id<"github_issues">;
    error?: string;
  }> => {
    const employee = await ctx.runQuery(api.digitalEmployees.get, {
      id: args.digital_employee_id,
    });
    if (!employee) throw new Error("digital employee not found");

    const githubResource = (employee.linked_resources ?? []).find(
      (r: { kind: string; enabled: boolean }) =>
        r.kind === "github" && r.enabled
    );
    if (!githubResource) {
      throw new Error(
        "this employee has no enabled github resource — link a repo first"
      );
    }
    const cfg = githubResource.config as { owner?: string; repo?: string };
    if (!cfg?.owner || !cfg?.repo) {
      throw new Error("github resource is missing owner/repo");
    }

    const { generateIssueDraft } = await import("../lib/claude");
    const draft = await generateIssueDraft(
      args.brief,
      { owner: cfg.owner, repo: cfg.repo },
      { role: employee.role, employee_name: employee.name }
    );

    const { createIssue } = await import("../lib/github");
    const result = await createIssue({
      owner: cfg.owner,
      repo: cfg.repo,
      title: draft.title,
      body: draft.body,
      labels: draft.labels,
    });

    if (!result.ok) {
      return {
        ok: false,
        simulated: result.simulated,
        issue_url: "",
        issue_number: 0,
        title: draft.title,
        error: result.error,
      };
    }

    const issue_record_id = await ctx.runMutation(api.githubIssues.create, {
      digital_employee_id: args.digital_employee_id,
      owner: cfg.owner,
      repo: cfg.repo,
      issue_number: result.issue_number,
      issue_url: result.issue_url,
      title: draft.title,
      body: draft.body,
      labels: draft.labels,
      task_brief: args.brief,
      simulated: result.simulated,
    });

    return {
      ok: true,
      simulated: result.simulated,
      issue_url: result.issue_url,
      issue_number: result.issue_number,
      title: draft.title,
      issue_record_id,
    };
  },
});
