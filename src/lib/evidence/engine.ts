import { redactSecrets } from "../redact";
import { applicableRevisions, latestAtom } from "../extract/revisions";
import type { Evaluation, Evidence, EvidenceRole, RequirementChain } from "../types";
import type { IndexedFile } from "./repo";
import { specFor, type CheckSpec, type Pattern } from "./rules";

const MAX_HITS_PER_PATTERN = 6;
const MAX_HITS_PER_FILE = 3;
const MAX_SPAN = 9;
/** Comments describe intent, not behavior, so they never count as evidence. */
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#|<!--|\{\s*\/\*)/;

function test(re: RegExp, s: string): boolean {
  re.lastIndex = 0;
  return re.test(s);
}

/** Every hit is read straight from the file: path, 1-based lines and the exact text. */
export function findHits(files: IndexedFile[], p: Pattern, role: EvidenceRole): Evidence[] {
  const hits: Evidence[] = [];
  for (const f of files) {
    if (p.fileMust && !test(p.fileMust, f.lines.join("\n"))) continue;
    if (p.fileMustNot && test(p.fileMustNot, f.lines.join("\n"))) continue;
    let inFile = 0;
    for (let i = 0; i < f.lines.length; i++) {
      const line = f.lines[i];
      if (line.length > 2000 || COMMENT_LINE.test(line) || !test(p.re, line)) continue;
      if (p.skipLine && test(p.skipLine, line)) continue;
      let start = i;
      let end = i;
      if (p.near) {
        const w = p.window ?? 3;
        let found = -1;
        for (let j = Math.max(0, i - w); j <= Math.min(f.lines.length - 1, i + w); j++) {
          if (test(p.near, f.lines[j])) {
            found = j;
            break;
          }
        }
        if (found < 0) continue;
        start = Math.min(i, found);
        end = Math.max(i, found);
        if (end - start + 1 > MAX_SPAN) continue;
      }
      const raw = f.lines.slice(start, end + 1).join("\n");
      const { text, count } = redactSecrets(raw);
      hits.push({
        file: f.path,
        startLine: start + 1,
        endLine: end + 1,
        excerpt: text,
        role,
        why: p.why,
        ...(count > 0 ? { redacted: true } : {}),
      });
      inFile++;
      if (inFile >= MAX_HITS_PER_FILE || hits.length >= MAX_HITS_PER_PATTERN) break;
    }
    if (hits.length >= MAX_HITS_PER_PATTERN) break;
  }
  return hits;
}

function collect(files: IndexedFile[], patterns: Pattern[] | undefined, role: EvidenceRole): Evidence[] {
  const out: Evidence[] = [];
  for (const p of patterns ?? []) {
    for (const h of findHits(files, p, role)) {
      const overlaps = out.some((o) => o.file === h.file && h.startLine <= o.endLine && o.startLine <= h.endLine);
      if (!overlaps) out.push(h);
    }
  }
  return out;
}

const loc = (e: Evidence) => `${e.file}:${e.startLine}${e.endLine > e.startLine ? `-${e.endLine}` : ""}`;

/** Keyword candidates for requirements without a curated rule: lines mentioning several keywords. */
function keywordCandidates(files: IndexedFile[], spec: CheckSpec): Evidence[] {
  const pats = spec.candidates ?? [];
  if (pats.length === 0) return [];
  const minScore = pats.length >= 2 ? 2 : 1;
  const scored: { e: Evidence; score: number }[] = [];
  for (const f of files) {
    f.lines.forEach((line, i) => {
      if (line.length > 400 || COMMENT_LINE.test(line)) return;
      const matched = pats.filter((p) => test(p.re, line));
      if (matched.length < minScore) return;
      scored.push({
        score: matched.length,
        e: {
          file: f.path,
          startLine: i + 1,
          endLine: i + 1,
          excerpt: redactSecrets(line).text,
          role: "candidate",
          why: `Mentions ${matched.map((p) => p.why.match(/"([^"]+)"/)?.[1]).filter(Boolean).join(", ")}. Matching names aren't proof of behavior.`,
        },
      });
    });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.e);
}

