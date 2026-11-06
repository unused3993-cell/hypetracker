// Demo content: five hand-written sample discoveries.
//
// These are NOT produced by the content pipeline. They exist so the reading experience and
// visual design can be evaluated without any API credentials. Sources are real references,
// but they have not been link-checked from this environment, and the articles have not been
// through the pipeline's automated review.

import type { ArticleContent, ContentType, Source } from "../lib/types";

export interface DemoArticle {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  subcategory: string;
  content_type: ContentType;
  plate: string;
  plateAlt: string;
  plateCaption: string;
  content: ArticleContent;
  sources: Omit<Source, "link_status" | "link_detail">[];
  related_topics: string[];
  uncertain: string[];
}

export const DEMO_ARTICLES: DemoArticle[] = [
  // ── No. 005 · today ────────────────────────────────────────────────────────────
  {
    slug: "mongol-invasions-of-japan",
    title: "When the Mongols Came to Hakata Bay",
    subtitle:
      "Kublai Khan twice sent fleets against Kamakura Japan, and while the typhoon gets the credit, a wall, a stubborn defence and some badly built ships tell a fuller story.",
    category: "History",
    subcategory: "Japanese history",
    content_type: "story",
    plate: "hakata",
    plateAlt: "Schematic chart of the Korea Strait showing the invasion routes of 1274 and 1281 towards northern Kyushu.",
    plateCaption: "The approaches to northern Kyushu, with the routes of 1274 and 1281 and the coastal wall at Hakata. Schematic; not to scale.",
    content: {
      introduction: [
        "In the autumn of 1274, a fleet carrying Mongol, Korean and Chinese troops anchored in Hakata Bay, on the northern coast of Kyushu. Its commanders served Kublai Khan, grandson of Genghis and ruler of an empire that reached from Korea to the edge of Europe. Japan, governed in practice by the warrior government of the Kamakura shogunate, had ignored his letters for six years. Now he had sent an answer of his own.",
        "Japanese tradition remembers what happened next, twice, as an act of the gods: a divine wind, kamikaze, that wrecked the invaders' ships. The storm of 1281 was real and catastrophic. But historians, and more recently underwater archaeologists, have shown that wind alone does not explain why the invasions failed.",
      ],
      sections: [
        {
          heading: "A letter, and a silence",
          paragraphs: [
            "Kublai's first envoys reached Japan in 1268 with a letter addressed to the 'king of a small country', inviting him to open relations and closing with a reminder that nobody wished to resort to arms. The imperial court in Kyoto drafted replies; the shogunate, led by the young regent Hōjō Tokimune, made sure none was sent. Further embassies met the same silence.",
            "Kublai had recently brought the Korean kingdom of Goryeo under his control and was still at war with China's Southern Song dynasty. He ordered Goryeo to build ships. The force that sailed in late 1274 is put at around 900 vessels and some 23,000 fighting men, though medieval figures of this kind are unreliable. It overran the islands of Tsushima and Iki, then landed at Hakata.",
          ],
          source_ids: ["S1", "S2"],
        },
        {
          heading: "One day on the beach",
          paragraphs: [
            "The fighting on land lasted, as far as the sources allow us to tell, about a day. Japanese warriors trained for mounted archery and individual combat faced massed infantry, volleys of arrows and exploding ceramic bombs. The defenders were pushed back from the shore, and the town of Hakata burned.",
            "Then the invaders returned to their ships, and the fleet left. Korean and Chinese records describe a storm that sank many vessels on the way home. Why the commanders withdrew is disputed. The traditional story credits the weather; others suggest the expedition was a raid that had done what it set out to do, or that its leaders lost confidence after heavy fighting. The historian Thomas Conlan, working from the warriors' own petitions for reward, has argued that Japanese resistance was far more effective than the legend allows.",
          ],
          source_ids: ["S2", "S3"],
        },
        {
          heading: "A wall along the shore",
          paragraphs: [
            "The shogunate assumed the Mongols would return. Kyushu warriors were rotated through guard duty, and landholders were ordered to build a stone wall along the curve of Hakata Bay. It ran for roughly 20 kilometres and stood about two metres high, with a sloping landward face that defenders could climb. Stretches of it survive. When Kublai sent further envoys, in 1275 and 1279, the shogunate had them executed.",
          ],
          source_ids: ["S2"],
        },
        {
          heading: "The second fleet",
          paragraphs: [
            "The invasion of 1281 was on another scale. Having completed the conquest of the Southern Song in 1279, Kublai could draw on the shipyards and soldiers of southern China. Two fleets were to converge on Kyushu: one from Korea, and a far larger one from the Yangtze region. Yuan sources give totals of around 140,000 men and more than 4,000 ships, figures most historians treat as inflated.",
            "The Korean fleet arrived first, in early summer, and found the wall manned. Unable to establish themselves at Hakata, the invaders held islands and anchorages offshore while Japanese warriors raided them in small boats by night. The southern fleet arrived weeks late. In mid-August a typhoon struck the combined fleet off Takashima, an island in Imari Bay. Much of it was destroyed, and troops stranded on the island were killed or captured.",
          ],
          source_ids: ["S1", "S2", "S4"],
        },
        {
          heading: "What the seabed shows",
          paragraphs: [
            "Since the 1980s, archaeologists have recovered thousands of objects from the waters around Takashima: anchors, weapons, armour, ceramic bombs and ship timbers, and since 2011 the remains of hulls. The nautical archaeologist Randall Sasaki, studying the timbers, has argued that many ships in the 1281 fleet were built in haste or requisitioned, and that some were poorly suited to open water, one reason the storm did so much damage. The interpretation is debated; the surviving sample is small, and well-built ships also sink in typhoons.",
          ],
          source_ids: ["S2"],
        },
        {
          heading: "Victory without spoils",
          paragraphs: [
            "Survival did not settle Japan's accounts. Kamakura warriors expected to be rewarded for war service, usually with confiscated land, and a defensive victory produced none to hand out. The shogunate also kept Kyushu on alert for years against a third attempt, which Kublai planned but never launched before his death in 1294. Takezaki Suenaga, a minor warrior from Higo province, commissioned an illustrated scroll of his own exploits, the Mōko Shūrai Ekotoba, partly to press his claim. It is now one of the most important visual sources for the battles.",
            "Historians often count the unpaid debts of the invasions among the strains that weakened the shogunate before its fall in 1333. The divine wind outlived it by six centuries: in 1944 the word kamikaze was taken up as the name of Japan's suicide air units.",
          ],
          source_ids: ["S3", "S4"],
        },
      ],
    },
    sources: [
      { id: "S1", title: "Mongol invasions of Japan — Wikipedia", url: "https://en.wikipedia.org/wiki/Mongol_invasions_of_Japan" },
      { id: "S2", title: "Kamikaze (typhoon) — Wikipedia", url: "https://en.wikipedia.org/wiki/Kamikaze_(typhoon)" },
      { id: "S3", title: "Mōko Shūrai Ekotoba — Wikipedia", url: "https://en.wikipedia.org/wiki/M%C5%8Dko_Sh%C5%ABrai_Ekotoba" },
      { id: "S4", title: "Kamakura shogunate — Wikipedia", url: "https://en.wikipedia.org/wiki/Kamakura_shogunate" },
    ],
    related_topics: [
      "Why the Kamakura shogunate fell in 1333",
      "Goryeo Korea under Mongol rule",
      "Kublai Khan's expeditions to Java and Đại Việt",
    ],
    uncertain: [
      "Troop and ship numbers for both invasions come from Yuan and Korean records and are widely considered inflated.",
      "Whether a storm struck the 1274 fleet, and how much it mattered, is debated; Japanese sources of the time say little about it.",
      "The claim that much of the 1281 fleet was poorly built rests on a small archaeological sample and remains contested.",
    ],
  },

  // ── No. 004 ──────────────────────────────────────────────────────────────────
  {
    slug: "why-alexandrite-changes-colour",
    title: "Why Alexandrite Changes Colour",
    subtitle:
      "A trace of chromium in a rare gemstone sits on a knife-edge between red and green, and the light in the room decides which way it falls.",
    category: "Science & Nature",
    subcategory: "Physics of colour",
    content_type: "explanation",
    plate: "alexandrite",
    plateAlt: "Two cut gemstones, one green labelled daylight and one red labelled incandescent light, above a chart of the light the stone transmits.",
    plateCaption: "The same stone under two lights. Below, a simplified sketch of what alexandrite transmits: windows in the blue-green and the red, separated by absorption in the yellow.",
    content: {
      introduction: [
        "Take a cut alexandrite outside at midday and it looks green, a cool bluish or olive green. Carry it indoors under an incandescent bulb, or hold it near a candle, and it turns raspberry red or purple. Nothing about the stone has changed. What has changed is the light, and the way a few chromium atoms inside the crystal sort it.",
      ],
      sections: [
        {
          heading: "A borrowed colour",
          paragraphs: [
            "Alexandrite is a variety of chrysoberyl, an oxide of beryllium and aluminium. Pure chrysoberyl is pale yellow or greenish. Alexandrite owes its colour to chromium: a small fraction of the aluminium in the crystal, typically well under one per cent, is replaced by chromium ions. The same impurity is responsible for the red of ruby and the green of emerald, which turns out to be the key to the whole effect.",
            "The stone was first found in the emerald mines of the Ural Mountains in the 1830s and named after the future Tsar Alexander II. A popular story links its naming to his coming of age in 1834; the details are uncertain.",
          ],
          source_ids: ["S1", "S2"],
        },
        {
          heading: "How chromium absorbs light",
          paragraphs: [
            "A material absorbs light when the energy of that light matches a jump between two energy levels of its electrons. In an isolated chromium ion, several of the relevant levels would have the same energy. Inside a crystal, the ion sits in a cage of six oxygen atoms whose electric fields push those levels apart. The size of that split, known as the crystal field, determines which colours are absorbed.",
            "For chromium the result is two broad absorption bands: one in the violet and blue, and another somewhere between the green and the orange. What survives is a mixture of red light and blue-green light. The exact position of the second band decides which of the two dominates.",
            "In ruby, which is aluminium oxide, the chromium sits in a strong field. Its band falls in the yellow-green, so the stone passes mostly red. In emerald, a beryllium aluminium silicate, the field is weaker and the band moves towards the yellow and orange, so green wins. Alexandrite's chromium sits almost exactly between the two. Its band is centred in the yellow, leaving two windows of transmitted light, one in the blue-green and one in the red, that let through comparable amounts.",
          ],
          source_ids: ["S2", "S3"],
        },
        {
          heading: "Why the light source decides",
          paragraphs: [
            "Because those two windows are so evenly matched, the colour you see depends on what the light source contains to begin with. Daylight is relatively rich in blue and green wavelengths, so more light comes through the blue-green window and the stone looks green. Incandescent bulbs and flames give off far more red than blue, so the red window carries more of the light and the stone looks red.",
            "Our eyes do not measure spectra. Three kinds of cone cell sample the incoming light and the brain reduces the result to a single impression of hue. Most objects reflect or transmit a spectrum that lands comfortably on one side of a colour boundary whatever the lighting. Alexandrite's sits close to the line, so a change of illuminant tips it across.",
          ],
          source_ids: ["S2", "S3"],
        },
        {
          heading: "Other colour-changers",
          paragraphs: [
            "The effect is named after alexandrite, but it is not unique to it. Some sapphires, garnets and spinels also shift between daylight and incandescent light, usually because of chromium or vanadium. The colour change is also distinct from pleochroism, in which a crystal shows different colours when viewed along different directions. Alexandrite does that too, showing green, orange and purplish red along its three crystal axes, which is why cutters orient the rough with care.",
          ],
          source_ids: ["S1", "S2"],
        },
        {
          heading: "From jewellery to lasers",
          paragraphs: [
            "Natural alexandrite is scarce. The Ural deposits were largely worked out long ago, and stones now come mainly from Sri Lanka, Brazil, East Africa and India. Many show a weaker or muddier change than the finest old Russian material, and graders judge alexandrite chiefly on the strength of its change: how cleanly it moves between a distinct green and a distinct red.",
            "Chromium-bearing chrysoberyl has also found a use far from the jeweller's tray. Synthetic alexandrite crystals serve as the working medium in tunable lasers that emit near-infrared light, and alexandrite lasers operating at 755 nanometres are widely used in dermatology, including for hair removal.",
          ],
          source_ids: ["S1", "S2"],
        },
      ],
    },
    sources: [
      { id: "S1", title: "Alexandrite — Gemological Institute of America", url: "https://www.gia.edu/alexandrite" },
      { id: "S2", title: "Alexandrite — Wikipedia", url: "https://en.wikipedia.org/wiki/Alexandrite" },
      { id: "S3", title: "Crystal field theory — Wikipedia", url: "https://en.wikipedia.org/wiki/Crystal_field_theory" },
    ],
    related_topics: [
      "Why rubies glow red under ultraviolet light",
      "How cone cells turn spectra into colour",
      "The Usambara effect in tourmaline",
    ],
    uncertain: [
      "The story that alexandrite was named on Alexander II's sixteenth birthday is widely repeated but poorly documented.",
      "Exact chromium concentrations and band positions vary between deposits, so the strength of the colour change differs from stone to stone.",
    ],
  },

  // ── No. 003 ──────────────────────────────────────────────────────────────────
  {
    slug: "dancing-plague-of-1518",
    title: "The Summer Strasbourg Danced",
    subtitle:
      "In 1518, dozens of people in an Alsatian city danced for days on end, and the explanation most historians favour says as much about fear and faith as about the body.",
    category: "History",
    subcategory: "Unusual and forgotten events",
    content_type: "story",
    plate: "strasbourg",
    plateAlt: "A spiral of dots spreading outward from a single red point above the silhouette of Strasbourg Cathedral.",
    plateCaption: "One dancer, then dozens: an impression of the outbreak's spread through the summer of 1518. Numbers in the sources vary widely.",
    content: {
      introduction: [
        "In mid-July 1518, a woman in Strasbourg stepped into the street and began to dance. Later accounts give her name as Frau Troffea. She kept going for hours, and when she finally collapsed she got up and began again, day after day. Within a week others had joined her. By the end of the summer, depending on which chronicle you trust, the dancers numbered in the dozens or the hundreds.",
        "It sounds like folklore, but the dancing plague of 1518 is unusually well documented, in city council records, physicians' notes and local chronicles. What it was is another matter.",
      ],
      sections: [
        {
          heading: "A city under strain",
          paragraphs: [
            "Strasbourg was a prosperous free city of the Holy Roman Empire, but the years before 1518 had been hard for its poorer inhabitants. A run of bad harvests had driven up the price of bread, and the region had been hit by disease, including the syphilis that had spread across Europe in the 1490s. Religious anxiety ran high, too; the city would embrace the Reformation within a decade.",
            "In that setting, the dancing was not read as a spectacle. Many people in the region believed that St Vitus, among other saints, could punish sinners by afflicting them with uncontrollable dancing. The question for the authorities was what kind of illness this was, and how to cure it.",
          ],
          source_ids: ["S1", "S2"],
        },
        {
          heading: "The council's cure",
          paragraphs: [
            "The city's physicians rejected a supernatural cause and declared the condition a natural one, the result of overheated blood. Their remedy was, in effect, more dancing: the afflicted should dance until the fever broke. The council set aside guild halls and a market for the dancers, had a wooden stage built, and paid musicians, and men to support the dancers, to keep them moving.",
            "The cure did not work. As the numbers grew, the council reversed course, banned public music and dancing, and had the dancers taken to a shrine of St Vitus in the hills near Saverne, some 40 kilometres away, where they were led in rituals of prayer and penance. By September the outbreak had faded.",
          ],
          source_ids: ["S1"],
        },
        {
          heading: "Did anyone die?",
          paragraphs: [
            "Retellings often claim that the dancing killed as many as fifteen people a day. That figure does not appear in sources written during the outbreak, and no contemporary record confirms mass deaths. Some dancers may well have died from exhaustion, injury or illness, but how many, if any, is unknown.",
          ],
          source_ids: ["S1"],
        },
        {
          heading: "Explaining a compulsion",
          paragraphs: [
            "A once-popular theory blamed ergot, a fungus that grows on damp rye and produces compounds chemically related to LSD. Ergot poisoning can cause hallucinations and convulsions, but it also restricts blood flow to the limbs. It is hard to see how it could produce sustained, coordinated dancing over weeks, or why it would strike some people and spare others eating the same bread.",
            "The historian John Waller, whose work has shaped most recent discussion, argues that the dancing was a case of mass psychogenic illness, once called mass hysteria. Under severe distress, and in a culture primed to believe in a dancing curse, people entered dissociative, trance-like states that took the form their beliefs predicted. The council's decision to give the dancers a public stage and music may have helped spread the behaviour by making it visible.",
            "Not every scholar is comfortable diagnosing people across five centuries, and the label explains less than it seems to. But Strasbourg was not unique. Outbreaks of compulsive dancing had been recorded along the Rhine and Moselle and in the Low Countries since at least 1374, mostly in regions where belief in saintly dancing curses was strong.",
          ],
          source_ids: ["S1", "S2", "S3"],
        },
        {
          heading: "A witness with an opinion",
          paragraphs: [
            "Much of what is said about Frau Troffea goes back to the physician Paracelsus, who visited Strasbourg some years afterwards and wrote, unsympathetically, that she had begun dancing to spite her husband. His account is a reminder that even well-recorded events reach us through observers with their own theories, and that the people at the centre of this one left no words of their own.",
          ],
          source_ids: ["S1"],
        },
      ],
    },
    sources: [
      { id: "S1", title: "Dancing plague of 1518 — Wikipedia", url: "https://en.wikipedia.org/wiki/Dancing_plague_of_1518" },
      { id: "S2", title: "Dancing mania — Wikipedia", url: "https://en.wikipedia.org/wiki/Dancing_mania" },
      { id: "S3", title: "Mass psychogenic illness — Wikipedia", url: "https://en.wikipedia.org/wiki/Mass_psychogenic_illness" },
    ],
    related_topics: [
      "The dancing mania of 1374 along the Rhine",
      "Tarantism in southern Italy",
      "The Tanganyika laughter epidemic of 1962",
    ],
    uncertain: [
      "Estimates of the number of dancers range from a few dozen to around 400, depending on the chronicle.",
      "The frequently quoted death toll of fifteen a day is not supported by contemporary records.",
      "Mass psychogenic illness is the most widely accepted explanation, but retrospective diagnosis is inherently uncertain; ergot poisoning is now generally considered unlikely.",
    ],
  },

  // ── No. 002 ──────────────────────────────────────────────────────────────────
  {
    slug: "eddington-eclipse-1919",
    title: "The Eclipse That Made Einstein Famous",
    subtitle:
      "In 1919, two British expeditions photographed stars beside the darkened Sun to test whether gravity bends light, and their result was celebrated at once and argued over for decades.",
    category: "Science & Nature",
    subcategory: "Astronomy",
    content_type: "story",
    plate: "eclipse",
    plateAlt: "A totally eclipsed Sun with its corona, surrounded by stars with small arrows pointing away from the Sun.",
    plateCaption: "Stars of the Hyades around the eclipsed Sun, with their apparent outward shift greatly exaggerated. Illustration, not a reproduction of the 1919 plates.",
    content: {
      introduction: [
        "On 29 May 1919, the Moon passed in front of the Sun along a narrow track running from South America across the Atlantic to Africa. In Sobral, in northeastern Brazil, and on the island of Príncipe in the Gulf of Guinea, two small teams of British astronomers waited with their telescopes. They were not there for the corona. They wanted to photograph stars.",
      ],
      sections: [
        {
          heading: "A prediction worth testing",
          paragraphs: [
            "Four years earlier, Albert Einstein had completed his general theory of relativity, which describes gravity not as a force but as a curvature of space and time produced by mass. One consequence is that light passing close to a massive body follows a bent path. Einstein calculated that starlight grazing the edge of the Sun should be deflected by 1.75 seconds of arc, about half of one thousandth of a degree.",
            "Newtonian physics could also be made to predict some bending, if light were treated as a stream of particles; that calculation gave half Einstein's value, about 0.87 seconds of arc. A careful measurement could therefore distinguish three outcomes: no deflection, the 'Newtonian' half, or Einstein's full value.",
          ],
          source_ids: ["S1", "S3"],
        },
        {
          heading: "Why an eclipse",
          paragraphs: [
            "Stars close to the Sun are normally lost in its glare. During a total eclipse they can be photographed, and their positions compared with plates of the same star field taken months later at night. If light is bent, stars near the Sun appear pushed slightly outward from it. The 1919 eclipse was unusually favourable, because the Sun would sit in front of the Hyades, a bright, nearby cluster in Taurus.",
            "The expeditions were organised by the Astronomer Royal, Frank Dyson. Arthur Eddington of Cambridge, one of the few British astronomers fluent in the new theory, went to Príncipe with Edwin Cottingham; Andrew Crommelin and Charles Davidson went to Sobral. Planning began while the First World War was still being fought. Eddington, a Quaker, had refused military service on grounds of conscience, and accounts suggest that leading the expedition became, in effect, a condition of his exemption.",
          ],
          source_ids: ["S1", "S2"],
        },
        {
          heading: "Clouds, heat and a handful of plates",
          paragraphs: [
            "On Príncipe it rained on the morning of the eclipse, and the clouds only partly cleared during totality. Of the sixteen plates Eddington's team exposed, only two showed enough stars to measure. They gave a deflection of about 1.6 seconds of arc, with a large margin of error.",
            "Sobral had clear skies and two instruments. Plates from a small four-inch telescope gave about 1.98 seconds of arc. The main astrographic telescope produced more plates, but the star images were blurred; the team concluded that the Sun's heat had distorted the instrument's mirror and changed its focus. Taken at face value, those plates pointed towards the lower, Newtonian figure.",
          ],
          source_ids: ["S1", "S2"],
        },
        {
          heading: "A verdict and a controversy",
          paragraphs: [
            "Dyson and Eddington judged the astrographic results unreliable and gave most weight to the four-inch and Príncipe plates. On 6 November 1919, at a joint meeting of the Royal Society and the Royal Astronomical Society in London, they announced that the results supported Einstein. The next day The Times reported a 'Revolution in Science'. Einstein, until then known mainly to physicists, became a public figure almost overnight.",
            "In 1980 the philosophers John Earman and Clark Glymour argued that the evidence had been weaker than claimed, and that setting aside the astrographic plates looked like a choice made to fit the expected answer. The charge became a staple of writing about bias in science. Later work has largely defended the 1919 teams. The historian Daniel Kennefick has noted that the decision was driven mainly by Dyson, who was more sceptical of relativity than Eddington, and that the instrumental problems were recorded at the time. When the Sobral plates were re-measured with modern equipment in 1979, the astrographic plates also gave a result consistent with Einstein.",
          ],
          source_ids: ["S2"],
        },
        {
          heading: "Beyond 1919",
          paragraphs: [
            "The 1919 measurements were difficult, and their uncertainties were large. Later eclipse expeditions repeated the test with mixed precision. The decisive confirmations came from radio astronomy in the 1970s, when the bending of signals from distant quasars passing near the Sun was found to match Einstein's prediction to within about one per cent. The same effect, on the scale of galaxies, is now known as gravitational lensing and is used routinely to weigh galaxy clusters and map dark matter.",
          ],
          source_ids: ["S2", "S3"],
        },
      ],
    },
    sources: [
      {
        id: "S1",
        title: "Dyson, Eddington & Davidson (1920), 'A determination of the deflection of light by the Sun's gravitational field' — Philosophical Transactions of the Royal Society A",
        url: "https://doi.org/10.1098/rsta.1920.0009",
      },
      { id: "S2", title: "Eddington experiment — Wikipedia", url: "https://en.wikipedia.org/wiki/Eddington_experiment" },
      { id: "S3", title: "Tests of general relativity — Wikipedia", url: "https://en.wikipedia.org/wiki/Tests_of_general_relativity" },
    ],
    related_topics: [
      "How gravitational lensing reveals dark matter",
      "The precession of Mercury's orbit",
      "Why the Hyades are a yardstick for stellar distances",
    ],
    uncertain: [
      "Whether discarding the Sobral astrographic plates was justified was debated for decades; the 1979 re-measurement supports the original decision.",
      "Accounts differ on how directly Eddington's exemption from military service depended on the expedition.",
    ],
  },

  // ── No. 001 ──────────────────────────────────────────────────────────────────
  {
    slug: "antikythera-mechanism",
    title: "How the Antikythera Mechanism Worked",
    subtitle:
      "A corroded lump of bronze from a Roman-era shipwreck turned out to be a hand-cranked model of the heavens, built with gearing no one expected the ancient world to have.",
    category: "Technology & Engineering",
    subcategory: "Historical inventions",
    content_type: "explanation",
    plate: "antikythera",
    plateAlt: "Line drawing of interlocking bronze gears beside a five-turn spiral dial.",
    plateCaption: "A reconstruction sketch: the large drive wheel, the 223-tooth Saros gear, the pin-and-slot pair, and the five-turn Metonic spiral from the back of the device.",
    content: {
      introduction: [
        "In 1900, sponge divers sheltering from a storm off the small Greek island of Antikythera found the wreck of a ship that had sunk in the first century BC, loaded with bronze and marble statues, glassware and coins. Among the objects brought up in 1901 was a shoebox-sized lump of corroded bronze and wood. The following year, the archaeologist Valerios Stais noticed a gear wheel embedded in one of its fragments.",
        "It took most of the twentieth century, and eventually X-ray computed tomography, to work out what the device did. It was a calculator: a hand-cranked model of the sky that showed the positions of the Sun and Moon, the phase of the Moon, the months of coming eclipses and the cycle of the great athletic games.",
      ],
      sections: [
        {
          heading: "Gears from the Greeks",
          paragraphs: [
            "The mechanism survives in 82 fragments, kept at the National Archaeological Museum in Athens. Early investigators could see only what lay on the surfaces. From the 1950s the historian of science Derek de Solla Price used X-ray photographs to count gear teeth, publishing a first full reconstruction, 'Gears from the Greeks', in 1974. The engineer and curator Michael Wright later corrected and extended his model.",
            "The decisive step came in 2005, when the Antikythera Mechanism Research Project imaged the fragments with high-resolution X-ray CT and advanced surface photography. The scans revealed about 30 surviving bronze gears and thousands of characters of previously unreadable text: the device's own explanatory inscriptions.",
          ],
          source_ids: ["S1", "S4"],
        },
        {
          heading: "What the crank turned",
          paragraphs: [
            "The user turned a crank on the side. On the front, pointers moved around a dial marked with the twelve signs of the zodiac, encircled by a ring showing the 365 days of the Egyptian calendar. One pointer gave the position of the Sun, another the Moon, and a small ball, half pale and half dark, turned to show the Moon's phase.",
            "On the back were two large spiral dials. The upper one tracked the Metonic cycle: 235 lunar months, very nearly 19 years, after which the Moon's phases return to the same calendar dates. The lower spiral followed the Saros cycle of 223 lunar months, about 18 years, after which similar eclipses recur, and was marked with glyphs for the months in which eclipses could be expected. A smaller dial showed the four-year cycle of the Panhellenic games, including the Olympics.",
          ],
          source_ids: ["S1", "S2", "S4"],
        },
        {
          heading: "Modelling an irregular Moon",
          paragraphs: [
            "The most ingenious engineering handles the Moon's changing speed. The Moon moves faster across the sky when it is nearer the Earth and slower when it is farther away, an irregularity the astronomer Hipparchus had described with geometrical models in the second century BC.",
            "The mechanism reproduced it with two small gears mounted one above the other on slightly offset axes. A pin on one engages a slot in the other, so that as the first turns steadily the second speeds up and slows down once in each revolution. The pair rides on a larger rotating gear, so that the point of fastest motion itself creeps slowly around the zodiac, as the Moon's does over roughly nine years.",
          ],
          source_ids: ["S1", "S4"],
        },
        {
          heading: "Planets, and open questions",
          paragraphs: [
            "Inscriptions on the front cover refer to the five planets known in antiquity, and it is widely accepted that the device once displayed them, although the gearing for them is lost. In 2021 a team at University College London proposed a complete reconstruction of the planetary display, based on cycles recorded in the inscriptions.",
            "Much remains uncertain. Estimates of when it was made range from around 200 BC to shortly before the shipwreck. The month names on the calendar dial are Corinthian, which points to Corinth or one of its colonies, though Rhodes, a centre of Greek astronomy, has also been proposed. Who built it, and how many others existed, is unknown.",
            "What is clear is how unusual it is. Nothing of comparable mechanical complexity survives from the following thousand years; geared astronomical clocks of similar sophistication appear in Europe only in the fourteenth century.",
          ],
          source_ids: ["S2", "S3", "S4"],
        },
      ],
    },
    sources: [
      {
        id: "S1",
        title: "Freeth et al. (2006), 'Decoding the ancient Greek astronomical calculator known as the Antikythera Mechanism' — Nature",
        url: "https://doi.org/10.1038/nature05357",
      },
      {
        id: "S2",
        title: "Freeth et al. (2008), 'Calendars with Olympiad display and eclipse prediction on the Antikythera Mechanism' — Nature",
        url: "https://doi.org/10.1038/nature07130",
      },
      {
        id: "S3",
        title: "Freeth et al. (2021), 'A model of the cosmos in the ancient Greek Antikythera Mechanism' — Scientific Reports",
        url: "https://doi.org/10.1038/s41598-021-84310-w",
      },
      { id: "S4", title: "Antikythera mechanism — Wikipedia", url: "https://en.wikipedia.org/wiki/Antikythera_mechanism" },
    ],
    related_topics: [
      "How Hipparchus measured the Moon's distance",
      "Su Song's astronomical clock tower",
      "The medieval astrarium of Giovanni de' Dondi",
    ],
    uncertain: [
      "The date of construction is debated, with estimates from around 200 BC to the early first century BC.",
      "Where it was made is unknown; the Corinthian month names favour Corinth or a Corinthian colony, but Rhodes has also been suggested.",
      "The planetary display is reconstructed from inscriptions; none of its gearing survives.",
    ],
  },
];
