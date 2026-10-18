"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  CircleX,
  Equal,
  FileCode2,
  Flag,
  Info,
  ScanEye,
  SearchX,
  Split,
  TriangleAlert,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { useState } from "react";
import { resolveConflict } from "@/lib/audit";
import { applicableRevisions, latestAtom } from "@/lib/extract/revisions";
import { STATUSES, type Audit, type Evidence, type Relation, type Status } from "@/lib/types";
import { CodeBlock } from "../ui/code-block";
import { Button, Chip, STATUS_META, StatusBadge, formatTime } from "../ui/primitives";
import { useToast } from "../ui/toast";
import type { Row } from "./audit-view";
import type { FileTarget } from "./file-viewer";
import { useWorkspace } from "./store";

const METHOD_LABEL = {
  "static-pattern": "Static code pattern",
  "static-absence": "Static absence scan",
  "keyword-candidates": "Keyword candidates",
  "not-checked": "Not checked",
} as const;

const RELATION: Record<Relation, { label: string; tone: string }> = {
  original: { label: "Asked", tone: "border-line-strong text-fg-2" },
  supersedes: { label: "Corrected", tone: "border-accent/35 bg-accent/10 text-accent" },
  refines: { label: "Refined", tone: "border-line-strong text-fg" },
  cancels: { label: "Cancelled", tone: "border-line-strong text-fg-3" },
  "potential-conflict": { label: "Possible conflict", tone: "border-missing/30 bg-missing/10 text-missing" },
};

function loc(e: Evidence) {
  return `${e.file}:${e.startLine}${e.endLine > e.startLine ? `–${e.endLine}` : ""}`;
}

