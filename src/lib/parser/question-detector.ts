import type {
  AnswerMode,
  Question,
  QuestionGroup,
  QuestionOption,
  QuestionType,
} from "@/lib/types";
import { canonicalSpace, stripQuestionNumber } from "./normalize";

interface Chunk {
  lines: string[];
  rangeStart?: number;
  rangeEnd?: number;
}

export interface QuestionDetection {
  groups: QuestionGroup[];
  warnings: string[];
}

interface ParsedBlock {
  number: number;
  lines: string[];
}

const GROUP_MARKER = /^Questions?\s+(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*[:.]?\s*(.*)$/i;
const PASSAGE_BASED_RUBRIC = /\bwhich\s+(?:is|are)\s+based\s+on\s+(?:reading\s+)?passage\b/i;
const NUMBER_START = /^(\d{1,3})\s*[.)]\s*(.*)$/;
const NUMBER_SPACE_START = /^(\d{1,3})\s+(.+)$/;
const NUMBER_PAREN_START = /^\((\d{1,3})\)\s*(.*)$/;
const OPTION_DELIMITED = /^\(?([A-Z]|[ivx]{1,6})\)?[.)]\s+(.+)$/i;
const BARE_OPTION_LINE = /^([A-Z])\s+([A-ZÀ-Ỹ0-9].+)$/;
const ROMAN_OPTION = /^(x{0,2}(?:ix|iv|v?i{0,3}))[.)]\s+(.+)$/i;

const PROSE_NUMBER_UNITS =
  /^(?:percent|%|million|billion|thousand|hundred|years?|months?|weeks?|days?|hours?|minutes?|seconds?|centuries|decades|km|kg|cm|mm|mg|degrees?|people|species|times|items|students|researchers|studies|pages)\b/i;

const COMPLETION_BLANK = /(_{2,}|\.{3,}|…|\[\[BLANK\]\])/;
const INSTRUCTION_LINE_HINT =
  /^(?:Complete\b|Choose\b|Write\b|Use\b|Match\b|Answer\b|Do the following\b|Look at\b|Label\b|Select\b|Which\b|Using\b|In boxes\b|NB\b|TRUE\b|FALSE\b|NOT GIVEN\b|YES\b|NO\b|List of\b)|(?:on your answer sheet\.?|from the passage(?: for each answer)?\.?)$/i;

const FIXED_TFNG: QuestionOption[] = [
  { value: "TRUE", label: "TRUE", text: "TRUE" },
  { value: "FALSE", label: "FALSE", text: "FALSE" },
  { value: "NOT GIVEN", label: "NOT GIVEN", text: "NOT GIVEN" },
];

const FIXED_YNNG: QuestionOption[] = [
  { value: "YES", label: "YES", text: "YES" },
  { value: "NO", label: "NO", text: "NO" },
  { value: "NOT GIVEN", label: "NOT GIVEN", text: "NOT GIVEN" },
];

function toLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitChunks(text: string) {
  const lines = toLines(text);
  const markerIndexes: number[] = [];

  lines.forEach((line, index) => {
    if (!GROUP_MARKER.test(line)) return;
    const combined = `${line} ${lines[index + 1] ?? ""}`;
    if (PASSAGE_BASED_RUBRIC.test(combined)) return;
    markerIndexes.push(index);
  });

  if (!markerIndexes.length) {
    return [{ lines }] satisfies Chunk[];
  }

  return markerIndexes.map((markerIndex, index) => {
    const match = lines[markerIndex].match(GROUP_MARKER);
    const nextIndex = markerIndexes[index + 1] ?? lines.length;
    const rest = (match?.[3] ?? "").trim();
    const chunkLines = lines.slice(markerIndex + 1, nextIndex);
    if (rest && !/^Questions?\s+\d+/i.test(rest)) chunkLines.unshift(rest);
    return {
      lines: chunkLines,
      rangeStart: match?.[1] ? Number.parseInt(match[1], 10) : undefined,
      rangeEnd: match?.[2] ? Number.parseInt(match[2], 10) : undefined,
    };
  });
}

function isRomanToken(raw: string) {
  const lower = raw.toLowerCase();
  if (!/^(?:x{1,2}(?:ix|iv|v?i{0,3})|ix|iv|v?i{1,3}|v)$/.test(lower)) return false;
  if (raw === lower) return true;
  // Single uppercase I, V, X are usually paragraph/option letters unless multi-char Roman.
  return lower.length > 1;
}

