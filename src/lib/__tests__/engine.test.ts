import { describe, expect, it } from "vitest";
import { createAudit, effectiveStatus, rerunAudit, resolveConflict, statusCounts } from "../audit";
import { demoConversation } from "../demo/conversation";
import { SNAPSHOTS } from "../demo/repo";
import { extractRequirements } from "../extract/extract";
import { applicableRevisions, buildChains, latestAtom } from "../extract/revisions";
import { evaluateChain } from "../evidence/engine";
import { indexFiles, safeRelativePath, shouldScan } from "../evidence/repo";
import { generateFixPrompt } from "../fix-prompt";
import { parseClaudeJsonl } from "../ingest/claude-jsonl";
import { parsePastedConversation } from "../ingest/paste";
import { redactSecrets } from "../redact";
import type { Audit, RepoFile, SourceMessage, Status } from "../types";

const msgs = (...texts: string[]): SourceMessage[] =>
  texts.map((text, i) => ({ id: `m${i + 1}`, index: i + 1, text }));

function demoAudit(snapshot = 0): Audit {
  return createAudit({
    name: "Sample",
    conversation: demoConversation(),
    repo: { kind: "demo", label: SNAPSHOTS[snapshot].sha, snapshot: SNAPSHOTS[snapshot].id },
    files: SNAPSHOTS[snapshot].files,
    isSample: true,
  });
}

function statusByTitle(audit: Audit): Record<string, Status> {
  const out: Record<string, Status> = {};
  for (const r of audit.results) {
    const chain = audit.chains.find((c) => c.id === r.chainId)!;
    out[latestAtom(chain).title] = r.evaluation.status;
  }
  return out;
}

function auditFor(texts: string[], files: RepoFile[]): Audit {
  const conversation = parsePastedConversation(texts.join("\n\n"));
  return createAudit({ name: "t", conversation, repo: { kind: "none", label: "test" }, files });
}

describe("requirement extraction", () => {
  it("splits one sentence into atomic requirements with exact quotes", () => {
    const m = msgs("Add a booking page, use IST, remove login, and send a confirmation email.");
    const { atoms } = extractRequirements(m);
    expect(atoms.map((a) => a.quote)).toEqual([
      "Add a booking page",
      "use IST",
      "remove login",
      "send a confirmation email",
    ]);
    for (const a of atoms) expect(m[0].text).toContain(a.quote);
    expect(atoms.find((a) => a.quote === "remove login")?.polarity).toBe("forbid");
    expect(atoms.find((a) => a.quote === "use IST")).toMatchObject({ concept: "timezone", value: "IST" });
    expect(atoms.find((a) => a.quote.includes("email"))?.concept).toBe("email");
  });

  it("tolerates dictation typos and skips session chatter", () => {
    const { atoms, excluded } = extractRequirements(
      msgs("so remov the new car and place the old one", "Can you open the localhost link?", "ok do it", "thanks!"),
    );
    expect(atoms.map((a) => a.title)).toEqual(["Remove the new car", "Place the old one"]);
    expect(atoms[0].polarity).toBe("forbid");
    expect(excluded.map((e) => e.reason)).toEqual(
      expect.arrayContaining(["Request about the session, not the product"]),
    );
    expect(excluded.some((e) => e.quote.startsWith("ok do it"))).toBe(true);
  });

  it("keeps conditional clauses attached to their instruction", () => {
    const { atoms } = extractRequirements(msgs("If the booking fails, show a clear error message."));
    expect(atoms).toHaveLength(1);
    expect(atoms[0].title).toBe("If the booking fails, show a clear error message");
    expect(atoms[0].concept).toBe("error-handling");
  });

  it("detects priority only when the wording supports it", () => {
    const { atoms } = extractRequirements(msgs("Phone numbers must have 10 digits.", "Add dark mode if possible.", "Add a footer."));
    expect(atoms.map((a) => a.priority)).toEqual(["high", "low", undefined]);
  });

  it("never uses assistant messages as requirement sources", () => {
    const conv = parsePastedConversation("User: Add a footer with contact links.\nAssistant: Done! I also added a blog section.");
    expect(conv.messages).toHaveLength(1);
    const { atoms } = extractRequirements(conv.messages);
    expect(atoms.map((a) => a.title)).toEqual(["Add a footer with contact links"]);
    expect(conv.agentClaim?.text).toContain("Done!");
  });
});

