import type { AnswerMode, Question, QuestionType } from "@/lib/types";
import { canonicalSpace, compactLines } from "./normalize";

export interface AnswerKeyEntry {
  raw: string;
  explanation?: string;
}

export interface AnswerKeyResult {
  entries: Map<number, AnswerKeyEntry>;
  found: boolean;
}

const ANSWER_HEADING =
  /^(?:(?:answer\s*key|đáp\s*án|hướng\s*dẫn\s*chấm)\b\s*[:：\-–—]?\s*(.*)|(?:answers?|key)\s*(?:$|[:：\-–—]\s*(.*)|(?=\d{1,3}\s*[.)])(.*)))$/i;

const STANDALONE_KEY_HEADING =
  /^(?:answer\s*key|đáp\s*án|hướng\s*dẫn\s*chấm)\s*[:：\-–—]?\s*$/i;

const ENTRY_START = /^(\d{1,3})\s*(?:[.)\-:]\s*(?![\d,])|[.)\-:]?\s+)(.+)$/;
const NUMBER_ONLY = /^(\d{1,3})\s*[.)\-:]?\s*$/;

const ANSWER_TOKEN =
  /^(?:TRUE|FALSE|NOT\s+GIVEN|YES|NO|NG|Y|N|T|F|[A-Z]|x?(?:ix|iv|v?i{0,3}))\b/i;

const VIETNAMESE_CHARS =
  /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

const COMPLETION_BLANK_RE = /(_{2,}|\.{3,}|…)/;

export function splitAnswerKey(text: string) {
  const lines = compactLines(text);
  const candidates: Array<{ index: number; rest: string; standalone: boolean }> = [];

  lines.forEach((line, index) => {
    const match = line.match(ANSWER_HEADING);
    if (match && line.length <= 90) {
      candidates.push({
        index,
        rest: ((match[1] ?? match[2] ?? match[3]) ?? "").trim(),
        standalone: STANDALONE_KEY_HEADING.test(line),
      });
    }
  });

  // Tier 1: earliest standalone section heading ("Đáp án", "Answer key") with parsed answers
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]!;
    if (!candidate.standalone) continue;
    const keyLines = [
      ...(candidate.rest ? [candidate.rest] : []),
      ...lines.slice(candidate.index + 1),
    ];
    const parsed = parseAnswerKey(keyLines.join("\n"));
    if (parsed.entries.size >= 2 || (parsed.found && candidates.length === 1)) {
      return {
        bodyText: lines.slice(0, candidate.index).join("\n"),
        keyText: keyLines.join("\n"),
        found: true,
      };
    }
  }

  // Tier 2: earliest candidate yielding >= 2 entries
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]!;
    const keyLines = [
      ...(candidate.rest ? [candidate.rest] : []),
      ...lines.slice(candidate.index + 1),
    ];
    const parsed = parseAnswerKey(keyLines.join("\n"));
    if (parsed.entries.size >= 2) {
      return {
        bodyText: lines.slice(0, candidate.index).join("\n"),
        keyText: keyLines.join("\n"),
        found: true,
      };
    }
  }

  // Fallback: single-entry key near the end
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i]!;
    const keyLines = [
      ...(candidate.rest ? [candidate.rest] : []),
      ...lines.slice(candidate.index + 1),
    ];
    const parsed = parseAnswerKey(keyLines.join("\n"));
    if (parsed.found) {
      return {
        bodyText: lines.slice(0, candidate.index).join("\n"),
        keyText: keyLines.join("\n"),
        found: true,
      };
    }
  }

  if (candidates.length > 0) {
    const first = candidates.find((c) => c.standalone) ?? candidates[candidates.length - 1]!;
    const headingLine = lines[first.index] ?? "";
    if (/^(?:answer\s*key|đáp\s*án|hướng\s*dẫn\s*chấm)\b/i.test(headingLine)) {
      const keyLines = [
        ...(first.rest ? [first.rest] : []),
        ...lines.slice(first.index + 1),
      ];
      return {
        bodyText: lines.slice(0, first.index).join("\n"),
        keyText: keyLines.join("\n"),
        found: true,
      };
    }
  }

  return { bodyText: text, keyText: "", found: false };
}

