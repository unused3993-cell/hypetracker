import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Daily Discovery — content engine test bench" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <a href="/">Daily Discovery</a> <span className="muted">· Phase 1 test bench</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
