"use client";

import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "../ui/logo";
import { AuditView } from "./audit-view";
import { NewAudit } from "./new-audit";
import { SettingsView } from "./settings";
import { Sidebar } from "./sidebar";
import { useWorkspace, WorkspaceProvider } from "./store";

export function Workspace() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function Shell() {
  const { ready, view, active } = useWorkspace();
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-panel lg:flex">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 flex w-[272px] border-r border-line bg-panel lg:hidden"
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
            >
              <Sidebar onNavigate={() => setDrawer(false)} />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                className="absolute top-3.5 right-3 rounded-md p-1.5 text-fg-3 hover:bg-panel-3 hover:text-fg"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="rounded-md p-2 text-fg-2 hover:bg-panel-3 hover:text-fg"
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </button>
          <Logo className="text-sm" />
        </div>

        {!ready ? (
          <LoadingState />
        ) : view === "new" ? (
          <NewAudit />
        ) : view === "settings" ? (
          <SettingsView />
        ) : active ? (
          <AuditView key={active.id} audit={active} />
        ) : (
          <NewAudit />
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex-1 p-6" aria-busy="true" aria-label="Loading workspace">
      <div className="h-6 w-52 animate-pulse rounded bg-panel-3" />
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-panel-2" />
        ))}
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-panel-2" />
        ))}
      </div>
    </div>
  );
}
