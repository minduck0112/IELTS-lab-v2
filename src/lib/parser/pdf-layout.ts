export interface PdfTextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageInput {
  pageNumber: number;
  width: number;
  height: number;
  runs: PdfTextRun[];
}

interface PositionedLine {
  text: string;
  x: number;
  endX: number;
  y: number;
  height: number;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  column: "full" | "left" | "right";
}

interface TextSegment {
  text: string;
  x: number;
  endX: number;
  y: number;
  height: number;
}

const PROTECTED_IELTS_HEADING =
  /^(?:reading\s+passage\s+\d+|passage\s+\d+|questions?\s+\d+|answer\s+key\b|answers?\s*:|\d{1,3}\s*[.)])/i;

const STANDALONE_PAGE_NUMBER =
  /^(?:page\s*\d+(?:\s*(?:of|\/)\s*\d+)?|trang\s*\d+(?:\s*(?:\/|trên)\s*\d+)?|\d+\s*\/\s*\d+|[-–—•·|]\s*\d{1,3}\s*[-–—•·|]|\d{1,3})$/i;

function median(values: number[], fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function joinSegmentRuns(runs: PdfTextRun[]): TextSegment {
  const ordered = [...runs].sort((a, b) => a.x - b.x);
  let text = "";
  let prevEndX: number | null = null;
  let totalCharWidth = 0;
  let totalChars = 0;

  for (const run of ordered) {
    const chunk = run.str.replace(/\s+/g, " ");
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    totalCharWidth += Math.max(run.width, 0);
    totalChars += Math.max(trimmed.length, 1);
    const avgCharWidth = totalChars > 0 ? totalCharWidth / totalChars : 5;

    if (prevEndX !== null && text.length > 0) {
      const gap = run.x - prevEndX;
      const startsWithClosingPunct = /^[.,;:?!%)\]}'’”\-]/.test(trimmed);
      const endsWithOpeningPunct = /[(\[{'"‘“\-]$/.test(text);
      const spaceThreshold = startsWithClosingPunct
        ? Math.max(2.6, avgCharWidth * 0.55)
        : endsWithOpeningPunct
          ? Math.max(2.4, avgCharWidth * 0.48)
          : Math.max(1.2, avgCharWidth * 0.25);

      if (gap > spaceThreshold && !text.endsWith(" ") && !chunk.startsWith(" ")) {
        text += " ";
      }
    }

    text += trimmed;
    prevEndX = Math.max(prevEndX ?? run.x, run.x + Math.max(run.width, 0));
  }

  const first = ordered[0]!;
  const lastEnd = Math.max(...ordered.map((r) => r.x + Math.max(r.width, 0)));
  const y = median(
    ordered.map((r) => r.y),
    first.y,
  );
  const height = median(
    ordered.map((r) => (r.height > 0 ? r.height : 10)),
    10,
  );

  return {
    text: text.replace(/\s+/g, " ").trim(),
    x: first.x,
    endX: lastEnd,
    y,
    height,
  };
}

function groupRunsIntoYBands(runs: PdfTextRun[]): PdfTextRun[][] {
  const valid = runs.filter((run) => run.str.trim().length > 0);
  if (!valid.length) return [];

  const medianHeight = median(
    valid.map((r) => (r.height > 0 ? r.height : 10)),
    10,
  );
  const yTolerance = Math.max(2.5, Math.min(6, medianHeight * 0.45));

  const sorted = [...valid].sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > 0.5) return dy;
    return a.x - b.x;
  });

  const bands: Array<{ anchorY: number; runs: PdfTextRun[] }> = [];
  for (const run of sorted) {
    let targetBand: { anchorY: number; runs: PdfTextRun[] } | null = null;
    for (let i = bands.length - 1; i >= Math.max(0, bands.length - 4); i -= 1) {
      if (Math.abs(bands[i]!.anchorY - run.y) <= yTolerance) {
        targetBand = bands[i]!;
        break;
      }
    }

    if (targetBand) {
      targetBand.runs.push(run);
    } else {
      bands.push({ anchorY: run.y, runs: [run] });
    }
  }

  return bands
    .sort((a, b) => b.anchorY - a.anchorY)
    .map((band) => band.runs);
}

