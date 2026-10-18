import { applicableRevisions, latestAtom } from "./extract/revisions";
import { effectiveStatus } from "./audit";
import type { Audit, Evidence, Status } from "./types";

const LABEL: Record<Status, string> = {
  contradicted: "CONTRADICTED",
  missing: "MISSING",
  unverifiable: "NEEDS VERIFICATION",
  proven: "PROVEN",
};

function loc(e: Evidence): string {
  return `${e.file}:${e.startLine}${e.endLine > e.startLine ? `-${e.endLine}` : ""}`;
}

function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

/**
 * A follow-up prompt for the coding agent, containing only the selected gaps.
 * Built from the audit data alone; nothing here is sent anywhere.
 */
export function generateFixPrompt(audit: Audit, chainIds: string[]): string {
  const selected = audit.chains.filter((c) => chainIds.includes(c.id) && c.state === "active");
  if (selected.length === 0) return "";

  const results = new Map(audit.results.map((r) => [r.chainId, r.evaluation]));
  const lines: string[] = [];
  const n = selected.length;
  lines.push(
    `Your last change was reported as complete, but checking the code against my instructions found ${n} requirement${n > 1 ? "s" : ""} that ${n > 1 ? "aren't" : "isn't"} done. Fix only these and keep everything else working.`,
  );
  lines.push("");

  selected.forEach((chain, i) => {
    const atom = latestAtom(chain);
    const ev = results.get(chain.id);
    const status = effectiveStatus(audit, chain.id) ?? "missing";
    lines.push(`${i + 1}. ${atom.title} [${LABEL[status]}]`);
    const applicable = applicableRevisions(chain);
    for (const r of applicable) {
      lines.push(`   I asked (message ${r.atom.messageIndex}): "${r.atom.quote}"`);
    }
    const replaced = chain.revisions.filter((r) => !applicable.includes(r) && r.relation !== "cancels");
    for (const r of replaced) {
      lines.push(`   This replaces what I said earlier (message ${r.atom.messageIndex}): "${r.atom.quote}". Don't follow the earlier version.`);
    }
    if (ev) {
      const problem =
        status === "contradicted"
          ? `What the code does now: ${ev.summary}`
          : status === "missing"
            ? `What's missing: ${ev.summary}`
            : `Why it's unconfirmed: ${ev.summary}`;
      lines.push(`   ${problem}`);
      const shown = ev.evidence.filter((e) => e.role === "conflicts").slice(0, 2);
      const fallback = shown.length ? shown : ev.evidence.filter((e) => e.role === "candidate").slice(0, 1);
      for (const e of fallback) {
        lines.push(`   ${e.role === "conflicts" ? "Conflicting code" : "Related code"}: ${loc(e)}`);
        lines.push(indent(e.excerpt.split("\n").slice(0, 4).join("\n").trimEnd(), "      "));
      }
      lines.push(`   Expected: ${ev.expectation}`);
    }
    const override = audit.overrides[chain.id];
    if (override?.note) lines.push(`   Note from my review: ${override.note}`);
    lines.push("");
  });

  const proven = audit.chains
    .filter((c) => c.state === "active" && !chainIds.includes(c.id) && effectiveStatus(audit, c.id) === "proven")
    .map((c) => latestAtom(c).title);
  lines.push("Constraints:");
  if (proven.length) {
    lines.push(`- Don't break what already works: ${proven.slice(0, 6).join("; ")}${proven.length > 6 ? `; and ${proven.length - 6} more` : ""}.`);
  }
  lines.push("- Don't change unrelated files or behavior.");
  lines.push("");
  lines.push(
    "When you're done, for each numbered item give me the file and line range that implements it so I can verify it. Don't call an item done without that. If something needs a manual or browser check, say so instead of claiming it works.",
  );
  return lines.join("\n");
}
