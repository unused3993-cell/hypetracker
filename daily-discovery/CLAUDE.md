# BAER / Daily Discovery: project context

Read this first. It records the decisions and preferences built up over a long earlier conversation with the project owner, Adam.

## What this is

BAER is a personal daily magazine. Every day it publishes one substantive, trustworthy and engaging article for curious, intelligent adults: about half history, the rest science, technology and art. The goal is **copywriter-quality narrative nonfiction**, in the tone of a New Yorker or NYT feature: one coherent piece told with authority, never a report assembled from facts.

## How Adam wants to work

- **Everything runs locally on his Mac** (`~/Developer/hypetracker/daily-discovery`). No cloud sessions. The only remote services are the Anthropic API and the research websites.
- **Never commit secrets.** The API key lives in `.env.local`, which is gitignored.
- **Never recommend destructive git operations** (resets, deleting the repo) without first safeguarding uncommitted files.
- Adam isn't a programmer. Run the commands yourself, explain things plainly and briefly, and don't make him type code. Avoid long blocking waits without reporting progress.
- **Costs:** target about $0.25 per article. The hard cap is `BUDGET_MAX_USD` in `.env.local`, normally $0.35; raised to $0.50 when using the Opus rewrite. Adam rejected a standing $0.40–0.80 budget, but agreed to spend a little more for Opus. Report what each run actually cost.
- **The design:** Adam built the "linen" article design himself (`app/(baer)/LinenArticle.tsx`, `linen.css`, `linen-editions.ts`, `lib/edition-*.ts`). That is the design to use; don't replace it.
- Use British English.

## The writing pipeline

Run: `npm run article -- --topic "..." --angle "..." --terms "Wikipedia title|other term" [--type explanation] [--rewriter claude-opus-5-5]`

1. **Research** (`lib/retrieval.ts`, `lib/passages.ts`). Free sources first: the Wikipedia article and the sites it cites, OpenAlex papers, Project Gutenberg and Internet Archive books. Web search (Haiku) tops up when those fall short. Dictionary and fringe sites are skipped. BM25 picks about 48K characters of passages.
2. **Draft** (Sonnet, `lib/writer.ts`). It states a one-sentence plan first: form, spine, payoff.
3. **Editor's critique** (Sonnet). It works through the style guide's checklist and asks first whether the draft would sit beside the model features.
4. **Full rewrite** from the critique (Sonnet by default; `--rewriter claude-opus-5-5` for Opus).
5. **Fact-check** (Sonnet, `lib/review.ts`). It fixes errors only, by rewriting whole paragraphs; a rewritten paragraph that balloons in size is rejected. It must not restore cut material or add "sources say" phrasing.
6. The result is held for manual approval; nothing auto-publishes.

Every model step reads the same shared context: **the model features + the style guide + the research**. This is sent with prompt caching, and every stage uses one combined output schema (`lib/schemas.ts`) so the cache actually hits; a different schema per stage breaks the cache. Budget checks are cache-aware. If the edit and rewrite can't fit under the cap, they are skipped and the log prints a WARNING. Check for it.

Reports are saved to `runs/article-<time>.md`, with the plan, the editor's critique, the first draft, the final version and the cost per stage. To import an article into the reader: `npm run import-article -- runs/<file>.json --category History --slug <slug>`.

## The style guide and model features

- `content/style-guide.md` is the house style. Adam edits it directly, so preserve his edits. It covers:
  - the four forms (story, biography of a thing, investigation, portrait through a tension)
  - the spine and structure rules
  - voice
  - "documentary presence" instead of first-person reporting (the writer was never there and interviewed no one)
  - the banned habits: signposting, narrated sources, lists of numbers, clichés
  - accuracy and attribution
  - investigation craft
  - section 8, "Write for the reader's understanding", taken from Adam's detailed editorial feedback
  - the editor's checklist
- `content/exemplars/*.md` holds three published features Adam chose as models of voice and flow: an NYT Budapest feature, an NYT piece on Scythian cannabis use, and an NYT piece on how the vertebrate eye evolved. They are third-party text, so they're gitignored and stay on this Mac. More can be added as `.md` files.

## What we've learned (don't relearn it)

- Single-pass writing produced chronological research summaries. A critique-and-rewrite pass is essential.
- Rules alone don't produce voice; the model features do more.
- Spliced sentence-level corrections left seams. Whole-paragraph fixes work better, but the fact-checker must not act as a co-writer.
- Encyclopedia-heavy research gives encyclopedia-sounding prose. Primary sources, period accounts and interviews in the research improve texture.
- Adam's main criticisms of the drafts so far:
  - fake suspense about something the headline already answered
  - stuffy openings that bury the hook
  - researcher-then-date chronology instead of a chain of questions
  - no picture of the object before its parts
  - unexplained jargon
  - lists of numbers
  - generic endings
  - stiff phrasing ("hitherto")

## Open items

- **Reader-focused polish after the fact-check.** Adam's feedback asked for a dedicated reader-focused edit after factual review. It's not built yet; ask before adding it (about $0.04–0.06 more).
- **The Opus rewrite with the $0.50 cap** hasn't yet been seen working end to end. The next test topic is "John Harrison and the longitude problem".
- **The linen design commit** still needs pushing to GitHub (`gh auth login`, then `git push`).
- `lib/e2e.test.ts` hangs; the other tests pass (`npx tsx --test lib/review.test.ts lib/pipeline.test.ts lib/research.test.ts`).
- Use Node 22 LTS. Node 26 hung Next.js and tsx.
