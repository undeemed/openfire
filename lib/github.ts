/**
 * GitHub REST client — used by digital employees that have a github
 * resource linked. Authenticates with a personal access token from
 * `GITHUB_TOKEN` and creates issues against the linked repo.
 *
 * If GITHUB_TOKEN is unset the calls fall back to a deterministic
 * simulated response so demos run without any real GitHub side-effects.
 */

const API_BASE = "https://api.github.com";

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface CreateIssueParams extends GitHubRepoRef {
  title: string;
  body: string;
  labels?: string[];
  /** Override the default token (else `GITHUB_TOKEN`). */
  token?: string;
}

export interface CreateIssueResult {
  ok: boolean;
  simulated: boolean;
  issue_url: string;
  issue_number: number;
  /** Server-side error message when ok=false. */
  error?: string;
}

/**
 * Parse "owner/repo" or a https://github.com/owner/repo[/...] URL into a
 * structured ref. Returns null when the input is unrecognizable.
 */
export function parseRepoRef(input: string): GitHubRepoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // URL form
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)/i
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2].replace(/\.git$/, ""),
    };
  }
  // owner/repo shorthand
  const slashMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (slashMatch) {
    return { owner: slashMatch[1], repo: slashMatch[2] };
  }
  return null;
}

export async function createIssue(
  params: CreateIssueParams
): Promise<CreateIssueResult> {
  const token = params.token ?? process.env.GITHUB_TOKEN;
  // Demo / no-token fallback so the rest of the agent loop still
  // completes; the persisted row records `simulated=true`.
  if (!token) {
    const fakeNumber = Math.floor(Math.random() * 9000) + 1000;
    return {
      ok: true,
      simulated: true,
      issue_number: fakeNumber,
      issue_url: `https://github.com/${params.owner}/${params.repo}/issues/${fakeNumber}`,
    };
  }

  const res = await fetch(
    `${API_BASE}/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        labels: params.labels,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      simulated: false,
      issue_number: 0,
      issue_url: "",
      error: `GitHub ${res.status}: ${text.slice(0, 400)}`,
    };
  }

  const data = (await res.json()) as {
    number?: number;
    html_url?: string;
  };
  return {
    ok: true,
    simulated: false,
    issue_number: data.number ?? 0,
    issue_url: data.html_url ?? "",
  };
}

/**
 * Probe whether the configured token has access to the given repo.
 * Used by the resource-link UI to confirm the repo is reachable before
 * letting the user dispatch a real task.
 */
export async function checkRepoAccess(
  ref: GitHubRepoRef,
  token?: string
): Promise<{ ok: boolean; error?: string; simulated: boolean }> {
  const t = token ?? process.env.GITHUB_TOKEN;
  if (!t) return { ok: true, simulated: true };
  const res = await fetch(
    `${API_BASE}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`,
    {
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (!res.ok) {
    return {
      ok: false,
      simulated: false,
      error: `GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  }
  return { ok: true, simulated: false };
}
