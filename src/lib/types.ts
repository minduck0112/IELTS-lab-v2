export type QuestionType =
  | "multiple_choice"
  | "multiple_choice_multi"
  | "true_false_not_given"
  | "yes_no_not_given"
  | "matching_headings"
  | "matching_information"
  | "matching_features"
  | "matching_sentence_endings"
  | "sentence_completion"
  | "summary_completion"
  | "notes_completion"
  | "table_completion"
  | "diagram_labelling"
  | "short_answer";

export type AnswerMode = "single" | "any" | "all";

export interface QuestionOption {
  value: string;
  label: string;
  text: string;
}

export interface Question {
  id: string;
  number: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  answer?: string[];
  answerMode?: AnswerMode;
  officialExplanation?: string;
  placeholder?: string;
  selectCount?: number;
  groupId: string;
}

export interface QuestionGroup {
  id: string;
  type: QuestionType;
  instructions: string;
  rangeStart: number;
  rangeEnd: number;
  options: QuestionOption[];
  questions: Question[];
}

export interface Passage {
  id: string;
  number: number;
  title: string;
  html: string;
  text: string;
  wordCount: number;
  groups: QuestionGroup[];
}

export type DocumentFileType = "docx" | "doc" | "pdf";

export interface ParsedTest {
  id: string;
  fileName: string;
  fileType: DocumentFileType;
  passages: Passage[];
  totalQuestions: number;
  answerKeyFound: boolean;
  completeAnswerKey: boolean;
  warnings: string[];
  parsedAt: number;
}

export type UserAnswer = string | string[];

export interface HighlightNote {
  id: string;
  text: string;
  color: "yellow" | "green" | "pink";
  createdAt: number;
}

export interface PassageAnnotation {
  html: string;
  notes: HighlightNote[];
}

export type SelfGrade = "correct" | "incorrect" | null;

export interface ReviewState {
  grades: Record<number, SelfGrade>;
  explanations: Record<number, string>;
  updatedAt: number;
}

export interface AttemptRecord {
  id: string;
  fileName: string;
  fileType: DocumentFileType;
  createdAt: number;
  submittedAt: number;
  durationSeconds: number;
  timeSpentSeconds: number;
  selectedPassageIds: string[];
  passageCount: number;
  totalQuestions: number;
  answeredCount: number;
  score: number;
  autoGraded: boolean;
  answers: Record<number, UserAnswer>;
  annotations: Record<string, PassageAnnotation>;
  review: ReviewState;
  test: ParsedTest;
}

export interface ExamResult {
  score: number;
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  ungraded: number;
  autoGraded: boolean;
}
