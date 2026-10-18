"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Check, ClipboardPaste, FileJson, Loader2, Lock, Play, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { createAudit } from "@/lib/audit";
import { parseClaudeJsonl } from "@/lib/ingest/claude-jsonl";
import { parsePastedConversation } from "@/lib/ingest/paste";
import type { Conversation } from "@/lib/types";
import { Button } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { RepoPicker, type LoadedRepo } from "./repo-picker";
import { useWorkspace } from "./store";

const MAX_LOG_BYTES = 50 * 1024 * 1024;

const PASTE_EXAMPLE = `User: Build a signup page with name, email and password fields.
Assistant: Done! Added the signup page.
User: Passwords must be at least 12 characters. Show an error if the email is already taken.
Assistant: Updated.
User: Actually, remove the name field. And send a welcome email after signup.
Assistant: All set ✅ everything is implemented.`;

type Phase = { label: string; detail?: string; done: boolean };

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

export function NewAudit() {
  const { add, setView, audits } = useWorkspace();
  const toast = useToast();
  const [mode, setMode] = useState<"log" | "paste">("log");
  const [consent, setConsent] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [logName, setLogName] = useState("");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [repo, setRepo] = useState<LoadedRepo | null>(null);
  const [name, setName] = useState("");
  const [phases, setPhases] = useState<Phase[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pasted = mode === "paste" && paste.trim() ? parsePastedConversation(paste) : null;
  const conv = mode === "log" ? conversation : pasted;
  const canRun = Boolean(conv && conv.messages.length > 0 && repo && !phases);

  const readLog = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_LOG_BYTES) {
      setError("That log is larger than 50 MB. Pick a single session file.");
      return;
    }
    try {
      const parsed = parseClaudeJsonl(await file.text());
      if (parsed.messages.length === 0) {
        setError(
          parsed.stats.records === 0
            ? "This doesn't look like a Claude Code session log (no JSON records found)."
            : "No messages written by you were found in this log.",
        );
        setConversation(null);
        return;
      }
      setConversation(parsed);
      setLogName(file.name);
    } catch {
      setError("Couldn't read that file.");
    }
  };

  const run = async () => {
    if (!conv || !repo) return;
    const steps: Phase[] = [
      { label: "Reading your messages", done: false },
      { label: "Extracting requirements", done: false },
      { label: "Linking corrections", done: false },
      { label: "Checking the code for evidence", done: false },
    ];
    setPhases(steps);
    try {
      await nextFrame();
      const audit = createAudit({
        name: name.trim() || (repo.repo.kind !== "none" ? repo.repo.label.split("@")[0] : "Untitled audit"),
        conversation: conv,
        repo: repo.repo,
        files: repo.session.files,
      });
      const details = [
        `${conv.messages.length} messages${conv.stats.redactions ? ` · ${conv.stats.redactions} secrets redacted` : ""}`,
        `${audit.atoms.length} requirements · ${audit.excluded.length} lines skipped`,
        `${audit.chains.filter((c) => c.revisions.length > 1).length} changed over time · ${audit.chains.filter((c) => c.state === "cancelled").length} cancelled`,
        `${audit.filesScanned} source files`,
      ];
      for (let i = 0; i < steps.length; i++) {
        steps[i] = { ...steps[i], done: true, detail: details[i] };
        setPhases([...steps]);
        await new Promise((r) => setTimeout(r, 140));
      }
      add(audit, repo.session);
      toast(`Audit ready: ${audit.results.length} requirements checked`);
    } catch (e) {
      setPhases(null);
      setError((e as Error).message || "The audit failed.");
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">New audit</h1>
        <p className="mt-1.5 text-[14px] text-fg-2">Check a coding session against the code it produced. Everything below runs in this browser tab.</p>

        <Step n={1} title="The conversation" done={Boolean(conv && conv.messages.length)}>
          <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5" role="tablist" aria-label="Conversation source">
            {(
              [
                ["log", "Claude Code log", FileJson],
                ["paste", "Paste a conversation", ClipboardPaste],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => (setMode(id), setError(null))}
                className={clsx(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors",
                  mode === id ? "bg-panel-3 text-fg" : "text-fg-3 hover:text-fg-2",
                )}
              >
                <Icon className="size-3.5" aria-hidden /> {label}
              </button>
            ))}
          </div>

          {mode === "log" ? (
            <div className="mt-4 space-y-3">
              <p className="text-[13px] leading-relaxed text-fg-2">
                Claude Code saves each session as a JSONL file in{" "}
                <code className="rounded bg-panel-3 px-1 py-0.5 font-mono text-[12px] text-fg">~/.claude/projects/&lt;project&gt;/</code>. On a Mac, press{" "}
                <code className="rounded bg-panel-3 px-1 py-0.5 font-mono text-[12px] text-fg">⌘⇧.</code> in the file picker to show hidden folders.
              </p>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-panel-2 p-3 text-[13px] text-fg-2">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                <span>
                  I want Receipts to read this log <span className="text-fg">in my browser</span>. Only my own messages are used; tool output and the
                  agent&apos;s replies are ignored, likely secrets are redacted, and nothing is uploaded.
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => fileRef.current?.click()} disabled={!consent}>
                  <FileJson className="size-4" aria-hidden /> {conversation ? "Choose another log" : "Choose session log…"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".jsonl,.json,.txt,application/json"
                  className="hidden"
                  onChange={(e) => {
                    readLog(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                {!consent && <span className="text-[12.5px] text-fg-3">Confirm above to enable the file picker.</span>}
              </div>
              {conversation && <ConversationSummary conv={conversation} source={logName} />}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-fg-2">
                  Use <span className="font-mono text-[12px] text-fg">User:</span> / <span className="font-mono text-[12px] text-fg">Assistant:</span>{" "}
                  labels, a Claude Code terminal copy, or plain text (one message per paragraph).
                </p>
                <button type="button" onClick={() => setPaste(PASTE_EXAMPLE)} className="shrink-0 text-[12.5px] text-accent hover:text-accent-hover">
                  Load example
                </button>
              </div>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={9}
                spellCheck={false}
                placeholder={"User: Add a booking form with name and phone.\nAssistant: Done!\nUser: Actually, use IST for all times."}
                aria-label="Conversation text"
                className="w-full resize-y rounded-lg border border-line bg-canvas p-3 font-mono text-[12.5px] leading-relaxed text-fg placeholder:text-fg-3 focus:border-line-strong focus:outline-none"
              />
              {pasted && <ConversationSummary conv={pasted} />}
            </div>
          )}
          {error && (
            <p className="mt-3 flex items-start gap-2 text-[13px] text-contra" role="alert">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </p>
          )}
        </Step>

        <Step n={2} title="The code" done={Boolean(repo)}>
          <RepoPicker onLoaded={setRepo} allowNone />
        </Step>

        <Step n={3} title="Run" done={false} last>
          <label className="block max-w-sm">
            <span className="text-[12.5px] text-fg-3">Audit name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={repo && repo.repo.kind !== "none" ? repo.repo.label.split("@")[0] : "Untitled audit"}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-panel-2 px-3 text-[13px] text-fg placeholder:text-fg-3 focus:border-line-strong focus:outline-none"
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" disabled={!canRun} onClick={run}>
              {phases ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />} Run audit
            </Button>
            {audits.length > 0 && !phases && (
              <Button variant="ghost" onClick={() => setView("audit")}>
                Cancel
              </Button>
            )}
            {!canRun && !phases && (
              <span className="text-[12.5px] text-fg-3">
                {!conv?.messages.length ? "Add a conversation first." : !repo ? "Choose a repository, or skip it." : ""}
              </span>
            )}
          </div>
          <AnimatePresence>
            {phases && (
              <motion.ol initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-5 space-y-2 overflow-hidden">
                {phases.map((p) => (
                  <li key={p.label} className="flex items-center gap-2.5 text-[13px]">
                    <span className={clsx("grid size-4 place-items-center rounded-full", p.done ? "bg-proven/15 text-proven" : "text-fg-3")}>
                      {p.done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    </span>
                    <span className={p.done ? "text-fg" : "text-fg-2"}>{p.label}</span>
                    {p.detail && <span className="text-fg-3">· {p.detail}</span>}
                  </li>
                ))}
              </motion.ol>
            )}
          </AnimatePresence>
          <p className="mt-6 flex items-start gap-2 text-[12.5px] leading-relaxed text-fg-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Extraction is rule-based and checks are static: code is searched, never executed. Audits are saved in this browser&apos;s local storage
            (requirements, quotes and short evidence excerpts, not whole files).
          </p>
        </Step>
      </div>
    </div>
  );
}

function Step({ n, title, done, last, children }: { n: number; title: string; done: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <section className="relative mt-8 pl-10">
      {!last && <span className="absolute top-8 bottom-[-28px] left-[13px] w-px bg-line" aria-hidden />}
      <span
        className={clsx(
          "absolute top-0 left-0 grid size-[27px] place-items-center rounded-full border text-[12px] font-medium transition-colors",
          done ? "border-proven/40 bg-proven/10 text-proven" : "border-line-strong bg-panel-2 text-fg-2",
        )}
      >
        {done ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : n}
      </span>
      <h2 className="pt-0.5 text-[15px] font-medium">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ConversationSummary({ conv, source }: { conv: Conversation; source?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-2">
        {source && <span className="font-mono text-fg">{source}</span>}
        <span>
          <span className="text-fg">{conv.messages.length}</span> messages from you
        </span>
        {conv.stats.skipped > 0 && <span>{conv.stats.skipped} other records ignored</span>}
        {conv.stats.malformed > 0 && <span className="text-missing">{conv.stats.malformed} malformed lines skipped</span>}
        {conv.stats.redactions > 0 && (
          <span className="inline-flex items-center gap-1 text-fg">
            <Lock className="size-3" aria-hidden /> {conv.stats.redactions} secrets redacted
          </span>
        )}
      </p>
      <ul className="mt-2 space-y-1">
        {conv.messages.slice(0, 3).map((m) => (
          <li key={m.id} className="truncate text-[12.5px] text-fg-3">
            <span className="mr-2 font-mono text-[11px]">#{m.index}</span>
            {m.text}
          </li>
        ))}
        {conv.messages.length > 3 && <li className="text-[12px] text-fg-3">…and {conv.messages.length - 3} more</li>}
      </ul>
    </div>
  );
}
