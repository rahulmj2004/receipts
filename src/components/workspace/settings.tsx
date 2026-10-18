"use client";

import { Lock, RotateCcw, Trash2 } from "lucide-react";
import { Button, relativeTime } from "../ui/primitives";
import { useToast } from "../ui/toast";
import { useWorkspace } from "./store";

const FACTS = [
  ["Conversations", "Logs and pasted chats are parsed in this tab. Only your own messages are used; likely secrets are redacted before anything is saved."],
  ["Local folders", "Read through your browser's file picker, in this tab. Dependencies, build output and .env files are skipped. Files aren't uploaded."],
  ["GitHub", "Public repositories are downloaded by your browser straight from GitHub's API. GitHub sees that request; Receipts has no server in between."],
  ["Storage", "Audits (requirements, quotes, verdicts and short evidence excerpts) are saved in this browser's local storage. Whole files are kept only in memory."],
  ["Analysis", "Rule-based extraction and static pattern checks. No AI model is called and no code is executed."],
] as const;

export function SettingsView() {
  const { audits, remove, discardAll, resetSample, storageError } = useWorkspace();
  const toast = useToast();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Settings &amp; privacy</h1>

        <section className="mt-8 rounded-xl border border-line bg-panel">
          <h2 className="flex items-center gap-2 border-b border-line px-5 py-3.5 text-[14px] font-medium">
            <Lock className="size-4 text-fg-3" aria-hidden /> Where your data goes
          </h2>
          <dl className="divide-y divide-line">
            {FACTS.map(([k, v]) => (
              <div key={k} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[140px_1fr] sm:gap-4">
                <dt className="text-[13px] text-fg">{k}</dt>
                <dd className="text-[13px] leading-relaxed text-fg-2">{v}</dd>
              </div>
            ))}
          </dl>
          {storageError && (
            <p className="border-t border-line px-5 py-3 text-[13px] text-missing">
              This browser blocked local storage, so audits will be lost when the tab closes.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-line bg-panel">
          <h2 className="border-b border-line px-5 py-3.5 text-[14px] font-medium">Saved audits</h2>
          {audits.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-fg-3">Nothing saved.</p>
          ) : (
            <ul className="divide-y divide-line">
              {audits.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-fg">
                      {a.name} {a.isSample && <span className="text-fg-3">(sample)</span>}
                    </p>
                    <p className="text-[12px] text-fg-3">
                      {a.results.length} requirements · analyzed {relativeTime(a.analyzedAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      remove(a.id);
                      toast("Audit deleted", "info");
                    }}
                    aria-label={`Delete ${a.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Delete
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
            <Button
              size="sm"
              onClick={() => {
                resetSample();
                toast("Sample audit restored", "info");
              }}
            >
              <RotateCcw className="size-3.5" aria-hidden /> Reset sample audit
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (window.confirm("Delete every audit stored in this browser? This can't be undone.")) {
                  discardAll();
                  toast("All audit data discarded", "info");
                }
              }}
            >
              <Trash2 className="size-3.5" aria-hidden /> Discard all data
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
