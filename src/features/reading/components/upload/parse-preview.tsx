"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  KeyRound,
  ListChecks,
  RefreshCw,
  ShieldQuestion,
} from "lucide-react";
import type { ParsedTest } from "@/lib/types";
import { PASSAGE_MINUTES, QUESTION_TYPE_LABELS } from "@/lib/constants";
import { getTestQuestions } from "@/lib/parser/parse-reading";
import { cn, formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import styles from "./upload.module.css";

interface ParsePreviewProps {
  test: ParsedTest;
  selectedIds: string[];
  onToggle: (passageId: string) => void;
  onStart: () => void;
  onReset: () => void;
}

export function ParsePreview({ test, selectedIds, onToggle, onStart, onReset }: ParsePreviewProps) {
  const selected = new Set(selectedIds);
  const questions = useMemo(() => getTestQuestions(test, selectedIds), [test, selectedIds]);
  const duration = selectedIds.length * PASSAGE_MINUTES * 60;
  const needsSelection = test.passages.length > 3;

  return (
    <div className={styles.preview}>
      <div className={styles.fileBar}>
        <div className={styles.fileIcon}>
          <FileText size={20} />
        </div>
        <div className={styles.fileInfo}>
          <strong>{test.fileName}</strong>
          <span>{test.fileType.toUpperCase()} · Đã đọc xong</span>
        </div>
        <button className={styles.changeFile} onClick={onReset} type="button">
          <RefreshCw size={14} />
          Đổi file
        </button>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <BookOpen size={17} />
          <span>
            <strong>{test.passages.length}</strong>
            Passage
          </span>
        </div>
        <div className={styles.stat}>
          <ListChecks size={17} />
          <span>
            <strong>{questions.length}</strong>
            Câu hỏi đã chọn
          </span>
        </div>
        <div className={styles.stat}>
          <Clock3 size={17} />
          <span>
            <strong>{selectedIds.length * PASSAGE_MINUTES}</strong>
            Phút
          </span>
        </div>
        <div className={cn(styles.stat, test.completeAnswerKey ? styles.statGood : styles.statWarn)}>
          {test.completeAnswerKey ? <CheckCircle2 size={17} /> : <ShieldQuestion size={17} />}
          <span>
            <strong>{test.completeAnswerKey ? "Có" : test.answerKeyFound ? "Một phần" : "Không"}</strong>
            Đáp án
          </span>
        </div>
      </div>

      <div className={styles.sectionHead}>
        <div>
          <h3>{needsSelection ? "Chọn passage sẽ thi" : "Cấu trúc bài thi"}</h3>
          <p>
            {needsSelection
              ? `File có ${test.passages.length} passages. Bỏ chọn những passage bạn muốn bỏ qua; thời gian tự tính lại.`
              : "Toàn bộ passage trong file sẽ được đưa vào bài thi."}
          </p>
        </div>
        {needsSelection && (
          <span className={styles.selectionCount}>
            {selectedIds.length}/{test.passages.length} đã chọn
          </span>
        )}
      </div>

      <div className={styles.passageList}>
        {test.passages.map((passage) => {
          const passageQuestions = passage.groups.flatMap((group) => group.questions);
          const isSelected = selected.has(passage.id);
          return (
            <label
              key={passage.id}
              className={cn(
                styles.passageRow,
                isSelected && styles.passageRowActive,
                !needsSelection && styles.passageRowStatic,
              )}
            >
              {needsSelection && (
                <span className={cn(styles.checkbox, isSelected && styles.checkboxOn)}>
                  {isSelected && <Check size={13} strokeWidth={3} />}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(passage.id)}
                  />
                </span>
              )}
              <span className={styles.passageNumber}>{passage.number}</span>
              <span className={styles.passageInfo}>
                <strong>{passage.title || `Reading Passage ${passage.number}`}</strong>
                <span>
                  {passage.wordCount.toLocaleString("vi-VN")} từ · {passageQuestions.length} câu
                </span>
              </span>
              {!needsSelection && <CheckCircle2 size={18} className={styles.selectedIcon} />}
            </label>
          );
        })}
      </div>

      <details className={styles.details}>
        <summary>
          <ChevronDown size={15} />
          Xem chi tiết dạng câu hỏi
        </summary>
        <div className={styles.groupList}>
          {test.passages.map((passage) =>
            passage.groups.map((group) => (
              <div key={group.id} className={styles.groupRow}>
                <span>Passage {passage.number}</span>
                <strong>
                  {QUESTION_TYPE_LABELS[group.type]} · Câu {group.rangeStart}–{group.rangeEnd}
                </strong>
                <span>{group.questions.length} câu</span>
              </div>
            )),
          )}
        </div>
      </details>

      {test.warnings.length > 0 && (
        <div className={styles.warnings}>
          <div className={styles.warningTitle}>
            <AlertTriangle size={16} />
            Lưu ý khi đọc file
          </div>
          <ul>
            {test.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.previewFooter}>
        <div className={styles.durationBox}>
          <span>Thời gian làm bài</span>
          <strong>{formatDuration(duration)}</strong>
          <small>{selectedIds.length} passage × {PASSAGE_MINUTES} phút</small>
        </div>
        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={onReset} type="button">
            Chọn file khác
          </Button>
          <Button
            size="lg"
            onClick={onStart}
            disabled={selectedIds.length === 0 || questions.length === 0}
            iconRight={<ArrowRight size={17} />}
          >
            Bắt đầu làm bài
          </Button>
        </div>
      </div>

      {!test.completeAnswerKey && (
        <div className={styles.reviewNote}>
          <KeyRound size={16} />
          <span>
            {test.answerKeyFound
              ? "File chỉ có đáp án một phần. Sau khi nộp, bạn sẽ tự chấm các câu còn thiếu."
              : "File không có đáp án. Sau khi nộp, bài làm chuyển sang chế độ Review để bạn tự chấm từng câu."}
          </span>
        </div>
      )}
    </div>
  );
}
