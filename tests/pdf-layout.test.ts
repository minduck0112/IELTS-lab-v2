import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { extractLayoutTextFromPages, isLikelyScannedPdf, type PdfPageInput } from "@/lib/parser/pdf-layout";
import { parseReadingDocument } from "@/lib/parser/parse-reading";

describe("PDF upload limits & scanned detection", () => {
  it("sets upload limit to 25 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);
  });

  it("flags empty, sparse, or garbled PDFs as requiring OCR", () => {
    expect(isLikelyScannedPdf("", 3)).toBe(true);
    expect(isLikelyScannedPdf("Page 1\nPage 2", 2)).toBe(true);
    expect(isLikelyScannedPdf("\ufffd".repeat(250), 1)).toBe(true);

    const normalText = Array.from(
      { length: 30 },
      (_, idx) => `Sentence ${idx + 1} discusses urban biodiversity and rooftop hives.`,
    ).join(" ");
    expect(isLikelyScannedPdf(normalText, 2)).toBe(false);
  });
});

describe("PDF layout & column reconstruction", () => {
  it("keeps full-width titles first and reads left column before right column", () => {
    const page: PdfPageInput = {
      pageNumber: 1,
      width: 600,
      height: 840,
      runs: [
        // Full-width heading spanning across midpoint (x=300)
        { str: "READING PASSAGE 1", x: 180, y: 780, width: 240, height: 14 },
        { str: "The Return of Urban Bees", x: 160, y: 755, width: 280, height: 16 },

        // Two-column layout sharing exact baseline Y coordinates
        { str: "For much of the twentieth century,", x: 40, y: 700, width: 220, height: 11 },
        { str: "Questions 1–2", x: 330, y: 700, width: 120, height: 11 },

        { str: "beekeeping stayed in rural areas.", x: 40, y: 682, width: 210, height: 11 },
        { str: "1. Bees appeared on office roofs.", x: 330, y: 682, width: 210, height: 11 },

        { str: "Now hives appear on city roofs.", x: 40, y: 664, width: 215, height: 11 },
        { str: "2. Urban hives need more pesticides.", x: 330, y: 664, width: 220, height: 11 },
      ],
    };

    const text = extractLayoutTextFromPages([page]);
    const lines = text.split("\n");

    expect(lines).toEqual([
      "READING PASSAGE 1",
      "The Return of Urban Bees",
      "For much of the twentieth century,",
      "beekeeping stayed in rural areas.",
      "Now hives appear on city roofs.",
      "Questions 1–2",
      "1. Bees appeared on office roofs.",
      "2. Urban hives need more pesticides.",
    ]);

    const parsed = parseReadingDocument({
      text,
      html: "",
      fileType: "pdf",
      fileName: "urban-bees.pdf",
    });
    expect(parsed.fileType).toBe("pdf");
    expect(parsed.passages).toHaveLength(1);
    expect(parsed.totalQuestions).toBe(2);
  });

  it("strips repeated headers, footers, and standalone page numbers while protecting IELTS headings", () => {
    const pages: PdfPageInput[] = [
      {
        pageNumber: 1,
        width: 600,
        height: 840,
        runs: [
          { str: "Cambridge Practice Test - Page 1 of 3", x: 180, y: 810, width: 240, height: 10 },
          { str: "READING PASSAGE 1", x: 50, y: 760, width: 160, height: 13 },
          { str: "Paragraph A explains early water clocks.", x: 50, y: 700, width: 260, height: 11 },
          { str: "www.example-ielts.org", x: 200, y: 40, width: 160, height: 9 },
          { str: "- 1 -", x: 280, y: 20, width: 30, height: 9 },
        ],
      },
      {
        pageNumber: 2,
        width: 600,
        height: 840,
        runs: [
          { str: "Cambridge Practice Test - Page 2 of 3", x: 180, y: 810, width: 240, height: 10 },
          { str: "READING PASSAGE 2", x: 50, y: 760, width: 160, height: 13 },
          { str: "Paragraph B explores modern timekeeping.", x: 50, y: 700, width: 270, height: 11 },
          { str: "www.example-ielts.org", x: 200, y: 40, width: 160, height: 9 },
          { str: "- 2 -", x: 280, y: 20, width: 30, height: 9 },
        ],
      },
      {
        pageNumber: 3,
        width: 600,
        height: 840,
        runs: [
          { str: "Cambridge Practice Test - Page 3 of 3", x: 180, y: 810, width: 240, height: 10 },
          { str: "Questions 1–2", x: 50, y: 760, width: 110, height: 12 },
          { str: "1. Early water clocks were accurate.", x: 50, y: 720, width: 240, height: 11 },
          { str: "www.example-ielts.org", x: 200, y: 40, width: 160, height: 9 },
          { str: "3 / 3", x: 280, y: 20, width: 30, height: 9 },
        ],
      },
    ];

    const text = extractLayoutTextFromPages(pages);

    expect(text).not.toContain("Cambridge Practice Test");
    expect(text).not.toContain("www.example-ielts.org");
    expect(text).not.toContain("- 1 -");
    expect(text).not.toContain("3 / 3");
    expect(text).toContain("READING PASSAGE 1");
    expect(text).toContain("READING PASSAGE 2");
    expect(text).toContain("Questions 1–2");
    expect(text).toContain("1. Early water clocks were accurate.");
  });

  it("flags image-only sparse pages in hybrid PDFs while keeping text pages", async () => {
    const { extractLayoutPagesFromPages, findSparsePageNumbers } = await import(
      "@/lib/parser/pdf-layout"
    );
    const pages: PdfPageInput[] = [
      {
        pageNumber: 1,
        width: 600,
        height: 840,
        runs: [{ str: "IELTS READING", x: 50, y: 780, width: 120, height: 14 }],
      },
      {
        pageNumber: 2,
        width: 600,
        height: 840,
        runs: [
          { str: "Questions 1–6", x: 50, y: 780, width: 120, height: 12 },
          { str: "1. Talc is used to increase the size of drops in processing.", x: 50, y: 740, width: 320, height: 11 },
          { str: "2. Talc is applied to reduce foaming during extraction.", x: 50, y: 720, width: 310, height: 11 },
        ],
      },
    ];

    const layoutPages = extractLayoutPagesFromPages(pages);
    expect(findSparsePageNumbers(layoutPages)).toEqual([1]);
  });

  it("reflows wrapped PDF lines into coherent paragraphs and merges cross-page continuations", async () => {
    const { extractReflowedLayoutPagesFromPages, mergeCrossPageParagraphs } = await import(
      "@/lib/parser/pdf-layout"
    );
    const { formatPassageHtml } = await import("@/lib/parser/normalize");

    const pages: PdfPageInput[] = [
      {
        pageNumber: 1,
        width: 595,
        height: 842,
        runs: [
          { str: "IELTS READING_PASSAGE 1", x: 50, y: 780, width: 170, height: 12 },
          { str: "The Impact of the Potato", x: 50, y: 750, width: 190, height: 16 },
          { str: "A. The potato was first cultivated in South America between three and", x: 50, y: 710, width: 470, height: 11 },
          { str: "seven thousand years ago, though scientists believe it grew wild.", x: 50, y: 694, width: 400, height: 11 },
          { str: "B. Early Spanish chroniclers noted the importance of the tuber, which", x: 50, y: 668, width: 472, height: 11 },
          { str: "allowed even", x: 50, y: 652, width: 85, height: 11 },
        ],
      },
      {
        pageNumber: 2,
        width: 595,
        height: 842,
        runs: [
          { str: "the poorest farmers to survive crop failures across Europe.", x: 50, y: 770, width: 390, height: 11 },
          { str: "Questions 1–2", x: 50, y: 730, width: 110, height: 12 },
          { str: "1. The potato came from Europe.", x: 50, y: 705, width: 220, height: 11 },
        ],
      },
    ];

    const reflowedPages = extractReflowedLayoutPagesFromPages(pages);
    const merged = mergeCrossPageParagraphs(reflowedPages.map((p) => p.text));
    const paragraphs = merged.split("\n\n");

    expect(paragraphs).toContain(
      "A. The potato was first cultivated in South America between three and seven thousand years ago, though scientists believe it grew wild.",
    );
    expect(paragraphs).toContain(
      "B. Early Spanish chroniclers noted the importance of the tuber, which allowed even the poorest farmers to survive crop failures across Europe.",
    );

    const html = formatPassageHtml(
      "The Impact of the Potato",
      paragraphs.slice(2, 4).join("\n"),
    );
    expect(html).toContain('<h2 class="passage-title">The Impact of the Potato</h2>');
    expect(html).toContain('<strong class="passage-label">A.</strong>');
    expect(html).toContain('<strong class="passage-label">B.</strong>');
  });
});
