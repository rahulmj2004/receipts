"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpDown, Ban, Check, ChevronRight, GitBranch, Search, TriangleAlert, Wand2, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { STATUS_ORDER } from "@/lib/audit";
import { latestAtom } from "@/lib/extract/revisions";
import type { Audit, RequirementChain, Status } from "@/lib/types";
import { Chip, STATUS_META, StatusBadge, StatusIcon } from "../ui/primitives";
import type { Row } from "./audit-view";

type Tab = "all" | Status | "cancelled";
type Sort = "severity" | "conversation" | "changed";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "contradicted", label: "Contradicted" },
  { id: "missing", label: "Missing" },
  { id: "unverifiable", label: "Needs check" },
  { id: "proven", label: "Proven" },
];

export function Ledger({
  rows,
  selectedId,
  onSelect,
  fixSelection,
  onToggleFix,
  onOpenFix,
  onVisibleChange,
  searchRef,
  cancelled,
}: {
  rows: Row[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fixSelection: Set<string>;
  onToggleFix: (id: string) => void;
  onOpenFix: () => void;
  onVisibleChange: (ids: string[]) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  cancelled: RequirementChain[];
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("severity");
  const [stagger, setStagger] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setStagger(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, cancelled: cancelled.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows, cancelled]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (!q) return true;
      const hay = [
        latestAtom(r.chain).title,
        ...r.chain.revisions.map((v) => v.atom.quote),
        ...r.result.evaluation.evidence.map((e) => e.file),
        r.result.evaluation.ruleLabel,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    return [...filtered].sort((a, b) => {
      if (sort === "conversation") return a.order - b.order;
      if (sort === "changed") {
        const ac = a.result.previousStatus && a.result.previousStatus !== a.result.evaluation.status ? 0 : 1;
        const bc = b.result.previousStatus && b.result.previousStatus !== b.result.evaluation.status ? 0 : 1;
        return ac - bc || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.order - b.order;
      }
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.order - b.order;
    });
  }, [rows, tab, query, sort]);

  useEffect(() => {
    onVisibleChange(tab === "cancelled" ? [] : visible.map((r) => r.chain.id));
  }, [visible, tab, onVisibleChange]);

  const selectedForFix = [...fixSelection].filter((id) => rows.some((r) => r.chain.id === id)).length;

  return (
    <section aria-label="Requirement ledger" className="rounded-xl border border-line bg-panel">
      <div className="flex flex-col gap-3 border-b border-line p-3 sm:p-3.5 2xl:flex-row 2xl:items-center">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="toolbar" aria-label="Filter by status">
          {[...TABS, ...(cancelled.length ? [{ id: "cancelled" as Tab, label: "Cancelled" }] : [])].map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={active}
                className={clsx(
                  "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors",
                  active ? "text-fg" : "text-fg-3 hover:text-fg-2",
                )}
              >
                {active && (
                  <motion.span layoutId="ledger-tab" className="absolute inset-0 rounded-md bg-panel-3" transition={{ duration: 0.2 }} />
                )}
                <span className="relative flex items-center gap-1.5">
                  {t.id !== "all" && t.id !== "cancelled" && <span className={clsx("size-1.5 rounded-full", STATUS_META[t.id].dot)} />}
                  {t.label}
                  <span className="tabular-nums text-fg-3">{counts[t.id] ?? 0}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-1 items-center gap-2 2xl:justify-end">
          <label className="relative flex min-w-0 flex-1 items-center 2xl:max-w-[240px]">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-fg-3" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
              placeholder="Search requirements, files…"
              aria-label="Search requirements"
              className="h-8 w-full rounded-md border border-line bg-panel-2 pr-7 pl-8 text-[13px] text-fg placeholder:text-fg-3 focus:border-line-strong focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 rounded p-0.5 text-fg-3 hover:text-fg" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <label className="relative flex items-center">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 size-3.5 text-fg-3" aria-hidden />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort requirements"
              className="h-8 appearance-none rounded-md border border-line bg-panel-2 pr-3 pl-8 text-[13px] text-fg-2 focus:border-line-strong focus:outline-none"
            >
              <option value="severity">Severity</option>
              <option value="conversation">Conversation order</option>
              <option value="changed">Changed in last run</option>
            </select>
          </label>
        </div>
      </div>

      <AnimatePresence>
        {selectedForFix > 0 && tab !== "cancelled" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-line"
          >
            <div className="flex items-center gap-3 bg-accent/[0.06] px-4 py-2 text-[13px]">
              <span className="text-fg-2">
                <span className="font-medium text-fg">{selectedForFix}</span> selected for the fix prompt
              </span>
              <button type="button" onClick={onOpenFix} className="ml-auto inline-flex items-center gap-1.5 font-medium text-accent hover:text-accent-hover">
                <Wand2 className="size-3.5" aria-hidden /> Generate prompt
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {tab === "cancelled" ? (
        <CancelledList chains={cancelled} />
      ) : visible.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm text-fg-2">{rows.length === 0 ? "No requirements were extracted from this conversation." : "Nothing matches this filter."}</p>
          {rows.length > 0 && (
            <button type="button" onClick={() => (setTab("all"), setQuery(""))} className="mt-2 text-[13px] text-accent hover:text-accent-hover">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line" role="listbox" aria-label="Requirements">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((row, i) => (
              <LedgerRow
                key={row.chain.id}
                row={row}
                index={i}
                stagger={stagger}
                selected={row.chain.id === selectedId}
                inFix={fixSelection.has(row.chain.id)}
                onSelect={onSelect}
                onToggleFix={onToggleFix}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

const LedgerRow = memo(function LedgerRow({
  row,
  index,
  stagger,
  selected,
  inFix,
  onSelect,
  onToggleFix,
}: {
  row: Row;
  index: number;
  stagger: boolean;
  selected: boolean;
  inFix: boolean;
  onSelect: (id: string) => void;
  onToggleFix: (id: string) => void;
}) {
  const { chain, result, status } = row;
  const atom = latestAtom(chain);
  const ev = result.evaluation;
  const first = ev.evidence.find((e) => e.role === "conflicts") ?? ev.evidence.find((e) => e.role === "supports");
  const changed = result.previousStatus && result.previousStatus !== ev.status;
  const lastRelation = chain.revisions.at(-1)!.relation;
  const fixable = status !== "proven";

  return (
    <motion.li
      layout="position"
      data-row={chain.id}
      initial={{ opacity: 0, y: stagger ? 6 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, delay: stagger ? Math.min(index, 14) * 0.035 : 0 }}
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(chain.id)}
      className={clsx(
        "group relative flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors sm:px-4",
        selected ? "bg-panel-3/70" : "hover:bg-panel-2",
      )}
    >
      {selected && <motion.span layoutId="row-indicator" className="absolute top-0 bottom-0 left-0 w-0.5 bg-accent" />}
      {changed && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-proven/10"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.4, delay: 0.2 }}
        />
      )}

      <button
        type="button"
        role="checkbox"
        aria-checked={inFix}
        aria-label={fixable ? `Include "${atom.title}" in the fix prompt` : "Proven requirements aren't added to fix prompts"}
        disabled={!fixable}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFix(chain.id);
        }}
        className={clsx(
          "relative grid size-4 shrink-0 place-items-center rounded border transition-colors",
          inFix ? "border-accent bg-accent text-[#1a0a04]" : "border-line-strong bg-panel-2 hover:border-fg-3",
          !fixable && "invisible",
        )}
      >
        {inFix && <Check className="size-3" strokeWidth={3} aria-hidden />}
      </button>

      <StatusIcon status={status} className="size-4" />

      <div className="min-w-0 flex-1">
        <p className={clsx("truncate text-[13.5px]", selected ? "text-fg" : "text-fg/90")}>{atom.title}</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <Chip title={`From message ${atom.messageIndex}`}>#{atom.messageIndex}</Chip>
          {chain.revisions.length > 1 && (
            <Chip className="text-fg-2" title={chain.revisions.map((r) => `${r.relation} (message ${r.atom.messageIndex})`).join(" → ")}>
              <GitBranch className="size-3" aria-hidden />v{chain.revisions.length} · {lastRelation === "refines" ? "refined" : "corrected"}
            </Chip>
          )}
          {chain.review && (
            <Chip className="border-missing/30 text-missing">
              <TriangleAlert className="size-3" aria-hidden /> review
            </Chip>
          )}
          {first && (
            <Chip className="font-mono text-[10.5px]" title={`${first.file}:${first.startLine}`}>
              {first.file.split("/").pop()}:{first.startLine}
            </Chip>
          )}
          {atom.priority && <Chip className={atom.priority === "high" ? "text-fg" : "text-fg-3"}>{atom.priority} priority</Chip>}
          {row.overridden && <Chip className="border-accent/30 text-accent">set by you</Chip>}
          {changed && (
            <Chip className="border-proven/25 text-fg-2">
              was <span className={STATUS_META[result.previousStatus!].text}>{STATUS_META[result.previousStatus!].label}</span>
            </Chip>
          )}
        </div>
      </div>

      <StatusBadge status={status} size="sm" className="hidden sm:inline-flex" />
      <ChevronRight className="size-4 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </motion.li>
  );
});

function CancelledList({ chains }: { chains: RequirementChain[] }) {
  return (
    <ul className="divide-y divide-line">
      {chains.map((c) => (
        <li key={c.id} className="flex items-start gap-3 px-4 py-3">
          <Ban className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13.5px] text-fg-3 line-through">{c.revisions[0].atom.title}</p>
            <p className="mt-1 text-[12px] text-fg-3">{c.revisions.at(-1)!.note} Not checked against the code.</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ExcludedList({ audit }: { audit: Audit }) {
  const [open, setOpen] = useState(false);
  if (audit.excluded.length === 0) return null;
  const shown = audit.excluded.slice(0, 200);
  return (
    <section className="mt-4 rounded-xl border border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-fg-2 transition-colors hover:text-fg"
      >
        <ChevronRight className={clsx("size-4 text-fg-3 transition-transform", open && "rotate-90")} aria-hidden />
        {audit.excluded.length} line{audit.excluded.length > 1 ? "s" : ""} from your messages weren&apos;t treated as requirements
        <span className="ml-auto text-[12px] text-fg-3">Check that nothing important was skipped</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
            <ul className="divide-y divide-line border-t border-line">
              {shown.map((e, i) => (
                <li key={i} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-2">
                    <span className="mr-2 font-mono text-[11px] text-fg-3">#{e.messageIndex}</span>&ldquo;{e.quote}&rdquo;
                  </span>
                  <span className="shrink-0 text-[12px] text-fg-3">{e.reason}</span>
                </li>
              ))}
            </ul>
            {audit.excluded.length > shown.length && (
              <p className="border-t border-line px-4 py-2 text-[12px] text-fg-3">Showing the first {shown.length}.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
