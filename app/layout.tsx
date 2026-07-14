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

export const metadata: Metadata = {
  title: "SkewLab",
  description: "Options analytics and paper trading. Hand-written pricing.",
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
        <main className="max-w-[1200px] mx-auto px-6 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
