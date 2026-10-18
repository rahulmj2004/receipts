import { MAX_FILE_BYTES, safeRelativePath, shouldScan } from "../evidence/repo";
import type { RepoFile } from "../types";

const MAX_GITHUB_FILES = 600;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export interface GithubTarget {
  owner: string;
  repo: string;
  ref?: string;
}

/** Accepts "owner/repo", https://github.com/owner/repo, …/tree/<branch>. */
export function parseGithubUrl(input: string): GithubTarget | null {
  const s = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const m =
    s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/([\w./-]+))?$/i) ??
    s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], ref: m[3] };
}

async function gh<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal });
  if (res.status === 404) throw new Error("Repository not found. Only public repositories can be read without signing in.");
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : "later";
    throw new Error(`GitHub's anonymous rate limit was reached. Try again after ${when}, or choose a local folder instead.`);
  }
  if (!res.ok) throw new Error(`GitHub returned ${res.status}.`);
  return res.json() as Promise<T>;
}

export interface LoadProgress {
  done: number;
  total: number;
}

/**
 * Reads a public repository straight from the browser. Nothing goes through a Receipts server.
 */
export async function loadGithubRepo(
  target: GithubTarget,
  onProgress?: (p: LoadProgress) => void,
  signal?: AbortSignal,
): Promise<{ files: RepoFile[]; ref: string; truncated: boolean; skipped: number }> {
  const base = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const ref = target.ref ?? (await gh<{ default_branch: string }>(base, signal)).default_branch;
  const tree = await gh<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
    `${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    signal,
  );

  const wanted = tree.tree.filter((t) => t.type === "blob" && shouldScan(t.path, t.size));
  let total = 0;
  const picked: typeof wanted = [];
  for (const t of wanted) {
    if (picked.length >= MAX_GITHUB_FILES || total + (t.size ?? 0) > MAX_TOTAL_BYTES) break;
    picked.push(t);
    total += t.size ?? 0;
  }

  const files: RepoFile[] = [];
  let done = 0;
  onProgress?.({ done, total: picked.length });
  const queue = [...picked];
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift()!;
      const path = safeRelativePath(item.path);
      if (!path) continue;
      const url = `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${encodeURIComponent(ref)}/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      try {
        const res = await fetch(url, { signal });
        if (res.ok) {
          const text = await res.text();
          if (text.length <= MAX_FILE_BYTES) files.push({ path, content: text });
        }
      } catch (e) {
        if (signal?.aborted) throw e;
      }
      done++;
      onProgress?.({ done, total: picked.length });
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return {
    files,
    ref,
    truncated: tree.truncated || picked.length < wanted.length,
    skipped: wanted.length - picked.length,
  };
}
