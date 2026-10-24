import type { Metadata } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

// Atkinson Hyperlegible was designed for low-vision readability, which fits an
// audience that includes older and low-vision users. It is the single typeface
// for the whole app.
const atkinson = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: "PowerPlan",
  description:
    "Prioritize outreach to electricity-dependent Medicare beneficiaries in Massachusetts ahead of and during power outages.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body className="font-sans">
        <a href="#main-content" className="skip-link print-hide">
          Skip to main content
        </a>
        {/* Landmarks: banner, then each page's own <main id="main-content">,
            then contentinfo. The layout adds no wrapper around <main>. */}
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
