import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@/lib/constants";
import type { ExtractedDocument } from "./docx";

export interface ExtractDocumentOptions {
  onStageChange?: (stage: "parsing" | "ocr") => void;
}

export function getFileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export async function extractDocument(
  file: File,
  options?: ExtractDocumentOptions,
): Promise<ExtractedDocument> {
  const extension = getFileExtension(file.name);

  if (extension !== "doc" && extension !== "docx" && extension !== "pdf") {
    throw new Error("Chỉ hỗ trợ file .doc, .docx hoặc .pdf.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File vượt quá ${MAX_UPLOAD_MB} MB. Vui lòng chia nhỏ hoặc nén file.`);
  }

  if (file.size === 0) {
    throw new Error("File rỗng.");
  }

  const buffer = await file.arrayBuffer();

  if (extension === "docx") {
    const { parseDocx } = await import("./docx");
    return parseDocx(buffer);
  }

  if (extension === "pdf") {
    const { parsePdf } = await import("./pdf");
    return parsePdf(buffer, file, options);
  }

  const { parseLegacyDoc } = await import("./legacy-doc");
  const result = parseLegacyDoc(buffer);
  return { ...result, fileType: "doc" };
}
