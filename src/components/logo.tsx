import Link from "next/link";
import { cn } from "@/lib/utils";
import styles from "./logo.module.css";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className={cn(styles.logo, compact && styles.logoExam)}
      aria-label="IELTS Lab – Trang chủ"
    >
      <span className={cn(styles.text, "logo-text")}>
        <strong className={cn(styles.wordmark, compact && styles.examWordmark)}>
          <span className={styles.ieltsMark}>IELTS</span>
          <span className={styles.labMark}>Lab</span>
        </strong>
      </span>
    </Link>
  );
}