describe("corrections and revision history", () => {
  it("supersedes UTC with IST and keeps the history", () => {
    const { atoms } = extractRequirements(
      msgs("Display times in UTC.", "Change all displayed times to IST.", "Remove the timezone selector."),
    );
    const chains = buildChains(atoms);
    const tz = chains.find((c) => c.concept === "timezone")!;
    expect(tz.revisions.map((r) => r.relation)).toEqual(["original", "supersedes"]);
    expect(latestAtom(tz).value).toBe("IST");
    expect(applicableRevisions(tz).map((r) => r.atom.value)).toEqual(["IST"]);
    const selector = chains.find((c) => c.concept === "timezone-selector")!;
    expect(selector.revisions).toHaveLength(1);
    expect(latestAtom(selector).polarity).toBe("forbid");
  });

  it("cancels a dropped request without deleting it", () => {
    const { atoms } = extractRequirements(msgs("Send a confirmation email to the patient.", "Never mind the confirmation email."));
    const chains = buildChains(atoms);
    expect(chains).toHaveLength(1);
    expect(chains[0].state).toBe("cancelled");
    expect(chains[0].revisions.map((r) => r.relation)).toEqual(["original", "cancels"]);
  });

  it("treats compatible detail as a refinement", () => {
    const { atoms } = extractRequirements(msgs("Validate phone numbers.", "Phone numbers must be +91 followed by 10 digits."));
    const chains = buildChains(atoms);
    expect(chains).toHaveLength(1);
    expect(chains[0].revisions.map((r) => r.relation)).toEqual(["original", "refines"]);
  });

  it("flags an ambiguous change for human review instead of guessing", () => {
    const { atoms } = extractRequirements(msgs("Show times in UTC.", "Show times in IST."));
    const chains = buildChains(atoms);
    expect(chains).toHaveLength(2);
    expect(chains[1].revisions[0].relation).toBe("potential-conflict");
    expect(chains[0].review?.withChainId).toBe(chains[1].id);

    const asCorrection = buildChains(atoms, { [atoms[1].id]: "supersede" });
    expect(asCorrection).toHaveLength(1);
    expect(asCorrection[0].revisions.map((r) => r.relation)).toEqual(["original", "supersedes"]);

    const keepBoth = buildChains(atoms, { [atoms[1].id]: "keep" });
    expect(keepBoth).toHaveLength(2);
    expect(keepBoth.every((c) => !c.review)).toBe(true);
  });
});

