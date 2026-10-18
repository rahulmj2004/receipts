const PATTERNS: { re: RegExp; replace: (m: string, ...g: string[]) => string }[] = [
  {
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: () => "[redacted private key]",
  },
  { re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g, replace: () => "[redacted key]" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replace: () => "[redacted token]" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, replace: () => "[redacted token]" },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: () => "[redacted key]" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, replace: () => "[redacted token]" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: () => "[redacted key]" },
  {
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replace: () => "[redacted jwt]",
  },
  {
    re: /\b(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)(\s*[:=]\s*)(['"]?)([^\s'"]{6,})\3/gi,
    replace: (_m, key: string, sep: string, q: string) => `${key}${sep}${q}[redacted]${q}`,
  },
];

/** Replace likely credentials. Returns the cleaned text and how many were removed. */
export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, (...args) => {
      count++;
      return replace(...(args as [string, ...string[]]));
    });
  }
  return { text: out, count };
}
