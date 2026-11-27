import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { ExtractedDocument } from "./docx";
import { normalizeDocumentText, textToHtml } from "./normalize";
import {
  extractReflowedLayoutPagesFromPages,
  findSparsePageNumbers,
  isLikelyScannedPdf,
  mergeCrossPageParagraphs,
  type PdfPageInput,
  type PdfTextRun,
} from "./pdf-layout";

export interface ParsePdfOptions {
  onStageChange?: (stage: "parsing" | "ocr") => void;
}

const RAW_PDF_OCR_MAX_BYTES = 10 * 1024 * 1024;
const RAW_PDF_OCR_MAX_PAGES = 20;
const OCR_IMAGE_BATCH_SIZE = 6;
const MAX_OCR_PAGES = 48;

async function renderPageToJpegBlob(page: PDFPageProxy): Promise<Blob> {
  const baseViewport = page.getViewport({ scale: 1 });
  const maxDim = Math.max(baseViewport.width, baseViewport.height, 1);
  const scale = Math.min(2, Math.max(1.3, 1750 / maxDim));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));

  await page.render({ canvas, viewport }).promise;
  page.cleanup();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((result) => resolve(result), "image/jpeg", 0.82),
  );
  canvas.width = 0;
  canvas.height = 0;

  if (!blob) {
    throw new Error("Không thể kết xuất trang PDF scan thành ảnh để nhận dạng chữ.");
  }
  return blob;
}