function splitBandIntoSegments(runs: PdfTextRun[], pageWidth: number): TextSegment[] {
  const ordered = [...runs].sort((a, b) => a.x - b.x);
  const gapThreshold = Math.max(18, pageWidth * 0.042);

  const groups: PdfTextRun[][] = [];
  let current: PdfTextRun[] = [];
  let currentEndX = -Infinity;

  for (const run of ordered) {
    if (!current.length) {
      current = [run];
      currentEndX = run.x + Math.max(run.width, 0);
      continue;
    }

    const gap = run.x - currentEndX;
    if (gap > gapThreshold) {
      groups.push(current);
      current = [run];
      currentEndX = run.x + Math.max(run.width, 0);
    } else {
      current.push(run);
      currentEndX = Math.max(currentEndX, run.x + Math.max(run.width, 0));
    }
  }

  if (current.length) {
    groups.push(current);
  }

  return groups
    .map((group) => joinSegmentRuns(group))
    .filter((segment) => segment.text.length > 0);
}

function detectColumnSplitX(
  bandSegments: TextSegment[][],
  pageWidth: number,
): number | null {
  const minCenter = pageWidth * 0.32;
  const maxCenter = pageWidth * 0.68;

  const gapMidpoints: number[] = [];
  for (const segments of bandSegments) {
    if (segments.length < 2) continue;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const left = segments[i]!;
      const right = segments[i + 1]!;
      const gap = right.x - left.endX;
      const midpoint = (left.endX + right.x) / 2;
      if (gap >= Math.max(14, pageWidth * 0.03) && midpoint >= minCenter && midpoint <= maxCenter) {
        gapMidpoints.push(midpoint);
      }
    }
  }

  if (gapMidpoints.length >= 3) {
    const splitX = median(gapMidpoints, pageWidth * 0.5);
    const gutterTol = Math.max(8, pageWidth * 0.02);
    let leftCount = 0;
    let rightCount = 0;
    let crossingCount = 0;

    for (const segments of bandSegments) {
      for (const seg of segments) {
        if (seg.endX <= splitX + gutterTol) {
          leftCount += 1;
        } else if (seg.x >= splitX - gutterTol) {
          rightCount += 1;
        } else if (seg.x < splitX - gutterTol && seg.endX > splitX + gutterTol) {
          crossingCount += 1;
        }
      }
    }

    if (leftCount >= 3 && rightCount >= 3 && crossingCount <= leftCount + rightCount) {
      return splitX;
    }
  }

  // Fallback check: even if left and right baselines aren't aligned, check for a clear vertical gutter near center
  const defaultMid = pageWidth * 0.5;
  const gutterTol = Math.max(6, pageWidth * 0.015);
  let leftOnly = 0;
  let rightOnly = 0;
  let crossing = 0;

  for (const segments of bandSegments) {
    for (const seg of segments) {
      if (seg.endX <= defaultMid + gutterTol) {
        leftOnly += 1;
      } else if (seg.x >= defaultMid - gutterTol) {
        rightOnly += 1;
      } else {
        crossing += 1;
      }
    }
  }

  if (leftOnly >= 4 && rightOnly >= 4 && crossing <= Math.max(3, Math.floor((leftOnly + rightOnly) * 0.2))) {
    return defaultMid;
  }

  return null;
}