function splitExplanation(rest: string) {
  const normalized = rest
    .replace(/^answer\s*[:：]\s*/i, "")
    .replace(/^đáp\s*án\s*[:：]\s*/i, "")
    .trim();

  const explicit = normalized.match(/^(.*?)\s+(?:explanation|giải\s*thích)\s*[:：]\s*(.+)$/i);
  if (explicit) {
    return {
      answer: explicit[1].trim(),
      explanation: explicit[2].trim(),
    };
  }

  const dashed = normalized.match(/^(.*?)\s+[–—]\s+(.+)$/);
  if (dashed) {
    return { answer: dashed[1].trim(), explanation: dashed[2].trim() };
  }

  const parenthetical = normalized.match(
    /^(.*?)\s+\(((?:paragraph|section|because|giải\s*thích)\b.+)\)$/i,
  );
  if (parenthetical) {
    return {
      answer: parenthetical[1].trim(),
      explanation: parenthetical[2].trim(),
    };
  }

  return { answer: normalized };
}

function cleanBilingualAnswer(value: string, hasVietnameseContext: boolean) {
  const cleaned = canonicalSpace(value).replace(/\.$/, "").trim();
  const slashParts = cleaned.split(/\s+\/\s+/);
  if (slashParts.length === 2) {
    const left = slashParts[0]!.trim();
    const right = slashParts[1]!.trim();
    const leftAscii = /^[\x20-\x7E]+$/.test(left);
    const rightIsVietnamese = VIETNAMESE_CHARS.test(right);
    const rightIsEnglishCode =
      /^(?:TRUE|FALSE|NOT\s+GIVEN|YES|NO|NG|[A-Z]|[ivx]{1,6})$/i.test(right);
    if (leftAscii && !rightIsEnglishCode && (rightIsVietnamese || hasVietnameseContext)) {
      return left;
    }
  }
  return cleaned;
}

function looksLikeQuestionPrompt(rest: string) {
  if (COMPLETION_BLANK_RE.test(rest)) return true;
  if (/\?\s*(?:\/|$)/.test(rest)) return true;
  const words = rest.split(/\s+/).filter(Boolean);
  if (/\s+\/\s+/.test(rest) && words.length >= 6) return true;
  if (words.length >= 8 && !/\b(?:explanation|giải\s*thích)\b/i.test(rest) && !/[–—]/.test(rest)) {
    return true;
  }
  return false;
}

function looksLikeAnswer(value: string) {
  const first = value.split(/[\/,;]|\s+or\s+/i)[0]?.trim() ?? "";
  return ANSWER_TOKEN.test(first) || /^[A-Za-zÀ-ỹ0-9][\wÀ-ỹ'’\- ]{0,60}$/.test(first);
}

function splitCompactPairs(line: string) {
  const matches = Array.from(
    line.matchAll(
      /(?:^|\s)(\d{1,3})\s*[.)]?\s*((?:NOT\s+GIVEN|TRUE|FALSE|YES|NO|NG|x(?:ix|iv|v?i{0,3})|ix|iv|v?i{1,3}|v|[A-Z]))(?=\s+\d{1,3}\s*[.)]?\s|$)/gi,
    ),
  );
  if (matches.length < 2) return [];
  return matches.map((match) => ({
    number: Number.parseInt(match[1], 10),
    raw: match[2],
  }));
}

