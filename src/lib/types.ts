export type Status = "proven" | "missing" | "contradicted" | "unverifiable";

export const STATUSES: Status[] = ["contradicted", "missing", "unverifiable", "proven"];

/** A message the user wrote. Assistant messages never become SourceMessages. */
export interface SourceMessage {
  id: string;
  /** 1-based position among the user's messages. */
  index: number;
  timestamp?: string;
  text: string;
}

export interface AgentClaim {
  text: string;
  id?: string;
  timestamp?: string;
}

export interface Conversation {
  source: "claude-jsonl" | "paste" | "demo";
  messages: SourceMessage[];
  /** The agent's last message, shown for contrast. Never used as evidence. */
  agentClaim?: AgentClaim;
  stats: {
    records: number;
    userMessages: number;
    skipped: number;
    malformed: number;
    redactions: number;
  };
}

export type Polarity = "require" | "forbid";
export type Cue = "correction" | "cancel";

/** One atomic requirement, cut from a single user message. */
export interface Atom {
  id: string;
  messageId: string;
  messageIndex: number;
  timestamp?: string;
  /** Exact substring of the user's message. */
  quote: string;
  title: string;
  priority?: "high" | "low";
  concept: string;
  value?: string;
  polarity: Polarity;
  keywords: string[];
  cue?: Cue;
}

export interface ExcludedSegment {
  messageId: string;
  messageIndex: number;
  quote: string;
  reason: string;
}

export type Relation = "original" | "supersedes" | "refines" | "cancels" | "potential-conflict";

export interface Revision {
  atom: Atom;
  relation: Relation;
  note: string;
}

export interface RequirementChain {
  /** Stable across reruns: derived from the first atom. */
  id: string;
  concept: string;
  revisions: Revision[];
  state: "active" | "cancelled";
  review?: { withChainId: string; atomId: string; note: string };
}

export type EvidenceRole = "supports" | "conflicts" | "candidate";

export interface Evidence {
  file: string;
  startLine: number;
  endLine: number;
  /** Exact lines startLine..endLine from the file (secrets redacted). */
  excerpt: string;
  role: EvidenceRole;
  why: string;
  redacted?: boolean;
}

export type Method = "static-pattern" | "static-absence" | "keyword-candidates" | "not-checked";

export interface Evaluation {
  status: Status;
  ruleId: string;
  ruleLabel: string;
  method: Method;
  summary: string;
  reasoning: string;
  uncertainty: string;
  expectation: string;
  evidence: Evidence[];
  filesScanned: number;
  scopeFiles: string[];
  runtimeCheckNeeded: boolean;
}

export interface RequirementResult {
  chainId: string;
  evaluation: Evaluation;
  previousStatus?: Status;
}

export interface Override {
  status: Status;
  note: string;
  at: string;
}

export interface RepoFile {
  path: string;
  content: string;
}

export type RepoRef =
  | { kind: "demo"; label: string; snapshot: string }
  | { kind: "github"; label: string; owner: string; repo: string; ref: string }
  | { kind: "folder"; label: string }
  | { kind: "none"; label: string };

export interface AuditRun {
  at: string;
  repoLabel: string;
  counts: Record<Status, number>;
}

export interface Audit {
  id: string;
  name: string;
  createdAt: string;
  analyzedAt: string;
  conversation: Conversation;
  repo: RepoRef;
  extraction: "rule-based";
  atoms: Atom[];
  excluded: ExcludedSegment[];
  chains: RequirementChain[];
  results: RequirementResult[];
  overrides: Record<string, Override>;
  /** atomId → how the user resolved a potential conflict. */
  resolutions: Record<string, "supersede" | "keep">;
  runs: AuditRun[];
  filesScanned: number;
  isSample?: boolean;
}
