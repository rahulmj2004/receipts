"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Copy, Download, MessageSquareQuote, RefreshCw, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUS_ORDER, effectiveStatus, isUnresolved, statusCounts } from "@/lib/audit";
import { latestAtom } from "@/lib/extract/revisions";
import { STATUSES, type Audit, type RequirementChain, type RequirementResult, type Status } from "@/lib/types";
import { Button, Kbd, STATUS_META, StatusIcon, copyText, formatTime, relativeTime } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { FileViewer, type FileTarget } from "./file-viewer";
import { FixPromptSheet } from "./fix-prompt-sheet";
import { Inspector } from "./inspector";
import { ExcludedList, Ledger } from "./ledger";
import { RerunDialog } from "./rerun-dialog";
import { useWorkspace } from "./store";
import { auditToMarkdown } from "./export";

export interface Row {
  chain: RequirementChain;
  result: RequirementResult;
  status: Status;
  overridden: boolean;
  order: number;
}

export function buildRows(audit: Audit): Row[] {
  const chains = new Map(audit.chains.map((c) => [c.id, c]));
  return audit.results.map((result, order) => ({
    chain: chains.get(result.chainId)!,
    result,
    status: effectiveStatus(audit, result.chainId)!,
    overridden: Boolean(audit.overrides[result.chainId]),
    order,
  }));
}

function initialSelection(rows: Row[]): string | null {
  const sorted = [...rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.order - b.order);
  const withHistory = sorted.find((r) => r.status === "contradicted" && r.chain.revisions.length > 1);
  return (withHistory ?? sorted[0])?.chain.id ?? null;
}

