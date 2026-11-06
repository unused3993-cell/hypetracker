// Article imagery, chosen per article by an editor (the pipeline doesn't produce images).
//
// To use a photograph: put the file in public/articles/<slug>/ and fill in `photo`. The page
// uses it automatically when the file exists; otherwise it shows the temporary illustration.

export interface LeadImage {
  /** Public path, e.g. "/articles/<slug>/lead.jpg". Used only if the file exists. */
  photo?: { src: string; alt: string; caption: string; credit: string };
  /** Temporary drawn illustration shown until a photograph is chosen. */
  illustration: { kind: "eclipse"; alt: string; caption: string };
}

export const ARTICLE_MEDIA: Record<string, { lead?: LeadImage }> = {
  "the-plates-eddington-set-aside": {
    lead: {
      // Candidate (public domain, 1920): a photographic plate of the 29 May 1919 eclipse from
      // Dyson, Eddington & Davidson's report in Philosophical Transactions A. Confirm the
      // specific file's rights and write its caption before adding it here.
      // photo: { src: "/articles/the-plates-eddington-set-aside/lead.jpg", alt: "…", caption: "…", credit: "…" },
      illustration: {
        kind: "eclipse",
        alt: "Illustration of the eclipsed Sun surrounded by its corona, with stars visible in the dark sky.",
        caption: "During totality the Moon covers the Sun’s disc, and stars near it become visible. Illustration.",
      },
    },
  },
};