function parseOptionLine(line: string): QuestionOption | null {
  const delimited = line.match(OPTION_DELIMITED);
  if (delimited) {
    const rawValue = delimited[1];
    const value = isRomanToken(rawValue) ? rawValue.toLowerCase() : rawValue.toUpperCase();
    return { value, label: value, text: canonicalSpace(delimited[2]) };
  }

  const roman = line.match(ROMAN_OPTION);
  if (roman && roman[1] && isRomanToken(roman[1])) {
    const value = roman[1].toLowerCase();
    return { value, label: value, text: canonicalSpace(roman[2]) };
  }

  return null;
}

function parseBareSequentialOptionLines(lines: string[]) {
  for (let start = 0; start < lines.length; start += 1) {
    const firstMatch = lines[start]!.match(BARE_OPTION_LINE);
    if (!firstMatch || firstMatch[1] !== "A") continue;

    const options: QuestionOption[] = [
      { value: "A", label: "A", text: canonicalSpace(firstMatch[2]) },
    ];
    let end = start + 1;

    while (end < lines.length) {
      const nextLetter = String.fromCharCode(65 + options.length);
      const match = lines[end]!.match(BARE_OPTION_LINE);
      if (match && match[1] === nextLetter) {
        options.push({
          value: nextLetter,
          label: nextLetter,
          text: canonicalSpace(match[2]),
        });
        end += 1;
        continue;
      }
      if (!/^(?:NB\b|Choose\b|Select\b|Write\b|Match\b|Complete\b|List of\b)/i.test(lines[end]!)) {
        break;
      }
      break;
    }

    if (options.length >= 2) {
      return {
        options,
        remaining: [...lines.slice(0, start), ...lines.slice(end)],
      };
    }
  }

  return null;
}

function parseOptionList(lines: string[]) {
  const options: QuestionOption[] = [];
  const remaining: string[] = [];
  let inOptions = false;

  lines.forEach((line) => {
    const option = parseOptionLine(line);
    if (option) {
      options.push(option);
      inOptions = true;
      return;
    }
    if (
      inOptions &&
      options.length > 0 &&
      !/^(?:NB\b|Choose\b|Select\b|Write\b|Match\b|Complete\b|List of\b)/i.test(line)
    ) {
      const prev = options[options.length - 1]!;
      prev.text = canonicalSpace(`${prev.text} ${line}`);
      return;
    }
    inOptions = false;
    remaining.push(line);
  });

  if (options.length >= 2) {
    return { options, remaining };
  }

  const bare = parseBareSequentialOptionLines(lines);
  if (bare) return bare;

  return { options: [], remaining: lines };
}

function extractBareSequentialInlineOptions(text: string) {
  const startRegex = /(?:^|\s)(A)\s+(?=[A-ZÀ-Ỹ0-9])/g;
  let startMatch: RegExpExecArray | null;

  while ((startMatch = startRegex.exec(text)) !== null) {
    const letterOffset = startMatch.index + startMatch[0].indexOf("A");
    const before = text.slice(0, letterOffset).trim();
    const markers: Array<{ letter: string; letterIndex: number; textStart: number }> = [
      {
        letter: "A",
        letterIndex: letterOffset,
        textStart: startMatch.index + startMatch[0].length,
      },
    ];

    let searchFrom = startMatch.index + startMatch[0].length;
    while (markers.length < 12) {
      const nextLetter = String.fromCharCode(65 + markers.length);
      const nextRegex = new RegExp(`\\s+(${nextLetter})\\s+(?=[A-ZÀ-Ỹ0-9])`, "g");
      nextRegex.lastIndex = searchFrom;
      const nextMatch = nextRegex.exec(text);
      if (!nextMatch) break;

      markers.push({
        letter: nextLetter,
        letterIndex: nextMatch.index + nextMatch[0].indexOf(nextLetter),
        textStart: nextMatch.index + nextMatch[0].length,
      });
      searchFrom = nextMatch.index + nextMatch[0].length;
    }

    if (markers.length < 2) continue;

    const options: QuestionOption[] = markers.map((marker, idx) => {
      const end = idx + 1 < markers.length ? markers[idx + 1]!.letterIndex : text.length;
      return {
        value: marker.letter,
        label: marker.letter,
        text: canonicalSpace(text.slice(marker.textStart, end)),
      };
    });

    const validLengths = options.every((opt) => opt.text.length >= 2 && opt.text.length <= 120);
    if (!validLengths) continue;

    const hasInstructionBoundary =
      before.length === 0 ||
      /(?:[:.]|\bonce|\bbelow|\bfollowing|\blist|\bbox|\bsheet)\s*$/i.test(before);
    if (options.length >= 3 || hasInstructionBoundary) {
      return {
        prompt: before,
        options,
      };
    }
  }

  return null;
}

