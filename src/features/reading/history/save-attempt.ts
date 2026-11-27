import type { AttemptRecord } from "@/lib/types";
import { countAnswered } from "@/lib/scoring";
import { getTestQuestions } from "@/lib/parser/parse-reading";
import type { ExamState } from "@/features/reading/store/exam-store";
import { saveAttempt } from "./db";

export function buildAttemptRecord(state: ExamState): AttemptRecord | null {
  if (!state.test || !state.attemptId || !state.submittedAt) return null;
  const questions = getTestQuestions(state.test, state.selectedPassageIds);

  return {
    id: state.attemptId,
    fileName: state.test.fileName,
    fileType: state.test.fileType,
    createdAt: state.startedAt ?? state.submittedAt,
    submittedAt: state.submittedAt,
    durationSeconds: state.durationSeconds,
    timeSpentSeconds: state.timeSpentSeconds,
    selectedPassageIds: state.selectedPassageIds,
    passageCount: state.selectedPassageIds.length,
    totalQuestions: questions.length,
    answeredCount: countAnswered(questions, state.answers),
    score: state.score,
    autoGraded: state.autoGraded,
    answers: state.answers,
    annotations: state.annotations,
    review: state.review,
    test: state.test,
  };
}

export async function saveCurrentAttempt(state: ExamState) {
  const record = buildAttemptRecord(state);
  if (!record) return null;
  await saveAttempt(record);
  return record;
}