describe("sample audit (illustrative data, real engine)", () => {
  it("classifies the agent's 'done' commit", () => {
    const audit = demoAudit(0);
    expect(statusByTitle(audit)).toEqual({
      "Patients should be able to book without logging in": "contradicted",
      "Add a booking form with name, phone and a time slot": "proven",
      "Save every booking to the database": "proven",
      "Change all displayed times to IST — our patients are in Kerala": "contradicted",
      "After booking, show a confirmation screen with the appointment details": "proven",
      "Send a confirmation email to the patient": "missing",
      "Phone numbers must be Indian: +91 followed by 10 digits": "missing",
      "Remove the timezone selector, nobody needs it now": "contradicted",
      "If the booking fails, show a clear error message instead of a blank screen": "proven",
      "Ensure the page works on mobile": "unverifiable",
      "Show a loading spinner while the booking is submitting": "proven",
    });
    expect(statusCounts(audit)).toEqual({ proven: 5, contradicted: 3, missing: 2, unverifiable: 1 });
  });

  it("changes status only where the fix commit adds evidence", () => {
    const after = rerunAudit(demoAudit(0), SNAPSHOTS[1].files, { kind: "demo", label: "7be21d4", snapshot: "v2" });
    expect(statusCounts(after)).toEqual({ proven: 10, contradicted: 0, missing: 0, unverifiable: 1 });
    const mobile = after.results.find((r) => r.evaluation.ruleId === "responsive")!;
    expect(mobile.evaluation.status).toBe("unverifiable");
    expect(mobile.previousStatus).toBe("unverifiable");
    const tz = after.results.find((r) => r.evaluation.ruleId === "timezone")!;
    expect(tz.previousStatus).toBe("contradicted");
    expect(after.runs).toHaveLength(2);
  });

  it("only cites real files, real line numbers and exact text", () => {
    for (const [i, snap] of SNAPSHOTS.entries()) {
      const audit = i === 0 ? demoAudit(0) : rerunAudit(demoAudit(0), snap.files);
      const files = new Map(snap.files.map((f) => [f.path, f.content.split("\n")]));
      let count = 0;
      for (const r of audit.results) {
        for (const e of r.evaluation.evidence) {
          const lines = files.get(e.file);
          expect(lines, `${e.file} exists in ${snap.sha}`).toBeDefined();
          expect(e.startLine).toBeGreaterThanOrEqual(1);
          expect(e.endLine).toBeGreaterThanOrEqual(e.startLine);
          expect(e.excerpt).toBe(lines!.slice(e.startLine - 1, e.endLine).join("\n"));
          count++;
        }
      }
      expect(count).toBeGreaterThan(5);
    }
  });

  it("never treats the README's 'all requirements implemented' claim as evidence", () => {
    const audit = demoAudit(0);
    const cited = audit.results.flatMap((r) => r.evaluation.evidence.map((e) => e.file));
    expect(cited).not.toContain("README.md");
  });

  it("keeps human overrides across reruns and reports them separately", () => {
    const audit = demoAudit(0);
    const mobile = audit.results.find((r) => r.evaluation.ruleId === "responsive")!;
    const withOverride = { ...audit, overrides: { [mobile.chainId]: { status: "proven" as Status, note: "Checked at 375px", at: "x" } } };
    const after = rerunAudit(withOverride, SNAPSHOTS[1].files);
    expect(effectiveStatus(after, mobile.chainId)).toBe("proven");
    expect(after.results.find((r) => r.chainId === mobile.chainId)!.evaluation.status).toBe("unverifiable");
  });
});