function extractInlineOptions(text: string) {
  const first = text.search(/\b[A-Z][.)]\s+/);
  if (first >= 0) {
    const before = text.slice(0, first).trim();
    const optionText = text.slice(first);
    const matches = Array.from(
      optionText.matchAll(/(?:^|\s)([A-Z])[.)]\s+(.+?)(?=\s+[A-Z][.)]\s+|$)/g),
    );

    if (matches.length >= 2) {
      return {
        prompt: before,
        options: matches.map((match) => ({
          value: match[1].toUpperCase(),
          label: match[1].toUpperCase(),
          text: canonicalSpace(match[2]),
        })),
      };
    }
  }

  return extractBareSequentialInlineOptions(text);
}

function detectQuestionType(instruction: string, prompt: string, options: QuestionOption[]): QuestionType {
  const text = `${instruction}\n${prompt}`;

  if (/true\s*[/,]\s*false\s*[/,]?\s*(?:or\s*)?not\s*given/i.test(text)) {
    return "true_false_not_given";
  }
  if (/yes\s*[/,]\s*no\s*[/,]?\s*(?:or\s*)?not\s*given/i.test(text)) {
    return "yes_no_not_given";
  }
  if (
    /(?:choose|which|select)\s+(?:two|three|four)\s+(?:letters?|answers?|options?|statements?|reasons?|causes?|factors?|features?|of\s+the\s+following)/i.test(
      text,
    ) ||
    /\bselect\s+(?:two|three|four)\b/i.test(text)
  ) {
    return "multiple_choice_multi";
  }
  if (/list of headings|match(?:ing)?\s+headings|choose\s+the\s+correct\s+heading|correct\s+heading/i.test(text)) {
    return "matching_headings";
  }
  if (/correct\s+ending|sentence\s+endings|match\s+each\s+sentence\s+ending/i.test(text)) {
    return "matching_sentence_endings";
  }
  if (/which\s+paragraph|which\s+section|matching\s+information|contains\s+the\s+following\s+information/i.test(text)) {
    return "matching_information";
  }
  if (/match\s+each|match\s+the|matching\s+features|which\s+person|which\s+feature|which\s+country|which\s+company/i.test(text)) {
    return "matching_features";
  }
  if (/complete\s+the\s+summary|summary\s+completion/i.test(text)) {
    return "summary_completion";
  }
  if (/complete\s+the\s+notes|notes\s+completion/i.test(text)) {
    return "notes_completion";
  }
  if (/complete\s+the\s+table|table\s+completion/i.test(text)) {
    return "table_completion";
  }
  if (/label\s+the\s+diagram|diagram\s+labelling|diagram\s+labeling/i.test(text)) {
    return "diagram_labelling";
  }
  if (/complete\s+the\s+sentences?|complete\s+the\s+gaps?|sentence\s+completion/i.test(text)) {
    return "sentence_completion";
  }
  if (/answer\s+the\s+questions|short\s+answer/i.test(text)) {
    return "short_answer";
  }
  if (/choose\s+(?:the\s+)?(?:correct\s+)?(?:letter|answer)|choose\s+one\s+letter|only\s+one\s+letter|A,\s*B,\s*C\s+or\s+D/i.test(text)) {
    return "multiple_choice";
  }

  if (options.length >= 2) {
    const roman = options.every((option) => /^[ivx]+$/.test(option.value));
    if (roman) return "matching_headings";
    return "multiple_choice";
  }
  if (/^(?:TRUE|FALSE|NOT GIVEN|YES|NO)$/i.test(prompt)) {
    return prompt.toUpperCase().startsWith("Y") ? "yes_no_not_given" : "true_false_not_given";
  }
  if (COMPLETION_BLANK.test(prompt)) return "sentence_completion";
  return "short_answer";
}

