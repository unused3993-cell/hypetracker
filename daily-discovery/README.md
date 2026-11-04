# Daily Discovery: content engine

Daily Discovery publishes one well-sourced article a day. This app contains:
- **The content pipeline.** It picks a topic, gathers about five reputable sources, writes a feature from them, has the article checked and corrected against those sources, and holds it for an editor to approve.
- **The reader screens:** Today, the Library and individual issues.
- **A test bench** for running and reviewing the pipeline.

## Demo mode (no credentials)

```bash
cd daily-discovery
npm install
npm run demo         # open http://localhost:3000
```

Demo mode shows the reader experience without Anthropic or Supabase. It contains five hand-written sample discoveries, each with an illustration.

- **Generation is simulated.** On the test bench, the generate button plays back the pipeline's steps without calling an API.
- **Disabled endpoints.** `POST /api/generate` and the review endpoint both return 403.
- **The samples weren't produced by the pipeline,** and their sources are labelled "not link-checked".
- **To remove demo mode,** delete `demo/`, the lines marked `// demo` in `lib/repository.ts` and `app/components/Figure.tsx`, and the `demo` script in `package.json`.

## Screens

| Route | What it is |
|---|---|
| `/` | **Today**: the latest *approved* discovery |
| `/library` | **Library**: every approved discovery, filterable by History, Science or Technology |
| `/discoveries/[id]` | One issue, with Previous/Next navigation |
| `/bench` | **Test bench**: every discovery in any status |
| `/bench/[id]` | One discovery's sources, editorial review and corrections, cost per stage, generation log, and **Approve / Reject** |

## Setup

**Requirements:** Node 20+ (tested on 22), a Supabase project and an Anthropic API key.

1. **Install.** Run `cd daily-discovery && npm install`.
2. **Set up the database.** In the Supabase SQL editor:
   - **New project:** run [`supabase/schema.sql`](supabase/schema.sql).
   - **Project created before the evidence pipeline:** run [`supabase/migrations/002_evidence_pipeline.sql`](supabase/migrations/002_evidence_pipeline.sql) instead. It adds the new columns. Articles that were previously `ready` become `verified`, so you'll need to approve them again before they reappear on Today.
3. **Credentials.** Copy `.env.example` to `.env.local` and fill in:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)

   Web search must be enabled for your organization in the Anthropic Console, because the pipeline uses it as a fallback.
4. **Run** `npm run dev`, then generate from `/bench`, or run `npm run generate` from the terminal.

## Live test without a database

```bash
npm run article -- --eclipse                          # the 1919 eclipse topic, end to end
npm run article -- --eclipse --writer claude-opus-5-5 # same topic, Opus as writer
npm run article                                       # a topic chosen from the interest profile
```

This runs topic, research, writing and editorial review, without Supabase. It saves `runs/article-<time>.md` and a JSON file with the full research pack, the draft, the corrected article and the review. The Markdown file contains:
- the finished article
- every correction, before and after
- the sources and what was retrieved from each
- the cost of each stage

## Generating and reviewing with the app

```bash
npm run generate -- --eclipse      # or: npm run generate
```

1. The terminal prints each step, the status, the cost and a link to the test bench.
2. On the bench page you can read the article and see:
   - every review issue, with its correction (before and after) and whether it was applied
   - the sources, with their stored text
   - the cost of each stage
   - the full log
3. A **verified** article can be approved, which publishes it. A **needs review** article has unresolved substantive issues, so it can only be rejected.

## How the pipeline works

**1. Topic** (`lib/topics.ts`, Claude Sonnet 5.5, low effort)
- Proposes candidates from the interest profile and past articles, each with search terms.

**2. Research** (`lib/retrieval.ts`, `lib/passages.ts`, no model)
- Sources are fetched in code, and their readable text is stored:
  - the Wikipedia article
  - the pages it cites, skipping catalogues, bibliographic databases and paywalls; arXiv papers are read through their HTML or abstract pages
  - OpenAlex scholarly abstracts
- **Web search tops up** when there are fewer than about 5 full-text sources: Claude Haiku 5.5, at most 3 searches. The pipeline then fetches the result pages itself.
- The most relevant excerpts, about 48,000 characters across the sources, go to the writer.
- A topic is rejected if there's too little material: fewer than 3 sources, or less than 8,000 characters.

**3. Writing** (`lib/writer.ts`, Claude Sonnet 5.5 by default; set `MODEL_WRITE` to change)
- The writer reads the actual source excerpts and writes an original feature, roughly 1,000–1,500 words where the material warrants.
- Structure is free.
- It records which sources each section draws on, and lists any uncertainties for the reader's note.

**4. Editorial review** (`lib/review.ts`, Claude Sonnet 5.5)
- One call checks facts, dates, numbers, explanations and interpretations against the same material.
- It flags factual errors, unsupported specifics, misleading framing and substantive omissions, and allows reasonable explanation and clearly framed inference.
- For each issue it proposes a targeted correction, which code applies to the article.
- A **substantive** issue whose correction can't be applied stays unresolved. That article becomes `needs_review` and can't be approved.

**5. Status.** Nothing is published automatically.
- `verified`: passed editorial review. Only these can be approved.
- `needs_review`, `failed`, `approved`, `rejected`: as above.
- Sources with URLs, the research pack (`evidence`), the review (`validation`), the cost per stage (`usage`) and the log are all stored.

## Cost control

- **Configuration.** Every stage's model, effort and output cap can be set by environment variable (see `.env.example` and `lib/config.ts`).
- **Hard cap.** Before each model call, a worst-case cost is estimated from the prompt size, the full output cap and the search count. The call is refused if it could take the run past `BUDGET_MAX_USD`, which defaults to $0.35.
- **Money reserved for review.** Research holds back enough to write *and* review; writing holds back enough to review. So review is never skipped to save money.
- **Actual cost.** After each call, the token usage the API reported is priced and stored for that stage.
- **Prices** are in `lib/config.ts`, taken from Anthropic's documentation (as of 2026-10-06).

**Estimated cost** (not measured):

| Stage | Estimated cost |
|---|---|
| Topic | $0.01–0.03 |
| Search, when used | $0.02–0.03 |
| Writing (Sonnet) | $0.06–0.10 |
| Review | $0.05–0.08 |
| **Total** | **$0.15–0.25** |

## Tests

`npm test` runs 21 tests with no keys or network:
- unit tests for retrieval, HTML extraction, passage selection, budget enforcement and applying corrections
- end-to-end runs against a mock Anthropic API and a mock Supabase, using fixture web pages:
  - a correction applied, then verified
  - an unresolved issue, then `needs_review` and approval refused
  - approve and reject
  - the budget stop happening before any writing
  - the web search fallback

The mock models' answers are scripted, so the tests prove the code paths work, not the quality of real writing or review. Use `npm run article` for that.

`npm run typecheck` and `npm run build` should also pass.
