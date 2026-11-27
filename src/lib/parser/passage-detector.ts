import { compactLines, isLikelyHeading } from "./normalize";

export interface PassageDraft {
  number: number;
  title: string;
  bodyText: string;
  questionText: string;
}

export interface PassageDetection {
  passages: PassageDraft[];
  warnings: string[];
}

const PASSAGE_HEADING =
  /^\s*(?:(?:IELTS\s+)?(?:ACADEMIC\s+|GENERAL\s+TRAINING\s+)?(?:READING[\s_]+)?PASSAGE|SECTION|BÀI\s+ĐỌC|BÀI)\s+(\d{1,2})\b(?:\s*[:.\-–—_]\s*(.*))?$/i;

const RUBRIC_PREAMBLE =
  /^(?:You\s+should\s+spend\b|(?:Questions?\s+\d+(?:\s*[-–—]\s*\d+)?\s*,?\s*)?which\s+(?:is|are)\s+based\s+on\s+(?:Reading\s+)?Passage\b|(?:Reading\s+)?Passage\s+\d+\s+below\b|Time\s*:\s*\d+\s*min)/i;

const NON_TITLE_BANNER =
  /^(?:IELTS\s+(?:ACADEMIC\s+|GENERAL\s+TRAINING\s+)?READING(?:[\s_]+(?:PASSAGE|TEST|PRACTICE))?|ACADEMIC\s+READING|GENERAL\s+TRAINING\s+READING|READING\s+TEST|READING\s+PRACTICE)$/i;

const PASSAGE_RUBRIC_SPLIT =
  /\bwhich\s+(?:is|are)\s+based\s+on\s+(?:Reading\s+)?Passage\s+(\d{1,2})\b/i;

const INSTRUCTION_START =
  /^(?:Do the following|Choose the correct|Choose (?:TWO|THREE|FOUR|ONE)|Complete the|Complete each|Match each|Match the|Answer the questions|Look at the following|Write the correct|Which paragraph|Which section|Using NO MORE THAN|In boxes|NB\s|Questions?\s+\d+)/i;

const NUMBERED_QUESTION = /^\s*\d{1,3}\s*[.)]\s+\S/;

function isRubricPreambleAt(lines: string[], index: number) {
  const line = lines[index] ?? "";
  if (RUBRIC_PREAMBLE.test(line)) return true;
  if (/^Questions?\s+\d+/i.test(line)) {
    const next = lines[index + 1] ?? "";
    if (PASSAGE_RUBRIC_SPLIT.test(`${line} ${next}`)) return true;
  }
  return false;
}

function stripPassageBoilerplate(lines: string[]) {
  const result: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (NON_TITLE_BANNER.test(line)) continue;
    if (isRubricPreambleAt(lines, index)) {
      // Also drop immediate wrapped continuation like "which are based on Reading Passage 1 below."
      const next = lines[index + 1] ?? "";
      if (/^Questions?\s+\d+/i.test(next) && PASSAGE_RUBRIC_SPLIT.test(`${next} ${lines[index + 2] ?? ""}`)) {
        index += 1;
      }
      if (/^(?:which\s+(?:is|are)\s+based\s+on|Reading\s+Passage\s+\d+\s+below)/i.test(lines[index + 1] ?? "")) {
        index += 1;
      }
      continue;
    }
    result.push(line);
  }
  return result;
}

function parseHeading(line: string) {
  const match = line.match(PASSAGE_HEADING);
  if (!match) return null;
  const rest = (match[2] ?? "").trim();
  if (rest && /^(has|have|contains|below|is|are|you|the following|on the following)\b/i.test(rest)) {
    return null;
  }
  return {
    number: Number.parseInt(match[1], 10),
    title: rest || "",
  };
}

function looksLikePassageHeading(line: string) {
  return Boolean(parseHeading(line));
}

function findQuestionStart(lines: string[]) {
  let seenBodyLines = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (NON_TITLE_BANNER.test(line) || isRubricPreambleAt(lines, index)) {
      continue;
    }
    if (/^Questions?\s+\d+/i.test(line)) return index;
    if (INSTRUCTION_START.test(line) && seenBodyLines > 0) return index;
    if (NUMBERED_QUESTION.test(line) && seenBodyLines >= 2) {
      const previous = lines.slice(Math.max(0, index - 3), index).join(" ");
      if (previous.length > 40 || seenBodyLines >= 4) return index;
    }
    seenBodyLines += 1;
  }
  return -1;
}

