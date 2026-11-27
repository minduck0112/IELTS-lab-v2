"use client";

import { FileText, LayoutPanelLeft, ListChecks, LogOut, StickyNote } from "lucide-react";
import { cn, formatClock } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import styles from "./exam.module.css";

interface ExamHeaderProps {
  fileName: string;
  remaining: number;
  isWarning: boolean;
  isCritical: boolean;
  view: "passage" | "questions";
  notesOpen: boolean;
  notesCount: number;
  onView: (view: "passage" | "questions") => void;
  onToggleNotes: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function ExamHeader({
  fileName,
  remaining,
  isWarning,
  isCritical,
  view,
  notesOpen,
  notesCount,
  onView,
  onToggleNotes,
  onSubmit,
  submitting,
}: ExamHeaderProps) {
  return (
    <header className={styles.examHeader}>
      <div className={styles.headerLeft}>
        <div className={styles.headerBrand}>
          <Logo compact />
        </div>

        <div className={styles.testIdentity}>
          <FileText size={15} />
          <strong>{fileName}</strong>
        </div>

        <div className={styles.viewToggle} role="group" aria-label="Chế độ xem">
          <button
            type="button"
            className={cn(view === "passage" && styles.viewToggleActive)}
            onClick={() => onView("passage")}
          >
            <LayoutPanelLeft size={14} />
            Passage
          </button>
          <button
            type="button"
            className={cn(view === "questions" && styles.viewToggleActive)}
            onClick={() => onView("questions")}
          >
            <ListChecks size={14} />
            Questions
          </button>
        </div>
      </div>

      <div className={styles.headerCenter}>
        <div
          className={cn(
            styles.timer,
            isWarning && styles.timerWarning,
            isCritical && styles.timerCritical,
          )}
          role="timer"
          aria-live={isCritical ? "assertive" : "off"}
        >
          <span>Time remaining</span>
          <strong>{formatClock(remaining)}</strong>
        </div>
      </div>

      <div className={styles.headerRight}>
        {isWarning && (
          <div className={cn(styles.timeNotice, isCritical && styles.timeNoticeCritical)}>
            {isCritical ? "Còn dưới 1 phút" : "Còn 5 phút"}
          </div>
        )}

        <button
          type="button"
          className={cn(styles.notesHeaderButton, notesOpen && styles.notesHeaderButtonActive)}
          onClick={onToggleNotes}
          title="Ghi chú"
          aria-label={`Mở ghi chú (${notesCount})`}
          aria-pressed={notesOpen}
        >
          <StickyNote size={15} />
          <span>Ghi chú</span>
          {notesCount > 0 && <span className={styles.notesHeaderBadge}>{notesCount}</span>}
        </button>

        <Button
          variant={isWarning ? "danger" : "primary"}
          size="sm"
          onClick={onSubmit}
          loading={submitting}
          iconLeft={<LogOut size={15} />}
        >
          Nộp bài
        </Button>
      </div>
    </header>
  );
}
