"use client";

import clsx from "clsx";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { GitCommitHorizontal, MessageSquareQuote, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { snapshotById } from "@/lib/demo/repo";
import type { Status } from "@/lib/types";
import { CodeBlock } from "../ui/code-block";
import { StatusBadge } from "../ui/primitives";

const routeFile = snapshotById("v1").files.find((f) => f.path === "src/app/api/bookings/route.ts")!;
const SNIPPET_START = 8;
const SNIPPET = routeFile.content.split("\n").slice(SNIPPET_START - 1, 12).join("\n");
const TARGET_LINE = routeFile.content.split("\n").findIndex((l) => l.includes("prisma.booking.create")) + 1;
const TARGET = 3;

type Row = { title: string; meta: string; final: Status; revealAt: number; superseded?: string };
const ROWS: Row[] = [
  { title: "Patients can book without logging in", meta: "src/app/book/page.tsx:5 · requireAuth()", final: "contradicted", revealAt: 1 },
  { title: "Display appointment times in IST", meta: "src/lib/time.ts:11 · still UTC", final: "contradicted", revealAt: 1, superseded: "UTC" },
  { title: "Send a confirmation email", meta: "helper defined, never called", final: "missing", revealAt: 2 },
  { title: "Save every booking to the database", meta: `src/app/api/bookings/route.ts:${TARGET_LINE}`, final: "proven", revealAt: 5 },
  { title: "Page works on mobile", meta: "needs a check at 375px", final: "unverifiable", revealAt: 3 },
];

export function LedgerPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      const t = window.setTimeout(() => setStep(6), 0);
      return () => window.clearTimeout(t);
    }
    const times = [0, 500, 850, 1150, 1500, 2700, 3000];
    const timers = times.map((ms, i) => window.setTimeout(() => setStep(i), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [inView, reduce, run]);

  // Steps: 0 idle · 1-3 reveal rows · 4 inspect IST evidence (scan) · 5 IST proven · 6 settled
  const scanning = step === 4;

  return (
    <div ref={ref} className="relative">
      <div className="overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
          </span>
          <span className="ml-2 truncate font-mono text-[11px] text-fg-3">receipts · clinic-booking · sample</span>
          <button
            type="button"
            onClick={() => {
              setStep(0);
              setRun((r) => r + 1);
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-fg-3 transition-colors hover:bg-panel-3 hover:text-fg-2"
            aria-label="Replay animation"
          >
            <RotateCcw className="size-3" aria-hidden /> Replay
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="border-b border-line p-4 md:border-r md:border-b-0">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">
              <MessageSquareQuote className="size-3.5" aria-hidden /> Agent said
            </p>
            <div className="rounded-xl rounded-tl-sm border border-line bg-panel-2 p-3 text-[13px] leading-relaxed text-fg-2">
              All done! ✅ I&apos;ve implemented every requirement. The app is ready to ship.
            </div>
            <AnimatePresence>
              {step >= 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 rounded-xl border border-contra/25 bg-contra/[0.06] p-3 text-[13px] leading-relaxed"
                >
                  <span className="font-medium text-fg">3 of 5 aren&apos;t done.</span>
                  <span className="text-fg-2"> 1 needs a human check. Evidence attached to each.</span>
                </motion.div>
              )}
            </AnimatePresence>
            <p className="mt-4 hidden items-center gap-1.5 font-mono text-[11px] text-fg-3 md:flex">
              <GitCommitHorizontal className="size-3.5" aria-hidden /> checked against a1f3c9e
            </p>
          </div>

          <ul className="divide-y divide-line">
            {ROWS.map((row, i) => {
              const revealed = step >= row.revealAt;
              const isTarget = i === TARGET;
              return (
                <motion.li
                  key={row.title}
                  initial={{ opacity: 0, y: 4 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: i * 0.06 }}
                  className={clsx("px-4 py-3", isTarget && step >= 4 && "bg-panel-2/60")}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-fg">{row.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 truncate font-mono text-[11px] text-fg-3">
                        {row.superseded && (
                          <span className="rounded border border-line px-1 text-[10px] text-fg-2">
                            v2 · replaces <span className="line-through">{row.superseded}</span>
                          </span>
                        )}
                        {revealed ? row.meta : "…"}
                      </p>
                    </div>
                    {revealed ? (
                      <StatusBadge status={row.final} size="sm" />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line-strong px-1.5 py-0.5 text-[11px] text-fg-3">
                        <span className="size-1.5 animate-pulse rounded-full bg-fg-3" />
                        {isTarget && scanning ? "Inspecting" : "Unverified"}
                      </span>
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {isTarget && step >= 4 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28 }}
                        className="overflow-hidden"
                      >
                        <div className="relative mt-2.5 overflow-hidden rounded-lg border border-line bg-canvas">
                          <div className="flex items-center justify-between border-b border-line px-3 py-1.5 font-mono text-[10.5px] text-fg-3">
                            <span>src/app/api/bookings/route.ts</span>
                            <span>static evidence</span>
                          </div>
                          <CodeBlock
                            code={SNIPPET}
                            startLine={SNIPPET_START}
                            highlightFrom={step >= 5 ? TARGET_LINE : undefined}
                            tone="proven"
                            className="py-1.5 text-[11px]"
                          />
                          {scanning && (
                            <motion.div
                              aria-hidden
                              className="pointer-events-none absolute inset-x-0 h-5 bg-gradient-to-b from-transparent via-accent/15 to-transparent"
                              initial={{ top: 28 }}
                              animate={{ top: 118 }}
                              transition={{ duration: 1.1, ease: "easeInOut" }}
                            />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] text-fg-3">
        Illustrative sample project. The real engine runs on it in the demo.
      </p>
    </div>
  );
}