function inferTitle(bodyText: string) {
  const first = compactLines(bodyText)[0] ?? "";
  if (
    first &&
    first.length <= 120 &&
    !/[.!?]$/.test(first) &&
    !INSTRUCTION_START.test(first) &&
    !RUBRIC_PREAMBLE.test(first) &&
    !NON_TITLE_BANNER.test(first) &&
    !/^questions?\s+\d+/i.test(first) &&
    (isLikelyHeading(first) || /^[A-ZÀ-Ỹ]/.test(first))
  ) {
    return first;
  }
  return "";
}

function findFallbackRubricHeadings(lines: string[]) {
  const found: Array<{ index: number; number: number; title: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const combined = `${lines[index] ?? ""} ${lines[index + 1] ?? ""}`;
    if (!/^You\s+should\s+spend\b/i.test(lines[index] ?? "")) continue;
    const match = combined.match(PASSAGE_RUBRIC_SPLIT);
    if (match?.[1]) {
      found.push({
        index,
        number: Number.parseInt(match[1], 10),
        title: "",
      });
    }
  }
  return found.length >= 2 ? found : [];
}

export function detectPassages(text: string): PassageDetection {
  const lines = compactLines(text);
  const warnings: string[] = [];
  const headings: Array<{ index: number; number: number; title: string }> = [];

  lines.forEach((line, index) => {
    const heading = parseHeading(line);
    if (heading) headings.push({ index, ...heading });
  });

  const resolvedHeadings = headings.length > 0 ? headings : findFallbackRubricHeadings(lines);

  if (resolvedHeadings.length === 0) {
    const questionStart = findQuestionStart(lines);
    const rawBodyLines = questionStart >= 0 ? lines.slice(0, questionStart) : lines;
    const bodyLines = stripPassageBoilerplate(rawBodyLines);
    const questionLines = questionStart >= 0 ? lines.slice(questionStart) : [];
    const title = inferTitle(bodyLines.join("\n"));
    const cleanedBody =
      title && bodyLines[0] === title ? bodyLines.slice(1).join("\n") : bodyLines.join("\n");
    return {
      passages: [
        {
          number: 1,
          title: title || "Reading Passage 1",
          bodyText: cleanedBody,
          questionText: questionLines.join("\n"),
        },
      ],
      warnings: ["Không tìm thấy tiêu đề Passage. Đã coi toàn bộ file là một passage."],
    };
  }

  const drafts: PassageDraft[] = [];

  resolvedHeadings.forEach((heading, index) => {
    const next = resolvedHeadings[index + 1];
    const sectionLines = lines.slice(heading.index + 1, next?.index ?? lines.length);
    const questionStart = findQuestionStart(sectionLines);
    const rawBodyLines = questionStart >= 0 ? sectionLines.slice(0, questionStart) : sectionLines;
    const bodyLines = stripPassageBoilerplate(rawBodyLines);
    const questionLines = questionStart >= 0 ? sectionLines.slice(questionStart) : [];
    const bodyText = bodyLines.join("\n").trim();

    if (!bodyText) {
      warnings.push(`Passage ${heading.number} không có nội dung đọc.`);
    }
    if (!questionLines.length) {
      warnings.push(`Không tìm thấy câu hỏi cho Passage ${heading.number}.`);
    }

    const inferredTitle = heading.title || inferTitle(bodyText);
    const cleanedBody =
      !heading.title && inferredTitle && bodyLines[0] === inferredTitle
        ? bodyLines.slice(1).join("\n")
        : bodyText;

    drafts.push({
      number: heading.number,
      title: inferredTitle || `Reading Passage ${heading.number}`,
      bodyText: cleanedBody,
      questionText: questionLines.join("\n"),
    });
  });

  if (drafts.length > 3) {
    warnings.push(`Phát hiện ${drafts.length} passages. Bạn sẽ chọn các passage muốn làm trước khi bắt đầu.`);
  }

  return { passages: drafts, warnings };
}

export { looksLikePassageHeading };
