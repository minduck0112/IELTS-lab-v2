"use client";

import Link from "next/link";
import { History, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import styles from "./site-header.module.css";

export function SiteHeader({ active }: { active?: "home" | "history" }) {
  return (
    <header className={styles.header}>
      <div className={cn("page-shell", styles.inner)}>
        <Logo />
        <nav className={styles.nav} aria-label="Điều hướng chính">
          <Link href="/" className={cn(styles.link, active === "home" && styles.active)}>
            Luyện thi
          </Link>
          <Link href="/history" className={cn(styles.link, active === "history" && styles.active)}>
            <History size={15} />
            Lịch sử
          </Link>
        </nav>
        <div className={styles.local}>
          <ShieldCheck size={15} />
          <span>Dữ liệu lưu trên máy</span>
        </div>
      </div>
    </header>
  );
}
