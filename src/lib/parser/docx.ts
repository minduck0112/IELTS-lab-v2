import type { DocumentFileType } from "@/lib/types";
import { normalizeDocumentText, textToHtml } from "./normalize";

export interface ExtractedDocument {
  text: string;
  html: string;
  fileType: DocumentFileType;
  warning?: string;
}

const ALLOWED_TAGS = [
  "p",
  "div",
  "span",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sup",
  "sub",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "hr",
];

function sanitizeHtml(html: string) {
  return import("dompurify").then(({ default: DOMPurify }) => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ["colspan", "rowspan", "class"],
      ALLOW_DATA_ATTR: false,
    });
  });
}

export async function parseDocx(buffer: ArrayBuffer): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const options = {
    styleMap: [
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Quote'] => blockquote:fresh",
    ],
    includeDefaultStyleMap: true,
  };

  let raw: { value: string };
  let html: { value: string };

  try {
    [raw, html] = await Promise.all([
      mammoth.extractRawText({ arrayBuffer: buffer }),
      mammoth.convertToHtml({ arrayBuffer: buffer }, options),
    ]);
  } catch {
    throw new Error("Không đọc được file .docx. File có thể bị hỏng hoặc được bảo vệ bằng mật khẩu.");
  }

  const normalized = normalizeDocumentText(raw.value);
  if (normalized.length < 20) {
    throw new Error("File .docx không có đủ nội dung văn bản để tạo bài thi.");
  }

  const safeHtml = await sanitizeHtml(html.value);
  const fallbackHtml = textToHtml(normalized);

  return {
    text: normalized,
    html: safeHtml.trim() || fallbackHtml,
    fileType: "docx",
  };
}
