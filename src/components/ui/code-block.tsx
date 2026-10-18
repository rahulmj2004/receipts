import clsx from "clsx";
import { Fragment } from "react";

const TOKEN =
  /(\/\/.*$|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(<\/?[A-Za-z][\w.]*)|\b(import|export|from|default|const|let|var|function|return|await|async|if|else|try|catch|finally|throw|new|type|interface|extends|model)\b|\b(\d+(?:\.\d+)?)\b/g;

/** Minimal, dependency-free highlighting. It only colors; text is never altered. */
function highlight(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [text, comment, str, tag, kw, num] = m;
    const cls = comment
      ? "text-fg-3 italic"
      : str
        ? "text-[#e6c07b]"
        : tag
          ? "text-[#7cc7ff]"
          : kw
            ? "text-[#c792ea]"
            : num
              ? "text-[#f78c6c]"
              : "";
    out.push(
      <span key={m.index} className={cls}>
        {text}
      </span>,
    );
    last = m.index + text.length;
    if (text.length === 0) TOKEN.lastIndex++;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function CodeBlock({
  code,
  startLine = 1,
  highlightFrom,
  highlightTo,
  tone = "neutral",
  className,
  wrap = false,
}: {
  code: string;
  startLine?: number;
  highlightFrom?: number;
  highlightTo?: number;
  tone?: "neutral" | "proven" | "contra" | "candidate";
  className?: string;
  wrap?: boolean;
}) {
  const lines = code.split("\n");
  const hl =
    tone === "proven"
      ? "bg-proven/[0.09] shadow-[inset_2px_0_0_var(--proven)]"
      : tone === "contra"
        ? "bg-contra/[0.10] shadow-[inset_2px_0_0_var(--contra)]"
        : tone === "candidate"
          ? "bg-unver/[0.08] shadow-[inset_2px_0_0_var(--unver)]"
          : "bg-accent/[0.08] shadow-[inset_2px_0_0_var(--accent)]";
  return (
    <div className={clsx("overflow-x-auto font-mono text-[12px] leading-[1.7]", className)}>
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            const n = startLine + i;
            const on = highlightFrom !== undefined && n >= highlightFrom && n <= (highlightTo ?? highlightFrom);
            return (
              <tr key={n} className={clsx(on && hl)} data-line={n}>
                <td className="w-0 select-none py-0 pr-3 pl-3 text-right align-top text-fg-3/70 tabular-nums">{n}</td>
                <td className={clsx("py-0 pr-4 align-top text-fg/90", wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")}>
                  {line.length ? <Fragment>{highlight(line)}</Fragment> : " "}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