function buildPageLines(page: PdfPageInput): PositionedLine[] {
  const pageWidth = page.width > 0 ? page.width : 595;
  const pageHeight = page.height > 0 ? page.height : 842;

  const bands = groupRunsIntoYBands(page.runs);
  if (!bands.length) return [];

  const bandSegments = bands.map((band) => splitBandIntoSegments(band, pageWidth));
  const splitX = detectColumnSplitX(bandSegments, pageWidth);

  if (splitX === null) {
    const lines: PositionedLine[] = [];
    for (const segments of bandSegments) {
      if (!segments.length) continue;
      // Merge segments on single-column line with spaces if they were wide-spaced (e.g. table/label)
      const mergedText = segments.map((s) => s.text).join("  ").trim();
      const first = segments[0]!;
      const last = segments[segments.length - 1]!;
      lines.push({
        text: mergedText,
        x: first.x,
        endX: last.endX,
        y: first.y,
        height: first.height,
        pageNumber: page.pageNumber,
        pageWidth,
        pageHeight,
        column: "full",
      });
    }
    return lines;
  }

  const gutterTol = Math.max(10, pageWidth * 0.025);
  const fullWidthSpanThreshold = Math.max(24, pageWidth * 0.08);
  const output: PositionedLine[] = [];
  let leftBuffer: PositionedLine[] = [];
  let rightBuffer: PositionedLine[] = [];

  const flushColumns = () => {
    if (leftBuffer.length) {
      output.push(...leftBuffer);
      leftBuffer = [];
    }
    if (rightBuffer.length) {
      output.push(...rightBuffer);
      rightBuffer = [];
    }
  };

  for (const segments of bandSegments) {
    if (!segments.length) continue;

    // A single segment clearly spanning both sides of splitX acts as a full-width heading/header/footer
    if (
      segments.length === 1 &&
      segments[0]!.x < splitX - fullWidthSpanThreshold &&
      segments[0]!.endX > splitX + fullWidthSpanThreshold
    ) {
      flushColumns();
      const seg = segments[0]!;
      output.push({
        text: seg.text,
        x: seg.x,
        endX: seg.endX,
        y: seg.y,
        height: seg.height,
        pageNumber: page.pageNumber,
        pageWidth,
        pageHeight,
        column: "full",
      });
      continue;
    }

    const leftSegs: TextSegment[] = [];
    const rightSegs: TextSegment[] = [];

    for (const seg of segments) {
      const mid = (seg.x + seg.endX) / 2;
      if (seg.endX <= splitX + gutterTol || mid < splitX) {
        leftSegs.push(seg);
      } else {
        rightSegs.push(seg);
      }
    }

    if (leftSegs.length) {
      const first = leftSegs[0]!;
      const last = leftSegs[leftSegs.length - 1]!;
      leftBuffer.push({
        text: leftSegs.map((s) => s.text).join(" ").trim(),
        x: first.x,
        endX: last.endX,
        y: first.y,
        height: first.height,
        pageNumber: page.pageNumber,
        pageWidth,
        pageHeight,
        column: "left",
      });
    }

    if (rightSegs.length) {
      const first = rightSegs[0]!;
      const last = rightSegs[rightSegs.length - 1]!;
      rightBuffer.push({
        text: rightSegs.map((s) => s.text).join(" ").trim(),
        x: first.x,
        endX: last.endX,
        y: first.y,
        height: first.height,
        pageNumber: page.pageNumber,
        pageWidth,
        pageHeight,
        column: "right",
      });
    }
  }

  flushColumns();
  return output;
}

function normalizeMarginSignature(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function isInTopMargin(line: PositionedLine, indexInPage: number): boolean {
  return line.y >= line.pageHeight * 0.88 || indexInPage === 0;
}

function isInBottomMargin(line: PositionedLine, indexInPage: number, totalOnPage: number): boolean {
  return line.y <= line.pageHeight * 0.12 || indexInPage === totalOnPage - 1;
}

function filterHeadersFootersAndPageNumbers(pagesLines: PositionedLine[][]): PositionedLine[][] {
  const pageCount = pagesLines.length;
  const topCounts = new Map<string, Set<number>>();
  const bottomCounts = new Map<string, Set<number>>();

  if (pageCount >= 2) {
    pagesLines.forEach((lines, pageIdx) => {
      lines.forEach((line, lineIdx) => {
        if (PROTECTED_IELTS_HEADING.test(line.text)) return;
        const sig = normalizeMarginSignature(line.text);
        if (sig.length < 3 || sig.length > 120) return;

        if (isInTopMargin(line, lineIdx)) {
          const set = topCounts.get(sig) ?? new Set<number>();
          set.add(pageIdx);
          topCounts.set(sig, set);
        }
        if (isInBottomMargin(line, lineIdx, lines.length)) {
          const set = bottomCounts.get(sig) ?? new Set<number>();
          set.add(pageIdx);
          bottomCounts.set(sig, set);
        }
      });
    });
  }

  const minRepeatPages = pageCount >= 3 ? Math.max(2, Math.ceil(pageCount * 0.4)) : 2;

  return pagesLines.map((lines) =>
    lines.filter((line, lineIdx) => {
      if (PROTECTED_IELTS_HEADING.test(line.text)) {
        return true;
      }

      const inMargin =
        isInTopMargin(line, lineIdx) || isInBottomMargin(line, lineIdx, lines.length);

      if (inMargin && STANDALONE_PAGE_NUMBER.test(line.text.trim())) {
        return false;
      }

      if (pageCount >= 2 && inMargin) {
        const sig = normalizeMarginSignature(line.text);
        const repeatedTop = (topCounts.get(sig)?.size ?? 0) >= minRepeatPages;
        const repeatedBottom = (bottomCounts.get(sig)?.size ?? 0) >= minRepeatPages;
        if (
          (isInTopMargin(line, lineIdx) && repeatedTop) ||
          (isInBottomMargin(line, lineIdx, lines.length) && repeatedBottom)
        ) {
          return false;
        }
      }

      return true;
    }),
  );
}

export interface PdfLayoutPage {
  pageNumber: number;
  text: string;
}

const STANDALONE_HEADING_LINE =
  /^(?:(?:IELTS\s+)?(?:ACADEMIC\s+|GENERAL\s+TRAINING\s+)?(?:READING[\s_]+)?PASSAGE\s+\d+|SECTION\s+\d+|BÀI\s+(?:ĐỌC\s+)?\d+|Questions?\s+\d+.*|Question\s+\d+.*|Đáp\s*án\s*$|Answer\s*key\s*$|Hướng\s*dẫn\s*chấm\s*$)/i;

const PARAGRAPH_START_LINE =
  /^(?:(?:[A-Z]\.|Paragraph\s+[A-Z]\b)\s+\S|\d{1,3}\s*[.)]\s|\(\d{1,3}\)\s|[•▪◦●\-*]\s|\(?[A-Z]\)[.)]\s|[A-Z][.)]\s|[ivx]{1,6}[.)]\s|(?:TRUE|FALSE|NOT GIVEN|YES|NO)\b(?:\s+if\b|\s*$)|(?:Đáp\s*án|Kỹ\s*năng\s+IELTS|Câu\s*hỏi(?:\s+suy\s+luận)?|Vị\s*trí|Dấu\s*hiệu|Giải\s*thích|Paraphrase|Lưu\s*ý|Bẫy|Kết\s*luận|Explanation)\s*[:：]|\/\s+\S|You\s+should\s+spend\b|Complete\s+the\b|Choose\b|Do\s+the\s+following\b|Write\s*[:：]?$)/i;

