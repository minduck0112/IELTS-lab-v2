import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { PASSAGE_SECONDS } from "@/lib/constants";
import type {
  ExamResult,
  ParsedTest,
  PassageAnnotation,
  ReviewState,
  SelfGrade,
  UserAnswer,
} from "@/lib/types";
import { clamp, uid } from "@/lib/utils";
import { computeResult, isAutoGradable } from "@/lib/scoring";

export interface ExamState {
  hydrated: boolean;
  test: ParsedTest | null;
  selectedPassageIds: string[];
  answers: Record<number, UserAnswer>;
  annotations: Record<string, PassageAnnotation>;
  attemptId: string | null;
  startedAt: number | null;
  durationSeconds: number;
  submittedAt: number | null;
  autoGraded: boolean;
  score: number;
  timeSpentSeconds: number;
  review: ReviewState;
  beginTest: (test: ParsedTest, selectedPassageIds: string[]) => void;
  setAnswer: (number: number, answer: UserAnswer) => void;
  savePassageAnnotation: (passageId: string, annotation: PassageAnnotation) => void;
  submit: (timeSpentSeconds?: number) => ExamResult | null;
  setSelfGrade: (number: number, grade: SelfGrade) => void;
  setExplanation: (number: number, explanation: string) => void;
  reset: () => void;
  setHydrated: (hydrated: boolean) => void;
}

const emptyReview = (): ReviewState => ({
  grades: {},
  explanations: {},
  updatedAt: Date.now(),
});

const memoryStorage: Storage = (() => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
})();

export const useExamStore = create<ExamState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      test: null,
      selectedPassageIds: [],
      answers: {},
      annotations: {},
      attemptId: null,
      startedAt: null,
      durationSeconds: 0,
      submittedAt: null,
      autoGraded: false,
      score: 0,
      timeSpentSeconds: 0,
      review: emptyReview(),

      beginTest: (test, selectedPassageIds) => {
        const annotations: Record<string, PassageAnnotation> = {};
        test.passages.forEach((passage) => {
          annotations[passage.id] = {
            html: passage.html,
            notes: [],
          };
        });

        set({
          test,
          selectedPassageIds,
          answers: {},
          annotations,
          attemptId: uid("attempt"),
          startedAt: Date.now(),
          durationSeconds: selectedPassageIds.length * PASSAGE_SECONDS,
          submittedAt: null,
          autoGraded: false,
          score: 0,
          timeSpentSeconds: 0,
          review: emptyReview(),
        });
      },

      setAnswer: (number, answer) => {
        set((state) => ({
          answers: {
            ...state.answers,
            [number]: answer,
          },
        }));
      },

      savePassageAnnotation: (passageId, annotation) => {
        set((state) => ({
          annotations: {
            ...state.annotations,
            [passageId]: annotation,
          },
        }));
      },

      submit: (timeSpentSeconds) => {
        const state = get();
        if (!state.test || !state.attemptId) return null;
        if (state.submittedAt) {
          return computeResult(
            state.test,
            state.selectedPassageIds,
            state.answers,
            state.review,
            state.autoGraded,
          );
        }

        const autoGraded = isAutoGradable(state.test, state.selectedPassageIds);
        const result = computeResult(
          state.test,
          state.selectedPassageIds,
          state.answers,
          state.review,
          autoGraded,
        );
        const elapsed =
          timeSpentSeconds ??
          (state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0);

        set({
          submittedAt: Date.now(),
          autoGraded,
          score: result.score,
          timeSpentSeconds: clamp(elapsed, 0, state.durationSeconds),
          review: emptyReview(),
        });

        return result;
      },

      setSelfGrade: (number, grade) => {
        const state = get();
        if (!state.test) return;
        const review: ReviewState = {
          ...state.review,
          grades: {
            ...state.review.grades,
            [number]: grade,
          },
          updatedAt: Date.now(),
        };
        const result = computeResult(
          state.test,
          state.selectedPassageIds,
          state.answers,
          review,
          false,
        );
        set({ review, score: result.score });
      },

      setExplanation: (number, explanation) => {
        set((state) => ({
          review: {
            ...state.review,
            explanations: {
              ...state.review.explanations,
              [number]: explanation,
            },
            updatedAt: Date.now(),
          },
        }));
      },

      reset: () => {
        set({
          test: null,
          selectedPassageIds: [],
          answers: {},
          annotations: {},
          attemptId: null,
          startedAt: null,
          durationSeconds: 0,
          submittedAt: null,
          autoGraded: false,
          score: 0,
          timeSpentSeconds: 0,
          review: emptyReview(),
        });
      },

      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "ielts-reading-session",
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : window.sessionStorage,
      ),
      partialize: (state) => ({
        test: state.test,
        selectedPassageIds: state.selectedPassageIds,
        answers: state.answers,
        annotations: state.annotations,
        attemptId: state.attemptId,
        startedAt: state.startedAt,
        durationSeconds: state.durationSeconds,
        submittedAt: state.submittedAt,
        autoGraded: state.autoGraded,
        score: state.score,
        timeSpentSeconds: state.timeSpentSeconds,
        review: state.review,
      }),
    },
  ),
);
