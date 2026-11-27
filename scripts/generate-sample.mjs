import { mkdir, writeFile } from "node:fs/promises";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

const p = (text, options = {}) => {
  const { run, ...paragraphOptions } = options;
  return new Paragraph({
    spacing: { after: 120 },
    ...paragraphOptions,
    children: [new TextRun({ text, ...(run ?? {}) })],
  });
};

const heading = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, size: 28 })],
  });

const title = (text) =>
  new Paragraph({
    spacing: { before: 100, after: 160 },
    children: [new TextRun({ text, bold: true, size: 24 })],
  });

const numbered = (number, text) => p(`${number}. ${text}`);

const option = (letter, text) => p(`${letter}. ${text}`, { indent: { left: 360 } });

const children = [
  new Paragraph({
    alignment: "center",
    spacing: { after: 160 },
    children: [new TextRun({ text: "IELTS READING PRACTICE TEST", bold: true, size: 32 })],
  }),
  p("Reading Passage 1", { run: { bold: true, size: 24 } }),
  title("The Return of the Urban Bee"),
  p(
    "For much of the twentieth century, beekeeping was associated with the countryside. In the past fifteen years, however, hives have appeared on office roofs, in community gardens and on the balconies of city apartments. The people who keep them are rarely motivated by commercial honey production. Most say they want to support pollinators and to reconnect with the natural world.",
  ),
  p(
    "Supporters argue that urban hives can be easier to manage than rural ones. Cities are generally warmer than the surrounding countryside, so colonies start building comb earlier in spring. There are also fewer pesticides on many city allotments. Yet the picture is not entirely positive. Some scientists warn that adding more honeybees may put pressure on wild bee species that already face a shortage of flowers.",
  ),
  p(
    "A three-year study in London compared gardens, parks and railway embankments. Gardens contained the widest variety of flowering plants, while parks were more uniform and depended on a small number of species. Railway edges, although often overlooked, proved surprisingly rich in flowers. The researchers concluded that the value of a site depends less on its size than on how it is managed.",
  ),
  p(
    "The charity Bees in the City now provides free training to new beekeepers and advises them to place hives where bees can find food throughout the year. It also recommends keeping hives away from hospitals, schools and busy entrances. Beekeepers are asked to monitor hive weight every week, because a sudden fall may indicate that the colony is short of food.",
  ),
  p("Questions 1–5", { run: { bold: true } }),
  p("Do the following statements agree with the information given in Reading Passage 1?"),
  p("In boxes 1–5, write TRUE, FALSE or NOT GIVEN."),
  numbered(1, "City beekeepers in London began keeping hives mainly to produce honey."),
  numbered(2, "Rooftop hives can be easier to maintain than rural hives."),
  numbered(3, "All urban bee species are increasing in number."),
  numbered(4, "The study found that flowers in parks were less varied than in gardens."),
  numbered(5, "Local authorities have banned beekeeping on public buildings."),

  p("Questions 6–8", { run: { bold: true } }),
  p("Choose the correct letter, A, B, C or D."),
  numbered(6, "What does the writer say about the first urban hives?"),
  option("A", "They were built mainly by honey companies."),
  option("B", "They were illegal in most British cities."),
  option("C", "They were set up to help pollinators."),
  option("D", "They produced more honey than rural hives."),
  numbered(7, "According to the passage, one problem with too many hives is that"),
  option("A", "the honey produced is of lower quality."),
  option("B", "wild bees may lose access to limited flowers."),
  option("C", "urban temperatures begin to fall."),
  option("D", "beekeepers need more training."),
  numbered(8, "The phrase “green corridors” in the passage refers to"),
  option("A", "roads built beside railway lines."),
  option("B", "buildings covered with grass."),
  option("C", "areas where hives are forbidden."),
  option("D", "connected strips of vegetation."),

  p("Questions 9–10", { run: { bold: true } }),
  p("Complete the sentences below."),
  p("Choose NO MORE THAN TWO WORDS from the passage for each answer."),
  numbered(9, "The charity provides free ________ to new beekeepers."),
  numbered(10, "Hives should be placed where bees can find ________ throughout the year."),

  p("Questions 11–13", { run: { bold: true } }),
  p("Answer the questions below."),
  p("Choose NO MORE THAN THREE WORDS from the passage for each answer."),
  numbered(11, "How many hives did the pilot project install?"),
  numbered(12, "Which organisation paid for the project?"),
  numbered(13, "What should beekeepers monitor every week?"),

  heading("READING PASSAGE 2"),
  title("How Cities Cool Themselves"),
  p(
    "Paragraph A: Heatwaves are becoming more frequent and more intense. Concrete and asphalt absorb solar energy during the day and release it slowly at night. As a result, the centre of a large city can be several degrees warmer than nearby countryside, a phenomenon known as the urban heat island effect.",
  ),
  p(
    "Paragraph B: Water has a remarkable ability to moderate temperature. Fountains, canals and ponds cool the air as water evaporates, while trees release moisture through their leaves. A park with a lake can therefore feel noticeably cooler than a paved square of the same size.",
  ),
  p(
    "Paragraph C: Architects are rediscovering techniques that were common before air conditioning. Thick walls, narrow streets and shaded courtyards keep buildings cool without using electricity. In some hot regions, wind towers draw fresh air into homes, while white roofs reflect sunlight back into the sky.",
  ),
  p(
    "Paragraph D: Planting trees is often presented as a universal solution, but it has limits. Trees need water and space, and they take years to mature. In dense districts there may be nowhere to plant them. Green roofs can help, yet they are expensive to install and require regular maintenance.",
  ),
  p(
    "Paragraph E: Measuring the effect of these measures is difficult. Temperatures vary from street to street, and a single sensor cannot represent a whole neighbourhood. Researchers now combine satellite images with readings from bicycles and mobile phones to build a more detailed picture.",
  ),
  p("Questions 14–18", { run: { bold: true } }),
  p("Choose the correct heading for each paragraph from the list of headings below."),
  p("List of Headings"),
  p("i. A problem that is getting worse"),
  p("ii. Learning from traditional buildings"),
  p("iii. The role of water"),
  p("iv. Measuring the effect"),
  p("v. A solution with limits"),
  numbered(14, "Paragraph A"),
  numbered(15, "Paragraph B"),
  numbered(16, "Paragraph C"),
  numbered(17, "Paragraph D"),
  numbered(18, "Paragraph E"),

  heading("READING PASSAGE 3"),
  title("The Quiet Power of Maps"),
  p(
    "A map is never a neutral mirror of the world. Every map chooses what to show and what to leave out. A road map for drivers may omit footpaths, while a tourist map may exaggerate the size of a historic centre. These choices shape how people understand a place, even when the mapmaker has no deliberate intention to mislead.",
  ),
  p(
    "Digital maps have made these choices less visible. An algorithm can direct thousands of drivers along the same street, changing traffic patterns within minutes. Users see a route presented as the best one, but they rarely see the criteria behind it: speed, fuel use, safety or commercial agreements.",
  ),
  p(
    "Elena Marsh, a historian of cartography, argues that maps are arguments rather than facts. Tomas Reed, a transport planner, believes that digital maps are more democratic because anyone can contribute. Priya Nair, a data scientist, has designed a method for testing whether route recommendations treat neighbourhoods fairly. All three agree that mapmakers should explain their choices more openly.",
  ),
  p("Questions 19–21", { run: { bold: true } }),
  p("Do the following statements agree with the claims of the writer?"),
  p("In boxes 19–21, write YES, NO or NOT GIVEN."),
  numbered(19, "The writer believes that paper maps are always more accurate than digital maps."),
  numbered(20, "Digital maps can influence the routes people choose."),
  numbered(21, "The writer thinks mapmakers should explain their choices to users."),
  p("Questions 22–23", { run: { bold: true } }),
  p("Match each statement with the correct person, A, B or C."),
  p("A. Elena Marsh"),
  p("B. Tomas Reed"),
  p("C. Priya Nair"),
  numbered(22, "argues that maps are never neutral."),
  numbered(23, "developed a method for testing map bias."),

  heading("ANSWER KEY"),
  p("1. FALSE"),
  p("2. TRUE"),
  p("3. NOT GIVEN"),
  p("4. TRUE"),
  p("5. FALSE"),
  p("6. C"),
  p("7. B"),
  p("8. D"),
  p("9. training"),
  p("10. food"),
  p("11. twelve"),
  p("12. city council"),
  p("13. hive weight"),
  p("14. i"),
  p("15. iii"),
  p("16. ii"),
  p("17. v"),
  p("18. iv"),
  p("19. NO"),
  p("20. YES"),
  p("21. YES"),
  p("22. A"),
  p("23. C"),
  p("Explanation: The passage says most city beekeepers wanted to support pollinators, not produce honey."),
];

const doc = new Document({
  creator: "IELTS Reading Lab",
  title: "IELTS Reading Practice Test",
  description: "Demo test for IELTS Reading Lab",
  sections: [{ properties: {}, children }],
});

await mkdir("public/samples", { recursive: true });
const buffer = await Packer.toBuffer(doc);
await writeFile("public/samples/ielts-reading-demo.docx", buffer);
console.log("Wrote public/samples/ielts-reading-demo.docx");