function detectSelectCount(instruction: string) {
  if (/choose\s+two|which\s+two|select\s+two/i.test(instruction)) return 2;
  if (/choose\s+three|which\s+three|select\s+three/i.test(instruction)) return 3;
  if (/choose\s+four|which\s+four|select\s+four/i.test(instruction)) return 4;
  return 1;
}

function parseQuestionStart(
  line: string,
  options?: { allowSpaced?: boolean; expectedRange?: [number, number] },
) {
  const standard = line.match(NUMBER_START);
  if (standard) return { number: Number.parseInt(standard[1], 10), rest: standard[2] };
  const paren = line.match(NUMBER_PAREN_START);
  if (paren) return { number: Number.parseInt(paren[1], 10), rest: paren[2] };

  const spaced = line.match(NUMBER_SPACE_START);
  if (spaced) {
    const number = Number.parseInt(spaced[1], 10);
    const rest = spaced[2].trim();
    if (number >= 1 && number <= 200) {
      if (options?.expectedRange) {
        const [min, max] = options.expectedRange;
        if (number < min || number > max) return null;
      }
      const startsWithBlank = /^(?:_{2,}|\.{2,}|…|\[\[BLANK\]\])/.test(rest);
      if (startsWithBlank) {
        return { number, rest };
      }
      if (options?.allowSpaced !== false && !PROSE_NUMBER_UNITS.test(rest)) {
        return { number, rest };
      }
    }
  }
  return null;
}

function buildBlocks(lines: string[], expectedRange?: [number, number]) {
  const hasPunctuated = lines.some((line) => NUMBER_START.test(line) || NUMBER_PAREN_START.test(line));
  const blocks: ParsedBlock[] = [];
  let current: ParsedBlock | null = null;

  lines.forEach((line) => {
    const start = parseQuestionStart(line, {
      allowSpaced: !hasPunctuated,
      expectedRange,
    });
    if (start) {
      if (current) blocks.push(current);
      current = { number: start.number, lines: start.rest ? [start.rest] : [] };
      return;
    }
    if (current) current.lines.push(line);
  });

  if (current) blocks.push(current);
  return blocks;
}

interface InlineBlankMarker {
  number: number;
  start: number;
  end: number;
}