export function parseAnswerKey(keyText: string): AnswerKeyResult {
  const entries = new Map<number, AnswerKeyEntry>();
  if (!keyText.trim()) return { entries, found: false };

  const hasVietnameseContext =
    VIETNAMESE_CHARS.test(keyText) ||
    /(?:đáp\s*án|kỹ\s*năng|vị\s*trí|dấu\s*hiệu|giải\s*thích|kết\s*luận)/i.test(keyText);

  const lines = compactLines(keyText);
  let currentNumber: number | null = null;
  let currentExplanation: string[] = [];

  const flushExplanation = () => {
    if (currentNumber !== null && currentExplanation.length) {
      const entry = entries.get(currentNumber);
      if (entry) {
        entry.explanation = [entry.explanation, ...currentExplanation].filter(Boolean).join("\n");
      }
    }
    currentExplanation = [];
  };

  lines.forEach((line) => {
    if (STANDALONE_KEY_HEADING.test(line)) return;
    if (/^Questions?\s+\d+/i.test(line)) {
      flushExplanation();
      currentNumber = null;
      return;
    }

    const compact = splitCompactPairs(line);
    if (compact.length >= 2) {
      flushExplanation();
      compact.forEach(({ number, raw }) => {
        entries.set(number, { raw: canonicalSpace(raw) });
      });
      currentNumber = null;
      return;
    }

    // Inline answer inside a detailed explanation block: "Đáp án: flower / hoa" or "Kết luận: FALSE."
    const inlineAnswer = line.match(/^(?:đáp\s*án|answer|kết\s*luận)\s*[:：]\s*(.+)$/i);
    if (inlineAnswer && currentNumber !== null) {
      const answerVal = cleanBilingualAnswer(inlineAnswer[1], hasVietnameseContext);
      if (!entries.has(currentNumber) && answerVal && looksLikeAnswer(answerVal)) {
        entries.set(currentNumber, { raw: answerVal });
      }
      return;
    }

    const explanation = line.match(/^(?:explanation|giải\s*thích)\s*[:：]\s*(.+)$/i);
    if (explanation && currentNumber !== null) {
      currentExplanation.push(line);
      return;
    }

    const numberOnly = line.match(NUMBER_ONLY);
    if (numberOnly) {
      flushExplanation();
      currentNumber = Number.parseInt(numberOnly[1], 10);
      return;
    }

    const entry = line.match(ENTRY_START);
    if (entry) {
      const number = Number.parseInt(entry[1], 10);
      const existing = entries.get(number);
      const isQuestionHeader = looksLikeQuestionPrompt(entry[2]);

      if (isQuestionHeader) {
        flushExplanation();
        currentNumber = number;
        return;
      }

      if (looksLikeAnswer(entry[2])) {
        flushExplanation();
        const parsed = splitExplanation(entry[2]);
        const cleanedRaw = cleanBilingualAnswer(parsed.answer, hasVietnameseContext);
        if (!existing) {
          entries.set(number, {
            raw: cleanedRaw,
            explanation: parsed.explanation,
          });
        } else if (parsed.explanation) {
          existing.explanation = [existing.explanation, parsed.explanation]
            .filter(Boolean)
            .join("\n");
        }
        currentNumber = number;
        return;
      }
    }

    if (currentNumber !== null) {
      if (/^Câu\s*hỏi\s*[:：]/i.test(line)) {
        return;
      }
      currentExplanation.push(line);
    }
  });

  flushExplanation();

  return { entries, found: entries.size > 0 };
}

