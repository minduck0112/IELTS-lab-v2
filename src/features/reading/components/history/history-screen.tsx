"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  History,
  Loader2,
  Trash2,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { AttemptRecord } from "@/lib/types";
import { getTestQuestions } from "@/lib/parser/parse-reading";
import { formatDateTime, formatDuration, percent } from "@/lib/utils";
import { clearAttempts, deleteAttempt, getAttempts } from "@/features/reading/history/db";
import { ReviewQuestionCard } from "@/features/reading/components/review/review-question-card";
import styles from "./history.module.css";

function scorePercent(attempt: AttemptRecord) {
  return percent(attempt.score, attempt.totalQuestions);
}

export function HistoryScreen() {
  const router = useRouter();
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AttemptRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AttemptRecord | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAttempts()
      .then((records) => {
        if (!cancelled) setAttempts(records);
      })
      .catch(() => {
        if (!cancelled) setError("Không đọc được lịch sử trong trình duyệt này.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!attempts.length) return null;
    const totalPercent = attempts.reduce((sum, attempt) => sum + scorePercent(attempt), 0);
    const best = Math.max(...attempts.map(scorePercent));
    const totalSeconds = attempts.reduce((sum, attempt) => sum + attempt.timeSpentSeconds, 0);
    return {
      count: attempts.length,
      average: Math.round(totalPercent / attempts.length),
      best,
      totalSeconds,
    };
  }, [attempts]);

  const selectedQuestions = selected
    ? getTestQuestions(selected.test, selected.selectedPassageIds)
    : [];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteAttempt(deleteTarget.id);
      setAttempts((current) => current.filter((attempt) => attempt.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
    } catch {
      setError("Không xóa được bài làm. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const confirmClear = async () => {
    setBusy(true);
    try {
      await clearAttempts();
      setAttempts([]);
      setSelected(null);
      setClearOpen(false);
    } catch {
      setError("Không xóa được lịch sử. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SiteHeader active="history" />
      <main className={styles.historyPage}>
        <div className={`page-shell ${styles.historyInner}`}>
          <div className={styles.pageHead}>
            <div>
              <span className={styles.kicker}>Lưu trên trình duyệt</span>
              <h1>Lịch sử làm bài</h1>
              <p>
                Mọi bài làm được lưu cục bộ trên thiết bị này. Không có tài khoản, không có
                dữ liệu gửi lên server.
              </p>
            </div>
            {attempts.length > 0 && (
              <div className={styles.headActions}>
                <Button variant="ghost" size="sm" onClick={() => setClearOpen(true)}>
                  <Trash2 size={15} />
                  Xóa tất cả
                </Button>
              </div>
            )}
          </div>

          {loading && (
            <div className={styles.loading}>
              <Loader2 size={22} className={styles.spin} />
              Đang đọc lịch sử...
            </div>
          )}

          {!loading && error && (
            <div className={styles.error}>
              <AlertTriangle size={17} />
              {error}
            </div>
          )}

          {!loading && !attempts.length && (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>
                <History size={30} />
              </div>
              <h2>Chưa có bài làm nào</h2>
              <p>Sau khi nộp bài Reading, kết quả và câu trả lời sẽ xuất hiện tại đây.</p>
              <Button onClick={() => router.push("/")} iconRight={<ArrowRight size={16} />}>
                Tạo bài thi đầu tiên
              </Button>
            </div>
          )}

          {!loading && attempts.length > 0 && stats && (
            <>
              <div className={styles.stats}>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>
                    <BookOpen size={18} />
                  </div>
                  <div>
                    <span>Bài đã làm</span>
                    <strong>{stats.count}</strong>
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <span>Điểm trung bình</span>
                    <strong>{stats.average}%</strong>
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <span>Kết quả cao nhất</span>
                    <strong>{stats.best}%</strong>
                  </div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statIcon}>
                    <Clock3 size={18} />
                  </div>
                  <div>
                    <span>Tổng thời gian</span>
                    <strong>{formatDuration(stats.totalSeconds)}</strong>
                  </div>
                </div>
              </div>

              <div className={styles.tableCard}>
                <div className={styles.tableHead}>
                  <span>Bài làm</span>
                  <span>Ngày nộp</span>
                  <span>Passage</span>
                  <span>Điểm</span>
                  <span>Thời gian</span>
                  <span>Chế độ</span>
                  <span />
                </div>
                <div className={styles.rows}>
                  {attempts.map((attempt) => {
                    const pct = scorePercent(attempt);
                    return (
                      <div
                        key={attempt.id}
                        className={styles.row}
                        onClick={() => setSelected(attempt)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelected(attempt);
                          }
                        }}
                      >
                        <div className={styles.fileCell}>
                          <span className={styles.fileIcon}>
                            <FileText size={16} />
                          </span>
                          <span>
                            <strong>{attempt.fileName}</strong>
                            <small>{attempt.totalQuestions} câu hỏi</small>
                          </span>
                        </div>
                        <span className={styles.dateCell}>
                          <CalendarClock size={13} />
                          {formatDateTime(attempt.submittedAt)}
                        </span>
                        <span>{attempt.passageCount}</span>
                        <span className={styles.scoreCell}>
                          <strong>{attempt.score}</strong>/{attempt.totalQuestions}
                          <em>{pct}%</em>
                        </span>
                        <span>{formatDuration(attempt.timeSpentSeconds)}</span>
                        <span className={attempt.autoGraded ? styles.modeAuto : styles.modeSelf}>
                          {attempt.autoGraded ? "Tự động" : "Tự chấm"}
                        </span>
                        <div className={styles.rowActions}>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(attempt);
                            }}
                            title="Xem chi tiết"
                            aria-label="Xem chi tiết"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteTarget(attempt);
                            }}
                            title="Xóa bài làm"
                            aria-label="Xóa bài làm"
                            className={styles.deleteButton}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <Modal
        open={Boolean(selected)}
        title={selected?.fileName ?? "Chi tiết bài làm"}
        description={
          selected
            ? `${formatDateTime(selected.submittedAt)} · ${selected.passageCount} passage · ${formatDuration(selected.timeSpentSeconds)}`
            : undefined
        }
        onClose={() => setSelected(null)}
        size="lg"
        footer={
          <>
            {selected && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDeleteTarget(selected);
                  setSelected(null);
                }}
                iconLeft={<Trash2 size={15} />}
              >
                Xóa bài này
              </Button>
            )}
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Đóng
            </Button>
          </>
        }
      >
        {selected && (
          <div className={styles.detail}>
            <div className={styles.detailSummary}>
              <div>
                <span>Điểm</span>
                <strong>
                  {selected.score}/{selected.totalQuestions}
                </strong>
              </div>
              <div>
                <span>Tỷ lệ</span>
                <strong>{scorePercent(selected)}%</strong>
              </div>
              <div>
                <span>Đã trả lời</span>
                <strong>
                  {selected.answeredCount}/{selected.totalQuestions}
                </strong>
              </div>
              <div>
                <span>Cách chấm</span>
                <strong>{selected.autoGraded ? "Tự động" : "Tự chấm"}</strong>
              </div>
            </div>

            {!selected.autoGraded && (
              <div className={styles.detailNote}>
                <AlertTriangle size={15} />
                Bài này được chấm thủ công. Điểm có thể thay đổi nếu bạn cập nhật lại phần tự
                chấm trong Review.
              </div>
            )}

            <div className={styles.detailList}>
              {selectedQuestions.map((question) => (
                <ReviewQuestionCard
                  key={question.id}
                  question={question}
                  answer={selected.answers[question.number]}
                  review={selected.review}
                  autoGraded={selected.autoGraded}
                  readOnly
                />
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Xóa bài làm?"
        description="Hành động này không thể hoàn tác."
        onClose={() => setDeleteTarget(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmDelete()}
              loading={busy}
              iconLeft={<Trash2 size={15} />}
            >
              Xóa
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          {deleteTarget?.fileName} · {deleteTarget ? formatDateTime(deleteTarget.submittedAt) : ""}
        </p>
      </Modal>

      <Modal
        open={clearOpen}
        title="Xóa toàn bộ lịch sử?"
        description="Tất cả bài làm, điểm và ghi chú lưu trên thiết bị này sẽ bị xóa."
        onClose={() => setClearOpen(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setClearOpen(false)} disabled={busy}>
              Hủy
            </Button>
            <Button
              variant="danger"
              onClick={() => void confirmClear()}
              loading={busy}
              iconLeft={<Trash2 size={15} />}
            >
              Xóa tất cả
            </Button>
          </>
        }
      >
        <div className={styles.confirmText}>
          <AlertTriangle size={16} />
          Không thể khôi phục sau khi xóa.
        </div>
      </Modal>
    </>
  );
}
