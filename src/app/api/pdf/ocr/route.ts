import { NextRequest, NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/constants";
import { getGeminiClient, OCR_MODEL } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BATCH_IMAGES = 16;
const MAX_BATCH_IMAGE_BYTES = 20 * 1024 * 1024;

const SYSTEM_INSTRUCTION = [
  "You are a precise OCR transcription engine for IELTS Reading exam documents.",
  "Transcribe all visible passage text, headings, paragraph labels, instructions, numbered questions, answer choices, blanks, and answer keys accurately.",
  "Reading order rules:",
  "1. If a page has two columns (or a passage on the left and questions on the right), read full-width titles/headings first, then the ENTIRE left column from top to bottom, then the ENTIRE right column from top to bottom.",
  "2. Omit repeated running page headers, footers, watermarks, URLs, and standalone page numbers (such as 'Page 2', '2 / 12', '- 4 -').",
  "3. Keep structural markers verbatim on their own lines: 'READING PASSAGE 1/2/3', passage titles, paragraph labels ('A', 'B', ...), 'Questions X-Y', numbered questions ('1.', '2.', ...), letter/Roman options ('A.', 'B.', 'i.', 'ii.'), blanks as '______', and 'ANSWER KEY'.",
  "4. Output plain UTF-8 text only. Do not wrap in markdown code fences and do not add commentary or answers that are not printed on the pages.",
].join("\n");

function getErrorStatus(error: unknown): number {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && status >= 400 && status <= 599) {
      return status;
    }
  }
  return 500;
}

function getErrorMessage(error: unknown, status: number): string {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("GEMINI_API_KEY")) {
    return raw;
  }
  if (status === 429) {
    return "Hệ thống OCR đang tạm quá tải. Vui lòng thử lại sau ít phút.";
  }
  if (status === 403 || status === 401) {
    return "Không thể xác thực dịch vụ OCR trên server. Vui lòng kiểm tra cấu hình.";
  }
  if (status === 413 || /payload|too large|size/i.test(raw)) {
    return "Dữ liệu PDF scan vượt quá giới hạn gửi OCR. Hãy thử nén hoặc chia nhỏ file.";
  }
  return raw || "Không thể nhận dạng chữ từ file PDF scan. Vui lòng thử lại.";
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu tải lên không hợp lệ hoặc vượt quá kích thước cho phép." },
      { status: 400 },
    );
  }

  const pdfFile = formData.get("file");
  const imageEntries = formData
    .getAll("images")
    .filter((entry): entry is File => entry instanceof File);

  const pageStartRaw = formData.get("pageStart");
  const totalPagesRaw = formData.get("totalPages");
  const pageStart = typeof pageStartRaw === "string" ? Number(pageStartRaw) : NaN;
  const totalPages = typeof totalPagesRaw === "string" ? Number(totalPagesRaw) : NaN;

  try {
    const parts: Array<
      | { inlineData: { mimeType: string; data: string } }
      | { text: string }
    > = [];

    if (pdfFile instanceof File) {
      const isPdfMime =
        pdfFile.type === "application/pdf" || pdfFile.name.toLowerCase().endsWith(".pdf");
      if (!isPdfMime) {
        return NextResponse.json({ error: "Chỉ chấp nhận file PDF." }, { status: 400 });
      }
      if (pdfFile.size === 0) {
        return NextResponse.json({ error: "File PDF rỗng." }, { status: 400 });
      }
      if (pdfFile.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: `File vượt quá ${MAX_UPLOAD_MB} MB.` },
          { status: 413 },
        );
      }

      const bytes = Buffer.from(await pdfFile.arrayBuffer());
      parts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: bytes.toString("base64"),
        },
      });
      parts.push({
        text: "Transcribe all pages of this scanned IELTS Reading PDF into clean plain text following the reading-order rules.",
      });
    } else if (imageEntries.length > 0) {
      if (imageEntries.length > MAX_BATCH_IMAGES) {
        return NextResponse.json(
          { error: `Mỗi lượt OCR chỉ nhận tối đa ${MAX_BATCH_IMAGES} trang.` },
          { status: 400 },
        );
      }

      let totalBytes = 0;
      for (const img of imageEntries) {
        const mime = img.type === "image/jpg" ? "image/jpeg" : img.type;
        if (!ALLOWED_IMAGE_TYPES.has(img.type)) {
          return NextResponse.json(
            { error: "Định dạng ảnh trang PDF không được hỗ trợ." },
            { status: 400 },
          );
        }
        totalBytes += img.size;
        if (totalBytes > MAX_BATCH_IMAGE_BYTES) {
          return NextResponse.json(
            { error: "Tổng dung lượng ảnh trong lượt OCR quá lớn." },
            { status: 413 },
          );
        }
        const bytes = Buffer.from(await img.arrayBuffer());
        parts.push({
          inlineData: {
            mimeType: mime,
            data: bytes.toString("base64"),
          },
        });
      }

      const rangeHint =
        Number.isFinite(pageStart) && Number.isFinite(totalPages)
          ? `These ${imageEntries.length} page images start at page ${pageStart} of ${totalPages}. `
          : "";
      parts.push({
        text: `${rangeHint}Transcribe these scanned IELTS Reading pages in exact page order into clean plain text following the reading-order rules.`,
      });
    } else {
      return NextResponse.json(
        { error: "Không tìm thấy file PDF hoặc ảnh trang để nhận dạng." },
        { status: 400 },
      );
    }

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: { parts },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) {
      return NextResponse.json(
        { error: "Dịch vụ OCR không trích xuất được văn bản từ các trang này." },
        { status: 502 },
      );
    }

    return NextResponse.json({ text });
  } catch (error) {
    const status = getErrorStatus(error);
    const message = getErrorMessage(error, status);
    return NextResponse.json({ error: message }, { status: status === 500 && message.includes("GEMINI_API_KEY") ? 503 : status });
  }
}
