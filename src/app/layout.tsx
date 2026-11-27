import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "IELTS Lab – Phòng luyện Reading trên máy tính",
    template: "%s | IELTS Lab",
  },
  description:
    "Tải file .doc, .docx hoặc .pdf, chuyển bài IELTS Reading thành bài thi computer-based, làm bài, chấm điểm và lưu lịch sử trên trình duyệt.",
  applicationName: "IELTS Lab",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15324c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
