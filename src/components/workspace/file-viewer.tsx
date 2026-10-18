"use client";

import { useEffect, useRef } from "react";
import type { Audit } from "@/lib/types";
import { CodeBlock } from "../ui/code-block";
import { Modal } from "../ui/overlay";
import { useWorkspace } from "./store";

export interface FileTarget {
  file: string;
  startLine: number;
  endLine: number;
  tone: "proven" | "contra" | "candidate";
}

export function FileViewer({ target, onClose, audit }: { target: FileTarget | null; onClose: () => void; audit: Audit }) {
  const { filesFor } = useWorkspace();
  const files = filesFor(audit);
  const content = target ? files?.find((f) => f.path === target.file)?.content : undefined;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target || content === undefined) return;
    const t = window.setTimeout(() => {
      const row = scroller.current?.querySelector(`[data-line="${target.startLine}"]`);
      row?.scrollIntoView({ block: "center" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [target, content]);

  const evidence = target
    ? audit.results.flatMap((r) => r.evaluation.evidence).find((e) => e.file === target.file && e.startLine === target.startLine)
    : undefined;

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={target?.file ?? ""}
      width="max-w-4xl"
      description={
        target && (
          <span className="font-mono text-[12px]">
            Lines {target.startLine}
            {target.endLine > target.startLine ? `–${target.endLine}` : ""} highlighted
            {audit.isSample ? " · sample repository" : ""}
          </span>
        )
      }
    >
      <div ref={scroller} className="max-h-[70dvh] overflow-auto bg-canvas py-2">
        {target && content !== undefined ? (
          <CodeBlock code={content.replace(/\n$/, "")} highlightFrom={target.startLine} highlightTo={target.endLine} tone={target.tone} />
        ) : target ? (
          <div className="p-5">
            <p className="mb-3 text-[13px] text-fg-2">
              The full file isn&apos;t in memory. Repository contents aren&apos;t stored between sessions. Rerun the audit with the repository
              connected to browse whole files. The recorded excerpt:
            </p>
            {evidence && <CodeBlock code={evidence.excerpt} startLine={evidence.startLine} highlightFrom={evidence.startLine} highlightTo={evidence.endLine} tone={target.tone} />}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
