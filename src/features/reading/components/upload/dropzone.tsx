"use client";

import { useRef, useState } from "react";
import { FileUp, UploadCloud } from "lucide-react";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import { cn } from "@/lib/utils";
import styles from "./upload.module.css";

interface DropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function Dropzone({ onFile, disabled }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (file: File | undefined) => {
    if (!file) return;
    onFile(file);
  };

  return (
    <div
      className={cn(styles.dropzone, dragging && styles.dragging, disabled && styles.disabled)}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) pick(event.dataTransfer.files?.[0]);
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Tải file .doc, .docx hoặc .pdf"
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
        hidden
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div className={styles.dropIcon} aria-hidden="true">
        <UploadCloud size={28} strokeWidth={1.7} />
      </div>
      <div className={styles.dropTitle}>Kéo thả file vào đây</div>
      <p className={styles.dropText}>
        hoặc <span>chọn file từ máy</span>
      </p>
      <div className={styles.dropMeta}>
        <span>
          <FileUp size={13} />
          .doc / .docx / .pdf
        </span>
        <span>Tối đa {MAX_UPLOAD_MB} MB</span>
      </div>
    </div>
  );
}
