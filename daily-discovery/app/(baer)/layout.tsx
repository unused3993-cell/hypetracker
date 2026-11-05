import type { ReactNode } from "react";
import type { Viewport } from "next";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/inter/opsz.css";
import "./fonts.css";
import "./baer.css";

export const metadata = { title: "BAER", description: "A daily reading edition." };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf9f6",
};

/** Root layout for the BAER reading experience (separate from the test bench and older pages). */
export default function BaerLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="baer">{children}</body>
    </html>
  );
}
