import type { RepoFile } from "../types";

export const MAX_FILE_BYTES = 256 * 1024;
export const MAX_FILES = 3000;

const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".turbo", ".vercel", ".cache", "dist",
  "build", "out", "coverage", "vendor", ".venv", "venv", "__pycache__", ".idea", ".vscode", "target",
  ".gradle", "Pods", ".expo", ".parcel-cache", "storybook-static",
]);

const CODE_EXT = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?|css|scss|sass|less|py|rb|go|rs|java|kt|kts|swift|php|cs|dart|sql|prisma|graphql|gql|ya?ml|toml)$/i;
const SKIP_FILE = /(?:^|\/)(?:\.env(?:\..*)?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|.*\.min\.(?:js|css)|.*\.map|.*\.d\.ts)$/i;
const TEST_FILE = /(?:^|\/)(?:__tests__|tests?|e2e|cypress|__mocks__)\/|\.(?:test|spec|stories)\.[a-z]+$/i;

/** Normalise a repository-relative path and reject anything that escapes the root. */
export function safeRelativePath(path: string): string | null {
  const parts = path.replace(/\\/g, "/").split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) return null;
  return parts.join("/") || null;
}

export function isIgnoredDir(name: string): boolean {
  return IGNORED_DIRS.has(name);
}

/** Whether a path is worth reading at all (code, not secrets, not dependencies). */
export function shouldScan(path: string, size?: number): boolean {
  const safe = safeRelativePath(path);
  if (!safe) return false;
  if (safe.split("/").some((seg) => IGNORED_DIRS.has(seg))) return false;
  if (SKIP_FILE.test(safe)) return false;
  if (!CODE_EXT.test(safe)) return false;
  if (size !== undefined && size > MAX_FILE_BYTES) return false;
  return true;
}

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

export function isUiFile(path: string): boolean {
  return /\.(?:[jt]sx|vue|svelte|astro|html?)$/i.test(path);
}

export interface IndexedFile {
  path: string;
  lines: string[];
}

export function indexFiles(files: RepoFile[]): IndexedFile[] {
  return files
    .filter((f) => shouldScan(f.path) && !isTestFile(f.path))
    .map((f) => ({ path: safeRelativePath(f.path)!, lines: f.content.split(/\r?\n/) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