function findInlineBlankMarkers(
  text: string,
  expectedRange?: [number, number],
  allowBareFallback = false,
): InlineBlankMarker[] {
  const byNumber = new Map<number, InlineBlankMarker>();

  const register = (num: number, start: number, end: number) => {
    if (num < 1 || num > 200) return;
    if (expectedRange && (num < expectedRange[0] || num > expectedRange[1])) return;
    const existing = byNumber.get(num);
    if (!existing || start < existing.start) {
      byNumber.set(num, { number: num, start, end });
    }
  };

  // Format 1: 7 ______, (7) ______, 7. ______, 7 ......, 7 …
  const numThenBlank = /(?:^|(?<=[\s([{"'“‘]))\(?(\d{1,3})\)?\s*[.)]?\s*(?:_{2,}|\.{2,}|…+|\[\s*\]|\[\[BLANK\]\])/g;
  let match: RegExpExecArray | null;
  while ((match = numThenBlank.exec(text)) !== null) {
    register(Number.parseInt(match[1], 10), match.index, match.index + match[0].length);
  }

  // Format 2: ______ (7), ...... (7)
  const blankThenNum = /(?:_{2,}|\.{2,}|…+)\s*\((\d{1,3})\)/g;
  while ((match = blankThenNum.exec(text)) !== null) {
    register(Number.parseInt(match[1], 10), match.index, match.index + match[0].length);
  }

  // Format 3: (7) or [7] when expectedRange confirms it's a question gap
  if (expectedRange) {
    const bracketNum = /(?:^|(?<=[\s"“‘]))[\[(]\s*(\d{1,3})\s*[\])](?=\s|$|[.,;:!?])/g;
    while ((match = bracketNum.exec(text)) !== null) {
      register(Number.parseInt(match[1], 10), match.index, match.index + match[0].length);
    }

    // Format 4: PDF vector-drawn blank lines leave bare numbers in sequence inside [min, max]
    const [min, max] = expectedRange;
    const expectedCount = max - min + 1;
    if (allowBareFallback && expectedCount > 1 && expectedCount <= 20 && byNumber.size < expectedCount) {
      const sortedKnown = Array.from(byNumber.values()).sort((a, b) => a.start - b.start);
      let cursor = 0;

      for (let num = min; num <= max; num += 1) {
        const known = byNumber.get(num);
        if (known) {
          cursor = Math.max(cursor, known.end);
          continue;
        }
        const nextKnown = sortedKnown.find((item) => item.number > num);
        const upperBound = nextKnown ? nextKnown.start : text.length;
        if (cursor >= upperBound) continue;

        const slice = text.slice(cursor, upperBound);
        const bareRegex = new RegExp(`(?<![\\d.,\\-–—])\\b(${num})\\b(?![\\d%]|[.,]\\d|[-–—]\\d)`, "g");
        const bareMatch = bareRegex.exec(slice);
        if (bareMatch) {
          const absStart = cursor + bareMatch.index;
          const absEnd = absStart + bareMatch[0].length;
          register(num, absStart, absEnd);
          cursor = absEnd;
        }
      }
    }
  }

  return Array.from(byNumber.values()).sort((a, b) => a.start - b.start);
}

function formatSentenceContextForMarker(
  text: string,
  markers: InlineBlankMarker[],
  target: InlineBlankMarker,
): string {
  // Find sentence/note boundaries around target
  let start = 0;
  for (let i = target.start - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === "\n" || ch === "•" || ch === "▪") {
      start = i + 1;
      break;
    }
    if ((ch === "." || ch === "!" || ch === "?") && /\s/.test(text[i + 1] ?? " ")) {
      // Avoid splitting abbreviations like "e.g." or numbers like "10."
      const beforeDot = text.slice(Math.max(0, i - 3), i);
      if (!/\b(?:e\.g|i\.e|Dr|Mr|Ms|St|\d+)$/i.test(beforeDot)) {
        start = i + 1;
        break;
      }
    }
  }

  let end = text.length;
  for (let i = target.end; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n" || ch === "•" || ch === "▪") {
      end = i;
      break;
    }
    if ((ch === "." || ch === "!" || ch === "?") && (i + 1 >= text.length || /\s/.test(text[i + 1]!))) {
      end = i + 1;
      break;
    }
  }

  const sliceMarkers = markers.filter((m) => m.start >= start && m.end <= end);
  let rebuilt = "";
  let pos = start;
  for (const m of sliceMarkers) {
    rebuilt += text.slice(pos, m.start);
    rebuilt += m.number === target.number ? "[[BLANK]]" : `(${m.number}) —`;
    pos = m.end;
  }
  rebuilt += text.slice(pos, end);

  return canonicalSpace(rebuilt.replace(/^[-–—:;\s•▪]+/, ""));
}

function extractInlineCompletionBlocks(
  lines: string[],
  expectedRange?: [number, number],
  allowBareFallback = false,
): ParsedBlock[] {
  // Keep bullet breaks as \n while joining wrapped prose lines with spaces.
  const joinedParts: string[] = [];
  lines.forEach((line, index) => {
    const isBullet = /^[•▪◦\-*]\s+/.test(line);
    if (index === 0) {
      joinedParts.push(line);
      return;
    }
    const prev = lines[index - 1]!;
    const prevEndedSentence = /[.!?:]$/.test(prev);
    joinedParts.push(isBullet || prevEndedSentence ? `\n${line}` : ` ${line}`);
  });

  const normalized = joinedParts.join("").replace(/[ \t]+/g, " ").trim();
  const markers = findInlineBlankMarkers(normalized, expectedRange, allowBareFallback);
  if (!markers.length) return [];

  return markers.map((marker) => ({
    number: marker.number,
    lines: [formatSentenceContextForMarker(normalized, markers, marker)],
  }));
}

function lineHasInlineBlank(line: string, expectedRange?: [number, number]) {
  return findInlineBlankMarkers(line, expectedRange, false).length > 0;
}

function inferPlaceholder(type: QuestionType, instruction: string) {
  if (!["sentence_completion", "summary_completion", "notes_completion", "table_completion", "diagram_labelling", "short_answer"].includes(type)) {
    return undefined;
  }
  const match = instruction.match(/NO MORE THAN\s+([A-Z]+(?:\s+AND\/OR\s+[A-Z]+)?)\s+(WORDS?|NUMBERS?)/i);
  if (match) return `NO MORE THAN ${match[1]} ${match[2]}`.toUpperCase();
  if (/ONE WORD AND\/OR A NUMBER/i.test(instruction)) return "ONE WORD AND/OR A NUMBER";
  if (/ONE WORD ONLY/i.test(instruction)) return "ONE WORD ONLY";
  if (/TWO WORDS/i.test(instruction)) return "NO MORE THAN TWO WORDS";
  if (type === "short_answer") return "Câu trả lời ngắn";
  return "Điền từ còn thiếu";
}

function normalizePrompt(lines: string[], number: number) {
  let prompt = canonicalSpace(lines.join(" "));
  prompt = stripQuestionNumber(prompt);
  prompt = prompt.replace(/\s+Answer\s*[:：].*$/i, "").trim();
  prompt = prompt.replace(/^[-–—:;\s]+/, "").replace(/[-–—:;\s]+$/, "");
  return prompt || `Question ${number}`;
}

function parseChunk(
  chunk: Chunk,
  passageNumber: number,
  groupIndex: number,
): { group: QuestionGroup; warnings: string[] } | null {
  const lines = chunk.lines;
  if (!lines.length) return null;

  const expectedRange: [number, number] | undefined =
    chunk.rangeStart !== undefined && chunk.rangeEnd !== undefined
      ? [chunk.rangeStart, chunk.rangeEnd]
      : undefined;

  let firstQuestionIndex = lines.findIndex(
    (line) =>
      Boolean(parseQuestionStart(line, { expectedRange })) ||
      lineHasInlineBlank(line, expectedRange),
  );

  // Fallback for vector-line blanks where only bare expected numbers appear after instructions.
  if (firstQuestionIndex < 0 && expectedRange) {
    firstQuestionIndex = lines.findIndex((line, idx) => {
      if (INSTRUCTION_LINE_HINT.test(line)) return false;
      const tail = lines.slice(idx).join(" ");
      return findInlineBlankMarkers(tail, expectedRange, true).length > 0;
    });
  }

  if (firstQuestionIndex < 0) return null;

  // If the first inline blank appeared mid-paragraph on a subsequent line (or skipped earlier expected numbers),
  // pull leading non-instruction prose lines after the last instruction line into questionLines.
  const firstStart = parseQuestionStart(lines[firstQuestionIndex]!, { expectedRange });
  const skippedEarlierExpected =
    Boolean(expectedRange && firstStart && firstStart.number > expectedRange[0]);
  if (
    !firstStart ||
    skippedEarlierExpected ||
    lineHasInlineBlank(lines[firstQuestionIndex]!, expectedRange)
  ) {
    let lastInstructionIdx = -1;
    for (let i = 0; i < firstQuestionIndex; i += 1) {
      if (INSTRUCTION_LINE_HINT.test(lines[i]!)) {
        lastInstructionIdx = i;
      }
    }
    if (lastInstructionIdx >= 0 && lastInstructionIdx + 1 < firstQuestionIndex) {
      const candidateLead = lines.slice(lastInstructionIdx + 1, firstQuestionIndex);
      const hasOptions = parseOptionList(candidateLead).options.length >= 2;
      if (!hasOptions) {
        firstQuestionIndex = lastInstructionIdx + 1;
      }
    }
  }

  const preamble = lines.slice(0, firstQuestionIndex);
  const optionList = parseOptionList(preamble);
  let instruction = optionList.remaining.join(" ").trim();
  let groupOptions = optionList.options;

  if (groupOptions.length === 0 && instruction) {
    const inlinePreamble = extractInlineOptions(instruction);
    if (inlinePreamble) {
      instruction = inlinePreamble.prompt;
      groupOptions = inlinePreamble.options;
    }
  }

  const questionLines = lines.slice(firstQuestionIndex);
  let blocks = buildBlocks(questionLines, expectedRange).filter((block) => {
    if (chunk.rangeStart !== undefined && block.number < chunk.rangeStart) return false;
    if (chunk.rangeEnd !== undefined && block.number > chunk.rangeEnd) return false;
    return true;
  });

  const expectedCount = expectedRange ? expectedRange[1] - expectedRange[0] + 1 : 0;
  const allowBareFallback = expectedCount > 1 && blocks.length < expectedCount;
  const shouldTryInlineCompletion =
    blocks.length === 0 ||
    allowBareFallback ||
    questionLines.some((line) => findInlineBlankMarkers(line, expectedRange, false).length >= 2);

  if (shouldTryInlineCompletion) {
    const inlineBlocks = extractInlineCompletionBlocks(
      questionLines,
      expectedRange,
      allowBareFallback,
    ).filter((block) => {
      if (chunk.rangeStart !== undefined && block.number < chunk.rangeStart) return false;
      if (chunk.rangeEnd !== undefined && block.number > chunk.rangeEnd) return false;
      return true;
    });
    if (inlineBlocks.length > blocks.length) {
      blocks = inlineBlocks;
    }
  }

  if (!blocks.length) return null;

  const firstBlock = blocks[0];
  const firstPrompt = normalizePrompt(firstBlock.lines, firstBlock.number);
  const groupType = detectQuestionType(instruction, firstPrompt, groupOptions);
  const groupId = `p${passageNumber}-g${groupIndex}`;
  const selectCount = detectSelectCount(instruction);
  const placeholder = inferPlaceholder(groupType, instruction);
  const questions: Question[] = [];
  const warnings: string[] = [];

  blocks.forEach((block, index) => {
    const blockOptionList = parseOptionList(block.lines);
    const promptLines = blockOptionList.remaining;
    let options = blockOptionList.options;
    let prompt = normalizePrompt(promptLines, block.number);
    let type = groupType;

    const inline = extractInlineOptions(prompt);
    if (inline && options.length === 0) {
      prompt = inline.prompt;
      options = inline.options;
    }

    if (options.length >= 2) {
      const roman = options.every((option) => /^[ivx]+$/.test(option.value));
      if (roman) {
        type = groupType === "matching_information" ? "matching_information" : "matching_headings";
      } else if (groupType === "short_answer" || groupType === "sentence_completion") {
        type = "multiple_choice";
      }
    }

    if (type === "matching_headings" && options.length === 0 && groupOptions.length) {
      options = groupOptions;
    }
    if (
      ["matching_features", "matching_information", "matching_sentence_endings"].includes(type) &&
      options.length === 0 &&
      groupOptions.length
    ) {
      options = groupOptions;
    }
    if (
      (type === "multiple_choice" || type === "multiple_choice_multi") &&
      options.length === 0 &&
      groupOptions.length
    ) {
      options = groupOptions;
    }
    if (type === "true_false_not_given") options = FIXED_TFNG;
    if (type === "yes_no_not_given") options = FIXED_YNNG;

    if ((type === "multiple_choice" || type === "multiple_choice_multi") && options.length < 2) {
      type = "short_answer";
    }

    const answerMode: AnswerMode =
      type === "multiple_choice_multi" || (options.length > 0 && selectCount > 1) ? "all" : "single";

    questions.push({
      id: `p${passageNumber}-q${block.number}-${index}`,
      number: block.number,
      type,
      prompt,
      options,
      placeholder: inferPlaceholder(type, instruction) ?? placeholder,
      selectCount: type === "multiple_choice_multi" ? Math.max(2, selectCount) : undefined,
      answerMode,
      groupId,
    });
  });

  if (!questions.length) return null;

  const rangeStart = chunk.rangeStart ?? questions[0].number;
  const rangeEnd = chunk.rangeEnd ?? questions[questions.length - 1].number;

  if (chunk.rangeEnd !== undefined) {
    const expected = chunk.rangeEnd - (chunk.rangeStart ?? questions[0].number) + 1;
    if (expected > questions.length) {
      warnings.push(
        `Nhóm câu ${rangeStart}–${rangeEnd} có ${questions.length}/${expected} câu được nhận diện.`,
      );
    }
  }

  const group: QuestionGroup = {
    id: groupId,
    type: groupType,
    instructions: instruction,
    rangeStart,
    rangeEnd,
    options: groupOptions,
    questions,
  };

  return { group, warnings };
}

export function detectQuestions(text: string, passageNumber: number): QuestionDetection {
  const chunks = splitChunks(text);
  const groups: QuestionGroup[] = [];
  const warnings: string[] = [];

  chunks.forEach((chunk, index) => {
    const parsed = parseChunk(chunk, passageNumber, index + 1);
    if (!parsed) return;
    warnings.push(...parsed.warnings);
    groups.push(parsed.group);
  });

  if (!groups.length) {
    warnings.push(`Không nhận diện được câu hỏi cho Passage ${passageNumber}.`);
  }

  const seen = new Set<number>();
  groups.flatMap((group) => group.questions).forEach((question) => {
    if (seen.has(question.number)) {
      warnings.push(`Số câu ${question.number} bị trùng. Kiểm tra lại file gốc.`);
    }
    seen.add(question.number);
  });

  return { groups, warnings };
}