function percentile(values: number[], p: number, fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx]!;
}

function reflowPositionedLines(lines: PositionedLine[]): string {
  if (!lines.length) return "";

  const spacings: number[] = [];
  const heights: number[] = [];
  const colEnds = new Map<PositionedLine["column"], number[]>();
  const colStarts = new Map<PositionedLine["column"], number[]>();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    heights.push(line.height);
    if (line.text.length >= 35) {
      const ends = colEnds.get(line.column) ?? [];
      ends.push(line.endX);
      colEnds.set(line.column, ends);
    }
    const starts = colStarts.get(line.column) ?? [];
    starts.push(line.x);
    colStarts.set(line.column, starts);

    if (i > 0) {
      const prev = lines[i - 1]!;
      const dy = prev.y - line.y;
      if (prev.column === line.column && dy > 0.5 && dy < prev.height * 3.5) {
        spacings.push(dy);
      }
    }
  }

  const medianHeight = median(heights, 11);
  const medianSpacing = median(spacings, medianHeight * 1.35);

  const paragraphs: string[] = [];
  let current = "";

  for (let i = 0; i < lines.length; i += 1) {
    const curr = lines[i]!;
    if (i === 0) {
      current = curr.text;
      continue;
    }

    const prev = lines[i - 1]!;
    const dy = prev.y - curr.y;
    const rightValues = colEnds.get(prev.column) ?? [prev.endX];
    const leftValues = colStarts.get(curr.column) ?? [curr.x];
    const colRightEdge = percentile(rightValues, 0.88, prev.endX);
    const colLeftEdge = percentile(leftValues, 0.15, curr.x);
    const shortMarginThreshold = Math.max(60, curr.pageWidth * 0.11);
    const prevWasShort = prev.endX < colRightEdge - shortMarginThreshold;
    const prevEndedSentence = /[.!?…]["'”’)]?$/.test(prev.text);

    const startsNew =
      prev.column !== curr.column ||
      STANDALONE_HEADING_LINE.test(curr.text) ||
      STANDALONE_HEADING_LINE.test(prev.text) ||
      PARAGRAPH_START_LINE.test(curr.text) ||
      dy > Math.max(medianSpacing * 1.25, prev.height * 1.65) ||
      Math.abs(prev.height - curr.height) > Math.max(1.8, prev.height * 0.16) ||
      (prevWasShort && prevEndedSentence) ||
      (prevWasShort && prev.text.length <= 95 && !/[,;\-–—]$/.test(prev.text)) ||
      (curr.x > colLeftEdge + 10 && prevEndedSentence);

    if (startsNew) {
      if (current.trim()) paragraphs.push(current.trim());
      current = curr.text;
    } else if (current.endsWith("\u00ad")) {
      current = `${current.slice(0, -1)}${curr.text}`;
    } else {
      current = `${current} ${curr.text}`;
    }
  }

  if (current.trim()) {
    paragraphs.push(current.trim());
  }

  return paragraphs.join("\n\n");
}

