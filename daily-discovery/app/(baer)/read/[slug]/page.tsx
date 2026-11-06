import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { loadArticle, type ReaderArticle } from "@/lib/articles";
import { AskBaer } from "../../AskBaer";
import { EclipseIllustration } from "../../EclipseIllustration";
import { ARTICLE_MEDIA, type LeadImage } from "../../media";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = loadArticle((await params).slug);
  return article ? { title: `${article.title} — BAER`, description: article.subtitle } : { title: "BAER" };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Masthead() {
  return (
    <header className="masthead">
      <p className="wordmark" aria-label="BAER">
        BAER
      </p>
    </header>
  );
}

function Lead({ image }: { image: LeadImage }) {
  const photo = image.photo && existsSync(join(process.cwd(), "public", image.photo.src)) ? image.photo : null;
  return (
    <figure className="lead-figure">
      <div className="frame" role="img" aria-label={photo ? photo.alt : image.illustration.alt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo.src} alt="" /> : <EclipseIllustration />}
      </div>
      <figcaption>
        {photo ? photo.caption : image.illustration.caption}
        {photo?.credit && <span className="credit">{photo.credit}</span>}
      </figcaption>
    </figure>
  );
}

function Article({ article }: { article: ReaderArticle }) {
  const lead = ARTICLE_MEDIA[article.slug]?.lead;
  return (
    <article>
      <div className="opening">
        <p className="meta">
          <span>{article.category}</span>
          <span>{article.readingMinutes} min read</span>
        </p>
        <h1 className="headline">{article.title}</h1>
        <p className="standfirst">{article.subtitle}</p>
      </div>

      {lead && <Lead image={lead} />}

      <div className="article-body">
        {article.introduction.map((p, i) => (
          <p key={`i${i}`}>{p}</p>
        ))}
        {article.sections.map((s, i) => (
          <section key={i}>
            {s.heading.trim() ? <h2>{s.heading}</h2> : <hr className="section-break" />}
            {s.paragraphs.map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </section>
        ))}
        <hr className="article-end" />
      </div>

      <div className="coda">
        {article.uncertainties.length > 0 && (
          <section className="notes" aria-labelledby="notes-h">
            <h2 id="notes-h">A note on the evidence</h2>
            {article.uncertainties.map((u, i) => (
              <p key={i}>{u}</p>
            ))}
          </section>
        )}

        <section aria-labelledby="sources-h">
          <h2 id="sources-h">Sources</h2>
          <ol className="sources">
            {article.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  <span className="src-title">{s.title}</span>
                  <span className="src-host">
                    {hostOf(s.url)} <span aria-hidden="true">↗</span>
                    <span className="skip"> (opens in a new tab)</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <AskBaer />
      </div>
    </article>
  );
}

export default async function ReadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = loadArticle(slug);
  return (
    <>
      <a className="skip" href="#main">
        Skip to article
      </a>
      <Masthead />
      <main id="main">
        {article ? (
          <Article article={article} />
        ) : (
          <div className="missing">
            <p>
              No article file found for <code>{slug}</code>.
            </p>
            <p>
              Import a generated article with <code>npm run import-article -- runs/article-&lt;time&gt;.json</code>, then reload.
            </p>
          </div>
        )}
      </main>
      <footer className="page-foot">
        <span className="wordmark">BAER</span>
        <span>A daily reading edition</span>
      </footer>
    </>
  );
}