describe("false-positive guards", () => {
  it("does not prove an email requirement from a helper that is never called", () => {
    const audit = auditFor(["Send a confirmation email after booking."], [
      { path: "src/lib/email.ts", content: "export async function sendConfirmationEmail(to: string) {\n  await resend.emails.send({ to });\n}\n" },
    ]);
    expect(audit.results[0].evaluation.status).toBe("missing");
  });

  it("does not prove anything from comments", () => {
    const audit = auditFor(["Display all times in IST."], [
      { path: "src/time.ts", content: "// TODO: format with timeZone: 'Asia/Kolkata'\nexport const fmt = (d: Date) => d.toLocaleString();\n" },
    ]);
    expect(audit.results[0].evaluation.status).toBe("missing");
  });

  it("does not count a list of selectable zones as formatting in that zone", () => {
    const audit = auditFor(["Display all times in IST."], [
      {
        path: "src/components/TimezoneSelect.tsx",
        content: 'const ZONES = ["UTC", "Asia/Kolkata"];\n\nexport function TimezoneSelect({ onChange }: { onChange: (tz: string) => void }) {\n  return null;\n}\n',
      },
    ]);
    expect(audit.results[0].evaluation.status).toBe("missing");
  });

  it("never marks a requirement proven from keyword matches alone", () => {
    const audit = auditFor(["Add a FAQ accordion to the pricing page."], [
      { path: "src/app/pricing/page.tsx", content: "export default function Pricing() {\n  return <section><h2>FAQ</h2><Accordion items={faq} /></section>;\n}\n" },
    ]);
    const ev = audit.results[0].evaluation;
    expect(ev.status).toBe("unverifiable");
    expect(ev.method).toBe("keyword-candidates");
    expect(ev.evidence.every((e) => e.role === "candidate")).toBe(true);
  });

  it("reports MISSING, not CONTRADICTED, when nothing is found", () => {
    const audit = auditFor(["Save every order to the database."], [
      { path: "src/app/orders/page.tsx", content: "export default function Orders() {\n  return <p>Orders</p>;\n}\n" },
    ]);
    expect(audit.results[0].evaluation.status).toBe("missing");
  });

  it("keeps everything unverifiable without a repository", () => {
    const audit = auditFor(["Use IST for all times.", "Send a confirmation email."], []);
    expect(audit.results.every((r) => r.evaluation.status === "unverifiable")).toBe(true);
  });

  it("keeps runtime-only requirements unverifiable even with supporting hints", () => {
    const audit = auditFor(["Make sure the page is responsive on mobile."], [
      { path: "src/page.tsx", content: 'export default () => <div className="grid sm:grid-cols-2 md:gap-6" />;\n' },
    ]);
    expect(audit.results[0].evaluation.status).toBe("unverifiable");
    expect(audit.results[0].evaluation.runtimeCheckNeeded).toBe(true);
  });

  it("requires affirmative conflicting evidence for CONTRADICTED", () => {
    const files: RepoFile[] = [{ path: "src/lib/time.ts", content: 'export const f = (d: Date) => d.toLocaleString("en-IN", { timeZone: "UTC" });\n' }];
    const audit = auditFor(["Show all times in IST."], files);
    const ev = audit.results[0].evaluation;
    expect(ev.status).toBe("contradicted");
    expect(ev.evidence[0]).toMatchObject({ role: "conflicts", file: "src/lib/time.ts", startLine: 1 });
  });

  it("does not scan dependencies, env files or docs", () => {
    const indexed = indexFiles([
      { path: "node_modules/x/index.js", content: "timeZone: 'Asia/Kolkata'" },
      { path: ".env", content: "SECRET=1" },
      { path: "docs/notes.md", content: "done" },
      { path: "src/app.tsx", content: "x" },
    ]);
    expect(indexed.map((f) => f.path)).toEqual(["src/app.tsx"]);
  });
});

describe("evaluateChain directly", () => {
  it("reports when the scope has no files", () => {
    const { atoms } = extractRequirements(msgs("Remove the timezone selector."));
    const [chain] = buildChains(atoms);
    const ev = evaluateChain(chain, indexFiles([{ path: "src/server.ts", content: "export {}" }]));
    expect(ev.status).toBe("unverifiable");
    expect(ev.method).toBe("not-checked");
  });
});

