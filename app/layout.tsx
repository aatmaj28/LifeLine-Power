import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <div id="main-content">{children}</div>
      </body>
    </html>
  );
}