export function mergeCrossPageParagraphs(pageTexts: string[]): string {
  const nonEmpty = pageTexts.map((t) => t.trim()).filter(Boolean);
  if (!nonEmpty.length) return "";

  const paragraphs: string[] = [];

  for (const pageText of nonEmpty) {
    const pageParagraphs = pageText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!pageParagraphs.length) continue;

    if (paragraphs.length > 0) {
      const prev = paragraphs[paragraphs.length - 1]!;
      const first = pageParagraphs[0]!;
      const prevComplete =
        /[.!?…:]["'”’)]?$/.test(prev) ||
        STANDALONE_HEADING_LINE.test(prev) ||
        prev.length < 75;
      const nextIsBreak =
        STANDALONE_HEADING_LINE.test(first) ||
        PARAGRAPH_START_LINE.test(first);

      if (!prevComplete && !nextIsBreak) {
        paragraphs[paragraphs.length - 1] = prev.endsWith("\u00ad")
          ? `${prev.slice(0, -1)}${first}`
          : `${prev} ${first}`;
        paragraphs.push(...pageParagraphs.slice(1));
        continue;
      }
    }

    paragraphs.push(...pageParagraphs);
  }

  return paragraphs.join("\n\n");
}

export function extractLayoutPagesFromPages(pages: PdfPageInput[]): PdfLayoutPage[] {
  const rawPagesLines = pages.map((page) => buildPageLines(page));
  const cleanedPagesLines = filterHeadersFootersAndPageNumbers(rawPagesLines);

  return cleanedPagesLines.map((lines, index) => ({
    pageNumber: pages[index]?.pageNumber ?? index + 1,
    text: lines.map((line) => line.text).join("\n"),
  }));
}

export function extractReflowedLayoutPagesFromPages(pages: PdfPageInput[]): PdfLayoutPage[] {
  const rawPagesLines = pages.map((page) => buildPageLines(page));
  const cleanedPagesLines = filterHeadersFootersAndPageNumbers(rawPagesLines);

  return cleanedPagesLines.map((lines, index) => ({
    pageNumber: pages[index]?.pageNumber ?? index + 1,
    text: reflowPositionedLines(lines),
  }));
}

export function extractLayoutTextFromPages(pages: PdfPageInput[]): string {
  return extractLayoutPagesFromPages(pages)
    .map((page) => page.text)
    .filter((pageText) => pageText.trim().length > 0)
    .join("\n\n");
}

export function findSparsePageNumbers(layoutPages: PdfLayoutPage[]): number[] {
  return layoutPages
    .filter((page) => {
      const trimmed = page.text.trim();
      if (!trimmed) return true;
      const nonSpace = trimmed.replace(/\s+/g, "");
      if (nonSpace.length < 40) return true;
      const garbledCount = (nonSpace.match(/[\ufffd\ue000-\uf8ff]/g) ?? []).length;
      if (garbledCount / nonSpace.length > 0.25) return true;
      const readableWords = (trimmed.match(/[A-Za-zÀ-ỹ0-9]{2,}/g) ?? []).length;
      return readableWords < 6;
    })
    .map((page) => page.pageNumber);
}

export function isLikelyScannedPdf(text: string, pageCount: number): boolean {
  if (pageCount <= 0) return false;
  const trimmed = text.trim();
  if (!trimmed) return true;

  const nonSpaceChars = trimmed.replace(/\s+/g, "");
  if (nonSpaceChars.length < 120) return true;

  const avgCharsPerPage = nonSpaceChars.length / pageCount;
  if (avgCharsPerPage < 80) return true;

  const garbledCount = (nonSpaceChars.match(/[\ufffd\ue000-\uf8ff]/g) ?? []).length;
  const readableWords = (trimmed.match(/[A-Za-zÀ-ỹ0-9]{2,}/g) ?? []).length;

  if (garbledCount / nonSpaceChars.length > 0.2) return true;
  if (readableWords < Math.max(18, pageCount * 10)) return true;

  return false;
}