describe("imports", () => {
  const jsonl = [
    JSON.stringify({ type: "user", uuid: "u1", timestamp: "2026-10-01T10:00:00Z", message: { role: "user", content: "Add a pricing page with three tiers." } }),
    "{ this is not json",
    JSON.stringify({ type: "assistant", uuid: "a1", message: { role: "assistant", content: [{ type: "text", text: "All done ✅" }] } }),
    JSON.stringify({ type: "user", uuid: "u2", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] }, toolUseResult: {} }),
    JSON.stringify({ type: "user", uuid: "u3", isMeta: true, message: { role: "user", content: "Continue from where you left off." } }),
    JSON.stringify({ type: "user", uuid: "u4", message: { role: "user", content: "<command-name>/clear</command-name>" } }),
    JSON.stringify({ type: "user", uuid: "u5", message: { role: "user", content: [{ type: "text", text: "[Image #1] Use my key sk-ant-abcdefghijklmnopqrstuvwxyz123 and make the header sticky" }] } }),
    JSON.stringify({ type: "attachment", uuid: "x1" }),
    JSON.stringify(["not", "an", "object"]),
    JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "Add a pricing page with three tiers." } }),
  ].join("\n");

  it("reads only user-typed text from Claude Code logs and survives malformed lines", () => {
    const conv = parseClaudeJsonl(jsonl);
    expect(conv.messages.map((m) => m.id)).toEqual(["u1", "u5"]);
    expect(conv.messages[0]).toMatchObject({ index: 1, timestamp: "2026-10-01T10:00:00Z" });
    expect(conv.stats.malformed).toBe(2);
    expect(conv.agentClaim?.text).toBe("All done ✅");
  });

  it("redacts secrets before anything is stored", () => {
    const conv = parseClaudeJsonl(jsonl);
    expect(conv.messages[1].text).not.toContain("sk-ant-");
    expect(conv.messages[1].text).toContain("[redacted key]");
    expect(conv.messages[1].text).not.toContain("[Image");
    expect(conv.stats.redactions).toBe(1);
    expect(redactSecrets('password = "hunter2hunter2"').text).toBe('password = "[redacted]"');
  });

  it("handles an empty or garbage log without throwing", () => {
    expect(parseClaudeJsonl("").messages).toEqual([]);
    expect(parseClaudeJsonl("garbage\n\n{").stats.malformed).toBe(2);
  });

  it("parses plain pasted text as one message per paragraph", () => {
    const conv = parsePastedConversation("Add a footer.\n\nUse IST everywhere.");
    expect(conv.messages.map((m) => m.text)).toEqual(["Add a footer.", "Use IST everywhere."]);
  });

  it("parses Claude Code terminal transcripts", () => {
    const conv = parsePastedConversation("> add a contact form\n⏺ Added it.\n> also validate the email field");
    expect(conv.messages.map((m) => m.text)).toEqual(["add a contact form", "also validate the email field"]);
  });
});

describe("paths", () => {
  it("rejects traversal and normalises separators", () => {
    expect(safeRelativePath("../etc/passwd")).toBeNull();
    expect(safeRelativePath("src/../../x")).toBeNull();
    expect(safeRelativePath("src\\app\\page.tsx")).toBe("src/app/page.tsx");
    expect(shouldScan(".env.local")).toBe(false);
    expect(shouldScan("src/app/page.tsx", 10)).toBe(true);
    expect(shouldScan("src/big.ts", 10_000_000)).toBe(false);
  });
});

describe("fix prompt", () => {
  it("contains only the selected gaps, the superseded wording and real evidence", () => {
    const audit = demoAudit(0);
    const unresolved = audit.results.filter((r) => ["contradicted", "missing"].includes(r.evaluation.status)).map((r) => r.chainId);
    const prompt = generateFixPrompt(audit, unresolved);
    expect(prompt).toContain("found 5 requirements that aren't done");
    expect(prompt).toContain('This replaces what I said earlier (message 2): "Display all appointment times in UTC"');
    expect(prompt).toContain("src/lib/time.ts:11");
    expect(prompt).toContain('timeZone: "UTC",');
    expect(prompt).toContain("Don't break what already works:");
    expect(prompt).not.toMatch(/^\d+\. Show a loading spinner/m);
    expect(prompt).toMatch(/file and line range/);
  });

  it("returns nothing when nothing is selected", () => {
    expect(generateFixPrompt(demoAudit(0), [])).toBe("");
  });
});

describe("conflict resolution", () => {
  it("re-evaluates after the user confirms a correction", () => {
    const files: RepoFile[] = [{ path: "src/t.ts", content: 'export const f = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });\n' }];
    const audit = auditFor(["Show times in UTC.", "Show times in IST."], files);
    expect(audit.results).toHaveLength(2);
    const atom = audit.atoms[1];
    const resolved = resolveConflict(audit, atom.id, "supersede", files);
    expect(resolved.results).toHaveLength(1);
    expect(resolved.results[0].evaluation.status).toBe("proven");
  });
});
