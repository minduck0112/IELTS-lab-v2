import type {
  ExamResult,
  ParsedTest,
  Question,
  ReviewState,
  SelfGrade,
  UserAnswer,
} from "@/lib/types";
import { isAnswered } from "@/lib/utils";
import { getTestQuestions } from "@/lib/parser/parse-reading";

function normalizeValue(value: string, type: Question["type"]) {
  let normalized = value
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  if (type === "true_false_not_given" || type === "yes_no_not_given") {
    if (/^(t|true)$/.test(normalized)) return "true";
    if (/^(f|false)$/.test(normalized)) return "false";
    if (/^(y|yes)$/.test(normalized)) return "yes";
    if (/^(n|no)$/.test(normalized)) return "no";
    if (/^(ng|not given)$/.test(normalized)) return "not given";
    return normalized;
  }

  if (type === "multiple_choice" || type === "multiple_choice_multi") {
    const stripped = normalized
      .replace(/^(?:option|letter|choice|answer)\s+/i, "")
      .replace(/[.,;:!?()[\]{}]/g, " ")
      .trim();
    const tokens = stripped.match(/\b[a-z]\b/g);
    if (tokens?.length) return tokens.join("");
    return stripped.replace(/[^a-z]/g, "");
  }

  if (type === "matching_headings") {
    const stripped = normalized
      .replace(/^(?:heading|roman)\s+/i, "")
      .replace(/[.,;:!?()[\]{}]/g, " ")
      .trim();
    const roman = stripped.match(/\b(?:x{1,2}(?:ix|iv|v?i{0,3})|ix|iv|v?i{1,3}|v)\b/);
    if (roman) return roman[0];
    const letter = stripped.match(/\b[a-z]\b/);
    if (letter) return letter[0];
    return stripped.replace(/[^ivx]/g, "");
  }

  if (
    type === "matching_information" ||
    type === "matching_features" ||
    type === "matching_sentence_endings"
  ) {
    const stripped = normalized
      .replace(/^(?:paragraph|section|option|feature|person|ending|letter|box)\s+/i, "")
      .replace(/[.,;:!?()[\]{}]/g, " ")
      .trim();
    const letter = stripped.match(/\b[a-z]\b/);
    if (letter) return letter[0];
    const roman = stripped.match(/\b(?:x{1,2}(?:ix|iv|v?i{0,3})|ix|iv|v?i{1,3}|v)\b/);
    if (roman) return roman[0];
    return stripped.replace(/[^a-z]/g, "");
  }

  normalized = normalized
    .replace(/[.,;:!?"“”()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.replace(/^(?:the|a|an)\s+/, "");
}

function normalizeUser(value: string, type: Question["type"]) {
  return normalizeValue(value, type);
}

function toArray(value: UserAnswer | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

export function isQuestionCorrect(question: Question, answer: UserAnswer | undefined) {
  if (!question.answer?.length) return false;
  const values = toArray(answer).map((value) => normalizeUser(value, question.type)).filter(Boolean);
  if (!values.length) return false;

  const expected = question.answer.map((value) => normalizeValue(value, question.type)).filter(Boolean);
  if (!expected.length) return false;

  if (question.answerMode === "all") {
    const actual = new Set(values);
    const target = new Set(expected);
    if (actual.size !== target.size) return false;
    return Array.from(target).every((value) => actual.has(value));
  }

  if (question.answerMode === "any") {
    return values.some((value) => expected.includes(value));
  }

  return values[0] === expected[0];
}

export function getAutoGradeStatus(question: Question, answer: UserAnswer | undefined) {
  if (!isAnswered(answer)) return "unanswered" as const;
  return isQuestionCorrect(question, answer) ? ("correct" as const) : ("incorrect" as const);
}

export function computeResult(
  test: ParsedTest,
  selectedPassageIds: string[],
  answers: Record<number, UserAnswer>,
  review: ReviewState,
  autoGraded: boolean,
): ExamResult {
  const questions = getTestQuestions(test, selectedPassageIds);
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  let ungraded = 0;

  questions.forEach((question) => {
    const answer = answers[question.number];
    if (autoGraded) {
      if (!isAnswered(answer)) {
        unanswered += 1;
      } else if (isQuestionCorrect(question, answer)) {
        correct += 1;
      } else {
        incorrect += 1;
      }
      return;
    }

    const grade: SelfGrade = review.grades[question.number] ?? null;
    if (grade === "correct") correct += 1;
    else if (grade === "incorrect") incorrect += 1;
    else if (!isAnswered(answer)) unanswered += 1;
    else ungraded += 1;
  });

  return {
    score: correct,
    total: questions.length,
    correct,
    incorrect,
    unanswered,
    ungraded,
    autoGraded,
  };
}

export function getQuestionStatus(
  question: Question,
  answer: UserAnswer | undefined,
  review: ReviewState,
  autoGraded: boolean,
) {
  if (autoGraded) return getAutoGradeStatus(question, answer);
  const grade = review.grades[question.number];
  if (grade) return grade;
  return isAnswered(answer) ? ("ungraded" as const) : ("unanswered" as const);
}

export function formatAnswer(answer: UserAnswer | undefined) {
  if (Array.isArray(answer)) return answer.filter(Boolean).join(", ");
  return answer?.trim() ?? "";
}

export function formatCorrectAnswer(question: Question) {
  if (!question.answer?.length) return "";
  if (question.answerMode === "any") return question.answer.join(" / ");
  return question.answer.join(", ");
}

export function isAutoGradable(test: ParsedTest, selectedPassageIds: string[]) {
  const questions = getTestQuestions(test, selectedPassageIds);
  return questions.length > 0 && questions.every((question) => question.answer?.length);
}

export function countAnswered(questions: Question[], answers: Record<number, UserAnswer>) {
  return questions.filter((question) => isAnswered(answers[question.number])).length;
}
