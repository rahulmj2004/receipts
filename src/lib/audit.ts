import { extractRequirements } from "./extract/extract";
import { buildChains, latestAtom } from "./extract/revisions";
import { evaluateChain } from "./evidence/engine";
import { indexFiles } from "./evidence/repo";
import type { Audit, Conversation, RepoFile, RepoRef, RequirementChain, RequirementResult, Status } from "./types";

export function emptyCounts(): Record<Status, number> {
  return { proven: 0, missing: 0, contradicted: 0, unverifiable: 0 };
}

export function evaluateAll(chains: RequirementChain[], files: RepoFile[], previous?: RequirementResult[]) {
  const indexed = indexFiles(files);
  const prev = new Map(previous?.map((r) => [r.chainId, r.evaluation.status]));
  const results: RequirementResult[] = chains
    .filter((c) => c.state === "active")
    .map((c) => ({
      chainId: c.id,
      evaluation: evaluateChain(c, indexed),
      ...(prev.has(c.id) ? { previousStatus: prev.get(c.id) } : {}),
    }));
  return { results, filesScanned: indexed.length };
}

function countsOf(results: RequirementResult[]): Record<Status, number> {
  const counts = emptyCounts();
  for (const r of results) counts[r.evaluation.status]++;
  return counts;
}

export function createAudit(args: {
  name: string;
  conversation: Conversation;
  repo: RepoRef;
  files: RepoFile[];
  isSample?: boolean;
  now?: Date;
}): Audit {
  const now = (args.now ?? new Date()).toISOString();
  const { atoms, excluded } = extractRequirements(args.conversation.messages);
  const chains = buildChains(atoms);
  const { results, filesScanned } = evaluateAll(chains, args.files);
  return {
    id: args.isSample ? "sample" : `audit-${Date.now().toString(36)}`,
    name: args.name,
    createdAt: now,
    analyzedAt: now,
    conversation: args.conversation,
    repo: args.repo,
    extraction: "rule-based",
    atoms,
    excluded,
    chains,
    results,
    overrides: {},
    resolutions: {},
    runs: [{ at: now, repoLabel: args.repo.label, counts: countsOf(results) }],
    filesScanned,
    isSample: args.isSample,
  };
}

/** Re-check the same requirements against new code. Keeps overrides; records what changed. */
export function rerunAudit(audit: Audit, files: RepoFile[], repo: RepoRef = audit.repo, now = new Date()): Audit {
  const chains = buildChains(audit.atoms, audit.resolutions);
  const { results, filesScanned } = evaluateAll(chains, files, audit.results);
  const at = now.toISOString();
  return {
    ...audit,
    repo,
    chains,
    results,
    filesScanned,
    analyzedAt: at,
    runs: [...audit.runs, { at, repoLabel: repo.label, counts: countsOf(results) }],
  };
}

/** Apply the user's decision about a potential conflict, then re-evaluate. */
export function resolveConflict(audit: Audit, atomId: string, choice: "supersede" | "keep", files: RepoFile[]): Audit {
  const next = { ...audit, resolutions: { ...audit.resolutions, [atomId]: choice } };
  const chains = buildChains(next.atoms, next.resolutions);
  const { results, filesScanned } = evaluateAll(chains, files, audit.results);
  return { ...next, chains, results, filesScanned };
}

export function effectiveStatus(audit: Audit, chainId: string): Status | undefined {
  const o = audit.overrides[chainId];
  if (o) return o.status;
  return audit.results.find((r) => r.chainId === chainId)?.evaluation.status;
}

export function statusCounts(audit: Audit): Record<Status, number> {
  const counts = emptyCounts();
  for (const r of audit.results) counts[effectiveStatus(audit, r.chainId)!]++;
  return counts;
}

export function chainById(audit: Audit, id: string): RequirementChain | undefined {
  return audit.chains.find((c) => c.id === id);
}

export const STATUS_ORDER: Record<Status, number> = { contradicted: 0, missing: 1, unverifiable: 2, proven: 3 };

export function isUnresolved(s: Status): boolean {
  return s === "contradicted" || s === "missing";
}

export function titleOf(chain: RequirementChain): string {
  return latestAtom(chain).title;
}
