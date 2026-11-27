import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { parseReadingDocument } from "@/lib/parser/parse-reading";
import { parseAnswerKey, splitAnswerKey } from "@/lib/parser/answer-key";
import { cleanWordText } from "@/lib/parser/legacy-doc";
import { detectPassages } from "@/lib/parser/passage-detector";
import { detectQuestions } from "@/lib/parser/question-detector";
import { computeResult, isQuestionCorrect } from "@/lib/scoring";
import type { ReviewState } from "@/lib/types";

const emptyReview = (): ReviewState => ({ grades: {}, explanations: {}, updatedAt: 0 });

describe("passage detector", () => {
  it("detects multiple passages and their question sections", () => {
    const text = [
      "READING PASSAGE 1",
      "Title One",
      "A short passage about one thing.",
      "Questions 1–2",
      "1. First question?",
      "2. Second question?",
      "READING PASSAGE 2",
      "Title Two",
      "Another passage about something else.",
      "Questions 3–4",
      "3. Third question?",
      "4. Fourth question?",
    ].join("\n");

    const result = detectPassages(text);
    expect(result.passages).toHaveLength(2);
    expect(result.passages[0].bodyText).toContain("A short passage");
    expect(result.passages[0].questionText).toContain("1. First question?");
    expect(result.passages[1].bodyText).toContain("Another passage");
  });
});

describe("answer key", () => {
  it("parses line-based and compact answers", () => {
    const parsed = parseAnswerKey(
      ["1. TRUE", "2. B", "3. NOT GIVEN", "4. training", "5. C 6. D"].join("\n"),
    );
    expect(parsed.entries.get(1)?.raw).toBe("TRUE");
    expect(parsed.entries.get(3)?.raw).toBe("NOT GIVEN");
    expect(parsed.entries.get(5)?.raw).toBe("C");
    expect(parsed.entries.get(6)?.raw).toBe("D");
  });
});

describe("full sample document", () => {
  it("parses the generated demo test and grades answers", async () => {
    const buffer = await readFile("public/samples/ielts-reading-demo.docx");
    const raw = await mammoth.extractRawText({ buffer });
    const test = parseReadingDocument({
      text: raw.value,
      html: "",
      fileType: "docx",
      fileName: "ielts-reading-demo.docx",
    });

    expect(test.passages).toHaveLength(3);
    expect(test.totalQuestions).toBe(23);
    expect(test.completeAnswerKey).toBe(true);
    expect(test.answerKeyFound).toBe(true);

    const types = test.passages.flatMap((passage) =>
      passage.groups.map((group) => group.type),
    );
    expect(types).toContain("true_false_not_given");
    expect(types).toContain("multiple_choice");
    expect(types).toContain("sentence_completion");
    expect(types).toContain("short_answer");
    expect(types).toContain("matching_headings");
    expect(types).toContain("yes_no_not_given");
    expect(types).toContain("matching_features");

    const all = test.passages.flatMap((passage) =>
      passage.groups.flatMap((group) => group.questions),
    );
    const question1 = all.find((question) => question.number === 1)!;
    const question6 = all.find((question) => question.number === 6)!;
    const question9 = all.find((question) => question.number === 9)!;
    const question14 = all.find((question) => question.number === 14)!;

    expect(question1.answer).toEqual(["FALSE"]);
    expect(question6.answer).toEqual(["C"]);
    expect(question9.answer?.[0]).toBe("training");
    expect(question14.answer).toEqual(["i"]);

    expect(isQuestionCorrect(question1, "FALSE")).toBe(true);
    expect(isQuestionCorrect(question1, "TRUE")).toBe(false);
    expect(isQuestionCorrect(question6, "c")).toBe(true);
    expect(isQuestionCorrect(question9, "Training")).toBe(true);

    const result = computeResult(
      test,
      test.passages.map((passage) => passage.id),
      { 1: "FALSE", 6: "C", 9: "training" },
      emptyReview(),
      true,
    );
    expect(result.correct).toBe(3);
    expect(result.total).toBe(23);
  });
});

