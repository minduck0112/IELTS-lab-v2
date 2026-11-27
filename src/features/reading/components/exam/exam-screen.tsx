"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronsLeftRight,
  Clock3,
  FileWarning,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Modal } from "@/components/ui/modal";
import { getTestQuestions } from "@/lib/parser/parse-reading";
import { countAnswered } from "@/lib/scoring";
import { clamp, formatClock, formatDuration } from "@/lib/utils";
import { useExamStore } from "@/features/reading/store/exam-store";
import { saveCurrentAttempt } from "@/features/reading/history/save-attempt";
import { useExamTimer } from "@/features/reading/hooks/use-exam-timer";
import { ExamHeader } from "./exam-header";
import { PassagePanel } from "./passage-panel";
import { QuestionPanel } from "./question-panel";
import { QuestionNav } from "./question-nav";
import styles from "./exam.module.css";

const SPLIT_STORAGE_KEY = "ielts-reading-split";
const SPLIT_EVENT = "ielts-split-change";
const MIN_SPLIT = 25;
const MAX_SPLIT = 75;

function subscribeSplit(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SPLIT_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SPLIT_EVENT, callback);
  };
}

function getSplitSnapshot() {
  try {
    const saved = window.sessionStorage.getItem(SPLIT_STORAGE_KEY);
    if (saved) {
      const parsed = Number.parseFloat(saved);
      if (Number.isFinite(parsed)) {
        return clamp(parsed, MIN_SPLIT, MAX_SPLIT);
      }
    }
  } catch {
    // Ignore storage access errors.
  }
  return 50;
}

const getServerSplitSnapshot = () => 50;

