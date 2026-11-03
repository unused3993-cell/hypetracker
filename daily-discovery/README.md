# Daily Discovery: Phase 1 content engine

This is the content pipeline for Daily Discovery. It picks one interesting topic, researches it on the web, writes a 600–900 word article from that research, checks the result automatically, and saves it to Supabase. A small local page lets you run the pipeline and inspect what it produced.

This phase is only the engine and a test bench. It has no consumer UI, auth, notifications or quizzes.

## Demo mode (no credentials)

```bash
cd daily-discovery
npm install
npm run demo         # open http://localhost:3000
```

Demo mode lets you try the reader experience without Anthropic or Supabase. It includes five hand-written sample discoveries (two history, two science, one technology), each with an illustrated plate. You can browse them on **Today** (`/`) and in the **Library** (`/library`), and step between issues with Previous/Next.

- **Generation is simulated.** On the test bench the generate button plays back the pipeline's steps without calling any API, and `POST /api/generate` returns 403.
- **The sample content is not from the pipeline.** I wrote it by hand. Its sources are real references, but they haven't been link-checked, and the pages label them that way.
- **How to remove it.** Demo code lives in `demo/` (content, plates, data source). To remove demo mode, delete that folder, the lines marked `// demo` in `lib/repository.ts` and `app/components/Figure.tsx`, and the `demo` script in `package.json`.

## Screens

| Route | What it is |
|---|---|
| `/` | **Today**: the latest published discovery |
| `/library` | **Library**: every published discovery, filterable by History, Science or Technology |
| `/discoveries/[id]` | One issue, with Previous/Next navigation |
| `/bench` | **Test bench**: every discovery in any status, with validation results, research notes and the generation log, plus the generate button |

## Setup

**Requirements:** Node 20+ (tested on 22), a Supabase project and an Anthropic API key.

1. **Install**
   ```bash
   cd daily-discovery
   npm install
   ```
