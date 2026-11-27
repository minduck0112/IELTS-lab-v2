import type { ParsedTest, Passage, Question, QuestionGroup } from "@/lib/types";
import { countWords, uid } from "@/lib/utils";
import type { ExtractedDocument } from "./docx";
import { applyAnswerKey, parseAnswerKey, splitAnswerKey } from "./answer-key";
import { formatPassageHtml } from "./normalize";
import { detectPassages } from "./passage-detector";
import { detectQuestions } from "./question-detector";

export interface ParseReadingOptions extends ExtractedDocument {
  fileName: string;
}

function collectQuestions(groups: QuestionGroup[]) {
  return groups.flatMap((group) => group.questions);
}

export function parseReadingDocument(options: ParseReadingOptions): ParsedTest {
  const { text, fileName, fileType } = options;
  const warnings = new Set<string>();

  if (options.warning) warnings.add(options.warning);

  const answerKeyParts = splitAnswerKey(text);
  const passageDetection = detectPassages(answerKeyParts.bodyText);
  passageDetection.warnings.forEach((warning) => warnings.add(warning));

  const answerKey = parseAnswerKey(answerKeyParts.keyText);
  if (answerKeyParts.found && !answerKey.found) {
    warnings.add("Đã tìm thấy mục đáp án nhưng không đọc được câu trả lời nào.");
  }

  const passages: Passage[] = passageDetection.passages.map((draft) => {
    const questionDetection = detectQuestions(draft.questionText, draft.number);
    questionDetection.warnings.forEach((warning) => warnings.add(warning));

    return {
      id: `passage-${draft.number}`,
      number: draft.number,
      title: draft.title,
      html: formatPassageHtml(draft.title, draft.bodyText),
      text: draft.bodyText,
      wordCount: countWords(draft.bodyText),
      groups: questionDetection.groups,
    };
  });

  const allQuestions = passages.flatMap((passage) => collectQuestions(passage.groups));

  if (!allQuestions.length) {
    throw new Error(
      "Không nhận diện được câu hỏi. Hãy kiểm tra file có đánh số câu (1., 2., ...) và tiêu đề Passage rõ ràng.",
    );
  }

  const answerResult = applyAnswerKey(allQuestions, answerKey.entries);

  if (answerResult.found && !answerResult.complete) {
    warnings.add(
      `Chỉ tìm thấy đáp án cho ${allQuestions.length - answerResult.missing.length}/${allQuestions.length} câu. Bài làm sẽ chuyển sang chế độ tự chấm.`,
    );
  }

  if (!answerResult.found) {
    warnings.add("Không tìm thấy đáp án trong file. Sau khi nộp bài, bạn sẽ tự chấm từng câu.");
  }

  const emptyPassages = passages.filter((passage) => collectQuestions(passage.groups).length === 0);
  emptyPassages.forEach((passage) => {
    warnings.add(`Passage ${passage.number} không có câu hỏi và sẽ bị bỏ qua.`);
  });

  const usablePassages = passages.filter((passage) => collectQuestions(passage.groups).length > 0);
  if (!usablePassages.length) {
    throw new Error("Không có passage nào chứa câu hỏi hợp lệ.");
  }

  const totalQuestions = usablePassages.flatMap((passage) => collectQuestions(passage.groups)).length;

  return {
    id: uid("test"),
    fileName,
    fileType,
    passages: usablePassages,
    totalQuestions,
    answerKeyFound: answerResult.found,
    completeAnswerKey: answerResult.complete,
    warnings: Array.from(warnings),
    parsedAt: Date.now(),
  };
}

export function getTestQuestions(test: ParsedTest, selectedPassageIds: string[]): Question[] {
  const selected = new Set(selectedPassageIds);
  return test.passages
    .filter((passage) => selected.has(passage.id))
    .flatMap((passage) => collectQuestions(passage.groups))
    .sort((a, b) => a.number - b.number);
}

export function getPassageQuestions(passage: Passage): Question[] {
  return collectQuestions(passage.groups).sort((a, b) => a.number - b.number);
}
