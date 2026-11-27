import * as CFB from "cfb";
import { normalizeDocumentText, textToHtml } from "./normalize";

interface LegacyDocument {
  text: string;
  html: string;
  warning?: string;
}

function readUInt16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function decodeWindows1252(bytes: Uint8Array) {
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return Array.from(bytes)
      .map((byte) => String.fromCharCode(byte))
      .join("");
  }
}

function decodeUtf16(bytes: Uint8Array) {
  return new TextDecoder("utf-16le", { fatal: false }).decode(bytes);
}

export function cleanWordText(value: string) {
  return value
    .replace(/\u0013[^\u0014\u0015]*\u0014/g, "")
    .replace(/\u0013[^\u0014\u0015]*\u0015/g, "")
    .replace(/\u0013|\u0014|\u0015/g, "")
    .replace(/\u0007/g, "\t")
    .replace(/\u000b/g, "\n")
    .replace(/\u000c/g, "\n\n")
    .replace(/\u000d/g, "\n")
    .replace(/[\u0001-\u0006\u0008\u000e-\u001f]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractFromPieceTable(word: Uint8Array, table: Uint8Array) {
  const fcClx = readUInt32LE(word, 0x01a2);
  const lcbClx = readUInt32LE(word, 0x01a6);
  if (!fcClx || !lcbClx || fcClx + lcbClx > table.length) return null;

  let position = fcClx;
  const end = fcClx + lcbClx;
  let plcStart = -1;
  let plcLength = 0;

  while (position < end) {
    const type = table[position];
    if (type === 0x01) {
      const size = readUInt16LE(table, position + 1);
      position += 3 + size;
      continue;
    }
    if (type === 0x02) {
      plcLength = readUInt32LE(table, position + 1);
      plcStart = position + 5;
      break;
    }
    break;
  }

  if (plcStart < 0 || plcLength <= 0) return null;

  const pieceCount = Math.floor((plcLength - 4) / 12);
  if (pieceCount <= 0) return null;

  const cpStart = plcStart;
  const pcdStart = plcStart + (pieceCount + 1) * 4;
  const parts: string[] = [];

  for (let index = 0; index < pieceCount; index += 1) {
    const charStart = readUInt32LE(table, cpStart + index * 4);
    const charEnd = readUInt32LE(table, cpStart + (index + 1) * 4);
    const charCount = charEnd - charStart;
    if (charCount <= 0) continue;

    const pcdOffset = pcdStart + index * 8;
    const encodedFc = readUInt32LE(table, pcdOffset + 2);
    const compressed = (encodedFc & 0x40000000) !== 0;
    let fileOffset = encodedFc & 0x3fffffff;
    if (compressed) fileOffset = Math.floor(fileOffset / 2);

    const byteCount = compressed ? charCount : charCount * 2;
    if (fileOffset + byteCount > word.length) continue;

    const slice = word.subarray(fileOffset, fileOffset + byteCount);
    parts.push(compressed ? decodeWindows1252(slice) : decodeUtf16(slice));
  }

  if (!parts.length) return null;
  return cleanWordText(parts.join(""));
}

function fallbackExtract(word: Uint8Array) {
  const fcMin = readUInt32LE(word, 0x18);
  const fcMac = readUInt32LE(word, 0x1c);
  if (!fcMin || fcMac <= fcMin || fcMac > word.length) return null;

  const slice = word.subarray(fcMin, Math.min(fcMac, word.length));
  const utf16 = cleanWordText(decodeUtf16(slice));
  const ansi = cleanWordText(decodeWindows1252(slice));

  const score = (value: string) => {
    const printable = value.replace(/[^\p{L}\p{N}\s.,;:'"!?()\-–—]/gu, "");
    return printable.length / Math.max(1, value.length);
  };

  return score(utf16) >= score(ansi) ? utf16 : ansi;
}

export function parseLegacyDoc(buffer: ArrayBuffer): LegacyDocument {
  const bytes = new Uint8Array(buffer);
  let cfb: CFB.CFB$Container;

  try {
    cfb = CFB.read(bytes, { type: "array" });
  } catch {
    throw new Error("Không đọc được file .doc. Hãy mở file bằng Word và lưu lại thành .docx.");
  }

  const wordEntry = CFB.find(cfb, "WordDocument");
  if (!wordEntry?.content) {
    throw new Error("File .doc không chứa luồng WordDocument hợp lệ.");
  }

  const word = wordEntry.content as Uint8Array;
  const flags = readUInt16LE(word, 0x0a);
  const tableName = (flags & 0x0200) !== 0 ? "1Table" : "0Table";
  const tableEntry = CFB.find(cfb, tableName);
  const table = tableEntry?.content as Uint8Array | undefined;

  let text: string | null = null;
  let warning: string | undefined;

  if (table) {
    try {
      text = extractFromPieceTable(word, table);
    } catch {
      text = null;
    }
  }

  if (!text) {
    text = fallbackExtract(word);
    warning = "File .doc cũ chỉ được trích xuất dạng văn bản, có thể mất định dạng hoặc bảng.";
  }

  if (!text || text.trim().length < 20) {
    throw new Error("Không trích xuất được nội dung từ file .doc. Hãy chuyển file sang .docx.");
  }

  const normalized = normalizeDocumentText(text);
  return {
    text: normalized,
    html: textToHtml(normalized),
    warning,
  };
}
