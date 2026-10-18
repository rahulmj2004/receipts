"use client";

import clsx from "clsx";
import { Check, Copy, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { STATUS_ORDER } from "@/lib/audit";
import { latestAtom } from "@/lib/extract/revisions";
import { generateFixPrompt } from "@/lib/fix-prompt";
import type { Audit } from "@/lib/types";
import { Sheet } from "../ui/overlay";
import { Button, StatusIcon, useCopy } from "../ui/primitives";
import { useToast } from "../ui/toast";
import type { Row } from "./audit-view";

export function FixPromptSheet({
  open,
  onClose,
  audit,
  rows,
  selection,
  onToggle,
  onSetSelection,
}: {
  open: boolean;
  onClose: () => void;
  audit: Audit;
  rows: Row[];
  selection: Set<string>;
  onToggle: (id: string) => void;
  onSetSelection: (s: Set<string>) => void;
}) {
  const toast = useToast();
  const { copied, copy } = useCopy();
  const candidates = useMemo(
    () => rows.filter((r) => r.status !== "proven").sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.order - b.order),
    [rows],
  );
  const ids = useMemo(() => candidates.filter((r) => selection.has(r.chain.id)).map((r) => r.chain.id), [candidates, selection]);
  const generated = useMemo(() => generateFixPrompt(audit, ids), [audit, ids]);
  // Once edited, the user's text is kept until they ask to regenerate it.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? generated;
  const edited = draft !== null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Fix prompt"
      width="max-w-[640px]"
      description="A follow-up for your coding agent with only the gaps you pick. Receipts doesn't send it anywhere. Paste it yourself."
      footer={
        <div className="flex items-center gap-2">
          <p className="mr-auto text-[12px] text-fg-3 tabular-nums">
            {ids.length} item{ids.length === 1 ? "" : "s"} · {text.length.toLocaleString()} characters{edited ? " · edited" : ""}
          </p>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Back to audit
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!text.trim()}
            onClick={async () => {
              const ok = await copy(text);
              toast(ok ? "Copied. Paste it into your coding agent." : "Couldn't access the clipboard. Select the text and copy it.", ok ? "success" : "error");
            }}
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
      }
    >
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-medium tracking-wide text-fg-3 uppercase">Include</p>
          <div className="flex gap-3 text-[12px]">
            <button
              type="button"
              className="text-fg-3 hover:text-fg"
              onClick={() => onSetSelection(new Set(candidates.filter((r) => r.status === "contradicted" || r.status === "missing").map((r) => r.chain.id)))}
            >
              Unresolved only
            </button>
            <button type="button" className="text-fg-3 hover:text-fg" onClick={() => onSetSelection(new Set(candidates.map((r) => r.chain.id)))}>
              All
            </button>
            <button type="button" className="text-fg-3 hover:text-fg" onClick={() => onSetSelection(new Set())}>
              None
            </button>
          </div>
        </div>
        {candidates.length === 0 ? (
          <p className="mt-3 text-[13px] text-fg-2">Every requirement is proven. There&apos;s nothing to fix.</p>
        ) : (
          <ul className="mt-2 space-y-0.5">
            {candidates.map((r) => {
              const on = selection.has(r.chain.id);
              return (
                <li key={r.chain.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-panel-2">
                    <input type="checkbox" checked={on} onChange={() => onToggle(r.chain.id)} className="peer sr-only" />
                    <span
                      className={clsx(
                        "grid size-4 shrink-0 place-items-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                        on ? "border-accent bg-accent text-[#1a0a04]" : "border-line-strong bg-panel-2",
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <StatusIcon status={r.status} className="size-3.5" />
                    <span className="truncate text-[13px] text-fg-2">{latestAtom(r.chain).title}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <label htmlFor="fix-prompt-text" className="text-[12px] font-medium tracking-wide text-fg-3 uppercase">
            Prompt
          </label>
          {edited && (
            <button type="button" onClick={() => setDraft(null)} className="inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg">
              <RotateCcw className="size-3" aria-hidden /> Regenerate from selection
            </button>
          )}
        </div>
        <textarea
          id="fix-prompt-text"
          data-autofocus
          value={text}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Select at least one requirement above."
          spellCheck={false}
          className="mt-2 h-[52dvh] w-full resize-none rounded-lg border border-line bg-canvas p-3.5 font-mono text-[12px] leading-[1.65] text-fg/90 placeholder:text-fg-3 focus:border-line-strong focus:outline-none"
        />
      </div>
    </Sheet>
  );
}
