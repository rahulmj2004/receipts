"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createAudit } from "@/lib/audit";
import { demoConversation } from "@/lib/demo/conversation";
import { SNAPSHOTS, snapshotById } from "@/lib/demo/repo";
import type { GithubTarget } from "@/lib/sources/github";
import type { Audit, RepoFile } from "@/lib/types";

const STORAGE_KEY = "receipts:v1";

export type View = "audit" | "new" | "settings";

/** Repository contents live in memory only; audits store excerpts, never whole files. */
export interface RepoSession {
  files: RepoFile[];
  handle?: unknown;
  github?: GithubTarget;
}

interface Persisted {
  version: 1;
  audits: Audit[];
  activeId: string | null;
}

export function buildSampleAudit(): Audit {
  const snap = SNAPSHOTS[0];
  return createAudit({
    name: "Clinic booking",
    conversation: demoConversation(),
    repo: { kind: "demo", label: `${snap.sha} · ${snap.message}`, snapshot: snap.id },
    files: snap.files,
    isSample: true,
  });
}

function load(): Persisted | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Persisted;
    if (data?.version !== 1 || !Array.isArray(data.audits)) return null;
    const audits = data.audits.filter((a) => a && typeof a.id === "string" && Array.isArray(a.chains) && Array.isArray(a.results));
    return { version: 1, audits, activeId: data.activeId ?? null };
  } catch {
    return null;
  }
}

interface Ctx {
  ready: boolean;
  audits: Audit[];
  active: Audit | null;
  view: View;
  storageError: boolean;
  setView: (v: View) => void;
  select: (id: string) => void;
  add: (audit: Audit, session?: RepoSession) => void;
  update: (audit: Audit, session?: RepoSession) => void;
  remove: (id: string) => void;
  discardAll: () => void;
  resetSample: () => Audit;
  filesFor: (audit: Audit) => RepoFile[] | null;
  sessionFor: (audit: Audit) => RepoSession | undefined;
}

const WorkspaceContext = createContext<Ctx | null>(null);

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setViewState] = useState<View>("audit");
  const [storageError, setStorageError] = useState(false);
  const sessions = useRef(new Map<string, RepoSession>());

  useEffect(() => {
    const stored = load();
    const initial = stored && stored.audits.length > 0 ? stored : { version: 1 as const, audits: [buildSampleAudit()], activeId: "sample" };
    const wantsNew = window.location.hash === "#new";
    // Restoring browser-only state after hydration is the intended use of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudits(initial.audits);
    setActiveId(initial.activeId ?? initial.audits[0]?.id ?? null);
    setViewState(wantsNew ? "new" : "audit");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let failed = false;
    try {
      const data: Persisted = { version: 1, audits, activeId };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      failed = true;
    }
    queueMicrotask(() => setStorageError(failed));
  }, [audits, activeId, ready]);

  const setView = useCallback((v: View) => {
    setViewState(v);
    const hash = v === "new" ? "#new" : "";
    if (window.location.hash !== hash) window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
  }, []);

  const select = useCallback(
    (id: string) => {
      setActiveId(id);
      setView("audit");
    },
    [setView],
  );

  const add = useCallback(
    (audit: Audit, session?: RepoSession) => {
      if (session) sessions.current.set(audit.id, session);
      setAudits((list) => [audit, ...list.filter((a) => a.id !== audit.id)]);
      setActiveId(audit.id);
      setView("audit");
    },
    [setView],
  );

  const update = useCallback((audit: Audit, session?: RepoSession) => {
    if (session) sessions.current.set(audit.id, session);
    setAudits((list) => list.map((a) => (a.id === audit.id ? audit : a)));
  }, []);

  const remove = useCallback((id: string) => {
    sessions.current.delete(id);
    setAudits((list) => {
      const next = list.filter((a) => a.id !== id);
      setActiveId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
      return next;
    });
  }, []);

  const discardAll = useCallback(() => {
    sessions.current.clear();
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable: in-memory state is still cleared */
    }
    setAudits([]);
    setActiveId(null);
    setView("new");
  }, [setView]);

  const resetSample = useCallback(() => {
    const fresh = buildSampleAudit();
    setAudits((list) => [fresh, ...list.filter((a) => a.id !== "sample")]);
    setActiveId("sample");
    setView("audit");
    return fresh;
  }, [setView]);

  const filesFor = useCallback((audit: Audit): RepoFile[] | null => {
    if (audit.repo.kind === "demo") return snapshotById(audit.repo.snapshot).files;
    return sessions.current.get(audit.id)?.files ?? null;
  }, []);

  const sessionFor = useCallback((audit: Audit) => sessions.current.get(audit.id), []);

  const active = useMemo(() => audits.find((a) => a.id === activeId) ?? null, [audits, activeId]);

  const value = useMemo<Ctx>(
    () => ({ ready, audits, active, view, storageError, setView, select, add, update, remove, discardAll, resetSample, filesFor, sessionFor }),
    [ready, audits, active, view, storageError, setView, select, add, update, remove, discardAll, resetSample, filesFor, sessionFor],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
