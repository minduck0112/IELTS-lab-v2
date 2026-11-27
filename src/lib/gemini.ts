import { GoogleGenAI } from "@google/genai";

export const OCR_MODEL = "gemini-4-hydrogen";

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Thiếu cấu hình GEMINI_API_KEY trên server để thực hiện OCR cho file PDF scan.",
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}
