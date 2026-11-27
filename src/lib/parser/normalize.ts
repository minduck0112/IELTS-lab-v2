import { escapeHtml } from "@/lib/utils";

const PAGE_BREAK = "\f";

export function normalizeDocumentText(input: string) {
  return input
    .replace(/\u00a0/g, " ")
    .replace(/\u200b/g, "")
    .replace(/\u200c/g, "")
    .replace(/\u200d/g, "")
    .replace(/，\s*/g, ", ")
    .replace(/；\s*/g, "; ")
    .replace(/\r\n?/g, "\n")
    .replace(new RegExp(PAGE_BREAK, "g"), "\n\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function splitLines(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1]?.length > 0));
}

export function compactLines(text: string) {
  return splitLines(text).filter(Boolean);
}

export function textToHtml(text: string) {
  return normalizeDocumentText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("\n");
}

function isGenericPassageTitle(title: string) {
  return !title.trim() || /^(?:reading\s+)?passage\s+\d+$/i.test(title.trim());
}

export function formatPassageHtml(title: string, bodyText: string) {
  const paragraphs = normalizeDocumentText(bodyText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // Detect whether paragraphs use bare single-letter labels ("A The potato...") vs dotted ("A. The potato...").
  const dottedLabels = paragraphs.filter((p) => /^(?:[A-Z]\.|Paragraph\s+[A-Z]\b:?)\s+\S/.test(p)).length;
  const bareLabelCandidates = paragraphs.filter((p) => /^[A-Z]\s+[A-ZÀ-Ỹ]/.test(p)).length;
  const useBareLetterLabels = dottedLabels === 0 && bareLabelCandidates >= 2;

  const blocks: string[] = [];

  if (!isGenericPassageTitle(title)) {
    blocks.push(`<h2 class="passage-title">${escapeHtml(title.trim())}</h2>`);
  }

  paragraphs.forEach((line, index) => {
    const dottedMatch = line.match(/^([A-Z]\.|Paragraph\s+[A-Z]\b:?)\s+(.+)$/);
    if (dottedMatch) {
      blocks.push(
        `<p><strong class="passage-label">${escapeHtml(dottedMatch[1])}</strong> ${escapeHtml(dottedMatch[2])}</p>`,
      );
      return;
    }

    if (useBareLetterLabels) {
      const bareMatch = line.match(/^([A-Z])\s+([A-ZÀ-Ỹ].+)$/);
      if (bareMatch) {
        blocks.push(
          `<p><strong class="passage-label">${escapeHtml(bareMatch[1])}</strong> ${escapeHtml(bareMatch[2])}</p>`,
        );
        return;
      }
    }

    if (
      index === 0 &&
      !isGenericPassageTitle(title) &&
      line.length <= 140 &&
      !/[.!?]$/.test(line)
    ) {
      blocks.push(`<p class="passage-subtitle"><em>${escapeHtml(line)}</em></p>`);
      return;
    }

    blocks.push(`<p>${escapeHtml(line)}</p>`);
  });

  return blocks.join("\n");
}

export function stripQuestionNumber(line: string) {
  return line
    .replace(/^\s*(?:question\s+)?\d{1,3}\s*[.)\-:]\s*/i, "")
    .replace(/^\s*\(?\d{1,3}\)?\s+/, "")
    .trim();
}

export function canonicalSpace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function isLikelyHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 140) return false;
  const letters = trimmed.replace(/[^A-Za-zÀ-ỹ]/g, "");
  if (letters.length < 3) return false;
  return trimmed === trimmed.toUpperCase() || /^passage\s+\d+/i.test(trimmed);
}
