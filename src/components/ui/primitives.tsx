"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, CircleX, ScanEye, SearchX, type LucideIcon } from "lucide-react";
import { forwardRef, useCallback, useState } from "react";
import type { Status } from "@/lib/types";

export const STATUS_META: Record<
  Status,
  { label: string; short: string; icon: LucideIcon; text: string; bg: string; border: string; dot: string; hint: string }
> = {
  proven: {
    label: "Proven",
    short: "Proven",
    icon: CircleCheck,
    text: "text-proven",
    bg: "bg-proven/10",
    border: "border-proven/25",
    dot: "bg-proven",
    hint: "Code evidence supports it",
  },
  contradicted: {
    label: "Contradicted",
    short: "Contradicted",
    icon: CircleX,
    text: "text-contra",
    bg: "bg-contra/10",
    border: "border-contra/25",
    dot: "bg-contra",
    hint: "Code does something else",
  },
  missing: {
    label: "Missing",
    short: "Missing",
    icon: SearchX,
    text: "text-missing",
    bg: "bg-missing/10",
    border: "border-missing/25",
    dot: "bg-missing",
    hint: "No implementation found",
  },
  unverifiable: {
    label: "Unverifiable",
    short: "Needs check",
    icon: ScanEye,
    text: "text-unver",
    bg: "bg-unver/10",
    border: "border-unver/25 border-dashed",
    dot: "bg-unver",
    hint: "Code alone can't settle it",
  },
};

export function StatusIcon({ status, className }: { status: Status; className?: string }) {
  const Icon = STATUS_META[status].icon;
  return <Icon className={clsx("shrink-0", STATUS_META[status].text, className)} aria-hidden strokeWidth={2} />;
}

/** Animates when the status changes, so a rerun visibly flips it. */
export function StatusBadge({ status, size = "md", className }: { status: Status; size?: "sm" | "md"; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={clsx("relative", className ?? "inline-flex")}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, y: -6, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 6, filter: "blur(2px)" }}
          transition={{ duration: 0.24 }}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap",
            m.bg,
            m.border,
            m.text,
            size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
          )}
        >
          <m.icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden strokeWidth={2.2} />
          {m.label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        size === "sm" && "h-8 px-2.5 text-[13px]",
        size === "md" && "h-9 px-3.5 text-sm",
        size === "lg" && "h-11 px-5 text-[15px]",
        variant === "primary" &&
          "bg-accent text-[#1a0a04] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-accent-hover",
        variant === "secondary" && "border border-line-strong bg-panel-2 text-fg hover:border-fg-3/50 hover:bg-panel-3",
        variant === "ghost" && "text-fg-2 hover:bg-panel-3 hover:text-fg",
        variant === "danger" && "border border-contra/30 bg-contra/10 text-contra hover:bg-contra/15",
        className,
      )}
      {...rest}
    />
  );
});

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={clsx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-panel-3 px-1 font-mono text-[10.5px] text-fg-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Chip({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] leading-4 text-fg-2 whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function useCopy(timeout = 1800) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), timeout);
      }
      return ok;
    },
    [timeout],
  );
  return { copied, copy };
}

export function formatTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return formatTime(iso);
}
