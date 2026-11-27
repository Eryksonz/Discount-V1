import type { Metadata } from "next";
import { JetBrains_Mono, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { isSiteIndexingEnabled } from "@config/app";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif-google",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans-google",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-google",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const indexing = isSiteIndexingEnabled();
  return {
    title: "Tape & Tailor — Menswear Price Terminal & Verified Deal Feed",
    description:
      "Deterministic price tracking across curated menswear brands for students and young professionals. Real deals benchmarked against 90-day medians.",
    robots: indexing
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-[#FAF8F3] text-[#0F1D32] font-sans selection:bg-[#14532D] selection:text-[#FAF8F3]">
        {children}
      </body>
    </html>
  );
}