export function Inspector({
  audit,
  row,
  inFix,
  onToggleFix,
  onOpenFile,
  onUpdate,
  onClose,
}: {
  audit: Audit;
  row: Row;
  inFix: boolean;
  onToggleFix: () => void;
  onOpenFile: (t: FileTarget) => void;
  onUpdate: (a: Audit) => void;
  onClose?: () => void;
}) {
  const { chain, result, status } = row;
  const ev = result.evaluation;
  const atom = latestAtom(chain);
  const applicable = applicableRevisions(chain);
  const decisive =
    ev.evidence.find((e) => e.role === "conflicts") ?? ev.evidence.find((e) => e.role === "supports") ?? null;
  const rest = ev.evidence.filter((e) => e !== decisive);
  const override = audit.overrides[chain.id];

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-full flex-col"
    >
      <div className="border-b border-line px-5 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {override && <Chip className="border-accent/30 text-accent">set by you · engine said {STATUS_META[ev.status].label}</Chip>}
          {onClose && (
            <button type="button" onClick={onClose} className="ml-auto rounded-md p-1.5 text-fg-3 hover:bg-panel-3 hover:text-fg" aria-label="Close details">
              <X className="size-4" />
            </button>
          )}
        </div>
        <h2 className="mt-3 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-pretty">{atom.title}</h2>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip>{ev.ruleLabel}</Chip>
          {atom.priority && <Chip>{atom.priority} priority</Chip>}
          <Chip>
            {chain.revisions.length > 1 ? `${chain.revisions.length} revisions` : "1 revision"}
          </Chip>
          {result.previousStatus && result.previousStatus !== ev.status && (
            <Chip>
              was <span className={STATUS_META[result.previousStatus].text}>{STATUS_META[result.previousStatus].label}</span>
            </Chip>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {chain.review && <ConflictReview audit={audit} chainId={chain.id} onUpdate={onUpdate} />}

        <section aria-label="Instruction and evidence">
          <div className="rounded-xl border border-line bg-panel-2">
            <div className="px-4 pt-3 pb-3.5">
              <p className="flex items-center justify-between text-[11px] font-medium tracking-wide text-fg-3 uppercase">
                You asked
                <span className="font-mono normal-case tracking-normal">
                  #{atom.messageIndex}
                  {atom.timestamp ? ` · ${formatTime(atom.timestamp)}` : ""}
                </span>
              </p>
              {applicable.map((r) => (
                <blockquote key={r.atom.id} className="mt-2 border-l-2 border-accent pl-3 text-[14px] leading-relaxed text-fg">
                  &ldquo;{r.atom.quote}&rdquo;
                  {applicable.length > 1 && <span className="ml-1.5 font-mono text-[11px] text-fg-3">#{r.atom.messageIndex}</span>}
                </blockquote>
              ))}
              {chain.revisions.length > applicable.length && (
                <p className="mt-2 text-[12px] text-fg-3">
                  Replaces an earlier instruction from message {chain.revisions[0].atom.messageIndex}. See history below.
                </p>
              )}
            </div>

            <Connector status={ev.status} />

            <div className="px-4 pt-3.5 pb-4">
              <p className="flex items-center justify-between text-[11px] font-medium tracking-wide text-fg-3 uppercase">
                The code
                {ev.method !== "not-checked" && (
                  <span className="normal-case tracking-normal">{METHOD_LABEL[ev.method]} · not executed</span>
                )}
              </p>
              {decisive ? (
                <EvidenceCard evidence={decisive} onOpen={onOpenFile} prominent />
              ) : (
                <div className="mt-2 rounded-lg border border-dashed border-line-strong px-3.5 py-3 text-[13px] text-fg-2">
                  {ev.status === "missing"
                    ? "No implementation was found."
                    : ev.status === "unverifiable"
                      ? "There's no code that can settle this on its own."
                      : "No evidence lines."}
                </div>
              )}
            </div>
          </div>
        </section>

        <section aria-label="Verdict">
          <h3 className="text-[12px] font-medium tracking-wide text-fg-3 uppercase">Why this verdict</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-fg">{ev.summary}</p>
          {ev.reasoning && <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{ev.reasoning}</p>}
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
            <dt className="text-fg-3">Expected</dt>
            <dd className="text-fg-2">{ev.expectation}</dd>
            <dt className="text-fg-3">Method</dt>
            <dd className="text-fg-2">
              {METHOD_LABEL[ev.method]}
              {ev.runtimeCheckNeeded && " · needs a runtime or visual check"}
            </dd>
            <dt className="text-fg-3">Scope</dt>
            <dd className="text-fg-2">
              {ev.scopeFiles.length} of {ev.filesScanned} files
            </dd>
          </dl>
          <div className="mt-3 flex gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-2">
            <Info className="mt-0.5 size-3.5 shrink-0 text-fg-3" aria-hidden />
            <p>{ev.uncertainty}</p>
          </div>
        </section>

        {rest.length > 0 && (
          <section aria-label="More evidence">
            <h3 className="text-[12px] font-medium tracking-wide text-fg-3 uppercase">More evidence ({rest.length})</h3>
            <div className="mt-2 space-y-2.5">
              {rest.map((e) => (
                <EvidenceCard key={`${e.file}:${e.startLine}`} evidence={e} onOpen={onOpenFile} />
              ))}
            </div>
          </section>
        )}

        <section aria-label="Revision history">
          <h3 className="text-[12px] font-medium tracking-wide text-fg-3 uppercase">Revision history</h3>
          <ol className="relative mt-3 space-y-4 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-line-strong">
            {chain.revisions.map((r, i) => {
              const live = applicable.includes(r);
              return (
                <motion.li
                  key={r.atom.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="relative pl-6"
                >
                  <span
                    className={clsx(
                      "absolute top-1 left-0 size-[11px] rounded-full border-2",
                      live ? "border-accent bg-canvas" : "border-line-strong bg-panel-3",
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx("rounded border px-1.5 py-0.5 text-[10.5px] font-medium", RELATION[r.relation].tone)}>
                      {RELATION[r.relation].label}
                    </span>
                    <span className="font-mono text-[11px] text-fg-3">
                      message {r.atom.messageIndex}
                      {r.atom.timestamp ? ` · ${formatTime(r.atom.timestamp)}` : ""}
                    </span>
                    {live && <span className="text-[11px] text-accent">applies</span>}
                  </div>
                  <p className={clsx("mt-1.5 text-[13px] leading-relaxed", live ? "text-fg" : "text-fg-3 line-through decoration-fg-3/50")}>
                    &ldquo;{r.atom.quote}&rdquo;
                  </p>
                  <p className="mt-1 text-[12px] text-fg-3">{r.note}</p>
                </motion.li>
              );
            })}
          </ol>
        </section>

        <OverrideForm audit={audit} chainId={chain.id} engineStatus={ev.status} onUpdate={onUpdate} />
      </div>

      {status !== "proven" && (
        <div className="border-t border-line px-5 py-3">
          <Button variant={inFix ? "secondary" : "primary"} className="w-full" onClick={onToggleFix}>
            {inFix ? <Check className="size-4" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
            {inFix ? "In the fix prompt" : "Add to fix prompt"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}

function Connector({ status }: { status: Status }) {
  const map = {
    contradicted: { icon: CircleX, text: "conflicts with what you asked", cls: "text-contra" },
    proven: { icon: Equal, text: "supports what you asked", cls: "text-proven" },
    missing: { icon: SearchX, text: "nothing found for this", cls: "text-missing" },
    unverifiable: { icon: ScanEye, text: "needs a human check", cls: "text-unver" },
  }[status];
  const Icon = map.icon;
  return (
    <div className="relative flex items-center gap-2 border-y border-line bg-panel/60 px-4 py-1.5">
      <Icon className={clsx("size-3.5", map.cls)} aria-hidden />
      <span className={clsx("text-[12px] font-medium", map.cls)}>{map.text}</span>
    </div>
  );
}

function EvidenceCard({ evidence: e, onOpen, prominent }: { evidence: Evidence; onOpen: (t: FileTarget) => void; prominent?: boolean }) {
  const tone = e.role === "conflicts" ? "contra" : e.role === "supports" ? "proven" : "candidate";
  const roleLabel = { conflicts: "Conflicts", supports: "Supports", candidate: "Related · not proof" }[e.role];
  return (
    <div className={clsx("overflow-hidden rounded-lg border border-line bg-canvas", prominent && "mt-2")}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
        <button
          type="button"
          onClick={() => onOpen({ file: e.file, startLine: e.startLine, endLine: e.endLine, tone })}
          className="inline-flex min-w-0 items-center gap-1.5 font-mono text-[11.5px] text-fg-2 transition-colors hover:text-accent"
          title="Open the whole file"
        >
          <FileCode2 className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{loc(e)}</span>
        </button>
        <span
          className={clsx(
            "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium",
            e.role === "conflicts" && "bg-contra/10 text-contra",
            e.role === "supports" && "bg-proven/10 text-proven",
            e.role === "candidate" && "bg-unver/10 text-unver",
          )}
        >
          {roleLabel}
        </span>
      </div>
      <CodeBlock code={e.excerpt} startLine={e.startLine} highlightFrom={e.startLine} highlightTo={e.endLine} tone={tone} className="py-1.5" />
      <p className="border-t border-line px-3 py-2 text-[12px] leading-relaxed text-fg-2">
        {e.why}
        {e.redacted && <span className="ml-1 text-fg-3">(secrets redacted)</span>}
      </p>
    </div>
  );
}

function ConflictReview({ audit, chainId, onUpdate }: { audit: Audit; chainId: string; onUpdate: (a: Audit) => void }) {
  const { filesFor } = useWorkspace();
  const toast = useToast();
  const chain = audit.chains.find((c) => c.id === chainId)!;
  const other = audit.chains.find((c) => c.id === chain.review!.withChainId);
  const files = filesFor(audit);
  const canRecheck = files !== null || audit.repo.kind === "none";

  const apply = (choice: "supersede" | "keep") => {
    onUpdate(resolveConflict(audit, chain.review!.atomId, choice, files ?? []));
    toast(choice === "supersede" ? "Treated as a correction. Re-checked." : "Kept as two separate requirements.");
  };

  return (
    <div className="rounded-xl border border-missing/30 bg-missing/[0.06] p-4">
      <p className="flex items-center gap-2 text-[13px] font-medium text-missing">
        <TriangleAlert className="size-4" aria-hidden /> Possible conflict, needs your call
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">
        {chain.review!.note}
        {other && (
          <>
            {" "}
            The other instruction: <span className="text-fg">&ldquo;{latestAtom(other).quote}&rdquo;</span>
          </>
        )}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => apply("supersede")} disabled={!canRecheck}>
          <Split className="size-3.5" aria-hidden /> Later one replaces earlier
        </Button>
        <Button size="sm" variant="ghost" onClick={() => apply("keep")} disabled={!canRecheck}>
          Keep both
        </Button>
      </div>
      {!canRecheck && <p className="mt-2 text-[12px] text-fg-3">Rerun with the repository connected to re-check after deciding.</p>}
    </div>
  );
}

function OverrideForm({
  audit,
  chainId,
  engineStatus,
  onUpdate,
}: {
  audit: Audit;
  chainId: string;
  engineStatus: Status;
  onUpdate: (a: Audit) => void;
}) {
  const toast = useToast();
  const existing = audit.overrides[chainId];
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(existing?.status ?? (engineStatus === "proven" ? "missing" : "proven"));
  const [note, setNote] = useState(existing?.note ?? "");

  const save = () => {
    onUpdate({ ...audit, overrides: { ...audit.overrides, [chainId]: { status, note: note.trim(), at: new Date().toISOString() } } });
    setOpen(false);
    toast("Verdict updated. Marked as set by you.");
  };
  const clear = () => {
    const rest = { ...audit.overrides };
    delete rest[chainId];
    onUpdate({ ...audit, overrides: rest });
    toast("Back to the engine's verdict", "info");
  };

  if (existing && !open) {
    return (
      <section className="rounded-xl border border-accent/25 bg-accent/[0.05] p-4">
        <p className="text-[13px] text-fg">
          You marked this <span className={STATUS_META[existing.status].text}>{STATUS_META[existing.status].label}</span>. The engine said{" "}
          <span className={STATUS_META[engineStatus].text}>{STATUS_META[engineStatus].label}</span>.
        </p>
        {existing.note && <p className="mt-1 text-[13px] text-fg-2">&ldquo;{existing.note}&rdquo;</p>}
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={clear}>
            <Undo2 className="size-3.5" aria-hidden /> Use engine verdict
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 transition-colors hover:text-fg-2"
      >
        <Flag className="size-3.5" aria-hidden /> Disagree with this verdict?
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 rounded-xl border border-line bg-panel-2 p-4">
              <p className="text-[12.5px] text-fg-2">
                Your verdict is shown as &ldquo;set by you&rdquo; and kept separate from the engine&apos;s.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Correct verdict">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={status === s}
                    onClick={() => setStatus(s)}
                    className={clsx(
                      "rounded-md border px-2 py-1 text-[12px] transition-colors",
                      status === s ? `${STATUS_META[s].border} ${STATUS_META[s].bg} ${STATUS_META[s].text}` : "border-line text-fg-3 hover:text-fg-2",
                    )}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <label className="mt-3 block">
                <span className="text-[12px] text-fg-3">What did you check? (optional)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Checked at 375px in Chrome; no horizontal scroll."
                  className="mt-1 w-full resize-none rounded-md border border-line bg-panel px-2.5 py-2 text-[13px] text-fg placeholder:text-fg-3 focus:border-line-strong focus:outline-none"
                />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={save} disabled={status === engineStatus && !existing}>
                  Save verdict
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
