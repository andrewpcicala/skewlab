import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import NavLinks from "./components/NavLinks";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jb-mono",
  subsets: ["latin"],
});

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "SkewLab",
  description: "Options analytics with hand-written pricing. The volatility risk premium in SPY, measured.",
  openGraph: {
    title: "SkewLab — options analytics with hand-written pricing",
    description: "The volatility risk premium in SPY, measured.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SkewLab — options analytics with hand-written pricing",
    description: "The volatility risk premium in SPY, measured.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <header className="border-b border-edge">
          <nav className="max-w-[1200px] mx-auto px-6 h-12 flex items-center justify-between">
            <span className="label-caps" style={{ fontSize: "13px" }}>
              SKEWLAB
            </span>
            <NavLinks />
          </nav>
        </header>
        {/* overflow-x-clip: clips horizontal overflow without creating a scroll container,
            so sticky table headers and touch scroll still work correctly. */}
        <main className="max-w-[1200px] mx-auto px-6 py-10 overflow-x-clip">
          {children}
        </main>
      </body>
    </html>
  );
}
