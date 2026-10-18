import { redactSecrets } from "../redact";
import type { AgentClaim, Conversation, SourceMessage } from "../types";

/**
 * Claude Code writes one JSON record per line to ~/.claude/projects/<project>/<session>.jsonl.
 * Records come in many shapes (assistant turns, tool results, attachments, snapshots, titles…).
 * Only user-typed text is treated as a requirement source; everything else is skipped.
 */

const WRAPPER_PREFIXES = [
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<local-command-stdout>",
  "<local-command-stderr>",
  "<local-command-caveat>",
  "<bash-input>",
  "<bash-stdout>",
  "<bash-stderr>",
  "<user-memory-input>",
  "[Request interrupted",
  "<task-notification>",
  "Caveat: The messages below",
];

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textBlocks(content: unknown): string[] {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      out.push(block.text);
    }
  }
  return out;
}

function cleanUserText(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (WRAPPER_PREFIXES.some((p) => trimmed.startsWith(p))) return null;
  const cleaned = trimmed
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/\[Image(?: #\d+)?(?::[^\]]*)?\]/g, "")
    .replace(/^\s*<\/?[a-z][\w-]*(?:\s[^>]*)?>\s*$/gim, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return cleaned || null;
}

export function parseClaudeJsonl(input: string): Conversation {
  const stats = { records: 0, userMessages: 0, skipped: 0, malformed: 0, redactions: 0 };
  const messages: SourceMessage[] = [];
  const seen = new Set<string>();
  let agentClaim: AgentClaim | undefined;

  const lines = input.split(/\r?\n/);
  lines.forEach((line, lineNo) => {
    if (!line.trim()) return;
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      stats.malformed++;
      return;
    }
    if (!isRecord(rec)) {
      stats.malformed++;
      return;
    }
    stats.records++;

    const msg = isRecord(rec.message) ? rec.message : undefined;
    const uuid = typeof rec.uuid === "string" ? rec.uuid : `line-${lineNo + 1}`;
    const timestamp = typeof rec.timestamp === "string" ? rec.timestamp : undefined;

    if (rec.type === "assistant" && msg?.role === "assistant" && rec.isSidechain !== true) {
      const text = textBlocks(msg.content).join("\n").trim();
      if (text) agentClaim = { text: redactSecrets(text).text, id: uuid, timestamp };
      return;
    }

    if (rec.type !== "user" || msg?.role !== "user") {
      stats.skipped++;
      return;
    }
    if (rec.isMeta === true || rec.isSidechain === true || rec.isCompactSummary === true || "toolUseResult" in rec) {
      stats.skipped++;
      return;
    }
    if (seen.has(uuid)) {
      stats.skipped++;
      return;
    }

    const parts = textBlocks(msg.content)
      .map(cleanUserText)
      .filter((t): t is string => t !== null);
    if (parts.length === 0) {
      stats.skipped++;
      return;
    }
    seen.add(uuid);
    const { text, count } = redactSecrets(parts.join("\n\n"));
    stats.redactions += count;
    messages.push({ id: uuid, index: messages.length + 1, timestamp, text });
  });

  stats.userMessages = messages.length;
  return { source: "claude-jsonl", messages, agentClaim, stats };
}