export function AuditView({ audit }: { audit: Audit }) {
  const { update, remove } = useWorkspace();
  const toast = useToast();
  const rows = useMemo(() => buildRows(audit), [audit]);
  const counts = useMemo(() => statusCounts(audit), [audit]);

  const [selectedId, setSelectedId] = useState<string | null>(() => initialSelection(rows));
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [fixSelection, setFixSelection] = useState<Set<string>>(new Set());
  const [fixOpen, setFixOpen] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [fileTarget, setFileTarget] = useState<FileTarget | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = rows.find((r) => r.chain.id === selectedId) ?? null;
  const fixable = useMemo(
    () => new Set([...fixSelection].filter((id) => rows.some((r) => r.chain.id === id && r.status !== "proven"))),
    [fixSelection, rows],
  );
  const unresolvedCount = counts.contradicted + counts.missing;
  const previousRun = audit.runs.at(-2);
  const justResolved = previousRun && unresolvedCount === 0 && previousRun.counts.contradicted + previousRun.counts.missing > 0;

  const toggleFix = useCallback((id: string) => {
    setFixSelection((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setInspectorOpen(true);
  }, []);

  const openFix = useCallback(() => {
    setFixSelection((s) => {
      const live = [...s].filter((id) => rows.some((r) => r.chain.id === id && r.status !== "proven"));
      if (live.length > 0) return new Set(live);
      return new Set(rows.filter((r) => isUnresolved(r.status)).map((r) => r.chain.id));
    });
    setFixOpen(true);
  }, [rows]);

  const closeFix = useCallback(() => setFixOpen(false), []);
  const closeRerun = useCallback(() => setRerunOpen(false), []);
  const closeFile = useCallback(() => setFileTarget(null), []);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);

  // Keyboard: j/k or arrows move, x toggles for the fix prompt, / searches, p opens the prompt, r reruns.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const idx = visibleIds.indexOf(selectedId ?? "");
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = visibleIds[Math.min(visibleIds.length - 1, idx + 1)] ?? visibleIds[0];
        if (next) setSelectedId(next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = visibleIds[Math.max(0, idx - 1)] ?? visibleIds[0];
        if (prev) setSelectedId(prev);
      } else if (e.key === "Enter" && selectedId) {
        setInspectorOpen(true);
      } else if (e.key === "x" && selectedId) {
        toggleFix(selectedId);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "p") {
        openFix();
      } else if (e.key === "r") {
        setRerunOpen(true);
      } else if (e.key === "Escape") {
        setInspectorOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleIds, selectedId, toggleFix, openFix]);

  // Keep the selected row in view when the selection moves, but not on first load.
  const initialId = useRef(selectedId);
  useEffect(() => {
    if (!selectedId || selectedId === initialId.current) return;
    initialId.current = null;
    document.querySelector(`[data-row="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        audit={audit}
        unresolved={unresolvedCount}
        onRerun={() => setRerunOpen(true)}
        onFix={openFix}
        onDelete={() => {
          if (window.confirm(`Delete the audit "${audit.name}"? This only removes it from this browser.`)) {
            remove(audit.id);
            toast("Audit deleted", "info");
          }
        }}
      />

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1100px] px-4 py-5 sm:px-6 lg:py-6">
            {audit.isSample && <SampleBanner />}
            <AnimatePresence>{justResolved && <ResolvedBanner needsCheck={counts.unverifiable} />}</AnimatePresence>
            <Overview audit={audit} counts={counts} />
            <Ledger
              rows={rows}
              selectedId={selectedId}
              onSelect={select}
              fixSelection={fixable}
              onToggleFix={toggleFix}
              onOpenFix={openFix}
              onVisibleChange={setVisibleIds}
              searchRef={searchRef}
              cancelled={audit.chains.filter((c) => c.state === "cancelled")}
            />
            <ExcludedList audit={audit} />
            <ShortcutHint />
          </div>
        </div>

        <aside className="hidden w-[460px] shrink-0 border-l border-line bg-panel xl:block 2xl:w-[520px]">
          {selected ? (
            <Inspector
              key={selected.chain.id}
              audit={audit}
              row={selected}
              inFix={fixable.has(selected.chain.id)}
              onToggleFix={() => toggleFix(selected.chain.id)}
              onOpenFile={setFileTarget}
              onUpdate={update}
            />
          ) : (
            <EmptyInspector />
          )}
        </aside>
      </div>

      <AnimatePresence>
        {inspectorOpen && selected && (
          <div className="fixed inset-0 z-40 xl:hidden">
            <motion.div className="absolute inset-0 bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeInspector} />
            <motion.div
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              className="absolute inset-y-0 right-0 w-full max-w-[520px] border-l border-line-strong bg-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Requirement details"
            >
              <Inspector
                key={selected.chain.id}
                audit={audit}
                row={selected}
                inFix={fixable.has(selected.chain.id)}
                onToggleFix={() => toggleFix(selected.chain.id)}
                onOpenFile={setFileTarget}
                onUpdate={update}
                onClose={closeInspector}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <FixPromptSheet
        open={fixOpen}
        onClose={closeFix}
        audit={audit}
        rows={rows}
        selection={fixable}
        onToggle={toggleFix}
        onSetSelection={setFixSelection}
      />
      <RerunDialog key={audit.runs.length} open={rerunOpen} onClose={closeRerun} audit={audit} />
      <FileViewer target={fileTarget} onClose={closeFile} audit={audit} />
    </div>
  );
}

function TopBar({
  audit,
  unresolved,
  onRerun,
  onFix,
  onDelete,
}: {
  audit: Audit;
  unresolved: number;
  onRerun: () => void;
  onFix: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(audit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipts-${audit.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMenu(false);
    toast("Audit downloaded as JSON");
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-line px-4 py-3 sm:px-6">
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{audit.name}</h1>
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              unresolved > 0 ? "border-contra/25 bg-contra/10 text-contra" : "border-proven/25 bg-proven/10 text-proven",
            )}
          >
            <span className={clsx("size-1.5 rounded-full", unresolved > 0 ? "bg-contra" : "bg-proven")} />
            {unresolved > 0 ? `${unresolved} unresolved` : "No open gaps"}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-fg-3" title={formatTime(audit.analyzedAt)}>
          Analyzed {relativeTime(audit.analyzedAt)} · {audit.conversation.messages.length} messages · {audit.filesScanned} files · run{" "}
          {audit.runs.length}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onRerun} title="Rerun the audit (r)">
          <RefreshCw className="size-3.5" aria-hidden /> Rerun
        </Button>
        <div className="relative" ref={menuRef}>
          <Button size="sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu">
            <Download className="size-3.5" aria-hidden /> Export <ChevronDown className="size-3 text-fg-3" aria-hidden />
          </Button>
          <AnimatePresence>
            {menu && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-lg border border-line-strong bg-panel-2 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
              >
                <MenuItem
                  icon={Copy}
                  onClick={async () => {
                    const ok = await copyText(auditToMarkdown(audit));
                    setMenu(false);
                    toast(ok ? "Report copied as Markdown" : "Couldn't access the clipboard", ok ? "success" : "error");
                  }}
                >
                  Copy report (Markdown)
                </MenuItem>
                <MenuItem icon={Download} onClick={exportJson}>
                  Download JSON
                </MenuItem>
                <div className="my-1 h-px bg-line" />
                <MenuItem
                  icon={Trash2}
                  danger
                  onClick={() => {
                    setMenu(false);
                    onDelete();
                  }}
                >
                  Delete audit
                </MenuItem>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <Button size="sm" variant="primary" onClick={onFix} title="Generate a fix prompt (p)">
          <Wand2 className="size-3.5" aria-hidden /> Fix prompt
        </Button>
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors",
        danger ? "text-contra hover:bg-contra/10" : "text-fg-2 hover:bg-panel-3 hover:text-fg",
      )}
    >
      <Icon className="size-3.5" /> {children}
    </button>
  );
}

function SampleBanner() {
  const { resetSample } = useWorkspace();
  const toast = useToast();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-panel px-4 py-3 text-[13px]">
      <span className="rounded border border-line-strong px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide text-fg-2 uppercase">
        Sample
      </span>
      <p className="min-w-0 flex-1 text-fg-2">
        Illustrative project and conversation. The verdicts come from the real engine, and every file it cites can be opened.
      </p>
      <button
        type="button"
        onClick={() => {
          resetSample();
          toast("Sample reset to the agent's 'done' commit", "info");
        }}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-fg-3 transition-colors hover:bg-panel-3 hover:text-fg"
      >
        <RotateCcw className="size-3.5" aria-hidden /> Reset demo
      </button>
    </div>
  );
}

function ResolvedBanner({ needsCheck }: { needsCheck: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-proven/25 bg-proven/[0.07] px-4 py-3">
        <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
          <circle cx="12" cy="12" r="10" fill="none" stroke="var(--proven)" strokeOpacity=".3" strokeWidth="2" />
          <motion.path
            d="m7.5 12.5 3 3 6-6.5"
            fill="none"
            stroke="var(--proven)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.15 }}
          />
        </svg>
        <div className="text-[13.5px]">
          <p className="font-medium text-fg">No contradicted or missing requirements left.</p>
          <p className="text-fg-2">
            {needsCheck > 0
              ? `${needsCheck} still need${needsCheck === 1 ? "s" : ""} a human check. Code alone can't prove ${needsCheck === 1 ? "it" : "them"}.`
              : "Every requirement is backed by evidence."}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function Overview({ audit, counts }: { audit: Audit; counts: Record<Status, number> }) {
  const total = audit.results.length;
  const prev = audit.runs.at(-2)?.counts;
  const overrides = Object.keys(audit.overrides).filter((id) => audit.results.some((r) => r.chainId === id)).length;
  const claim = audit.conversation.agentClaim;
  const unresolved = counts.contradicted + counts.missing;

  return (
    <section aria-label="Audit overview" className="mb-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
            <MessageSquareQuote className="size-3.5" aria-hidden /> What the agent said
          </p>
          {claim ? (
            <blockquote className="mt-2.5 line-clamp-4 text-[13.5px] leading-relaxed text-fg-2">&ldquo;{claim.text}&rdquo;</blockquote>
          ) : (
            <p className="mt-2.5 text-[13px] text-fg-3">No agent message was included in this import.</p>
          )}
          <p className="mt-3 text-[11.5px] text-fg-3">Shown for comparison. Never used as evidence.</p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-[11px] font-medium tracking-wide text-fg-3 uppercase">What the code shows</p>
          <p className="mt-2.5 text-[15px] leading-snug text-fg">
            {total === 0 ? (
              "No requirements were found in this conversation."
            ) : (
              <>
                <span className="font-semibold text-proven">{counts.proven}</span> of {total} requirements are backed by
                evidence.{" "}
                {unresolved > 0 ? (
                  <>
                    <span className="font-semibold text-contra">{counts.contradicted}</span> contradict the code and{" "}
                    <span className="font-semibold text-missing">{counts.missing}</span> weren&apos;t found.
                  </>
                ) : (
                  "None contradict the code or are missing."
                )}
              </>
            )}
          </p>
          <ProgressBar counts={counts} total={total} />
          <p className="mt-2 text-[11.5px] text-fg-3">
            {audit.extraction === "rule-based" && "Rule-based extraction and static code checks. "}
            {overrides > 0 && `${overrides} verdict${overrides > 1 ? "s" : ""} set by you. `}
            {audit.excluded.length > 0 && `${audit.excluded.length} non-requirement line${audit.excluded.length > 1 ? "s" : ""} skipped.`}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATUSES.map((s) => {
          const delta = prev ? counts[s] - prev[s] : 0;
          return (
            <div key={s} className={clsx("rounded-xl border bg-panel p-3.5", counts[s] > 0 ? STATUS_META[s].border : "border-line")}>
              <p className="flex items-center gap-1.5 text-[12px] text-fg-2">
                <StatusIcon status={s} className="size-3.5" /> {STATUS_META[s].label}
              </p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <AnimatedNumber value={counts[s]} className="text-[26px] leading-none font-semibold tracking-[-0.02em] tabular-nums" />
                {delta !== 0 && (
                  <motion.span
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={clsx("text-[12px] font-medium tabular-nums", delta > 0 === (s === "proven") ? "text-proven" : "text-contra")}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </motion.span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] text-fg-3">{STATUS_META[s].hint}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  return (
    <span className={clsx("relative inline-flex overflow-hidden", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: "60%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-60%", opacity: 0 }} transition={{ duration: 0.25 }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function ProgressBar({ counts, total }: { counts: Record<Status, number>; total: number }) {
  const order: Status[] = ["proven", "unverifiable", "missing", "contradicted"];
  return (
    <div className="mt-3.5">
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-panel-3" role="img" aria-label={order.map((s) => `${counts[s]} ${s}`).join(", ")}>
        {order.map((s) =>
          counts[s] > 0 ? (
            <motion.span
              key={s}
              className={clsx("h-full first:rounded-l-full last:rounded-r-full", STATUS_META[s].dot)}
              initial={{ width: 0 }}
              animate={{ width: `${(counts[s] / Math.max(1, total)) * 100}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <Check className="size-6 text-fg-3" aria-hidden />
      <p className="mt-3 text-sm text-fg-2">Select a requirement to see its evidence.</p>
    </div>
  );
}

function ShortcutHint() {
  return (
    <p className="mt-8 hidden flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-fg-3 md:flex">
      <span className="inline-flex items-center gap-1.5">
        <Kbd>j</Kbd>
        <Kbd>k</Kbd> move
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>x</Kbd> add to fix prompt
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>p</Kbd> fix prompt
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>r</Kbd> rerun
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Kbd>/</Kbd> search
      </span>
    </p>
  );
}

export function titleFor(row: Row): string {
  return latestAtom(row.chain).title;
}
