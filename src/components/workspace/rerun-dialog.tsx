"use client";

import clsx from "clsx";
import { FolderOpen, GitBranch, GitCommitHorizontal, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { rerunAudit } from "@/lib/audit";
import { SNAPSHOTS, changedFiles, snapshotById } from "@/lib/demo/repo";
import { loadGithubRepo } from "@/lib/sources/github";
import { readDirectoryHandle } from "@/lib/sources/folder";
import type { Audit } from "@/lib/types";
import { Modal } from "../ui/overlay";
import { Button } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { RepoPicker, type LoadedRepo } from "./repo-picker";
import { useWorkspace } from "./store";

function changedCount(after: Audit): number {
  return after.results.filter((r) => r.previousStatus && r.previousStatus !== r.evaluation.status).length;
}

export function RerunDialog({ open, onClose, audit }: { open: boolean; onClose: () => void; audit: Audit }) {
  const { update, sessionFor } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(audit.repo.kind === "demo" ? (audit.repo.snapshot === "v1" ? "v2" : "v1") : "v1");
  const [picked, setPicked] = useState<LoadedRepo | null>(null);
  const session = sessionFor(audit);

  const done = (next: Audit) => {
    const n = changedCount(next);
    onClose();
    toast(n > 0 ? `Rerun complete: ${n} verdict${n > 1 ? "s" : ""} changed` : "Rerun complete: no verdicts changed", n > 0 ? "success" : "info");
  };

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    setError(null);
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await fn();
    } catch (e) {
      setError((e as Error).message || "The rerun failed.");
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  let action: React.ReactNode;

  if (audit.repo.kind === "demo") {
    const current = snapshotById(audit.repo.snapshot);
    const target = snapshotById(snapshot);
    const diff = changedFiles(current, target);
    body = (
      <div className="space-y-2 px-5 py-4">
        <p className="text-[13px] text-fg-2">Pick the commit to check. These are commits in the sample repository.</p>
        {SNAPSHOTS.map((s) => (
          <label
            key={s.id}
            className={clsx(
              "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
              snapshot === s.id ? "border-accent/40 bg-accent/[0.06]" : "border-line hover:border-line-strong",
            )}
          >
            <input type="radio" name="snapshot" value={s.id} checked={snapshot === s.id} onChange={() => setSnapshot(s.id)} className="mt-1 accent-[var(--accent)]" />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-fg">
                <GitCommitHorizontal className="size-4 text-fg-3" aria-hidden />
                <span className="font-mono text-[12px] text-fg-2">{s.sha}</span> {s.message}
                {s.id === current.id && <span className="rounded border border-line-strong px-1 text-[10.5px] text-fg-3">checked now</span>}
              </p>
              <p className="mt-1 text-[12.5px] text-fg-3">{s.description}</p>
            </div>
          </label>
        ))}
        {diff.length > 0 && (
          <div className="rounded-lg border border-line bg-panel-2 px-3.5 py-3">
            <p className="text-[12px] text-fg-3">
              {diff.length} file{diff.length > 1 ? "s" : ""} differ from {current.sha}
            </p>
            <ul className="mt-1.5 space-y-0.5 font-mono text-[12px]">
              {diff.map((d) => (
                <li key={d.path} className="flex gap-2">
                  <span className={clsx("w-3", d.change === "added" && "text-proven", d.change === "removed" && "text-contra", d.change === "modified" && "text-missing")}>
                    {d.change === "added" ? "A" : d.change === "removed" ? "D" : "M"}
                  </span>
                  <span className="text-fg-2">{d.path}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
    action = (
      <Button
        variant="primary"
        disabled={busy}
        onClick={() =>
          run(() => {
            const next = rerunAudit(audit, target.files, { kind: "demo", label: `${target.sha} · ${target.message}`, snapshot: target.id });
            update(next);
            done(next);
          })
        }
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} Rerun against {target.sha}
      </Button>
    );
  } else if (audit.repo.kind === "github" && session?.github) {
    const gh = session.github;
    body = (
      <p className="px-5 py-4 text-[13px] text-fg-2">
        Downloads <span className="font-mono text-fg">{gh.owner}/{gh.repo}</span> again from GitHub and re-checks every requirement. Your verdict
        overrides are kept.
      </p>
    );
    action = (
      <Button
        variant="primary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const res = await loadGithubRepo({ owner: gh.owner, repo: gh.repo });
            const next = rerunAudit(audit, res.files, { kind: "github", label: `${gh.owner}/${gh.repo}@${res.ref}`, owner: gh.owner, repo: gh.repo, ref: res.ref });
            update(next, { files: res.files, github: { ...gh, ref: res.ref } });
            done(next);
          })
        }
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GitBranch className="size-4" aria-hidden />} Re-fetch and rerun
      </Button>
    );
  } else if (audit.repo.kind === "folder" && session?.handle) {
    body = (
      <p className="px-5 py-4 text-[13px] text-fg-2">
        Reads <span className="font-mono text-fg">{audit.repo.label}</span> again from disk, in your browser, and re-checks every requirement.
      </p>
    );
    action = (
      <Button
        variant="primary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            const res = await readDirectoryHandle(session.handle);
            const next = rerunAudit(audit, res.files, { kind: "folder", label: res.name });
            update(next, { files: res.files, handle: res.handle });
            done(next);
          })
        }
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FolderOpen className="size-4" aria-hidden />} Re-read folder and rerun
      </Button>
    );
  } else {
    body = (
      <div className="px-5 py-4">
        <p className="mb-3 text-[13px] text-fg-2">
          {audit.repo.kind === "none"
            ? "This audit has no repository yet. Connect one to verify the requirements."
            : "Repository contents aren't kept between sessions. Connect it again to rerun."}
        </p>
        <RepoPicker onLoaded={setPicked} initialSource={audit.repo.kind === "github" ? "github" : "folder"} />
      </div>
    );
    action = (
      <Button
        variant="primary"
        disabled={busy || !picked || picked.repo.kind === "none"}
        onClick={() =>
          run(() => {
            const next = rerunAudit(audit, picked!.session.files, picked!.repo);
            update(next, picked!.session);
            done(next);
          })
        }
      >
        <RefreshCw className="size-4" aria-hidden /> Rerun audit
      </Button>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rerun audit"
      description="Same requirements, fresh evidence. A verdict changes only if the code does."
      width="max-w-xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <p className="mr-auto text-[12.5px] text-contra">{error}</p>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {action}
        </div>
      }
    >
      {body}
    </Modal>
  );
}
