"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Eraser,
  Highlighter,
  MessageSquareText,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import type { HighlightNote, Passage, PassageAnnotation } from "@/lib/types";
import { cn, uid } from "@/lib/utils";
import styles from "./exam.module.css";

type Color = HighlightNote["color"];

interface ToolbarState {
  top: number;
  left: number;
}

interface NoteDraft {
  mode: "new" | "edit";
  id?: string;
  text: string;
  color: Color;
  top: number;
  left: number;
}

interface PassagePanelProps {
  passage: Passage;
  annotation: PassageAnnotation;
  notesOpen: boolean;
  onCloseNotes: () => void;
  onSave: (annotation: PassageAnnotation) => void;
}

const COLORS: Array<{ value: Color; label: string }> = [
  { value: "yellow", label: "Vàng" },
  { value: "green", label: "Xanh" },
  { value: "pink", label: "Hồng" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function createNote(text: string, color: Color): HighlightNote {
  return {
    id: uid("note"),
    text: text.trim(),
    color,
    createdAt: Date.now(),
  };
}

export function PassagePanel({
  passage,
  annotation,
  notesOpen,
  onCloseNotes,
  onSave,
}: PassagePanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const noteEditorRef = useRef<HTMLDivElement>(null);
  const pendingRangeRef = useRef<Range | null>(null);

  const [toolbar, setToolbar] = useState<ToolbarState | null>(null);
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);

  useLayoutEffect(() => {
    if (contentRef.current) {
      contentRef.current.innerHTML = annotation.html;
    }
    // The panel is remounted when the passage changes; do not overwrite live edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage.id]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (toolbarRef.current?.contains(target) || noteEditorRef.current?.contains(target)) {
        return;
      }
      setToolbar(null);
      setNoteDraft(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const persist = (notes: HighlightNote[]) => {
    if (!contentRef.current) return;
    onSave({ html: contentRef.current.innerHTML, notes });
  };

  const positionForRect = (rect: DOMRect) => {
    const width = 230;
    return {
      top: clamp(rect.top - 48, 8, window.innerHeight - 62),
      left: clamp(rect.left + rect.width / 2 - width / 2, 8, window.innerWidth - width - 8),
    };
  };

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!contentRef.current?.contains(range.commonAncestorContainer)) return;
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    pendingRangeRef.current = range.cloneRange();
    setToolbar(positionForRect(rect));
    setNoteDraft(null);
  };

  const wrapSelection = (color: Color, note?: HighlightNote) => {
    const range = pendingRangeRef.current;
    if (!range || !contentRef.current) return null;

    const mark = document.createElement("mark");
    mark.className = `passage-highlight highlight-${color}`;
    mark.dataset.highlightId = note?.id ?? uid("hl");
    if (note) {
      mark.dataset.noteId = note.id;
      mark.title = note.text;
    }

    try {
      range.surroundContents(mark);
    } catch {
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
    }

    window.getSelection()?.removeAllRanges();
    pendingRangeRef.current = null;
    return mark;
  };

  const applyHighlight = (color: Color, noteText?: string) => {
    const note = noteText?.trim() ? createNote(noteText, color) : undefined;

    const mark = wrapSelection(color, note);
    if (!mark) return;

    const notes = note ? [...annotation.notes, note] : annotation.notes;
    persist(notes);
    setToolbar(null);
    setNoteDraft(null);
  };

  const openNewNote = () => {
    if (!toolbar) return;
    setNoteDraft({
      mode: "new",
      text: "",
      color: "yellow",
      top: toolbar.top,
      left: toolbar.left,
    });
    setToolbar(null);
  };

  const openExistingNote = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const mark = target.closest("mark[data-note-id]");
    if (!mark) return;
    const id = mark.getAttribute("data-note-id");
    if (!id) return;
    const note = annotation.notes.find((item) => item.id === id);
    if (!note) return;
    const rect = mark.getBoundingClientRect();
    const position = positionForRect(rect);
    setNoteDraft({
      mode: "edit",
      id: note.id,
      text: note.text,
      color: note.color,
      top: clamp(position.top + 52, 8, Math.max(8, window.innerHeight - 230)),
      left: position.left,
    });
    setToolbar(null);
  };

  const saveNoteDraft = () => {
    if (!noteDraft) return;
    const text = noteDraft.text.trim();
    if (!text) return;

    if (noteDraft.mode === "new") {
      applyHighlight(noteDraft.color, text);
      return;
    }

    const notes = annotation.notes.map((note) =>
      note.id === noteDraft.id ? { ...note, text } : note,
    );
    const mark = contentRef.current?.querySelector(
      `mark[data-note-id="${CSS.escape(noteDraft.id ?? "")}"]`,
    );
    if (mark) mark.setAttribute("title", text);
    persist(notes);
    setNoteDraft(null);
  };

  const deleteNote = (id: string) => {
    const marks = contentRef.current?.querySelectorAll(`mark[data-note-id="${CSS.escape(id)}"]`);
    marks?.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
      }
    });
    contentRef.current?.normalize();
    const notes = annotation.notes.filter((note) => note.id !== id);
    persist(notes);
    setNoteDraft(null);
  };

  const resetHighlights = () => {
    if (contentRef.current) contentRef.current.innerHTML = passage.html;
    onSave({ html: passage.html, notes: [] });
    onCloseNotes();
    setToolbar(null);
    setNoteDraft(null);
  };

  const scrollToNote = (note: HighlightNote) => {
    const mark = contentRef.current?.querySelector(
      `mark[data-note-id="${CSS.escape(note.id)}"]`,
    );
    mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (mark) {
      const rect = mark.getBoundingClientRect();
      const position = positionForRect(rect);
      setNoteDraft({
        mode: "edit",
        id: note.id,
        text: note.text,
        color: note.color,
        top: clamp(position.top + 52, 8, Math.max(8, window.innerHeight - 230)),
        left: position.left,
      });
    }
  };

  return (
    <section className={styles.passagePane} aria-label={`Reading Passage ${passage.number}`}>
      <div
        ref={scrollRef}
        className={styles.passageScroll}
        onScroll={() => {
          setToolbar(null);
          setNoteDraft(null);
        }}
      >
        <div
          ref={contentRef}
          className={styles.passageContent}
          onMouseUp={handleMouseUp}
          onClick={(event) => openExistingNote(event.target)}
        />
        <div className={styles.passageEnd}>
          <span>End of Reading Passage {passage.number}</span>
        </div>
      </div>

      {toolbar && (
        <div
          ref={toolbarRef}
          className={styles.highlightToolbar}
          style={{ top: toolbar.top, left: toolbar.left }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <span className={styles.toolbarLabel}>
            <Highlighter size={13} />
            Tô sáng
          </span>
          {COLORS.map((color) => (
            <button
              key={color.value}
              className={cn(styles.colorButton, styles[`color_${color.value}`])}
              onClick={() => applyHighlight(color.value)}
              title={color.label}
              aria-label={`Tô sáng ${color.label}`}
            />
          ))}
          <span className={styles.toolbarDivider} />
          <button className={styles.noteButton} onClick={openNewNote} title="Thêm ghi chú">
            <MessageSquareText size={14} />
            Ghi chú
          </button>
          <button
            className={styles.toolbarClose}
            onClick={() => {
              setToolbar(null);
              window.getSelection()?.removeAllRanges();
            }}
            aria-label="Đóng"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {noteDraft && (
        <div
          ref={noteEditorRef}
          className={styles.noteEditor}
          style={{ top: noteDraft.top, left: noteDraft.left }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setNoteDraft(null);
          }}
        >
          <div className={styles.noteEditorHead}>
            <strong>{noteDraft.mode === "new" ? "Ghi chú mới" : "Sửa ghi chú"}</strong>
            <button onClick={() => setNoteDraft(null)} aria-label="Đóng ghi chú">
              <X size={14} />
            </button>
          </div>
          {noteDraft.mode === "new" && (
            <div className={styles.noteColors}>
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  className={cn(
                    styles.noteColor,
                    styles[`color_${color.value}`],
                    noteDraft.color === color.value && styles.noteColorActive,
                  )}
                  onClick={() => setNoteDraft({ ...noteDraft, color: color.value })}
                  aria-label={`Màu ${color.label}`}
                />
              ))}
            </div>
          )}
          <textarea
            value={noteDraft.text}
            onChange={(event) => setNoteDraft({ ...noteDraft, text: event.target.value })}
            placeholder="Ghi chú cho đoạn đã chọn..."
            rows={4}
            autoFocus
          />
          <div className={styles.noteEditorActions}>
            {noteDraft.mode === "edit" && noteDraft.id && (
              <button
                className={styles.noteDelete}
                onClick={() => deleteNote(noteDraft.id!)}
                title="Xóa ghi chú"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button className={styles.noteCancel} onClick={() => setNoteDraft(null)}>
              Hủy
            </button>
            <button
              className={styles.noteSave}
              onClick={saveNoteDraft}
              disabled={!noteDraft.text.trim()}
            >
              Lưu
            </button>
          </div>
        </div>
      )}

      {notesOpen && (
        <aside className={styles.notesDrawer} aria-label="Danh sách ghi chú">
          <div className={styles.notesHead}>
            <strong>Ghi chú ({annotation.notes.length})</strong>
            <button onClick={onCloseNotes} aria-label="Đóng danh sách ghi chú">
              <X size={15} />
            </button>
          </div>
          {annotation.notes.length === 0 ? (
            <div className={styles.notesEmpty}>
              <StickyNote size={22} />
              <p>Bôi đen văn bản rồi chọn biểu tượng ghi chú để thêm.</p>
            </div>
          ) : (
            <div className={styles.notesList}>
              {annotation.notes.map((note) => (
                <div key={note.id} className={styles.noteItem}>
                  <button className={styles.noteItemText} onClick={() => scrollToNote(note)}>
                    <span className={cn(styles.noteDot, styles[`color_${note.color}`])} />
                    <span>{note.text}</span>
                  </button>
                  <button
                    className={styles.noteItemDelete}
                    onClick={() => deleteNote(note.id)}
                    aria-label="Xóa ghi chú"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className={styles.clearHighlights} onClick={resetHighlights}>
            <Eraser size={14} />
            Xóa tất cả tô sáng & ghi chú
          </button>
        </aside>
      )}
    </section>
  );
}
