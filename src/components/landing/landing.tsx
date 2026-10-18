"use client";

import { motion } from "motion/react";
import { ArrowRight, Check, Copy, FileCode2, GitBranch, ListChecks, Lock, Wand2 } from "lucide-react";
import Link from "next/link";
import { STATUSES } from "@/lib/types";
import { Logo } from "../ui/logo";
import { STATUS_META, StatusIcon } from "../ui/primitives";
import { LedgerPreview } from "./ledger-preview";

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

function PrimaryCta({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-[15px] font-medium text-[#1a0a04] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition-colors hover:bg-accent-hover"
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function SecondaryCta({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong bg-panel-2 px-5 text-[15px] font-medium text-fg transition-colors hover:border-fg-3/50 hover:bg-panel-3"
    >
      {children}
    </Link>
  );
}

export function Landing() {
  return (
    <div className="relative overflow-x-clip">
      <div className="code-grid pointer-events-none absolute inset-x-0 top-0 h-[720px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <a href="#how" className="hidden rounded-md px-3 py-2 text-fg-2 transition-colors hover:text-fg sm:inline-block">
            How it works
          </a>
          <a href="#verdicts" className="hidden rounded-md px-3 py-2 text-fg-2 transition-colors hover:text-fg sm:inline-block">
            Verdicts
          </a>
          <Link
            href="/app"
            className="ml-1 rounded-lg border border-line-strong bg-panel-2 px-3 py-1.5 text-fg transition-colors hover:bg-panel-3"
          >
            Open app
          </Link>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-16 lg:pt-20">
          <div className="mx-auto max-w-4xl text-center">
            <motion.p
              {...fadeUp}
              transition={{ duration: 0.3 }}
              className="mx-auto inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel/80 px-3 py-1 text-[12.5px] text-fg-2"
            >
              <span className="size-1.5 rounded-full bg-accent" /> For developers who build with AI coding agents
            </motion.p>
            <motion.h1
              {...fadeUp}
              transition={{ duration: 0.35, delay: 0.05 }}
              className="mt-6 text-[40px] leading-[1.04] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[66px]"
            >
              You said it.
              <br />
              <span className="text-fg-2">Did your AI </span>
              <span className="text-accent">actually build it?</span>
            </motion.h1>
            <motion.p
              {...fadeUp}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-fg-2 text-pretty sm:text-lg"
            >
              Every requirement. Every correction. Every omission. Receipts checks your AI-generated code against what
              you actually asked for.
            </motion.p>
            <motion.div
              {...fadeUp}
              transition={{ duration: 0.35, delay: 0.15 }}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <PrimaryCta href="/app#new">Audit a project</PrimaryCta>
              <SecondaryCta href="/app">Explore the demo</SecondaryCta>
            </motion.div>
            <motion.p
              {...fadeUp}
              transition={{ duration: 0.35, delay: 0.2 }}
              className="mt-5 inline-flex items-center gap-1.5 text-[12.5px] text-fg-3"
            >
              <Lock className="size-3.5" aria-hidden /> Runs in your browser. No sign-up, no API key.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.25 }}
            className="mx-auto mt-14 max-w-4xl"
          >
            <LedgerPreview />
          </motion.div>
        </section>

        <section id="how" className="mx-auto max-w-6xl scroll-mt-10 px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-[13px] font-medium text-accent">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
              &ldquo;Done&rdquo; is a claim. Receipts asks for proof.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-fg-2">
              Point it at your coding session and your repository. It reads only your messages, keeps the latest version
              of every ask, and looks for file-and-line evidence in the code. The agent&apos;s own report is never used
              as evidence.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Feature
              icon={ListChecks}
              title="Requirements, not a summary"
              body="Long dictated prompts are cut into atomic asks, each linked to the exact words you used."
            >
              <p className="text-[13px] leading-relaxed text-fg-2">
                &ldquo;<mark className="rounded bg-accent/15 px-0.5 text-fg">Add a booking page</mark>,{" "}
                <mark className="rounded bg-accent/15 px-0.5 text-fg">use IST</mark>,{" "}
                <mark className="rounded bg-accent/15 px-0.5 text-fg">remove login</mark>, and{" "}
                <mark className="rounded bg-accent/15 px-0.5 text-fg">send a confirmation email</mark>.&rdquo;
              </p>
              <p className="mt-3 font-mono text-[11.5px] text-fg-3">→ 4 requirements, each checked separately</p>
            </Feature>

            <Feature
              icon={GitBranch}
              title="Corrections tracked across turns"
              body="When you change your mind three messages later, the old ask is kept in history and the new one is what gets checked."
            >
              <ol className="space-y-2 text-[13px]">
                <li className="flex items-center gap-2 text-fg-3">
                  <span className="font-mono text-[11px]">#2</span>
                  <span className="line-through">Display times in UTC</span>
                  <span className="rounded border border-line px-1 text-[10.5px]">replaced</span>
                </li>
                <li className="flex items-center gap-2 text-fg">
                  <span className="font-mono text-[11px] text-fg-3">#4</span>
                  Actually, change all displayed times to IST
                  <span className="rounded border border-accent/30 bg-accent/10 px-1 text-[10.5px] text-accent">current</span>
                </li>
              </ol>
            </Feature>

            <Feature
              icon={FileCode2}
              title="Evidence or it isn't proven"
              body="Proven means a real file and line supports it. A filename or a matching variable name isn't enough."
            >
              <div className="overflow-hidden rounded-lg border border-line bg-canvas font-mono text-[11.5px]">
                <div className="border-b border-line px-3 py-1.5 text-fg-3">src/lib/time.ts:11</div>
                <div className="bg-contra/[0.08] px-3 py-1.5 text-fg shadow-[inset_2px_0_0_var(--contra)]">
                  timeZone: <span className="text-[#e6c07b]">&quot;UTC&quot;</span>,
                </div>
              </div>
              <p className="mt-2 text-[12px] text-fg-3">Contradicts &ldquo;change all displayed times to IST&rdquo;</p>
            </Feature>

            <Feature
              icon={Wand2}
              title="Gaps become a fix prompt"
              body="Select what's unresolved and get a precise follow-up for your agent, with evidence and a request for proof."
            >
              <div className="rounded-lg border border-line bg-canvas p-3 font-mono text-[11.5px] leading-relaxed text-fg-2">
                <p className="text-fg">1. Change all displayed times to IST [CONTRADICTED]</p>
                <p>&nbsp;&nbsp; Conflicting code: src/lib/time.ts:11</p>
                <p>&nbsp;&nbsp; Expected: timeZone: &apos;Asia/Kolkata&apos;…</p>
                <p className="mt-2 inline-flex items-center gap-1 text-fg-3">
                  <Copy className="size-3" aria-hidden /> Copy prompt
                </p>
              </div>
            </Feature>
          </div>
        </section>

        <section id="verdicts" className="mx-auto max-w-6xl scroll-mt-10 px-4 py-16 sm:px-6">
          <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Four verdicts, used consistently</h2>
            <p className="mt-2 max-w-2xl text-[15px] text-fg-2">
              When code alone can&apos;t settle a requirement, Receipts says so instead of guessing.
            </p>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[...STATUSES].reverse().map((s) => (
                <div key={s} className="rounded-xl border border-line bg-panel-2 p-4">
                  <dt className={`flex items-center gap-2 text-sm font-medium ${STATUS_META[s].text}`}>
                    <StatusIcon status={s} className="size-4" /> {STATUS_META[s].label}
                  </dt>
                  <dd className="mt-2 text-[13px] leading-relaxed text-fg-2">{VERDICT_COPY[s]}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pt-8 pb-24 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-panel-2 px-6 py-12 text-center sm:px-12">
            <div className="code-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-[-0.025em] text-balance">
                Before you ship it, get the receipts.
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-fg-2">
                Open the sample audit in one click, or check your own Claude Code session against your repo.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <PrimaryCta href="/app#new">Audit a project</PrimaryCta>
                <SecondaryCta href="/app">Explore the demo</SecondaryCta>
              </div>
              <ul className="mx-auto mt-7 flex max-w-xl flex-wrap justify-center gap-x-5 gap-y-2 text-[12.5px] text-fg-3">
                {["Claude Code logs or pasted chats", "Local folder or public GitHub repo", "Nothing uploaded to Receipts"].map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5">
                    <Check className="size-3.5 text-proven" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-[12.5px] text-fg-3 sm:flex-row sm:px-6">
          <Logo className="text-sm" />
          <p>Rule-based checks, run on your machine. Results are evidence, not a guarantee.</p>
        </div>
      </footer>
    </div>
  );
}

const VERDICT_COPY = {
  proven: "Relevant code was found that supports the requirement, with the file and line attached.",
  contradicted: "Code was found that does something different, for example UTC where you asked for IST.",
  missing: "No implementation was found in the files scanned. Receipts doesn't treat that as absolute proof of absence.",
  unverifiable: "Code inspection can't decide it, for example layout on mobile. A person has to check.",
} as const;

function Feature({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.3 }}
      className="flex flex-col rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-line-strong sm:p-6"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg border border-line-strong bg-panel-2">
          <Icon className="size-4 text-accent" />
        </span>
        <h3 className="font-medium tracking-[-0.01em]">{title}</h3>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-fg-2">{body}</p>
      <div className="mt-5 rounded-xl border border-line bg-panel-2/60 p-4">{children}</div>
    </motion.article>
  );
}