2. **Create the database.** In the Supabase dashboard, open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run it. This creates the `interests` and `discoveries` tables and seeds the interest profile. You can run it again safely.
3. **Configure credentials**
   ```bash
   cp .env.example .env.local
   ```
   | Variable | Where to get it |
   |---|---|
   | `ANTHROPIC_API_KEY` | console.anthropic.com → API keys. **Web search and web fetch must be enabled for your organization** in the Console settings. |
   | `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys: the `service_role` key, or a new `sb_secret_…` secret key. It is only used on the server and never sent to the browser. |
   | `CLAUDE_MODEL` (optional) | Overrides the model. The default is `claude-opus-5-5`. |
4. **Run**
   ```bash
   npm run dev          # open http://localhost:3000
   ```
   Click **Generate a new discovery**. One run usually takes 2–5 minutes, and the terminal shows its progress. You can also generate from the command line with `npm run generate`.

Other commands: `npm test` runs the unit tests for the deterministic logic and needs no keys. `npm run typecheck` type-checks the code, and `npm run build` runs a production build.

## How the pipeline works

`lib/pipeline.ts` runs these steps in order. Each step is logged to the discovery's `generation_log`, and you can expand the log on the article page.

1. **Plan the category** (`lib/interests.ts`). It picks a top-level category using the interest weights, so History gets about 50% of discoveries. Categories that have been under-represented in the last 20 discoveries get a boost, and over-represented ones get less. The previous discovery's subcategory is always excluded, and a non-History category is never used twice in a row.
2. **Build a candidate pool** (`lib/topics.ts`). Claude proposes 10 specific candidate topics in that category. It is given the last 3 discoveries, which it must not closely relate to, and every past title, which it must not overlap. Each candidate gets a score from 1 to 5 for relevance, substance, curiosity, source availability and novelty. The code then combines these scores and subtracts a penalty for word overlap with past topics. Candidates that overlap too much are dropped.
3. **Research** (`lib/research.ts`). Claude researches the best candidate using Anthropic's server-side **web search** and **web fetch** tools, with sources ranked academic, museum, scientific and primary first. It writes structured notes: core facts, the narrative or mechanism, disputed or uncertain points, myths to avoid, and an assessment of each source. The notes end with a verdict: SUFFICIENT or INSUFFICIENT.
   - The code builds the source list **only from URLs that actually appeared in search or fetch results**. Any other URL in the notes is removed.
   - The code overrules a SUFFICIENT verdict if the notes rely on fewer than 3 retrieved sources, or on sources from fewer than 2 domains.
   - If the topic is rejected, the next candidate is researched, up to 3 attempts.
4. **Write** (`lib/writer.ts`). Claude writes the article from the research notes only, as structured JSON: title, subtitle, introduction, sections with headings, the source IDs each section relies on, and 3 related topics.
5. **Validate** (`lib/validate.ts`). Code checks the required fields, the structure, the 600–900 word target, that sources are present and every cited ID is real, duplicate titles, quotations, vague attribution and rhetorical questions.
6. **Claim review**. A second Claude pass compares every specific claim in the article against the research notes. It flags claims that are unsupported, contradicted, or stated as settled when the research says they are disputed.
7. **Revise once** if the review flagged a serious claim, a check found an error, or the word count is outside the target. The revised draft is validated and reviewed again.
8. **Link check**. Each source URL is requested. Unreachable links (404, DNS failure) are removed from the article. Sites that block bots (403/429) are marked *unverified* and kept.
9. **Save** with one of these statuses:
   - `ready`: passed every check. `published_at` is set.
   - `needs_review`: has remaining claim flags, a word count outside the target, a section with no sources, or fewer than 3 working sources.
   - `failed`: a hard error occurred or no topic had enough sources. The error and the full log are stored.

The article page labels these checks as automated. Passing them **does not mean the article has been fact-checked**. The claim review only compares the article with its own research notes, so it can't catch a mistake that is already in those notes.

## Data model (`supabase/schema.sql`)

- **`interests`** has the columns `category`, `subcategory`, `weight` and `active`. To change the profile, edit the weights in this table. They are relative to each other and don't need to sum to 100.
- **`discoveries`** has the fields from the brief (title, subtitle, category, content type, content, reading time, sources, related topics, created and published dates, generation status). It also has these columns:
  - `subcategory` and `topic`, used for diversity and de-duplication
  - `word_count`
  - `validation`: the issues found, the claim review, the disputed points and the full research notes
  - `generation_log` and `error`

  The article content is stored as JSON (`{ introduction: string[], sections: [{ heading, paragraphs[], source_ids[] }] }`) rather than as one block of text.

RLS is enabled on both tables with no policies. Only the server, using the service-role key, can read or write them.

## Technical decisions

- **One Next.js app with no extra services.** The pipeline is plain TypeScript modules called from one API route (`POST /api/generate`) and from one CLI script. There is no job queue. A run happens inside one request, which is fine locally. A hosted deployment would need a background job, because runs take minutes.
- **Anthropic's server-side web search and web fetch** handle research, so there is no separate search API key. Search results come with URL citations. Those citations, plus every URL the tools returned, form the only list of sources the writer may use. This is how the pipeline keeps invented URLs out of the article.
- **Research, writing and review are separate model calls.** The writer sees only the research notes, so anything it adds beyond them can be detected. The reviewer is a separate call, so it doesn't approve its own writing.
- **Structured outputs** (Zod schemas via `messages.parse`) for topic candidates, articles and reviews, so the output's structure is guaranteed and checked again.
- **Model and settings:** `claude-opus-5-5` with adaptive thinking. Effort is `medium` for topic selection and claim review, and `high` for research and writing.
  - Server-side refusal fallback (`fallbacks: "default"`) is on. If a safety classifier declines a request, which is most likely on a military-history topic, the API retries it on a substitute model instead of failing the run. To turn this off, remove `fallbacks` and the beta header in `lib/claude.ts`.
- **Duplicate detection has two layers.** Claude scores novelty against the full list of past titles, and the code also compares content words between topics. The word comparison is crude on purpose: it catches near-identical topics, and the model handles conceptual overlap.

## Cost and time

Each run makes about 4–6 model calls. The research call does up to 8 searches and 6 page fetches, and most of the cost is the fetched page content. Check the Anthropic Console usage page after a few runs to see the real cost per discovery. To make runs cheaper, lower `max_uses` in `lib/research.ts` or set a cheaper model with `CLAUDE_MODEL`.

## What's verified

- Unit tests cover category weighting (History stays at about 50% over 400 simulated days, with no back-to-back subcategory), building the source list from search results and removing URLs that weren't retrieved, the minimum-source rule, word counts and duplicate detection, and all structural validation rules.
- The whole pipeline, the API route and the pages were run end to end against stand-in Anthropic and Supabase servers. That run covered streaming with citations, the revision loop, link checking, duplicate rejection and saving.
- **Not yet run against the real Anthropic API or a real Supabase project.** No credentials were available in the development environment. The first real run is the real test of prompt quality and API compatibility.
