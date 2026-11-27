"use client";

import { ChevronRight } from "lucide-react";
import type { Passage, UserAnswer } from "@/lib/types";
import { MATCHING_TYPES, QUESTION_TYPE_LABELS } from "@/lib/constants";
import { QuestionCard } from "./question-card";
import styles from "./exam.module.css";

interface QuestionPanelProps {
  passage: Passage;
  answers: Record<number, UserAnswer>;
  activeQuestion: number;
  onAnswer: (number: number, answer: UserAnswer) => void;
  onActive: (number: number) => void;
}

export function QuestionPanel({
  passage,
  answers,
  activeQuestion,
  onAnswer,
  onActive,
}: QuestionPanelProps) {
  return (
    <section className={styles.questionsPane} aria-label="Câu hỏi">
      <div className={styles.questionsScroll}>
        {passage.groups.map((group) => {
          const showOptions =
            MATCHING_TYPES.includes(group.type) && group.options.length > 0;

          return (
            <div key={group.id} className={styles.group}>
              <div className={styles.groupHead}>
                <div className={styles.groupRange}>
                  <span>
                    Questions {group.rangeStart}–{group.rangeEnd}
                  </span>
                  <em>{QUESTION_TYPE_LABELS[group.type]}</em>
                </div>
                {group.instructions && (
                  <p className={styles.groupInstruction}>{group.instructions}</p>
                )}
                {showOptions && (
                  <div className={styles.optionReference}>
                    <div className={styles.optionReferenceTitle}>Đáp án lựa chọn</div>
                    <div className={styles.optionReferenceGrid}>
                      {group.options.map((option) => (
                        <div key={option.value} className={styles.optionReferenceRow}>
                          <span>{option.label}</span>
                          <p>{option.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.questionList}>
                {group.questions.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    answer={answers[question.number]}
                    active={activeQuestion === question.number}
                    onChange={(answer) => onAnswer(question.number, answer)}
                    onFocus={() => onActive(question.number)}
                  />
                ))}
              </div>

              <div className={styles.groupDivider}>
                <ChevronRight size={14} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
