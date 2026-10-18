import { effectiveStatus, statusCounts } from "@/lib/audit";
import { latestAtom } from "@/lib/extract/revisions";
import type { Audit } from "@/lib/types";

const LABEL = { proven: "PROVEN", contradicted: "CONTRADICTED", missing: "MISSING", unverifiable: "UNVERIFIABLE" } as const;

export function auditToMarkdown(audit: Audit): string {
  const counts = statusCounts(audit);
  const out: string[] = [];
  out.push(`# Receipts audit: ${audit.name}`);
  out.push("");
  if (audit.isSample) out.push("_Illustrative sample project._", "");
  out.push(`- Repository: ${audit.repo.label}`);
  out.push(`- Analyzed: ${new Date(audit.analyzedAt).toISOString()}`);
  out.push(`- Method: rule-based extraction, static code checks (nothing executed)`);
  out.push(
    `- Result: ${counts.proven} proven · ${counts.contradicted} contradicted · ${counts.missing} missing · ${counts.unverifiable} unverifiable`,
  );
  out.push("");
  for (const r of audit.results) {
    const chain = audit.chains.find((c) => c.id === r.chainId);
    if (!chain) continue;
    const atom = latestAtom(chain);
    const status = effectiveStatus(audit, r.chainId)!;
    const override = audit.overrides[r.chainId];
    out.push(`## ${LABEL[status]} · ${atom.title}${override ? " (set by reviewer)" : ""}`);
    out.push(`> "${atom.quote}" (message ${atom.messageIndex})`);
    if (chain.revisions.length > 1) {
      out.push(`Revisions: ${chain.revisions.map((v) => `${v.relation} @ message ${v.atom.messageIndex}`).join(" → ")}`);
    }
    out.push("");
    out.push(r.evaluation.summary);
    for (const e of r.evaluation.evidence.slice(0, 3)) {
      out.push(`- ${e.role}: \`${e.file}:${e.startLine}${e.endLine > e.startLine ? `-${e.endLine}` : ""}\` (${e.why})`);
    }
    if (override?.note) out.push(`- Reviewer note: ${override.note}`);
    out.push("");
  }
  return out.join("\n");
}
