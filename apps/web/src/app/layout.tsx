import type { Metadata } from "next";
import { Bitcount_Prop_Double } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "./ThemeToggle";
import { DragDropSearch } from "./DragDropSearch";

const bitcount = Bitcount_Prop_Double({ subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "Scrymarket",
  description: "Compare Australian MTG card prices across stores",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')})()` }} />
      <body className="min-h-screen bg-bg text-cream antialiased">
        <DragDropSearch />
        <header className="border-b border-subtle px-4 py-3 flex items-center justify-between header-gradient">
          <a
            href="/"
            className={`${bitcount.className} text-2xl logo-gradient`}
          >
            SCRYMARKET
          </a>
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
