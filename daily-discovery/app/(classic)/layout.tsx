import type { ReactNode } from "react";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { isDemoMode } from "@/lib/repository";

export const metadata = { title: "Daily Discovery", description: "One genuinely interesting thing, every day." };

export default function RootLayout({ children }: { children: ReactNode }) {
  const demo = isDemoMode();
  return (
    <html lang="en">
      <body>
        {demo && (
          <div className="demo-banner mono" role="note">
            <span className="demo-pill">Demo mode</span>
            Sample content, no external services. Generation is simulated.
          </div>
        )}
        <header className="masthead">
          <a className="wordmark" href="/">
            Daily <em>Discovery</em>
          </a>
          <nav className="mono">
            <a href="/">Today</a>
            <a href="/library">Library</a>
            <a href="/bench" className="nav-quiet">Test bench</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="footer mono">
          <span>Daily Discovery</span>
          <span>One genuinely interesting thing, every day</span>
        </footer>
      </body>
    </html>
  );
}
