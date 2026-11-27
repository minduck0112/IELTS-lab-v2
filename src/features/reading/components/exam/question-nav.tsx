"use client";

import { useEffect, useRef } from "react";
import type { Passage, UserAnswer } from "@/lib/types";
import { cn, isAnswered } from "@/lib/utils";
import styles from "./exam.module.css";

interface QuestionNavProps {
  passages: Passage[];
  answers: Record<number, UserAnswer>;
  activeQuestion: number;
  activePassageId: string;
  onSelect: (questionNumber: number) => void;
  onPassage: (passageId: string) => void;
}

export function QuestionNav({
  passages,
  answers,
  activeQuestion,
  activePassageId,
  onSelect,
  onPassage,
}: QuestionNavProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = trackRef.current?.querySelector<HTMLElement>(
      `[data-question="${activeQuestion}"]`,
    );
    target?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [activeQuestion, activePassageId]);

  return (
    <nav className={styles.questionNav} aria-label="Điều hướng Part và câu hỏi">
      <div className={styles.navTrack} ref={trackRef}>
        {passages.map((passage) => {
          const questions = passage.groups.flatMap((group) => group.questions);
          const answeredCount = questions.filter((question) =>
            isAnswered(answers[question.number]),
          ).length;
          const isActive = activePassageId === passage.id;

          if (!isActive) {
            return (
              <button
                key={passage.id}
                type="button"
                className={styles.navPartInactive}
                onClick={() => onPassage(passage.id)}
                aria-label={`Chuyển sang Part ${passage.number}: đã làm ${answeredCount} trên ${questions.length} câu`}
              >
                <strong className={styles.navPartTitle}>Part {passage.number} :</strong>
                <em className={styles.navPartCount}>
                  {answeredCount} of {questions.length} questions
                </em>
              </button>
            );
          }

          return (
            <div
              key={passage.id}
              className={styles.navPartActive}
              role="group"
              aria-label={`Part ${passage.number}`}
            >
              <strong className={styles.navPartTitle}>Part {passage.number}</strong>
              <div className={styles.navButtons}>
                {questions.map((question) => {
                  const done = isAnswered(answers[question.number]);
                  const current = activeQuestion === question.number;
                  return (
                    <button
                      key={question.id}
                      type="button"
                      data-question={question.number}
                      className={cn(
                        styles.navButton,
                        done && styles.navButtonDone,
                        current && styles.navButtonCurrent,
                      )}
                      onClick={() => onSelect(question.number)}
                      aria-label={`Part ${passage.number}, câu ${question.number}${done ? ", đã trả lời" : ", chưa trả lời"}`}
                      aria-current={current ? "step" : undefined}
                    >
                      {question.number}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
