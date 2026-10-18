"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Info, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "success" | "info" | "error";
interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const push = useCallback((message: string, tone: Tone = "success") => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-2), { id, tone, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-lg border border-line-strong bg-panel-3/95 px-3.5 py-2.5 text-sm text-fg shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur"
              role={t.tone === "error" ? "alert" : "status"}
            >
              {t.tone === "success" && <Check className="size-4 shrink-0 text-proven" aria-hidden />}
              {t.tone === "info" && <Info className="size-4 shrink-0 text-fg-2" aria-hidden />}
              {t.tone === "error" && <TriangleAlert className="size-4 shrink-0 text-contra" aria-hidden />}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