function splitAlternatives(value: string) {
  return value
    .split(/\s*[\/;]\s*|\s+or\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function expandOptional(value: string) {
  const match = value.match(/^(.*?)\(([^)]+)\)(.*)$/);
  if (!match) return [value];
  const without = `${match[1]}${match[3]}`.replace(/\s+/g, " ").trim();
  const withPart = `${match[1]}${match[2]}${match[3]}`.replace(/\s+/g, " ").trim();
  return Array.from(new Set([withPart, without]));
}

function normalizeTfng(value: string) {
  const upper = value.toUpperCase().replace(/[.]/g, "").trim();
  if (/^(T|TRUE)$/.test(upper)) return "TRUE";
  if (/^(F|FALSE)$/.test(upper)) return "FALSE";
  if (/^(NG|NOT\s*GIVEN)$/.test(upper)) return "NOT GIVEN";
  return upper;
}

function normalizeYnng(value: string) {
  const upper = value.toUpperCase().replace(/[.]/g, "").trim();
  if (/^(Y|YES)$/.test(upper)) return "YES";
  if (/^(N|NO)$/.test(upper)) return "NO";
  if (/^(NG|NOT\s*GIVEN)$/.test(upper)) return "NOT GIVEN";
  return upper;
}

function extractLetters(value: string) {
  const cleaned = value
    .replace(/^(?:option|letter|paragraph|section|heading|box|choice)\s+/i, "")
    .trim();
  const uppercaseMatches = Array.from(cleaned.matchAll(/(?<![A-Za-z])[A-Z](?![A-Za-z])/g)).map(
    (match) => match[0],
  );
  if (uppercaseMatches.length) return uppercaseMatches;

  if (/^[a-z](?:\s*(?:[,/&;]|\band\b|\bor\b)\s*[a-z])*$/i.test(cleaned)) {
    return Array.from(cleaned.toUpperCase().matchAll(/\b[A-Z]\b/g)).map((match) => match[0]);
  }
  return [];
}

function extractRoman(value: string) {
  const tokens = value
    .toLowerCase()
    .match(/\b(?:x{1,2}(?:ix|iv|v?i{0,3})|ix|iv|v?i{1,3}|v)\b/g);
  return tokens ?? [];
}

export function normalizeAnswer(
  raw: string,
  type: QuestionType,
): { answer: string[]; mode: AnswerMode } {
  const cleaned = raw
    .replace(/^answer\s*[:：]\s*/i, "")
    .replace(/^đáp\s*án\s*[:：]\s*/i, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s*\.$/, "")
    .trim();

  if (type === "true_false_not_given") {
    const alternatives = splitAlternatives(cleaned).map(normalizeTfng);
    return { answer: alternatives, mode: alternatives.length > 1 ? "any" : "single" };
  }

  if (type === "yes_no_not_given") {
    const alternatives = splitAlternatives(cleaned).map(normalizeYnng);
    return { answer: alternatives, mode: alternatives.length > 1 ? "any" : "single" };
  }

  if (type === "multiple_choice" || type === "multiple_choice_multi") {
    const letters = extractLetters(cleaned);
    if (letters.length) {
      return {
        answer: Array.from(new Set(letters)),
        mode: type === "multiple_choice_multi" || letters.length > 1 ? "all" : "single",
      };
    }
  }

  if (type === "matching_headings") {
    const roman = extractRoman(cleaned);
    if (roman.length) return { answer: [roman[0]!], mode: "single" };
    const letters = extractLetters(cleaned);
    if (letters.length) return { answer: [letters[0]!], mode: "single" };
  }

  if (
    type === "matching_information" ||
    type === "matching_features" ||
    type === "matching_sentence_endings"
  ) {
    const letters = extractLetters(cleaned);
    if (letters.length) return { answer: [letters[0]!], mode: "single" };
    const roman = extractRoman(cleaned);
    if (roman.length) return { answer: [roman[0]!], mode: "single" };
  }

  const alternatives = splitAlternatives(cleaned)
    .flatMap(expandOptional)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    answer: alternatives,
    mode: alternatives.length > 1 ? "any" : "single",
  };
}

export function applyAnswerKey(
  questions: Question[],
  entries: Map<number, AnswerKeyEntry>,
): { found: boolean; complete: boolean; missing: number[] } {
  let found = false;

  questions.forEach((question) => {
    const entry = entries.get(question.number);
    if (!entry) return;
    const normalized = normalizeAnswer(entry.raw, question.type);
    if (!normalized.answer.length) return;
    question.answer = normalized.answer;
    question.answerMode = normalized.mode;
    if (entry.explanation) question.officialExplanation = entry.explanation;
    found = true;
  });

  const missing = questions.filter((question) => !question.answer?.length).map((question) => question.number);
  return { found, complete: missing.length === 0, missing };
}