export function ExamScreen() {
  const router = useRouter();
  const hydrated = useExamStore((state) => state.hydrated);
  const test = useExamStore((state) => state.test);
  const selectedPassageIds = useExamStore((state) => state.selectedPassageIds);
  const answers = useExamStore((state) => state.answers);
  const annotations = useExamStore((state) => state.annotations);
  const startedAt = useExamStore((state) => state.startedAt);
  const durationSeconds = useExamStore((state) => state.durationSeconds);
  const submittedAt = useExamStore((state) => state.submittedAt);
  const setAnswer = useExamStore((state) => state.setAnswer);
  const savePassageAnnotation = useExamStore((state) => state.savePassageAnnotation);

  const [activePassageId, setActivePassageId] = useState("");
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [view, setView] = useState<"passage" | "questions">("questions");
  const [notesOpen, setNotesOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const storedSplit = useSyncExternalStore(
    subscribeSplit,
    getSplitSnapshot,
    getServerSplitSnapshot,
  );
  const [dragSplit, setDragSplit] = useState<number | null>(null);
  const splitPercent = dragSplit ?? storedSplit;
  const resizing = dragSplit !== null;
  const submittingRef = useRef(false);
  const layoutRef = useRef<HTMLElement>(null);

  const selectedPassages = useMemo(
    () => test?.passages.filter((passage) => selectedPassageIds.includes(passage.id)) ?? [],
    [test, selectedPassageIds],
  );

  const allQuestions = useMemo(
    () => (test ? getTestQuestions(test, selectedPassageIds) : []),
    [test, selectedPassageIds],
  );

  const answeredCount = countAnswered(allQuestions, answers);
  const activePassage =
    selectedPassages.find((passage) => passage.id === activePassageId) ?? selectedPassages[0];
  const activeNotesCount =
    activePassage && annotations[activePassage.id] ? annotations[activePassage.id].notes.length : 0;

  const effectiveQuestion = activeQuestion || allQuestions[0]?.number || 0;

  useEffect(() => {
    if (hydrated && submittedAt) {
      router.replace("/review");
    }
  }, [hydrated, submittedAt, router]);

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitOpen(false);

    const result = useExamStore.getState().submit();
    if (!result) {
      setSubmitting(false);
      submittingRef.current = false;
      return;
    }

    try {
      await saveCurrentAttempt(useExamStore.getState());
    } catch {
      // The attempt still lives in session storage; Review remains usable.
    }
    router.replace("/review");
  }, [router]);

  const { remaining, isWarning, isCritical } = useExamTimer({
    startedAt,
    durationSeconds,
    active: Boolean(hydrated && test && !submittedAt),
    onExpire: () => {
      void handleSubmit();
    },
  });

  useEffect(() => {
    if (!test || submittedAt) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [test, submittedAt]);

  const initialTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!test) return;
    if (initialTitleRef.current === null) {
      initialTitleRef.current = document.title;
    }
    document.title = `${formatClock(remaining)} · IELTS Reading`;
  }, [remaining, test]);

  useEffect(() => {
    return () => {
      if (initialTitleRef.current !== null) {
        document.title = initialTitleRef.current;
        initialTitleRef.current = null;
      }
    };
  }, []);

  const persistSplit = useCallback((value: number) => {
    const clamped = Math.round(clamp(value, MIN_SPLIT, MAX_SPLIT) * 10) / 10;
    try {
      window.sessionStorage.setItem(SPLIT_STORAGE_KEY, String(clamped));
      window.dispatchEvent(new Event(SPLIT_EVENT));
    } catch {
      // Ignore storage access errors.
    }
    return clamped;
  }, []);

  const handleSplitPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !layoutRef.current) return;
    event.preventDefault();
    let latest = splitPercent;
    setDragSplit(latest);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = layoutRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const ratio = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      latest = Math.round(clamp(ratio, MIN_SPLIT, MAX_SPLIT) * 10) / 10;
      setDragSplit(latest);
    };

    const onPointerUp = () => {
      persistSplit(latest);
      setDragSplit(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const handleSplitKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      persistSplit(splitPercent - 2);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      persistSplit(splitPercent + 2);
    } else if (event.key === "Home") {
      event.preventDefault();
      persistSplit(MIN_SPLIT);
    } else if (event.key === "End") {
      event.preventDefault();
      persistSplit(MAX_SPLIT);
    } else if (event.key === "Enter" || event.key === "0") {
      event.preventDefault();
      persistSplit(50);
    }
  };

  const goToQuestion = (number: number) => {
    const passage = selectedPassages.find((item) =>
      item.groups.some((group) => group.questions.some((question) => question.number === number)),
    );
    if (!passage) return;
    setActivePassageId(passage.id);
    setActiveQuestion(number);
    setView("questions");
    window.setTimeout(() => {
      document.getElementById(`q-${number}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 60);
  };

  const goToPassage = (passageId: string) => {
    const passage = selectedPassages.find((item) => item.id === passageId);
    if (!passage) return;
    setActivePassageId(passage.id);
    setActiveQuestion(passage.groups[0]?.questions[0]?.number ?? 0);
    setView("questions");
  };

  const toggleNotes = () => {
    setNotesOpen((open) => {
      const next = !open;
      if (next) {
        setView("passage");
      }
      return next;
    });
  };

  if (!hydrated) {
    return (
      <div className={styles.examLoading}>
        <Loader2 size={24} className={styles.spin} />
        <span>Đang khôi phục bài thi...</span>
      </div>
    );
  }

  if (!test || !selectedPassages.length) {
    return (
      <div className={styles.emptyExam}>
        <Logo />
        <div className={styles.emptyIcon}>
          <FileWarning size={28} />
        </div>
        <h1>Chưa có bài thi nào đang mở</h1>
        <p>Tải file .doc, .docx hoặc .pdf để tạo bài Reading mới.</p>
        <Button onClick={() => router.push("/")} iconLeft={<ArrowLeft size={16} />}>
          Về trang tải file
        </Button>
      </div>
    );
  }

  if (submittedAt) {
    return (
      <div className={styles.examLoading}>
        <Loader2 size={24} className={styles.spin} />
        <span>Đang mở phần Review...</span>
      </div>
    );
  }

  const unanswered = allQuestions.length - answeredCount;

  return (
    <div className={styles.examPage}>
      <ExamHeader
        fileName={test.fileName}
        remaining={remaining}
        isWarning={isWarning}
        isCritical={isCritical}
        view={view}
        notesOpen={notesOpen}
        notesCount={activeNotesCount}
        onView={setView}
        onToggleNotes={toggleNotes}
        onSubmit={() => setSubmitOpen(true)}
        submitting={submitting}
      />

      <main
        ref={layoutRef}
        className={styles.examLayout}
        data-view={view}
        data-resizing={resizing ? "true" : undefined}
        style={{ "--split-left": `${splitPercent}%` } as CSSProperties}
      >
        {activePassage && annotations[activePassage.id] && (
          <PassagePanel
            key={`passage-${activePassage.id}`}
            passage={activePassage}
            annotation={annotations[activePassage.id]}
            notesOpen={notesOpen}
            onCloseNotes={() => setNotesOpen(false)}
            onSave={(annotation) => savePassageAnnotation(activePassage.id, annotation)}
          />
        )}

        <div
          className={styles.splitHandle}
          data-active={resizing ? "true" : undefined}
          role="separator"
          aria-orientation="vertical"
          aria-label="Kéo để căn chỉnh tỷ lệ phần bài đọc và câu hỏi"
          aria-valuemin={MIN_SPLIT}
          aria-valuemax={MAX_SPLIT}
          aria-valuenow={Math.round(splitPercent)}
          tabIndex={0}
          title="Kéo để thay đổi kích thước · Nháy đúp để chia đều 50/50"
          onPointerDown={handleSplitPointerDown}
          onDoubleClick={() => persistSplit(50)}
          onKeyDown={handleSplitKeyDown}
        >
          <span className={styles.splitThumb} aria-hidden="true">
            <ChevronsLeftRight size={13} />
          </span>
        </div>

        {activePassage && (
          <QuestionPanel
            key={`questions-${activePassage.id}`}
            passage={activePassage}
            answers={answers}
            activeQuestion={effectiveQuestion}
            onAnswer={setAnswer}
            onActive={setActiveQuestion}
          />
        )}
      </main>

      <QuestionNav
        passages={selectedPassages}
        answers={answers}
        activeQuestion={effectiveQuestion}
        activePassageId={activePassage?.id ?? ""}
        onSelect={goToQuestion}
        onPassage={goToPassage}
      />

      <Modal
        open={submitOpen}
        title="Nộp bài Reading?"
        description="Sau khi nộp, bạn không thể thay đổi câu trả lời."
        onClose={() => setSubmitOpen(false)}
        closeOnBackdrop={!submitting}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubmitOpen(false)} disabled={submitting}>
              Tiếp tục làm bài
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleSubmit()}
              loading={submitting}
              iconLeft={<Clock3 size={16} />}
            >
              Nộp bài
            </Button>
          </>
        }
      >
        <div className={styles.submitSummary}>
          <div>
            <span>Đã trả lời</span>
            <strong>
              {answeredCount}/{allQuestions.length}
            </strong>
          </div>
          <div>
            <span>Chưa trả lời</span>
            <strong className={unanswered > 0 ? styles.warnText : undefined}>{unanswered}</strong>
          </div>
          <div>
            <span>Thời gian còn lại</span>
            <strong>{formatClock(remaining)}</strong>
          </div>
        </div>

        {unanswered > 0 && (
          <div className={styles.submitWarning}>
            <AlertTriangle size={16} />
            <span>
              Còn {unanswered} câu chưa trả lời. Bạn vẫn có thể nộp bài và xem lại sau.
            </span>
          </div>
        )}

        <div className={styles.submitNote}>
          <Clock3 size={15} />
          <span>
            Thời gian đã làm: {formatDuration(durationSeconds - remaining)} /{" "}
            {formatDuration(durationSeconds)}
          </span>
        </div>
      </Modal>
    </div>
  );
}