describe("parser regression fixes", () => {
  it("does not split passages on prose lines starting with Key or Answers", () => {
    const text = [
      "READING PASSAGE 1",
      "Urban Forests",
      "Key findings from the study show higher biodiversity.",
      "Answers to these questions remain uncertain.",
      "Questions 1–2",
      "1. Biodiversity increased.",
      "2. Researchers agreed.",
    ].join("\n");

    const split = splitAnswerKey(text);
    expect(split.found).toBe(false);
    expect(split.bodyText).toContain("Answers to these questions remain uncertain.");
  });

  it("parses parenthetical explanations cleanly without stray parentheses", () => {
    const parsed = parseAnswerKey("1. TRUE (Paragraph A: bees prefer diverse flowers)");
    expect(parsed.entries.get(1)?.raw).toBe("TRUE");
    expect(parsed.entries.get(1)?.explanation).toBe("Paragraph A: bees prefer diverse flowers");
  });

  it("parses compact T/F/NG, extended letters A-Z, and Roman numerals xi-xv", () => {
    const parsed = parseAnswerKey("1. T 2. F 3. NG 14. xi 15. xii 22. J 23. K");
    expect(parsed.entries.get(1)?.raw).toBe("T");
    expect(parsed.entries.get(2)?.raw).toBe("F");
    expect(parsed.entries.get(3)?.raw).toBe("NG");
    expect(parsed.entries.get(14)?.raw).toBe("xi");
    expect(parsed.entries.get(15)?.raw).toBe("xii");
    expect(parsed.entries.get(22)?.raw).toBe("J");
    expect(parsed.entries.get(23)?.raw).toBe("K");
  });

  it("attaches shared preamble options to multiple_choice_multi and supports wrapped options beyond H", () => {
    const questionText = [
      "Questions 25–26",
      "Choose TWO answers from A–J.",
      "A. First option that wraps",
      "onto a second line",
      "I. Ninth option",
      "J. Tenth option",
      "25. First multi-select item",
      "26. Second multi-select item",
    ].join("\n");

    const detected = detectQuestions(questionText, 3);
    expect(detected.groups).toHaveLength(1);
    const group = detected.groups[0]!;
    expect(group.type).toBe("multiple_choice_multi");
    expect(group.options).toHaveLength(3);
    expect(group.options[0]?.text).toBe("First option that wraps onto a second line");
    expect(group.options[2]?.value).toBe("J");
    expect(group.questions[0]?.options).toHaveLength(3);
  });

  it("does not split punctuated questions on prose lines beginning with numbers", () => {
    const questionText = [
      "Questions 1–2",
      "Complete the sentences below.",
      "1. In the survey, results showed that",
      "20 percent of respondents changed habits.",
      "2. Later studies confirmed the trend.",
    ].join("\n");

    const detected = detectQuestions(questionText, 1);
    const questions = detected.groups[0]?.questions ?? [];
    expect(questions).toHaveLength(2);
    expect(questions[0]?.prompt).toContain("20 percent of respondents changed habits.");
  });

  it("strips legacy .doc field code instructions while keeping display text", () => {
    const raw =
      'See \u0013 HYPERLINK "https://example.com" \u0014urban bees\u0015 and \u0013 PAGE \u0015here.';
    expect(cleanWordText(raw)).toBe("See urban bees and here.");
  });

  it("keeps full passage body when IELTS rubric appears at top (including wrapped Questions line)", () => {
    const text = [
      "IELTS READING",
      "You should spend about 20 minutes on",
      "Questions 1–13, which are based on Reading Passage 1 below.",
      "Talc Powder",
      "Talc is a mineral composed of hydrated magnesium silicate.",
      "Spanish olive oil producers use it extensively during processing.",
      "Questions 1–6",
      "Use the information in the passage to match each use of talc powder with current application from A, B or C. Write the appropriate letters A-C in boxes 1-6 on your answer sheet. NB You may use any letter more than once A Fruit protection B Chewing gum business C Olive oil extraction",
      "1. Talc is used to increase the size of drops.",
      "2. Talc is applied to reduce foaming.",
      "3. Talc is employed as a filler of base.",
      "4. Talc is modified and prevented sunburn.",
      "5. Talc is used to help absorb water.",
      "6. Talc prevents sticking during processing.",
      "Questions 7–13",
      "Complete the summary below.",
      "Choose NO MORE THAN TWO WORDS from the passage for each answer.",
      "Write your answers in boxes 7–13 on your answer sheet.",
      "Spain has used talc powder for 7 ______ years. It prevents pastes caused by 8 ______ and helps 9 ______ flow.",
      "10 ______ is added before 11 ______ and 12 ______ are removed by",
      "13 ______.",
      "Question 14",
      "Choose the correct letter, A, B, C or D.",
      "14. What is the main purpose of the passage?",
      "A. To describe talc mining",
      "B. To review industrial uses of talc",
      "C. To warn about dust",
      "D. To compare minerals",
    ].join("\n");

    const parsed = parseReadingDocument({
      text,
      html: "",
      fileType: "pdf",
      fileName: "talc-powder.pdf",
    });

    expect(parsed.passages).toHaveLength(1);
    const passage = parsed.passages[0]!;
    expect(passage.title).toBe("Talc Powder");
    expect(passage.text).toContain("hydrated magnesium silicate");
    expect(passage.text).toContain("Spanish olive oil producers");

    expect(parsed.totalQuestions).toBe(14);
    expect(passage.groups).toHaveLength(3);

    const matchingGroup = passage.groups[0]!;
    expect(matchingGroup.type).toBe("matching_features");
    expect(matchingGroup.options.map((o) => `${o.value}:${o.text}`)).toEqual([
      "A:Fruit protection",
      "B:Chewing gum business",
      "C:Olive oil extraction",
    ]);
    expect(matchingGroup.questions[0]?.options).toHaveLength(3);

    const summaryGroup = passage.groups[1]!;
    expect(summaryGroup.type).toBe("summary_completion");
    expect(summaryGroup.questions.map((q) => q.number)).toEqual([7, 8, 9, 10, 11, 12, 13]);
    expect(summaryGroup.questions[0]?.prompt).toContain("[[BLANK]] years");
    expect(summaryGroup.questions[6]?.prompt).toContain("removed by [[BLANK]]");
  });

  it("recovers inline summary questions when PDF vector blank lines omit underscores", () => {
    const questionText = [
      "Questions 7–13",
      "Complete the summary below.",
      "Choose NO MORE THAN TWO WORDS from the passage for each answer.",
      "Write your answers in boxes 7–13 on your answer sheet.",
      "Talc has been used in Spain for 7 years. It breaks down 8 and stops 9 from forming.",
      "10 is mixed with olive paste while 11 and 12 are filtered out by 13.",
    ].join("\n");

    const detected = detectQuestions(questionText, 1);
    expect(detected.groups).toHaveLength(1);
    expect(detected.groups[0]!.questions.map((q) => q.number)).toEqual([7, 8, 9, 10, 11, 12, 13]);
  });

  it("splits bilingual Vietnamese answer keys cleanly and stores explanations for review", () => {
    const rawText = [
      "IELTS READING_PASSAGE 1",
      "The Impact of the Potato",
      "Jeff Chapman relates the story of history the most important vegetable",
      "A. First paragraph about South America.",
      "B. Second paragraph about Spanish explorers.",
      "Questions 1–2",
      "Do the following statements agree with the information given in Reading Passage 1?",
      "1. The potato started in Europe.",
      "2. Explorers took it from Peru.",
      "Questions 3–4",
      "Complete the sentences below.",
      "3. The plant grows a purple ______.",
      "4. Farmers relied on ______ for food.",
      "Đáp án",
      "1. FALSE",
      "2. TRUE",
      "3. flower",
      "4.crops",
      "Questions 1–2",
      "1. The potato started in Europe.",
      "Đáp án: FALSE / Sai",
      "Vị trí câu trong đoạn: Paragraph A.",
      "2. Explorers took it from Peru.",
      "Đáp án: TRUE / Đúng",
      "Vị trí câu trong đoạn: Paragraph B.",
      "Questions 3–4",
      "3. The plant grows a purple ______.",
      "Đáp án: flower / hoa",
      "Giải thích: Paragraph A mentions purple flower.",
      "4. Farmers relied on ______ for food.",
      "Đáp án: crops / cây trồng",
      "Giải thích: Paragraph B mentions staple crops.",
    ].join("\n");

    const parsed = parseReadingDocument({
      text: rawText,
      html: "",
      fileType: "pdf",
      fileName: "potato.pdf",
    });

    expect(parsed.passages).toHaveLength(1);
    const passage = parsed.passages[0]!;
    expect(passage.title).toBe("The Impact of the Potato");
    expect(passage.html).toContain('<h2 class="passage-title">The Impact of the Potato</h2>');
    expect(passage.html).toContain('<strong class="passage-label">A.</strong>');
    expect(parsed.totalQuestions).toBe(4);
    expect(parsed.completeAnswerKey).toBe(true);

    const questions = passage.groups.flatMap((g) => g.questions);
    expect(questions[0]?.answer).toEqual(["FALSE"]);
    expect(questions[0]?.officialExplanation).toContain("Paragraph A.");
    expect(questions[1]?.answer).toEqual(["TRUE"]);
    expect(questions[2]?.answer).toEqual(["flower"]);
    expect(questions[2]?.officialExplanation).toContain("purple flower");
    expect(questions[3]?.answer).toEqual(["crops"]);
  });

  it("accurately parses the real attached bilingual Potato PDF without leaking answer explanations into questions", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const {
      extractReflowedLayoutPagesFromPages,
      mergeCrossPageParagraphs,
    } = await import("@/lib/parser/pdf-layout");
    const { normalizeDocumentText } = await import("@/lib/parser/normalize");

    const fileBytes = await readFile(
      "public/assets/aistudio/IE_Reading_The_Impact_of_the_Potato_FULL_KEY_fea25699.pdf",
    );
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(fileBytes),
      verbosity: 0,
    });
    const doc = await loadingTask.promise;

    const pages = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const runs = [];
      for (const item of textContent.items) {
        if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) continue;
        const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 10, 0, 0];
        const tx = pdfjs.Util.transform(viewport.transform, transform);
        const x = typeof tx[4] === "number" ? tx[4] : 0;
        const vy = typeof tx[5] === "number" ? tx[5] : 0;
        const y = viewport.height - vy;
        const width = typeof item.width === "number" ? item.width : 0;
        const height =
          typeof item.height === "number" && item.height > 0
            ? item.height
            : Math.hypot(tx[2] ?? 0, tx[3] ?? 10) || 10;
        runs.push({ str: item.str, x, y, width, height });
      }
      page.cleanup();
      pages.push({ pageNumber: pageNum, width: viewport.width, height: viewport.height, runs });
    }
    await doc.cleanup();
    await loadingTask.destroy();

    const layoutPages = extractReflowedLayoutPagesFromPages(pages);
    const mergedText = mergeCrossPageParagraphs(layoutPages.map((p) => p.text));
    const normalized = normalizeDocumentText(mergedText);

    const parsed = parseReadingDocument({
      text: normalized,
      html: "",
      fileType: "pdf",
      fileName: "IE Reading_The Impact of the Potato_FULL KEY.pdf",
    });

    expect(parsed.passages).toHaveLength(1);
    const passage = parsed.passages[0]!;
    expect(passage.title).toBe("The Impact of the Potato");
    expect(passage.html).toContain('<h2 class="passage-title">The Impact of the Potato</h2>');
    expect(passage.html).toContain(
      '<p class="passage-subtitle"><em>Jeff Chapman relates the story of history the most important vegetable</em></p>',
    );
    expect(passage.html).toContain('<strong class="passage-label">A.</strong>');
    expect(passage.html).toContain('<strong class="passage-label">J.</strong>');
    expect(passage.text).toContain("allowed even the poorest");

    // Reflowed paragraphs should stay compact (~1 subtitle + 10 sections A-J), not 70+ line fragments
    const paragraphMatches = passage.html.match(/<p(?:\s[^>]*)?>/g) ?? [];
    expect(paragraphMatches.length).toBeGreaterThanOrEqual(10);
    expect(paragraphMatches.length).toBeLessThanOrEqual(15);

    expect(parsed.totalQuestions).toBe(13);
    expect(parsed.answerKeyFound).toBe(true);
    expect(parsed.completeAnswerKey).toBe(true);

    const questions = passage.groups.flatMap((g) => g.questions);
    expect(questions.map((q) => q.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(questions[0]?.answer).toEqual(["FALSE"]);
    expect(questions[1]?.answer).toEqual(["FALSE"]);
    expect(questions[2]?.answer).toEqual(["NOT GIVEN"]);
    expect(questions[3]?.answer).toEqual(["TRUE"]);
    expect(questions[4]?.answer).toEqual(["TRUE"]);
    expect(questions[5]?.answer).toEqual(["flower"]);
    expect(questions[6]?.answer).toEqual(["prejudice"]);
    expect(questions[7]?.answer).toEqual(["reverse"]);
    expect(questions[8]?.answer).toEqual(["meat"]);
    expect(questions[9]?.answer).toEqual(["crops"]);
    expect(questions[10]?.answer).toEqual(["soil"]);
    expect(questions[11]?.answer).toEqual(["cultivation"]);
    expect(questions[12]?.answer).toEqual(["investment"]);

    // Vietnamese explanations preserved for review mode without leaking into prompts
    questions.forEach((q) => {
      expect(q.prompt).not.toMatch(/Kỹ năng IELTS kiểm tra|Vị trí câu trong đoạn|Đáp án:/i);
      expect(q.officialExplanation).toBeTruthy();
    });
  });
});