export function evaluateChain(chain: RequirementChain, allFiles: IndexedFile[]): Evaluation {
  const spec = specFor(chain, allFiles);
  const files = allFiles.filter(spec.scope);
  const base = {
    ruleId: spec.ruleId,
    ruleLabel: spec.label,
    expectation: spec.expectation,
    uncertainty: spec.uncertainty,
    filesScanned: allFiles.length,
    scopeFiles: files.map((f) => f.path),
    runtimeCheckNeeded: false,
  };

  if (allFiles.length === 0) {
    return {
      ...base,
      status: "unverifiable",
      method: "not-checked",
      summary: "No repository connected, so there's nothing to check against.",
      reasoning: "Connect a folder or a public GitHub repository and rerun the audit.",
      evidence: [],
    };
  }

  if (spec.ruleId === "keyword-search") {
    const evidence = keywordCandidates(allFiles, spec);
    const forbid = latestAtom(chain).polarity === "forbid";
    const distinctive = (spec.candidates ?? []).length > 0;
    if (evidence.length > 0) {
      return {
        ...base,
        status: "unverifiable",
        method: "keyword-candidates",
        summary: `${evidence.length} related line${evidence.length > 1 ? "s" : ""} found. A human needs to judge them.`,
        reasoning: forbid
          ? "These lines mention what you asked to remove. They might be leftovers, or harmless references."
          : "These lines mention the same things as the requirement. Matching names aren't proof that the behavior works.",
        evidence,
      };
    }
    if (!forbid && distinctive) {
      return {
        ...base,
        status: "missing",
        method: "keyword-candidates",
        summary: `Nothing related was found in ${allFiles.length} files.`,
        reasoning: `None of the requirement's key terms (${(spec.candidates ?? [])
          .map((p) => p.why.match(/"([^"]+)"/)?.[1])
          .join(", ")}) appear together in the code. Keyword search can miss renamed code, so treat this as a lead.`,
        evidence: [],
      };
    }
    return {
      ...base,
      status: "unverifiable",
      method: "keyword-candidates",
      summary: forbid ? "No leftovers found, but absence of a keyword isn't proof." : "Nothing specific enough to search for.",
      reasoning: forbid
        ? "No code mentions what you asked to remove. It may be gone, or it may be named differently. Check it yourself."
        : "The requirement doesn't contain distinctive terms to search for.",
      evidence: [],
    };
  }

  if (files.length === 0) {
    return {
      ...base,
      status: "unverifiable",
      method: "not-checked",
      summary: `No files in scope (${spec.scopeLabel}).`,
      reasoning: `This check looks at ${spec.scopeLabel}, and the repository has none, so it can't conclude anything.`,
      evidence: [],
    };
  }

  const conflicts = collect(files, spec.conflicts, "conflicts");
  const supports = collect(files, spec.supports, "supports");
  const candidates = collect(files, spec.candidates, "candidate");

  if (spec.mode === "runtime") {
    return {
      ...base,
      runtimeCheckNeeded: true,
      status: "unverifiable",
      method: "static-pattern",
      summary: "Needs a visual or runtime check. Code alone can't prove it.",
      reasoning:
        candidates.length > 0
          ? `Found ${candidates.length} hint${candidates.length > 1 ? "s" : ""} (${candidates.map(loc).slice(0, 2).join(", ")}), but hints aren't proof.`
          : "No related styles found either. Check it in a browser.",
      evidence: candidates,
    };
  }

  if (conflicts.length > 0) {
    const first = conflicts[0];
    return {
      ...base,
      status: "contradicted",
      method: "static-pattern",
      summary: `${first.why} (${loc(first)})`,
      reasoning:
        supports.length > 0
          ? `The code partly follows the requirement (${loc(supports[0])}), but ${conflicts.length} place${conflicts.length > 1 ? "s" : ""} contradict${conflicts.length > 1 ? "" : "s"} it.`
          : `${conflicts.length} place${conflicts.length > 1 ? "s directly contradict" : " directly contradicts"} the latest version of this requirement.`,
      evidence: [...conflicts, ...supports, ...candidates],
    };
  }

  if (spec.mode === "each") {
    const parts = (spec.each ?? []).map((e) => ({ label: e.label, hits: findHits(files, e.pattern, "supports").slice(0, 1) }));
    const missing = parts.filter((p) => p.hits.length === 0).map((p) => p.label);
    const evidence = parts.flatMap((p) => p.hits);
    if (parts.length === 0) {
      return { ...base, status: "unverifiable", method: "static-pattern", summary: "Couldn't tell which fields were requested.", reasoning: "", evidence };
    }
    if (missing.length === 0) {
      return {
        ...base,
        status: "proven",
        method: "static-pattern",
        summary: spec.provenSummary,
        reasoning: `Each requested field has a matching input: ${parts.map((p) => `${p.label} → ${loc(p.hits[0])}`).join("; ")}.`,
        evidence,
      };
    }
    return {
      ...base,
      status: "missing",
      method: "static-pattern",
      summary: `Missing field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
      reasoning: `Found ${parts.length - missing.length} of ${parts.length} requested fields. No input named ${missing.map((m) => `"${m}"`).join(" or ")} was found in ${files.length} UI files.`,
      evidence,
    };
  }

  if (spec.mode === "absence") {
    return {
      ...base,
      status: "proven",
      method: "static-absence",
      summary: spec.provenSummary,
      reasoning: `Scanned ${files.length} file${files.length > 1 ? "s" : ""} (${spec.scopeLabel}) for ${spec.conflicts.length} known pattern${spec.conflicts.length > 1 ? "s" : ""} and found none.`,
      evidence: candidates,
    };
  }

  if (supports.length > 0) {
    return {
      ...base,
      status: "proven",
      method: "static-pattern",
      summary: spec.provenSummary,
      reasoning: `${supports.length} supporting reference${supports.length > 1 ? "s" : ""}: ${supports
        .slice(0, 3)
        .map(loc)
        .join(", ")}. This is static code evidence; it wasn't executed.`,
      evidence: [...supports, ...candidates],
    };
  }

  const weak = collect(files, spec.weak, "candidate");
  if (weak.length > 0) {
    return {
      ...base,
      status: spec.weakStatus ?? "unverifiable",
      method: "static-pattern",
      summary: spec.weakSummary ?? "Only partial evidence was found.",
      reasoning: `Partial evidence at ${weak.slice(0, 2).map(loc).join(", ")}. It doesn't establish the full requirement${
        applicableRevisions(chain).length > 1 ? ", including the detail you added later" : ""
      }.`,
      evidence: [...weak, ...candidates],
    };
  }

  return {
    ...base,
    status: "missing",
    method: "static-pattern",
    summary: spec.missingSummary,
    reasoning: `No match for ${spec.supports.length} pattern${spec.supports.length > 1 ? "s" : ""} across ${files.length} file${files.length > 1 ? "s" : ""} (${spec.scopeLabel}). A missing match doesn't prove the feature is absent, but nothing here shows it exists.${
      candidates.length ? ` See the related ${candidates.length > 1 ? "lines" : "line"} below.` : ""
    }`,
    evidence: candidates,
  };
}
