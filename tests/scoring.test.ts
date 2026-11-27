import { describe, expect, it } from "vitest";
import type { ParsedTest, Question, ReviewState } from "@/lib/types";
import { computeResult, getQuestionStatus, isQuestionCorrect } from "@/lib/scoring";

function question(number: number, overrides: Partial<Question> = {}): Question {
  return {
    id: `q-${number}`,
    number,
    type: "true_false_not_given",
    prompt: `Question ${number}`,
    options: [],
    answer: ["TRUE"],
    answerMode: "single",
    groupId: "g-1",
    ...overrides,
  };
}

function testWith(questions: Question[]): ParsedTest {
  return {
    id: "test",
    fileName: "test.docx",
    fileType: "docx",
    passages: [
      {
        id: "passage-1",
        number: 1,
        title: "Test",
        html: "",
        text: "",
        wordCount: 0,
        groups: [
          {
            id: "g-1",
            type: "true_false_not_given",
            instructions: "",
            rangeStart: questions[0]?.number ?? 1,
            rangeEnd: questions[questions.length - 1]?.number ?? 1,
            options: [],
            questions,
          },
        ],
      },
    ],
    totalQuestions: questions.length,
    answerKeyFound: true,
    completeAnswerKey: true,
    warnings: [],
    parsedAt: 0,
  };
}

const emptyReview = (): ReviewState => ({ grades: {}, explanations: {}, updatedAt: 0 });

describe("answer normalization", () => {
  it("accepts case, spacing and article variations", () => {
    const q = question(1, { type: "sentence_completion", answer: ["the city council"] });
    expect(isQuestionCorrect(q, "City Council")).toBe(true);
    expect(isQuestionCorrect(q, "  the   city council ")).toBe(true);
    expect(isQuestionCorrect(q, "council")).toBe(false);
  });

  it("handles multiple-choice letter answers", () => {
    const q = question(2, { type: "multiple_choice", answer: ["C"], answerMode: "single" });
    expect(isQuestionCorrect(q, "c")).toBe(true);
    expect(isQuestionCorrect(q, "C.")).toBe(true);
    expect(isQuestionCorrect(q, "B")).toBe(false);
  });

  it("requires all letters for multi-select questions", () => {
    const q = question(3, {
      type: "multiple_choice_multi",
      answer: ["A", "C"],
      answerMode: "all",
      selectCount: 2,
    });
    expect(isQuestionCorrect(q, ["A", "C"])).toBe(true);
    expect(isQuestionCorrect(q, ["C", "A"])).toBe(true);
    expect(isQuestionCorrect(q, ["A"])).toBe(false);
  });
});

describe("self-grade result", () => {
  it("separates unanswered questions from ungraded ones", () => {
    const test = testWith([question(1), question(2), question(3)]);
    const answers = { 1: "TRUE", 2: "FALSE" };
    const result = computeResult(test, ["passage-1"], answers, emptyReview(), false);

    expect(result.score).toBe(0);
    expect(result.unanswered).toBe(1);
    expect(result.ungraded).toBe(2);
  });

  it("updates score and statuses as the user grades", () => {
    const test = testWith([question(1), question(2)]);
    const answers = { 1: "TRUE", 2: "FALSE" };
    const review: ReviewState = {
      grades: { 1: "correct" },
      explanations: {},
      updatedAt: 0,
    };

    expect(getQuestionStatus(test.passages[0].groups[0].questions[0], "TRUE", review, false)).toBe(
      "correct",
    );
    expect(getQuestionStatus(test.passages[0].groups[0].questions[1], "FALSE", review, false)).toBe(
      "ungraded",
    );

    const result = computeResult(test, ["passage-1"], answers, review, false);
    expect(result.correct).toBe(1);
    expect(result.ungraded).toBe(1);
    expect(result.score).toBe(1);
  });

  it("marks unanswered questions as unanswered, not ungraded", () => {
    const test = testWith([question(1)]);
    expect(getQuestionStatus(test.passages[0].groups[0].questions[0], undefined, emptyReview(), false)).toBe(
      "unanswered",
    );
  });
});

describe("scoring regression fixes", () => {
  it("extracts standalone option tokens instead of letters inside words like Paragraph", () => {
    const q = question(10, { type: "matching_information", answer: ["B"], answerMode: "single" });
    expect(isQuestionCorrect(q, "Paragraph B")).toBe(true);
    expect(isQuestionCorrect(q, "Paragraph A")).toBe(false);

    const mc = question(11, { type: "multiple_choice", answer: ["C"], answerMode: "single" });
    expect(isQuestionCorrect(mc, "Option C")).toBe(true);
    expect(isQuestionCorrect(mc, "Choice B")).toBe(false);
  });

  it("supports option letters I-Z and Roman numerals xi-xv", () => {
    const matching = question(12, { type: "matching_features", answer: ["J"], answerMode: "single" });
    expect(isQuestionCorrect(matching, "J")).toBe(true);
    expect(isQuestionCorrect(matching, "K")).toBe(false);

    const heading = question(13, { type: "matching_headings", answer: ["xii"], answerMode: "single" });
    expect(isQuestionCorrect(heading, "xii")).toBe(true);
    expect(isQuestionCorrect(heading, "xi")).toBe(false);
  });
});

