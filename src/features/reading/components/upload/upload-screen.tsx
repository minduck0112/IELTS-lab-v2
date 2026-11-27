"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Highlighter,
  History,
  Laptop,
  Loader2,
  LockKeyhole,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  TimerReset,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { extractDocument } from "@/lib/parser/document";
import { getTestQuestions, parseReadingDocument } from "@/lib/parser/parse-reading";
import type { ParsedTest } from "@/lib/types";
import { useExamStore } from "@/features/reading/store/exam-store";
import { formatDuration } from "@/lib/utils";
import { Dropzone } from "./dropzone";
import { ParsePreview } from "./parse-preview";
import styles from "./upload.module.css";

type Phase = "idle" | "parsing" | "preview";

export function UploadScreen() {
  const router = useRouter();
  const hydrated = useExamStore((state) => state.hydrated);
  const currentTest = useExamStore((state) => state.test);
  const submittedAt = useExamStore((state) => state.submittedAt);
  const currentScore = useExamStore((state) => state.score);
  const durationSeconds = useExamStore((state) => state.durationSeconds);
  const selectedPassageIds = useExamStore((state) => state.selectedPassageIds);
  const beginTest = useExamStore((state) => state.beginTest);
  const currentTotal = currentTest
    ? getTestQuestions(currentTest, selectedPassageIds).length
    : 0;

  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<"parsing" | "ocr">("parsing");
  const [parsed, setParsed] = useState<ParsedTest | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setStage("parsing");
    setPhase("parsing");
    setParsed(null);

    try {
      const document = await extractDocument(file, {
        onStageChange: (nextStage) => setStage(nextStage),
      });
      const test = parseReadingDocument({ ...document, fileName: file.name });
      setParsed(test);
      setSelectedIds(test.passages.map((passage) => passage.id));
      setPhase("preview");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Không thể đọc file. Vui lòng thử lại.";
      setError(message);
      setPhase("idle");
    }
  };

  const reset = () => {
    setPhase("idle");
    setParsed(null);
    setSelectedIds([]);
    setError(null);
  };

  const togglePassage = (passageId: string) => {
    setSelectedIds((current) =>
      current.includes(passageId)
        ? current.filter((id) => id !== passageId)
        : [...current, passageId],
    );
  };

  const start = () => {
    if (!parsed || !selectedIds.length) return;
    beginTest(parsed, selectedIds);
    router.push("/exam");
  };

  const hasActiveExam = hydrated && currentTest && !submittedAt;

  return (
    <>
      <SiteHeader active="home" />
      <main>
        <section className={styles.hero}>
          <div className={`page-shell ${styles.heroInner}`}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <span />
                IELTS Reading · Computer-based
              </div>
              <h1>
                Luyện Reading
                <br />
                như thi thật.
              </h1>
              <p className={styles.lede}>
                Tải file Word hoặc PDF của bạn lên. Hệ thống tự nhận diện passage, câu hỏi và
                đáp án — kể cả PDF nhiều cột hoặc file scan — rồi dựng thành bài thi IELTS
                trên máy tính.
              </p>

              <div className={styles.heroPoints}>
                <div>
                  <CheckCircle2 size={17} />
                  <span>Hỗ trợ Word, PDF & OCR scan</span>
                </div>
                <div>
                  <CheckCircle2 size={17} />
                  <span>Chấm điểm tự động</span>
                </div>
                <div>
                  <CheckCircle2 size={17} />
                  <span>Lưu lịch sử trên máy</span>
                </div>
              </div>

              <div className={styles.heroMeta}>
                <div className={styles.heroMetaItem}>
                  <BookOpenCheck size={18} />
                  <span>
                    <strong>3 passages</strong>
                    60 phút
                  </span>
                </div>
                <div className={styles.heroMetaItem}>
                  <Clock3 size={18} />
                  <span>
                    <strong>Tự tính giờ</strong>
                    Theo số passage
                  </span>
                </div>
                <div className={styles.heroMetaItem}>
                  <Highlighter size={18} />
                  <span>
                    <strong>Highlight</strong>
                    & ghi chú
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.uploadPanel}>
              <div className={styles.panelTop}>
                <div>
                  <span className={styles.panelKicker}>Bắt đầu</span>
                  <h2>Tạo bài thi từ Word / PDF</h2>
                </div>
                <span className={styles.panelBadge}>
                  <LockKeyhole size={13} />
                  Word · PDF
                </span>
              </div>

              {hasActiveExam && (
                <div className={styles.resumeCard}>
                  <div className={styles.resumeIcon}>
                    <PlayCircle size={20} />
                  </div>
                  <div className={styles.resumeInfo}>
                    <strong>Bạn có bài đang làm</strong>
                    <span>
                      {currentTest.fileName} · {formatDuration(durationSeconds)}
                    </span>
                  </div>
                  <Button size="sm" onClick={() => router.push("/exam")}>
                    Tiếp tục
                  </Button>
                </div>
              )}

              {hydrated && currentTest && submittedAt && (
                <div className={styles.submittedCard}>
                  <div className={styles.submittedIcon}>
                    <CheckCircle2 size={19} />
                  </div>
                  <div>
                    <strong>Bài gần nhất đã nộp: {currentScore}/{currentTotal}</strong>
                    <span>Xem lại đáp án hoặc mở lịch sử.</span>
                  </div>
                  <div className={styles.submittedActions}>
                    <button onClick={() => router.push("/review")}>Xem lại</button>
                    <button onClick={() => router.push("/history")}>
                      <History size={14} />
                      Lịch sử
                    </button>
                  </div>
                </div>
              )}

              {phase === "parsing" && (
                <div className={styles.parsing}>
                  <div className={styles.parsingIcon}>
                    <Loader2 size={26} className={styles.spin} />
                  </div>
                  <strong>
                    {stage === "ocr"
                      ? "Đang nhận dạng chữ (OCR) từ file PDF scan..."
                      : "Đang đọc cấu trúc bài thi..."}
                  </strong>
                  <span>
                    {stage === "ocr"
                      ? "Trích xuất văn bản, câu hỏi và đáp án từ các trang ảnh."
                      : "Nhận diện passage, câu hỏi, dạng câu và đáp án."}
                  </span>
                  <div className={styles.parsingBar}>
                    <span />
                  </div>
                </div>
              )}

              {phase === "idle" && (
                <>
                  <Dropzone onFile={handleFile} disabled={!hydrated} />
                  {error && (
                    <div className={styles.error} role="alert">
                      <TriangleAlert size={17} />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className={styles.panelFoot}>
                    <span>Chưa có file? </span>
                    <a href="/samples/ielts-reading-demo.docx" download>
                      <Download size={14} />
                      Tải bài mẫu
                    </a>
                  </div>
                </>
              )}

              {phase === "preview" && parsed && (
                <ParsePreview
                  test={parsed}
                  selectedIds={selectedIds}
                  onToggle={togglePassage}
                  onStart={start}
                  onReset={reset}
                />
              )}
            </div>
          </div>
        </section>

        <section className={styles.featureSection}>
          <div className={`page-shell ${styles.featureGrid}`}>
            <article>
              <div className={styles.featureIcon}>
                <Laptop size={20} />
              </div>
              <h3>Giao diện giống thi thật</h3>
              <p>
                Chia đôi bài đọc và câu hỏi kéo giãn linh hoạt, đồng hồ đếm ngược ở trên cùng
                và thanh chọn Part, câu hỏi ở dưới cùng.
              </p>
            </article>
            <article>
              <div className={styles.featureIcon}>
                <TimerReset size={20} />
              </div>
              <h3>Thời gian tự động</h3>
              <p>
                20 phút mỗi passage. File có hơn 3 passages sẽ cho bạn chọn phần cần làm
                trước khi bắt đầu.
              </p>
            </article>
            <article>
              <div className={styles.featureIcon}>
                <ShieldCheck size={20} />
              </div>
              <h3>Riêng tư tối đa</h3>
              <p>
                File Word và PDF văn bản xử lý ngay trên trình duyệt. Chỉ file PDF dạng ảnh
                scan mới gửi trích xuất OCR khi cần.
              </p>
            </article>
            <article>
              <div className={styles.featureIcon}>
                <FileText size={20} />
              </div>
              <h3>Tự động tính điểm</h3>
              <p>
                Chấm điểm ngay khi nộp nếu file có đáp án, kèm đối chiếu chi tiết và ghi chú.
                Không có đáp án vẫn có thể tự chấm từng câu.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.howSection}>
          <div className={`page-shell ${styles.howInner}`}>
            <div className={styles.howHead}>
              <span className={styles.panelKicker}>Quy trình</span>
              <h2>Ba bước để bắt đầu bài thi</h2>
              <p>Không cần cài đặt. Hỗ trợ cả file văn bản và PDF ảnh scan.</p>
            </div>
            <div className={styles.steps}>
              <div className={styles.step}>
                <span>01</span>
                <h3>Tải file Word / PDF</h3>
                <p>Hỗ trợ .docx, .doc và .pdf (tự sắp xếp cột, hỗ trợ OCR cho PDF scan).</p>
              </div>
              <div className={styles.step}>
                <span>02</span>
                <h3>Kiểm tra cấu trúc</h3>
                <p>Xem số passage, câu hỏi, đáp án và chọn phần sẽ làm nếu cần.</p>
              </div>
              <div className={styles.step}>
                <span>03</span>
                <h3>Làm bài & chấm</h3>
                <p>Hết giờ tự nộp. Có đáp án thì chấm ngay; không có thì tự chấm trong Review.</p>
              </div>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={`page-shell ${styles.footerInner}`}>
            <span>
              <Sparkles size={14} />
              IELTS Lab
            </span>
            <span>Thiết kế cho luyện thi nghiêm túc · Không quảng cáo</span>
          </div>
        </footer>
      </main>
    </>
  );
}
