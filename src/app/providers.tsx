"use client";

import { useEffect } from "react";
import { useExamStore } from "@/features/reading/store/exam-store";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let active = true;
    useExamStore.persist
      .rehydrate()
      .catch(() => undefined)
      .finally(() => {
        if (active) useExamStore.getState().setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return <>{children}</>;
}
