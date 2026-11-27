"use client";

import { useEffect, useRef, useState } from "react";

interface UseExamTimerOptions {
  startedAt: number | null;
  durationSeconds: number;
  active: boolean;
  onExpire: () => void;
}

export function useExamTimer({ startedAt, durationSeconds, active, onExpire }: UseExamTimerOptions) {
  const [now, setNow] = useState(() => Date.now());
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    const onVisibility = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const endAt = startedAt ? startedAt + durationSeconds * 1000 : null;
  const remaining = endAt ? Math.max(0, Math.ceil((endAt - now) / 1000)) : durationSeconds;

  useEffect(() => {
    if (!active || !startedAt) return;
    if (remaining > 0) {
      expiredRef.current = false;
      return;
    }
    if (!expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current();
    }
  }, [active, remaining, startedAt]);

  return {
    remaining,
    isWarning: remaining <= 5 * 60,
    isCritical: remaining <= 60,
  };
}
