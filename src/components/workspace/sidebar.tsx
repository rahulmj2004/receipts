"use client";

import clsx from "clsx";
import { ArrowLeft, FolderGit2, FolderOpen, GitBranch, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { isUnresolved, statusCounts } from "@/lib/audit";
import type { Audit } from "@/lib/types";
import { Logo } from "../ui/logo";
import { relativeTime } from "../ui/primitives";
import { useWorkspace } from "./store";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { audits, active, view, setView, select } = useWorkspace();

  const go = (fn: () => void) => () => {
    fn();
    onNavigate?.();
  };

  return (
    <nav className="flex w-full flex-col" aria-label="Workspace">
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="rounded-md" aria-label="Receipts home">
          <Logo />
        </Link>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={go(() => setView("new"))}
          className={clsx(
            "flex h-9 w-full items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
            view === "new"
              ? "border-accent/40 bg-accent/10 text-fg"
              : "border-line-strong bg-panel-2 text-fg hover:border-fg-3/40 hover:bg-panel-3",
          )}
          aria-current={view === "new" ? "page" : undefined}
        >
          <Plus className="size-4 text-accent" aria-hidden /> New audit
        </button>
      </div>

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
        <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Recent audits</p>
        {audits.length === 0 ? (
          <p className="px-2 py-2 text-[13px] text-fg-3">No audits yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {audits.map((a) => (
              <li key={a.id}>
                <AuditLink audit={a} active={view === "audit" && active?.id === a.id} onClick={go(() => select(a.id))} />
              </li>
            ))}
          </ul>
        )}

        {active && view === "audit" && (
          <div className="mt-6">
            <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Current repository</p>
            <RepoCard audit={active} />
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={go(() => setView("settings"))}
          className={clsx(
            "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
            view === "settings" ? "bg-panel-3 text-fg" : "text-fg-2 hover:bg-panel-3 hover:text-fg",
          )}
          aria-current={view === "settings" ? "page" : undefined}
        >
          <Settings className="size-4" aria-hidden /> Settings &amp; privacy
        </button>
        <Link
          href="/"
          className="mt-0.5 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-fg-3 transition-colors hover:bg-panel-3 hover:text-fg"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to site
        </Link>
      </div>
    </nav>
  );
}

function AuditLink({ audit, active, onClick }: { audit: Audit; active: boolean; onClick: () => void }) {
  const counts = statusCounts(audit);
  const open = (Object.keys(counts) as (keyof typeof counts)[]).filter(isUnresolved).reduce((n, s) => n + counts[s], 0);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "group relative flex w-full flex-col rounded-md px-2 py-2 text-left transition-colors",
        active ? "bg-panel-3" : "hover:bg-panel-2",
      )}
    >
      {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden />}
      <span className="flex items-center gap-2">
        <span className={clsx("truncate text-[13px]", active ? "text-fg" : "text-fg-2 group-hover:text-fg")}>{audit.name}</span>
        {audit.isSample && (
          <span className="rounded border border-line-strong px-1 text-[10px] leading-4 text-fg-3">sample</span>
        )}
      </span>
      <span className="mt-1 flex items-center gap-2 text-[11px] text-fg-3">
        <span className="flex h-1.5 w-14 overflow-hidden rounded-full bg-panel-3" aria-hidden>
          {(["proven", "unverifiable", "missing", "contradicted"] as const).map((s) =>
            counts[s] ? (
              <span
                key={s}
                className={clsx(
                  "h-full",
                  s === "proven" && "bg-proven",
                  s === "unverifiable" && "bg-unver",
                  s === "missing" && "bg-missing",
                  s === "contradicted" && "bg-contra",
                )}
                style={{ width: `${(counts[s] / Math.max(1, audit.results.length)) * 100}%` }}
              />
            ) : null,
          )}
        </span>
        {open > 0 ? `${open} open` : "no open gaps"} · {relativeTime(audit.analyzedAt)}
      </span>
    </button>
  );
}

function RepoCard({ audit }: { audit: Audit }) {
  const Icon = audit.repo.kind === "github" ? GitBranch : audit.repo.kind === "folder" ? FolderOpen : FolderGit2;
  return (
    <div className="rounded-lg border border-line bg-panel-2 p-3">
      <p className="flex items-center gap-2 text-[13px] text-fg">
        <Icon className="size-4 shrink-0 text-fg-3" aria-hidden />
        <span className="truncate">
          {audit.repo.kind === "github" ? `${audit.repo.owner}/${audit.repo.repo}` : audit.repo.kind === "none" ? "No repository" : audit.repo.label.split(" · ")[0]}
        </span>
      </p>
      <p className="mt-1 truncate pl-6 font-mono text-[11px] text-fg-3">
        {audit.repo.kind === "github"
          ? `@ ${audit.repo.ref}`
          : audit.repo.kind === "demo"
            ? audit.repo.label.split(" · ").slice(1).join(" · ")
            : audit.repo.kind === "folder"
              ? "local folder · read in browser"
              : "connect one to verify"}
      </p>
      <p className="mt-2 pl-6 text-[11px] text-fg-3">{audit.filesScanned} source files scanned</p>
    </div>
  );
}
