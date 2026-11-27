"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  History,
  ListFilter,
  Loader2,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import type { Question, SelfGrade } from "@/lib/types";
import { QUESTION_TYPE_LABELS } from "@/lib/constants";
import { computeResult, getQuestionStatus } from "@/lib/scoring";
import { formatDateTime, formatDuration, percent } from "@/lib/utils";
import { useExamStore } from "@/features/reading/store/exam-store";
import { saveCurrentAttempt } from "@/features/reading/history/save-attempt";
import { updateAttemptReview } from "@/features/reading/history/db";
import { ReviewQuestionCard } from "./review-question-card";
import styles from "./review.module.css";

type Filter = "all" | "correct" | "incorrect" | "unanswered" | "ungraded";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "correct", label: "Đúng" },
  { value: "incorrect", label: "Sai" },
  { value: "unanswered", label: "Chưa trả lời" },
  { value: "ungraded", label: "Chưa chấm" },
];

export function ReviewScreen() {
  const router = useRouter();
  const hydrated = useExamStore((state) => state.hydrated);
  const test = useExamStore((state) => state.test);
  const selectedPassageIds = useExamStore((state) => state.selectedPassageIds);
  const answers = useExamStore((state) => state.answers);
  const review = useExamStore((state) => state.review);
  const autoGraded = useExamStore((state) => state.autoGraded);
  const score = useExamStore((state) => state.score);
  const submittedAt = useExamStore((state) => state.submittedAt);
  const durationSeconds = useExamStore((state) => state.durationSeconds);
  const timeSpentSeconds = useExamStore((state) => state.timeSpentSeconds);
  const attemptId = useExamStore((state) => state.attemptId);
  const setSelfGrade = useExamStore((state) => state.setSelfGrade);
  const setExplanation = useExamStore((state) => state.setExplanation);

  const [filter, setFilter] = useState<Filter>("all");

  const selectedPassages = useMemo(
    () => test?.passages.filter((passage) => selectedPassageIds.includes(passage.id)) ?? [],
    [test, selectedPassageIds],
  );

  const questions = useMemo(
    () => selectedPassages.flatMap((passage) => passage.groups.flatMap((group) => group.questions)),
    [selectedPassages],
  );

  const result = useMemo(() => {
    if (!test) return null;
    return computeResult(test, selectedPassageIds, answers, review, autoGraded);
  }, [test, selectedPassageIds, answers, review, autoGraded]);

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      all: questions.length,
      correct: 0,
      incorrect: 0,
      unanswered: 0,
      ungraded: 0,
    };
    questions.forEach((question) => {
      const status = getQuestionStatus(question, answers[question.number], review, autoGraded);
      base[status] += 1;
    });
    return base;
  }, [questions, answers, review, autoGraded]);

  useEffect(() => {
    if (!hydrated || !attemptId || !submittedAt) return;
    saveCurrentAttempt(useExamStore.getState()).catch(() => undefined);
  }, [hydrated, attemptId, submittedAt]);

  useEffect(() => {
    if (!hydrated || !attemptId || !submittedAt) return;
    let flushed = false;
    const flush = () => {
      if (flushed) return;
      flushed = true;
      updateAttemptReview(attemptId, review, score).catch(() => undefined);
    };
    const timer = window.setTimeout(flush, 250);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [hydrated, attemptId, submittedAt, review, score]);

  const filteredPassages = selectedPassages
    .map((passage) => ({
      ...passage,
      groups: passage.groups
        .map((group) => ({
          ...group,
          questions: group.questions.filter((question) => {
            if (filter === "all") return true;
            return (
              getQuestionStatus(question, answers[question.number], review, autoGraded) === filter
            );
          }),
        }))
        .filter((group) => group.questions.length > 0),
    }))
    .filter((passage) => passage.groups.length > 0);

  if (!hydrated) {
    return (
      <div className={styles.reviewLoading}>
        <Loader2 size={24} className={styles.spin} />
        Đang tải kết quả...
      </div>
    );
  }

  if (!test || !submittedAt || !result) {
    return (
      <>
        <SiteHeader />
        <main className={styles.reviewEmpty}>
          <div className={styles.emptyIcon}>
            <ClipboardCheck size={30} />
          </div>
          <h1>Chưa có bài làm để review</h1>
          <p>Hoàn thành một bài Reading trước, sau đó kết quả sẽ xuất hiện tại đây.</p>
          <Button onClick={() => router.push("/")} iconLeft={<ArrowLeft size={16} />}>
            Về trang luyện thi
          </Button>
        </main>
      </>
    );
  }

  const total = result.total;
  const scorePercent = percent(score, total);
  const gradedCount = counts.correct + counts.incorrect;
  const allGraded = autoGraded || gradedCount === total;
  const ringColor = autoGraded ? "var(--green)" : allGraded ? "var(--green)" : "var(--amber)";

  return (
    <>
      <SiteHeader />
      <main className={styles.reviewPage}>
        <div className={`page-shell ${styles.reviewInner}`}>
          <div className={styles.topActions}>
            <button onClick={() => router.push("/")} className={styles.backLink}>
              <ArrowLeft size={15} />
              Về trang luyện thi
            </button>
            <div>
              <Button variant="secondary" size="sm" onClick={() => router.push("/history")}>
                <History size={15} />
                Lịch sử
              </Button>
            </div>
          </div>

          <section className={styles.summary}>
            <div className={styles.summaryMain}>
              <span className={styles.summaryKicker}>
                {autoGraded ? "Chấm tự động" : "Tự chấm"}
              </span>
              <h1>Kết quả bài Reading</h1>
              <p className={styles.fileName}>{test.fileName}</p>
              <div className={styles.summaryMeta}>
                <span>
                  <Clock3 size={14} />
                  Nộp lúc {formatDateTime(submittedAt)}
                </span>
                <span>
                  <Sparkles size={14} />
                  {selectedPassages.length} passage
                </span>
                <span>
                  <ClipboardCheck size={14} />
                  {formatDuration(timeSpentSeconds)} / {formatDuration(durationSeconds)}
                </span>
              </div>

              <div className={styles.modeNote}>
                {autoGraded ? (
                  <>
                    <CheckCircle2 size={16} />
                    <span>
                      Điểm được chấm tự động từ đáp án trong file. Bạn vẫn có thể ghi chú giải
                      thích cho từng câu.
                    </span>
                  </>
                ) : (
                  <>
                    <MessageSquareText size={16} />
                    <span>
                      File không có đủ đáp án. Hãy tự chấm từng câu bên dưới; điểm sẽ cập nhật
                      ngay. Đã chấm {gradedCount}/{total} câu.
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className={styles.scorePanel}>
              <div
                className={styles.scoreRing}
                style={{
                  background: `conic-gradient(${ringColor} ${scorePercent * 3.6}deg, var(--line) 0deg)`,
                }}
              >
                <div>
                  <strong>{score}</strong>
                  <span>/{total}</span>
                </div>
              </div>
              <div className={styles.scoreText}>
                <strong>{scorePercent}%</strong>
                <span>{autoGraded ? "điểm chính xác" : "điểm đã chấm"}</span>
              </div>
              <div className={styles.scoreStats}>
                <div>
                  <strong>{counts.correct}</strong>
                  <span>Đúng</span>
                </div>
                <div>
                  <strong>{counts.incorrect}</strong>
                  <span>Sai</span>
                </div>
                <div>
                  <strong>{counts.unanswered}</strong>
                  <span>Bỏ trống</span>
                </div>
                {!autoGraded && (
                  <div>
                    <strong>{counts.ungraded}</strong>
                    <span>Chưa chấm</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <div className={styles.filterBar}>
            <div className={styles.filterLabel}>
              <ListFilter size={15} />
              Lọc câu hỏi
            </div>
            <div className={styles.filterTabs} role="tablist" aria-label="Lọc câu hỏi">
              {FILTERS.filter((item) => item.value !== "ungraded" || !autoGraded).map((item) => (
                <button
                  key={item.value}
                  role="tab"
                  aria-selected={filter === item.value}
                  className={filter === item.value ? styles.filterActive : undefined}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                  <span>{counts[item.value]}</span>
                </button>
              ))}
            </div>
            <span className={styles.filterHint}>
              {filter === "all" ? `${questions.length} câu` : `${counts[filter]} câu`}
            </span>
          </div>

          <div className={styles.reviewList}>
            {filteredPassages.length === 0 ? (
              <div className={styles.noResults}>
                <ClipboardCheck size={26} />
                <strong>Không có câu nào trong nhóm này</strong>
                <span>Chọn bộ lọc khác để xem tiếp.</span>
              </div>
            ) : (
              filteredPassages.map((passage) => (
                <section key={passage.id} className={styles.passageBlock}>
                  <div className={styles.passageBlockHead}>
                    <span>Reading Passage {passage.number}</span>
                    <strong>{passage.title}</strong>
                  </div>
                  {passage.groups.map((group) => (
                    <div key={group.id} className={styles.groupBlock}>
                      <div className={styles.groupHead}>
                        <div>
                          <span>
                            Questions {group.rangeStart}–{group.rangeEnd}
                          </span>
                          <em>{QUESTION_TYPE_LABELS[group.type]}</em>
                        </div>
                        {group.instructions && <p>{group.instructions}</p>}
                      </div>
                      <div className={styles.reviewCards}>
                        {group.questions.map((question: Question) => (
                          <ReviewQuestionCard
                            key={question.id}
                            question={question}
                            answer={answers[question.number]}
                            review={review}
                            autoGraded={autoGraded}
                            onGrade={(grade: SelfGrade) =>
                              setSelfGrade(question.number, grade)
                            }
                            onExplanation={(text) => setExplanation(question.number, text)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              ))
            )}
          </div>

          <div className={styles.bottomActions}>
            <div>
              <strong>
                {autoGraded
                  ? "Bài đã được chấm tự động."
                  : allGraded
                    ? "Bạn đã chấm xong toàn bộ câu hỏi."
                    : `Còn ${total - gradedCount} câu chưa chấm.`}
              </strong>
              <span>Ghi chú và điểm tự chấm được lưu cùng lịch sử bài làm.</span>
            </div>
            <Button onClick={() => router.push("/")} iconRight={<ArrowRight size={16} />}>
              Làm bài mới
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
