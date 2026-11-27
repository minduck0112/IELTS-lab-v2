"use client";

import { Check, CheckCircle2, CircleHelp, MessageSquareText, X } from "lucide-react";
import type { Question, ReviewState, SelfGrade, UserAnswer } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatCorrectAnswer, getQuestionStatus } from "@/lib/scoring";
import styles from "./review.module.css";

interface ReviewQuestionCardProps {
  question: Question;
  answer: UserAnswer | undefined;
  review: ReviewState;
  autoGraded: boolean;
  readOnly?: boolean;
  onGrade?: (grade: SelfGrade) => void;
  onExplanation?: (text: string) => void;
}

function answerWithOptions(question: Question, value: string) {
  const option = question.options.find(
    (item) => item.value.toLowerCase() === value.toLowerCase(),
  );
  if (!option) return value;
  if (option.label.toLowerCase() === option.text.toLowerCase()) return option.text;
  return `${option.label}. ${option.text}`;
}

function displayAnswer(question: Question, answer: UserAnswer | undefined) {
  if (Array.isArray(answer)) {
    return answer.filter(Boolean).map((value) => answerWithOptions(question, value)).join(" · ");
  }
  if (answer) return answerWithOptions(question, answer);
  return "";
}

export function ReviewQuestionCard({
  question,
  answer,
  review,
  autoGraded,
  readOnly,
  onGrade,
  onExplanation,
}: ReviewQuestionCardProps) {
  const status = getQuestionStatus(question, answer, review, autoGraded);
  const userAnswer = displayAnswer(question, answer);
  const correctAnswer = formatCorrectAnswer(question);
  const explanation = review.explanations[question.number] ?? "";
  const grade = review.grades[question.number] ?? null;

  const statusLabel =
    status === "correct"
      ? "Đúng"
      : status === "incorrect"
        ? "Sai"
        : status === "unanswered"
          ? "Chưa trả lời"
          : "Chưa chấm";

  return (
    <article className={cn(styles.reviewCard, styles[`status_${status}`])}>
      <div className={styles.reviewCardHead}>
        <span className={cn(styles.reviewNumber, styles[`number_${status}`])}>
          {question.number}
        </span>
        <div className={styles.reviewMeta}>
          <span>Passage question</span>
          <strong>{QUESTION_TYPE_LABELS[question.type]}</strong>
        </div>
        <span className={cn(styles.statusBadge, styles[`badge_${status}`])}>
          {status === "correct" && <CheckCircle2 size={13} />}
          {status === "incorrect" && <X size={13} />}
          {status === "unanswered" && <CircleHelp size={13} />}
          {status === "ungraded" && <MessageSquareText size={13} />}
          {statusLabel}
        </span>
      </div>

      <p className={styles.reviewPrompt}>{question.prompt}</p>

      <div className={styles.answerGrid}>
        <div className={styles.answerBox}>
          <span>Câu trả lời của bạn</span>
          <strong className={cn(!userAnswer && styles.emptyAnswer)}>
            {userAnswer || "Chưa trả lời"}
          </strong>
        </div>
        <div className={styles.answerBox}>
          <span>Đáp án</span>
          <strong className={cn(!correctAnswer && styles.emptyAnswer)}>
            {correctAnswer || "File không có đáp án"}
          </strong>
        </div>
      </div>

      {!autoGraded && !readOnly && (
        <div className={styles.gradeRow}>
          <span>Tự chấm câu này:</span>
          <button
            className={cn(styles.gradeButton, grade === "correct" && styles.gradeCorrect)}
            onClick={() => onGrade?.(grade === "correct" ? null : "correct")}
          >
            <Check size={14} strokeWidth={3} />
            Đúng
          </button>
          <button
            className={cn(styles.gradeButton, grade === "incorrect" && styles.gradeIncorrect)}
            onClick={() => onGrade?.(grade === "incorrect" ? null : "incorrect")}
          >
            <X size={14} strokeWidth={3} />
            Sai
          </button>
          {grade && (
            <button className={styles.clearGrade} onClick={() => onGrade?.(null)}>
              Bỏ chấm
            </button>
          )}
        </div>
      )}

      {question.officialExplanation && (
        <div className={styles.officialExplanation}>
          <span>Giải thích từ file</span>
          <p>{question.officialExplanation}</p>
        </div>
      )}

      <div className={styles.explanationBox}>
        <label htmlFor={`explanation-${question.id}`}>
          <MessageSquareText size={14} />
          Ghi chú / giải thích của bạn
        </label>
        <textarea
          id={`explanation-${question.id}`}
          value={explanation}
          onChange={(event) => onExplanation?.(event.target.value)}
          readOnly={readOnly}
          placeholder="Vì sao đáp án đúng/sai? Ghi lại để rút kinh nghiệm..."
          rows={2}
        />
      </div>
    </article>
  );
}
