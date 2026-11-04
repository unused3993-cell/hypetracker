# Daily Discovery: content engine

Daily Discovery publishes one well-sourced article a day. This app contains:
- **The content pipeline.** It picks a topic, gathers sources, records the evidence, writes an article from that evidence, checks every factual statement against it, and holds the article for an editor to approve.
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
| `/bench/[id]` | One discovery's evidence ledger, verification results, cost per stage, generation log, and **Approve / Reject** |

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

## Generating and reviewing one article

```bash
npm run generate -- --eclipse      # the 1919 eclipse test topic
npm run generate                   # a topic chosen from the interest profile
```

1. The terminal prints each step, the final status, the cost, and a link to the article on the test bench.
2. On that page you can check:
   - the article
   - each verification round, listing every statement with its verdict
   - the evidence ledger: every claim with its quoted passage and that passage's position in the stored source text
   - the excluded claims, and why each was excluded
   - every source, with its stored text and credibility rating
   - the cost of each stage
3. A **verified** article can be approved. Approving publishes it to Today and the Library.
4. A **needs review** article can only be rejected.

## Live checks (with an API key)

```bash
npm run research-check                    # step 1 only: retrieval + evidence for the 1919 eclipse topic
npm run research-check -- --force-search  # also exercise Anthropic web search
npm run compare-writers -- --ledger runs/research-check-<time>.json --revise
                                          # write + verify with Opus 5.5 and Sonnet 5.5 from that same ledger
npm run compare-writers                   # or: research afresh, then compare
```

Passing `--ledger` makes both models write from exactly the evidence you reviewed in `research-check`. `compare-writers` saves a Markdown file per model (the full article, every verification verdict and the cost table) and one JSON file with the ledger, both drafts, all verification rounds and usage.

`research-check` reports:
- which sources were actually retrieved, and how many characters of text were kept from each
- how many of the evidence quotes were found in that text
- the shape of the raw web search response (result fields, and whether `cited_text` citations are present)
- the cost of each stage

`compare-writers` saves each model's article as Markdown in `runs/`, with its verification result and cost. Neither script needs Supabase.

## How the pipeline works

**1. Topic** (`lib/topics.ts`, Claude Sonnet 5.5, low effort)
- One call proposes 8 candidate topics, each with search terms.
- Category balance, novelty and duplicate checks work as before.

**2. Retrieval** (`lib/retrieval.ts`, no model)
- Free sources are fetched in code:
  - the English Wikipedia article
  - up to 6 pages that Wikipedia cites, one per site, skipping catalogues, paywalls and PDFs
  - OpenAlex scholarly abstracts
- Readable text is extracted from each page and stored.
- **Web search is a fallback.** It runs only when fewer than 3 independent (non-encyclopedia) sources were retrieved:
  - Claude Haiku 5.5 runs at most 3 searches.
  - The pipeline keeps the result URLs and any `cited_text` excerpts, then fetches the pages itself.
  - Search results contain no readable page text, so a result that wasn't fetched is recorded as `search_result_only` and never counts as evidence.

**3. Passages** (`lib/passages.ts`, no model)
- Sources are split into paragraph-sized passages.
- About 30,000 characters of the most relevant ones are kept, ranked by BM25 keyword scoring.

**4. Evidence ledger** (`lib/evidence.ts`, Claude Haiku 5.5)
- The model proposes claims, each with a verbatim quote from a passage, and rates every source's authority and relevance.
- **Code then checks each quote against the stored source text** (`lib/quotes.ts`):
  - It ignores harmless differences: case, whitespace, quote and dash styles, and `...` elisions.
  - It records where the quote sits in the source.
  - Claims without a matching quote are excluded.
- **Credibility rules** consider both the source's authority and the type of claim:
  - A routine fact needs one acceptable source.
  - A precise or contested claim (a figure, date, quotation, superlative, cause or interpretation) needs a primary, scholarly or institutional source, or two acceptable sources on different sites.
  - Unreliable sources never count.
- Conflicting evidence is recorded explicitly.
- **A topic is rejected** unless it has at least 10 usable claims, from at least 3 sources on at least 2 sites, including at least one source that isn't an encyclopedia. The next candidate is then tried, up to 2 topics.

**5. Writing** (`lib/writer.ts`, Claude Opus 5.5)
- The writer sees only the usable claims, with their quotes, the disputes and the source list.
- Structure is up to the writer.
- It also returns an internal **claim map** linking each factual sentence to its claims. Readers never see it.

**6. Verification** (`lib/verify.ts`, Claude Sonnet 5.5)
- A separate model lists every material factual assertion in the article itself, including background "common knowledge".
- It judges each one against the quotes. The verdicts are: supported, partially supported, unsupported, contradicted, misleading context, overstated, or uncertainty not acknowledged.
- Code then cross-checks the claim IDs that the verifier and the writer cite. A citation of a missing or excluded claim never counts as support.

**7. Revision**
- At most once, if anything other than "supported" remains, including partially supported statements.
- The whole revised article is **re-verified**.

**8. Status.** Nothing is published automatically.
- `verified`: every statement is supported and the structure is complete. This is the only status an editor can approve.
- `needs_review`: verification failed, or the budget didn't allow a revision. It can only be rejected.
- `failed`: no topic had enough evidence, or a hard error occurred.
- `approved` or `rejected`: the editor's decision. `published_at` is set only on approval.

Everything is stored for later inspection:
- the evidence ledger (`evidence`), including each source's retrieved text
- every verification round and the claim map (`validation`)
- cost per stage (`usage`)
- the full log

## Cost control

- **Configuration.** Every stage's model, effort and output cap can be set by environment variable (see `.env.example` and `lib/config.ts`).
- **Hard cap.** Before each model call, a worst-case cost is estimated from the prompt size, the full output cap, and the search count with an allowance for result tokens. The call is refused if it could take the run past `BUDGET_MAX_USD`, which defaults to $0.35.
- **Money reserved for verification:**
  - Research holds back enough to write *and* verify.
  - Writing holds back enough to verify.
  - So the budget can stop a revision or a topic attempt, but it never skips verification.
- **Actual cost.** After each call, the token usage the API reported is priced and stored for that stage, including fallback iterations at the price of the model that actually served them.
- **Prices** are in `lib/config.ts`, taken from Anthropic's documentation (as of 2026-10-06). Check them against Console billing.

Estimated typical cost is $0.13–0.20 per article. That figure hasn't been measured; run `compare-writers` or `generate` to get real numbers.

## Tests

`npm test` runs 25 tests with no keys or network:
- unit tests for quote matching, HTML extraction, passage selection, credibility and sufficiency rules, budget enforcement and claim-map checks
- an end-to-end run against a mock Anthropic API and a mock Supabase, using fixture web pages:
  - topic, evidence, writing, failed verification, revision and passing re-verification
  - verified status, then approval
  - the budget stop
  - the web search fallback over a streamed response

**What the tests don't show:** the mock models' answers are scripted, so the tests prove the code paths work, not that real models write or verify well. Real API behaviour, prompt quality and real costs still have to be checked with the live scripts above.

`npm run typecheck` and `npm run build` should also pass.
