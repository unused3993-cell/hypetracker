// Test fixtures for the 1919 eclipse topic. These imitate the SHAPE of real responses
// (Wikipedia Action API, OpenAlex, an ordinary HTML article page). The text is written for
// the tests; it is not copied from the real sources, and it proves nothing about live behaviour.

export const ECLIPSE_QUERY = {
  topic: "How the 1919 solar eclipse expeditions tested Einstein's prediction that gravity bends light",
  angle: "What was measured at Sobral and Príncipe, why some plates were set aside, and why the result is still debated",
  searchTerms: ["Eddington experiment 1919 eclipse", "1919 eclipse light deflection Sobral Principe"],
};

export const WP_SEARCH = { query: { search: [{ title: "Eddington experiment" }] } };

export const WP_EXTRACT = {
  query: {
    pages: {
      "123": {
        title: "Eddington experiment",
        fullurl: "https://en.wikipedia.org/wiki/Eddington_experiment",
        extract: [
          "The Eddington experiment was an observational test of general relativity carried out during the total solar eclipse of 29 May 1919.",
          "",
          "== Background ==",
          "General relativity predicted that starlight passing the edge of the Sun would be deflected by about 1.75 arcseconds, twice the value obtained from a Newtonian calculation that treats light as particles.",
          "",
          "== Expeditions ==",
          "Two expeditions were organised by the Astronomer Royal, Frank Dyson. Arthur Eddington and Edwin Cottingham travelled to the island of Príncipe, while Andrew Crommelin and Charles Davidson went to Sobral in Brazil.",
          "",
          "Cloud on Príncipe meant that only two of the sixteen plates showed enough stars to be measured.",
          "",
          "== Results ==",
          "The results were announced at a joint meeting of the Royal Society and the Royal Astronomical Society on 6 November 1919.",
        ].join("\n"),
      },
    },
  },
};

export const WP_LINKS = {
  parse: {
    externallinks: [
      "https://books.google.com/books?id=abc",
      "https://www.example-observatory.org/history/1919-eclipse",
      "https://www.example-observatory.org/another-page",
      "https://physicsmag.example.com/articles/eclipse-bias",
      "https://archive.example.edu/papers/dyson1920.pdf",
      "https://quiet-blog.example.net/einstein-was-right",
    ],
  },
};

export const OBSERVATORY_HTML = `<!doctype html><html><head><title>The 1919 eclipse expeditions | Example Observatory</title>
<script>var tracking = "ignore me";</script><style>p{color:red}</style></head>
<body><nav><p>Home · Visit · Collections · Shop · Support us today</p></nav>
<header><p>Free entry every day of the year, open from ten until five</p></header>
<main><h1>The 1919 eclipse expeditions</h1>
<p>In 1919 the Astronomer Royal, Frank Dyson, sent two parties to photograph the stars of the Hyades during totality.<sup>[3]</sup></p>
<p>At Sobral the smaller four-inch telescope gave a deflection of about 1.98 arcseconds, while plates from the main astrographic instrument were blurred because the Sun&rsquo;s heat had distorted its mirror.</p>
<p>Taken at face value the astrographic plates pointed towards the lower &ldquo;Newtonian&rdquo; value &mdash; one reason the decision to set them aside was later questioned.</p>
<p>The eclipse of 29 May 1919 was well placed for the test because the Sun would be in front of the Hyades, a bright cluster of stars in the constellation Taurus.</p>
<p>Comparison plates of the same star field were taken months later at night, when the Sun was elsewhere in the sky, so that any shift in the stars&rsquo; positions could be measured.</p>
<p>On Príncipe, Arthur Eddington and Edwin Cottingham found that rain fell on the morning of the eclipse and cloud only partly cleared during totality.</p>
<p>The two usable Príncipe plates gave a deflection of about 1.61 arcseconds, with a large uncertainty.</p>
<h2>Re-examination</h2>
<p>When the Sobral plates were re-measured with modern equipment in 1979, the astrographic plates also gave a result consistent with Einstein&rsquo;s prediction.</p>
<p>The re-measurement was carried out at the Royal Greenwich Observatory using a computer-controlled measuring machine.</p>
</main><footer><p>© Example Observatory. All rights reserved. Registered charity.</p></footer></body></html>`;

export const MAGAZINE_HTML = `<html><head><meta property="og:title" content="Was the 1919 eclipse result biased?"></head><body>
<article><h1>Was the 1919 eclipse result biased?</h1>
<p>In 1980 the philosophers John Earman and Clark Glymour argued that the 1919 evidence was weaker than claimed and that discarding plates looked like a choice made to fit the expected answer.</p>
<p>The historian Daniel Kennefick has argued that the decision was driven mainly by Dyson, who was more sceptical of relativity than Eddington, and that the instrumental problems were recorded at the time.</p>
<p>Later radio measurements in the 1970s matched Einstein's prediction to within about one per cent, settling the question of whether light is deflected by the Sun.</p>
<p>The announcement on 6 November 1919 at a joint meeting of the Royal Society and the Royal Astronomical Society turned Einstein into a public figure almost overnight.</p>
<p>The Times reported the result the following day under the headline Revolution in Science.</p>
<p>Critics of the 1919 analysis have mostly focused on how the Sobral astrographic plates were handled rather than on the Príncipe results.</p>
</article></body></html>`;

export const BLOG_HTML = `<html><head><title>Einstein was right!!!</title></head><body><p>Short.</p></body></html>`;

function invert(sentence: string): Record<string, number[]> {
  const idx: Record<string, number[]> = {};
  sentence.split(" ").forEach((w, i) => (idx[w] = [...(idx[w] ?? []), i]));
  return idx;
}

export const OPENALEX = {
  results: [
    {
      id: "https://openalex.org/W1",
      doi: "https://doi.org/10.0000/example.1920.0009",
      display_name: "A determination of the deflection of light by the Sun's gravitational field",
      publication_year: 1920,
      authorships: [{ author: { display_name: "F. W. Dyson" } }, { author: { display_name: "A. S. Eddington" } }, { author: { display_name: "C. Davidson" } }],
      primary_location: { source: { display_name: "Philosophical Transactions of the Royal Society A" } },
      abstract_inverted_index: invert("The purpose of the expeditions was to determine what effect, if any, is produced by a gravitational field on the path of light."),
    },
  ],
};

/** Route fixture responses by URL, like a tiny fake internet. */
export function fixtureFetch(overrides: Record<string, Response | (() => Response)> = {}): typeof fetch {
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  const html = (b: string) => new Response(b, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  return (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    for (const [k, v] of Object.entries(overrides)) if (url.includes(k)) return typeof v === "function" ? v() : v;
    if (url.includes("list=search")) return json(WP_SEARCH);
    if (url.includes("prop=extracts")) return json(WP_EXTRACT);
    if (url.includes("prop=externallinks")) return json(WP_LINKS);
    if (url.includes("api.openalex.org")) return json(OPENALEX);
    if (url.includes("example-observatory.org/history")) return html(OBSERVATORY_HTML);
    if (url.includes("physicsmag.example.com")) return html(MAGAZINE_HTML);
    if (url.includes("quiet-blog.example.net")) return html(BLOG_HTML);
    return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
}
