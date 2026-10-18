import clsx from "clsx";

/** A receipt with a torn edge and a check mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={clsx("shrink-0", className)} aria-hidden>
      <path
        d="M5 3.5A1.5 1.5 0 0 1 6.5 2h11A1.5 1.5 0 0 1 19 3.5V21l-2.33-1.5L14.33 21 12 19.5 9.67 21l-2.34-1.5L5 21V3.5Z"
        fill="var(--accent)"
      />
      <path d="m8.6 10.4 2.3 2.3 4.6-4.9" stroke="#1a0a04" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 15.6h7" stroke="#1a0a04" strokeOpacity=".45" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-semibold tracking-[-0.01em] text-fg", className)}>
      <LogoMark className="size-5" />
      Receipts
    </span>
  );
}