async function callOcrWithFormData(formData: FormData): Promise<string> {
  const response = await fetch("/api/pdf/ocr", {
    method: "POST",
    body: formData,
  });

  const payload = (await response.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };

  if (!response.ok) {
    const err = new Error(
      payload.error || "Không thể nhận dạng chữ từ file PDF scan.",
    ) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return (payload.text ?? "").trim();
}

async function ocrSpecificPages(
  doc: PDFDocumentProxy,
  pageNumbers: number[],
): Promise<{ texts: Map<number, string>; coveredPages: Set<number> }> {
  const limited = Array.from(
    new Set(pageNumbers.filter((num) => num >= 1 && num <= Math.min(doc.numPages, MAX_OCR_PAGES))),
  ).sort((a, b) => a - b);

  // Split into contiguous page runs so OCR output stays aligned relative to text pages.
  const runs: number[][] = [];
  for (const num of limited) {
    const lastRun = runs[runs.length - 1];
    if (lastRun && lastRun[lastRun.length - 1] === num - 1 && lastRun.length < OCR_IMAGE_BATCH_SIZE) {
      lastRun.push(num);
    } else {
      runs.push([num]);
    }
  }

  const texts = new Map<number, string>();
  const coveredPages = new Set<number>();

  for (const run of runs) {
    const formData = new FormData();
    formData.append("pageStart", String(run[0]!));
    formData.append("totalPages", String(doc.numPages));

    for (const pageNum of run) {
      const page = await doc.getPage(pageNum);
      const blob = await renderPageToJpegBlob(page);
      formData.append(
        "images",
        new File([blob], `page-${pageNum}.jpg`, { type: "image/jpeg" }),
      );
    }

    const batchText = await callOcrWithFormData(formData);
    if (batchText) {
      texts.set(run[0]!, batchText);
      run.forEach((pageNum) => coveredPages.add(pageNum));
    }
  }

  return { texts, coveredPages };
}

async function ocrViaRenderedBatches(doc: PDFDocumentProxy): Promise<string> {
  const pageLimit = Math.min(doc.numPages, MAX_OCR_PAGES);
  const pageTexts: string[] = [];

  for (let start = 1; start <= pageLimit; start += OCR_IMAGE_BATCH_SIZE) {
    const end = Math.min(pageLimit, start + OCR_IMAGE_BATCH_SIZE - 1);
    const formData = new FormData();
    formData.append("pageStart", String(start));
    formData.append("totalPages", String(pageLimit));

    for (let pageNum = start; pageNum <= end; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const blob = await renderPageToJpegBlob(page);
      formData.append(
        "images",
        new File([blob], `page-${pageNum}.jpg`, { type: "image/jpeg" }),
      );
    }

    const batchText = await callOcrWithFormData(formData);
    if (batchText) {
      pageTexts.push(batchText);
    }
  }

  return pageTexts.join("\n\n");
}

function mapPdfLoadError(cause: unknown): Error {
  const name =
    typeof cause === "object" && cause !== null && "name" in cause
      ? String((cause as { name?: unknown }).name)
      : "";
  const message = cause instanceof Error ? cause.message : "";

  if (name === "PasswordException" || /password/i.test(message)) {
    return new Error("File PDF đang có mật khẩu bảo vệ. Vui lòng mở khóa trước khi tải lên.");
  }

  return new Error("Không đọc được file .pdf. File có thể bị hỏng hoặc không đúng định dạng.");
}

export async function parsePdf(
  buffer: ArrayBuffer,
  file: File,
  options?: ParsePdfOptions,
): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  let loadingTask: PDFDocumentLoadingTask | null = null;
  let doc: PDFDocumentProxy | null = null;

  try {
    try {
      loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      });
      doc = await loadingTask.promise;
    } catch (cause) {
      throw mapPdfLoadError(cause);
    }

    const pages: PdfPageInput[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      const runs: PdfTextRun[] = [];
      for (const item of textContent.items) {
        if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) continue;
        const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 10, 0, 0];
        const tx = pdfjs.Util.transform(viewport.transform, transform);
        const x = typeof tx[4] === "number" ? tx[4] : 0;
        const vy = typeof tx[5] === "number" ? tx[5] : 0;
        const y = viewport.height - vy;
        const width = typeof item.width === "number" ? item.width : 0;
        const rawHeight =
          typeof item.height === "number" && item.height > 0
            ? item.height
            : Math.hypot(tx[2] ?? 0, tx[3] ?? 10) || 10;

        runs.push({
          str: item.str,
          x,
          y,
          width,
          height: rawHeight,
        });
      }

      page.cleanup();
      pages.push({
        pageNumber: pageNum,
        width: viewport.width,
        height: viewport.height,
        runs,
      });
    }

    const layoutPages = extractReflowedLayoutPagesFromPages(pages);
    const layoutText = mergeCrossPageParagraphs(layoutPages.map((page) => page.text));
    const normalized = normalizeDocumentText(layoutText);

    if (!isLikelyScannedPdf(normalized, doc.numPages) && normalized.length >= 20) {
      const sparsePages = findSparsePageNumbers(layoutPages).filter(
        (num) => num <= MAX_OCR_PAGES,
      );
      if (sparsePages.length > 0 && sparsePages.length < doc.numPages) {
        try {
          options?.onStageChange?.("ocr");
          const { texts: ocrMap, coveredPages } = await ocrSpecificPages(doc, sparsePages);
          let recoveredChars = 0;
          const mergedText = mergeCrossPageParagraphs(
            layoutPages.map((page) => {
              if (coveredPages.has(page.pageNumber)) {
                const ocrText = ocrMap.get(page.pageNumber) ?? "";
                recoveredChars += ocrText.replace(/\s+/g, "").length;
                return ocrText;
              }
              return page.text;
            }),
          );

          const mergedNormalized = normalizeDocumentText(mergedText);
          if (mergedNormalized.length >= normalized.length) {
            return {
              text: mergedNormalized,
              html: textToHtml(mergedNormalized),
              fileType: "pdf",
              warning:
                recoveredChars >= 60
                  ? "Một số trang dạng ảnh trong file PDF đã được nhận dạng tự động bằng OCR. Hãy kiểm tra nhanh nội dung trước khi làm bài."
                  : undefined,
            };
          }
        } catch {
          // If partial-page OCR fails (e.g., transient error), return extracted text pages.
        }
      }

      return {
        text: normalized,
        html: textToHtml(normalized),
        fileType: "pdf",
      };
    }

    // Scanned or image-only PDF: fall back to server OCR
    options?.onStageChange?.("ocr");

    let ocrRawText = "";
    if (file.size <= RAW_PDF_OCR_MAX_BYTES && doc.numPages <= RAW_PDF_OCR_MAX_PAGES) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        ocrRawText = await callOcrWithFormData(formData);
      } catch (cause) {
        const status =
          typeof cause === "object" && cause !== null && "status" in cause
            ? (cause as { status?: number }).status
            : undefined;
        if (status === 413) {
          ocrRawText = await ocrViaRenderedBatches(doc);
        } else {
          throw cause;
        }
      }
    } else {
      ocrRawText = await ocrViaRenderedBatches(doc);
    }

    const normalizedOcr = normalizeDocumentText(ocrRawText);
    if (normalizedOcr.length < 20) {
      throw new Error("Không nhận dạng được đủ nội dung văn bản từ file PDF scan này.");
    }

    const truncationNote =
      doc.numPages > MAX_OCR_PAGES
        ? ` (đã OCR ${MAX_OCR_PAGES}/${doc.numPages} trang đầu)`
        : "";

    return {
      text: normalizedOcr,
      html: textToHtml(normalizedOcr),
      fileType: "pdf",
      warning: `File PDF dạng ảnh scan đã được nhận dạng tự động bằng OCR${truncationNote}. Hãy kiểm tra nhanh số thứ tự câu hỏi và chỗ trống trước khi làm bài.`,
    };
  } finally {
    try {
      await doc?.cleanup();
    } catch {
      // Ignore cleanup errors.
    }
    try {
      await loadingTask?.destroy();
    } catch {
      // Ignore worker teardown errors.
    }
  }
}
