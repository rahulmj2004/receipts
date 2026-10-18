"use client";

import clsx from "clsx";
import { Check, FolderOpen, GitBranch, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadGithubRepo, parseGithubUrl } from "@/lib/sources/github";
import { pickDirectory, readDirectoryHandle, readFileList, supportsDirectoryPicker } from "@/lib/sources/folder";
import type { RepoRef } from "@/lib/types";
import { Button } from "../ui/primitives";
import type { RepoSession } from "./store";

export interface LoadedRepo {
  repo: RepoRef;
  session: RepoSession;
  note?: string;
}

type Source = "folder" | "github" | "none";

export function RepoPicker({
  onLoaded,
  allowNone = false,
  initialSource = "folder",
}: {
  onLoaded: (r: LoadedRepo | null) => void;
  allowNone?: boolean;
  initialSource?: Source;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedRepo | null>(null);
  const [url, setUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.setAttribute("webkitdirectory", "");
    inputRef.current?.setAttribute("directory", "");
  }, []);

  const finish = (r: LoadedRepo | null) => {
    setLoaded(r);
    onLoaded(r);
  };

  const choose = (s: Source) => {
    setSource(s);
    setError(null);
    if (s === "none") finish({ repo: { kind: "none", label: "No repository" }, session: { files: [] } });
    else if (loaded?.repo.kind === "none") finish(null);
  };

  const pickFolder = async () => {
    setError(null);
    if (!supportsDirectoryPicker()) {
      inputRef.current?.click();
      return;
    }
    try {
      const handle = await pickDirectory();
      setBusy(true);
      const res = await readDirectoryHandle(handle, (n) => setProgress(`${n} source files read…`));
      if (res.files.length === 0) throw new Error("No source files found in that folder (node_modules, build output and .env files are skipped).");
      finish({
        repo: { kind: "folder", label: res.name },
        session: { files: res.files, handle: res.handle },
        note: res.truncated ? "Stopped at 3,000 files. Pick a subfolder for full coverage." : undefined,
      });
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") setError((e as Error).message || "Couldn't read that folder.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const onFileList = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await readFileList(list, (n) => setProgress(`${n} source files read…`));
      if (res.files.length === 0) throw new Error("No source files found in that folder.");
      finish({
        repo: { kind: "folder", label: res.name },
        session: { files: res.files },
        note: res.truncated ? "Stopped at 3,000 files." : undefined,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const fetchGithub = async () => {
    const target = parseGithubUrl(url);
    if (!target) {
      setError("Use the form owner/repo or https://github.com/owner/repo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await loadGithubRepo(target, (p) => setProgress(`${p.done} of ${p.total} files downloaded…`));
      if (res.files.length === 0) throw new Error("No source files found in that repository.");
      finish({
        repo: { kind: "github", label: `${target.owner}/${target.repo}@${res.ref}`, owner: target.owner, repo: target.repo, ref: res.ref },
        session: { files: res.files, github: { ...target, ref: res.ref } },
        note: res.truncated ? `Large repository: ${res.skipped} files beyond the 600-file limit weren't read.` : undefined,
      });
    } catch (e) {
      setError((e as Error).message || "Couldn't reach GitHub.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const tabs: { id: Source; label: string; icon: typeof FolderOpen }[] = [
    { id: "folder", label: "Local folder", icon: FolderOpen },
    { id: "github", label: "Public GitHub repo", icon: GitBranch },
  ];

  return (
    <div>
      <div className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5" role="tablist" aria-label="Repository source">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={source === t.id}
            onClick={() => choose(t.id)}
            className={clsx(
              "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors",
              source === t.id ? "bg-panel-3 text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            <t.icon className="size-3.5" aria-hidden /> {t.label}
          </button>
        ))}
        {allowNone && (
          <button
            type="button"
            role="tab"
            aria-selected={source === "none"}
            onClick={() => choose("none")}
            className={clsx(
              "inline-flex h-8 items-center rounded-md px-3 text-[13px] transition-colors",
              source === "none" ? "bg-panel-3 text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            Skip
          </button>
        )}
      </div>

      <div className="mt-3">
        {source === "folder" && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={pickFolder} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FolderOpen className="size-4" aria-hidden />}
              {loaded?.repo.kind === "folder" ? "Choose a different folder" : "Choose folder…"}
            </Button>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFileList(e.target.files)} />
            <p className="text-[12.5px] text-fg-3">Read in your browser. node_modules, build output and .env files are skipped.</p>
          </div>
        )}
        {source === "github" && (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              fetchGithub();
            }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              aria-label="Public GitHub repository URL"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 font-mono text-[13px] text-fg placeholder:text-fg-3 focus:border-line-strong focus:outline-none"
            />
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Fetch
            </Button>
          </form>
        )}
        {source === "github" && (
          <p className="mt-2 text-[12.5px] text-fg-3">Your browser downloads the files straight from GitHub&apos;s public API. Up to 600 files.</p>
        )}
        {source === "none" && (
          <p className="text-[13px] text-fg-2">Requirements will be extracted, but none can be verified without code.</p>
        )}

        {busy && progress && <p className="mt-3 text-[12.5px] text-fg-2 tabular-nums">{progress}</p>}
        {error && (
          <p className="mt-3 flex items-start gap-2 text-[13px] text-contra" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
        {loaded && loaded.repo.kind !== "none" && !busy && (
          <div className="mt-3 rounded-lg border border-proven/20 bg-proven/[0.05] px-3 py-2.5 text-[13px]">
            <p className="flex items-center gap-2 text-fg">
              <Check className="size-4 text-proven" aria-hidden />
              <span className="font-medium">{loaded.repo.label}</span>
              <span className="text-fg-2">· {loaded.session.files.length} source files ready</span>
            </p>
            {loaded.note && <p className="mt-1 pl-6 text-[12px] text-missing">{loaded.note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
