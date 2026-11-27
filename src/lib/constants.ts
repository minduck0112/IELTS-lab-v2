import type { QuestionType } from "@/lib/types";

export const PASSAGE_MINUTES = 20;
export const PASSAGE_SECONDS = PASSAGE_MINUTES * 60;
export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
export const HISTORY_DB_NAME = "ielts-reading-lab";
export const HISTORY_STORE = "attempts";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Trắc nghiệm",
  multiple_choice_multi: "Chọn nhiều đáp án",
  true_false_not_given: "True / False / Not Given",
  yes_no_not_given: "Yes / No / Not Given",
  matching_headings: "Matching headings",
  matching_information: "Matching information",
  matching_features: "Matching features",
  matching_sentence_endings: "Matching sentence endings",
  sentence_completion: "Sentence completion",
  summary_completion: "Summary completion",
  notes_completion: "Notes completion",
  table_completion: "Table completion",
  diagram_labelling: "Diagram labelling",
  short_answer: "Short answer",
};

export const COMPLETION_TYPES: QuestionType[] = [
  "sentence_completion",
  "summary_completion",
  "notes_completion",
  "table_completion",
  "diagram_labelling",
  "short_answer",
];

export const MATCHING_TYPES: QuestionType[] = [
  "matching_headings",
  "matching_information",
  "matching_features",
  "matching_sentence_endings",
];
