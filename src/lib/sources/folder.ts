import { MAX_FILE_BYTES, MAX_FILES, isIgnoredDir, safeRelativePath, shouldScan } from "../evidence/repo";
import type { RepoFile } from "../types";

/**
 * Local folders are read entirely in the browser through the File System Access API
 * (Chromium) or a webkitdirectory <input> (other browsers). Nothing is uploaded.
 */

interface DirHandle {
  name: string;
  kind: "directory";
  values(): AsyncIterable<DirHandle | FileHandle>;
}
interface FileHandle {
  name: string;
  kind: "file";
  getFile(): Promise<File>;
}

type PickerWindow = Window & { showDirectoryPicker?: (opts?: { mode?: "read" }) => Promise<DirHandle> };

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

export interface FolderResult {
  name: string;
  files: RepoFile[];
  truncated: boolean;
  handle?: unknown;
}

export async function pickDirectory(): Promise<DirHandle> {
  return (window as PickerWindow).showDirectoryPicker!({ mode: "read" });
}

export async function readDirectoryHandle(
  root: unknown,
  onProgress?: (count: number) => void,
): Promise<FolderResult> {
  const dir = root as DirHandle;
  const files: RepoFile[] = [];
  let truncated = false;
  async function walk(handle: DirHandle, prefix: string) {
    for await (const entry of handle.values()) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      if (entry.kind === "directory") {
        if (isIgnoredDir(entry.name) || entry.name.startsWith(".")) continue;
        await walk(entry, `${prefix}${entry.name}/`);
      } else {
        const path = safeRelativePath(`${prefix}${entry.name}`);
        if (!path || !shouldScan(path)) continue;
        const file = await entry.getFile();
        if (file.size > MAX_FILE_BYTES) continue;
        files.push({ path, content: await file.text() });
        onProgress?.(files.length);
      }
    }
  }
  await walk(dir, "");
  return { name: dir.name, files, truncated, handle: dir };
}

/** Fallback for <input type="file" webkitdirectory>. */
export async function readFileList(list: FileList, onProgress?: (count: number) => void): Promise<FolderResult> {
  const all = Array.from(list);
  const first = (all[0] as File & { webkitRelativePath?: string })?.webkitRelativePath ?? "";
  const rootName = first.split("/")[0] || "folder";
  const files: RepoFile[] = [];
  let truncated = false;
  for (const f of all) {
    const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath ?? f.name).split("/").slice(1).join("/");
    const path = safeRelativePath(rel);
    if (!path || !shouldScan(path, f.size)) continue;
    if (files.length >= MAX_FILES) {
      truncated = true;
      break;
    }
    files.push({ path, content: await f.text() });
    onProgress?.(files.length);
  }
  return { name: rootName, files, truncated };
}
