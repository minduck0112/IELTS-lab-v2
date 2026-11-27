"use client";

import type { ChangeEvent, ReactNode } from "react";
import { Check, CircleDot, ListChecks } from "lucide-react";
import type { Question, UserAnswer } from "@/lib/types";
import { COMPLETION_TYPES, MATCHING_TYPES } from "@/lib/constants";
import { cn, isAnswered } from "@/lib/utils";
import styles from "./exam.module.css";

interface QuestionCardProps {
  question: Question;
  answer: UserAnswer | undefined;
  active: boolean;
  onChange: (answer: UserAnswer) => void;
  onFocus: () => void;
}

function BlankInput({
  question,
  answer,
  onChange,
  onFocus,
  inline,
}: {
  question: Question;
  answer: UserAnswer | undefined;
  onChange: (answer: UserAnswer) => void;
  onFocus: () => void;
  inline?: boolean;
}) {
  const value = typeof answer === "string" ? answer : "";
  return (
    <input
      className={cn(styles.textInput, inline && styles.inlineInput)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onFocus}
      placeholder={question.placeholder ?? "Nhập câu trả lời"}
      aria-label={`Câu ${question.number}`}
      autoComplete="off"
      spellCheck={false}
    />
  );
}

function PromptWithBlank({
  question,
  answer,
  onChange,
  onFocus,
}: {
  question: Question;
  answer: UserAnswer | undefined;
  onChange: (answer: UserAnswer) => void;
  onFocus: () => void;
}) {
  const parts = question.prompt.split(/(_{2,}|\.{3,}|…|\[\[BLANK\]\])/);
  const blankIndex = parts.findIndex((part) => /^(_{2,}|\.{3,}|…|\[\[BLANK\]\])$/.test(part));

  if (blankIndex < 0) {
    return (
      <div className={styles.promptWithInput}>
        <span>{question.prompt}</span>
        <BlankInput
          question={question}
          answer={answer}
          onChange={onChange}
          onFocus={onFocus}
        />
      </div>
    );
  }

  return (
    <div className={styles.promptWithInput}>
      {parts.map((part, index) => {
        if (index === blankIndex) {
          return (
            <BlankInput
              key={`blank-${index}`}
              question={question}
              answer={answer}
              onChange={onChange}
              onFocus={onFocus}
              inline
            />
          );
        }
        if (/^(_{2,}|\.{3,}|…|\[\[BLANK\]\])$/.test(part)) {
          return (
            <span key={`part-${index}`} aria-hidden="true">
              ______
            </span>
          );
        }
        return <span key={`part-${index}`}>{part}</span>;
      })}
    </div>
  );
}

function OptionRows({
  question,
  answer,
  onChange,
  onFocus,
  multiple,
}: {
  question: Question;
  answer: UserAnswer | undefined;
  onChange: (answer: UserAnswer) => void;
  onFocus: () => void;
  multiple: boolean;
}) {
  const selected = multiple
    ? Array.isArray(answer)
      ? answer
      : answer
        ? [answer]
        : []
    : typeof answer === "string"
      ? [answer]
      : [];

  const limit = question.selectCount ?? 1;

  const toggle = (value: string) => {
    onFocus();
    if (!multiple) {
      onChange(value);
      return;
    }
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    if (selected.length >= limit) {
      onChange([...selected.slice(selected.length - limit + 1), value]);
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <div className={styles.options} role={multiple ? "group" : "radiogroup"}>
      {question.options.map((option) => {
        const checked = selected.includes(option.value);
        const showLetter = option.label.toLowerCase() !== option.text.toLowerCase();
        return (
          <label
            key={option.value}
            className={cn(styles.option, checked && styles.optionChecked)}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={`question-${question.id}`}
              value={option.value}
              checked={checked}
              onChange={() => toggle(option.value)}
              onFocus={onFocus}
            />
            {showLetter && <span className={styles.optionLetter}>{option.label}</span>}
            <span className={styles.optionText}>{option.text}</span>
            <span className={styles.optionMark} aria-hidden="true">
              {multiple ? checked && <Check size={13} strokeWidth={3} /> : <CircleDot size={12} />}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function SelectAnswer({
  question,
  answer,
  onChange,
  onFocus,
}: {
  question: Question;
  answer: UserAnswer | undefined;
  onChange: (answer: UserAnswer) => void;
  onFocus: () => void;
}) {
  const value = typeof answer === "string" ? answer : "";
  if (!question.options.length) {
    return (
      <BlankInput question={question} answer={answer} onChange={onChange} onFocus={onFocus} />
    );
  }
  return (
    <select
      className={styles.select}
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
      onFocus={onFocus}
      aria-label={`Câu ${question.number}`}
    >
      <option value="">Chọn đáp án...</option>
      {question.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}. {option.text}
        </option>
      ))}
    </select>
  );
}

export function QuestionCard({ question, answer, active, onChange, onFocus }: QuestionCardProps) {
  const answered = isAnswered(answer);
  const isCompletion = COMPLETION_TYPES.includes(question.type);
  const isMatching = MATCHING_TYPES.includes(question.type);
  const isMulti = question.type === "multiple_choice_multi" || (question.selectCount ?? 1) > 1;

  let body: ReactNode;
  if (isCompletion) {
    body = (
      <PromptWithBlank
        question={question}
        answer={answer}
        onChange={onChange}
        onFocus={onFocus}
      />
    );
  } else if (isMatching) {
    body = (
      <SelectAnswer
        question={question}
        answer={answer}
        onChange={onChange}
        onFocus={onFocus}
      />
    );
  } else {
    body = (
      <OptionRows
        question={question}
        answer={answer}
        onChange={onChange}
        onFocus={onFocus}
        multiple={isMulti}
      />
    );
  }

  return (
    <article
      id={`q-${question.number}`}
      className={cn(styles.questionCard, active && styles.questionCardActive)}
      onFocusCapture={onFocus}
      aria-current={active ? "true" : undefined}
    >
      <div className={styles.questionHead}>
        <span className={cn(styles.questionNumber, answered && styles.questionNumberAnswered)}>
          {question.number}
        </span>
        <div className={styles.questionMeta}>
          <span>{question.prompt ? "Question" : "Question"}</span>
          {isMulti && (
            <span className={styles.multiBadge}>
              <ListChecks size={12} />
              Chọn {question.selectCount ?? 2}
            </span>
          )}
          {answered && <span className={styles.answeredBadge}>Đã trả lời</span>}
        </div>
      </div>

      {!isCompletion && !isMatching && question.prompt && (
        <p className={styles.questionPrompt}>{question.prompt}</p>
      )}

      {isMatching && question.prompt && (
        <p className={styles.questionPrompt}>{question.prompt}</p>
      )}

      {body}

      {isCompletion && question.placeholder && (
        <p className={styles.answerHint}>{question.placeholder}</p>
      )}
    </article>
  );
}
