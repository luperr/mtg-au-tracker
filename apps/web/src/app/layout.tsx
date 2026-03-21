import type { Metadata } from "next";
import { Bitcount_Prop_Double } from "next/font/google";
import "./globals.css";
import { ThemeToggle } from "./ThemeToggle";
import { DragDropSearch } from "./DragDropSearch";
import { WantListProvider } from "./WantListContext";
import { WantListBadge } from "./WantListBadge";
import { HeaderSearch } from "./HeaderSearch";

const bitcount = Bitcount_Prop_Double({ subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://test.scrymarket.au"),
  title: "Scrymarket",
  description: "Compare Australian MTG card prices across stores and eBay",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🃏</text></svg>",
  },
  openGraph: {
    title: "Scrymarket",
    description: "Compare Australian MTG card prices across stores and eBay",
    url: "https://test.scrymarket.au",
    siteName: "Scrymarket",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scrymarket",
    description: "Compare Australian MTG card prices across stores and eBay",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')})()` }} />
      </head>
      <body className="min-h-screen bg-bg text-cream antialiased flex flex-col">
        <WantListProvider>
          <DragDropSearch />
          <header className="border-b border-subtle px-4 py-3 header-gradient">
            <div className="mx-auto max-w-5xl w-full flex items-center gap-4">
              {/* Left: logo */}
              <a
                href="/"
                className={`${bitcount.className} text-2xl logo-gradient shrink-0`}
              >
                SCRYMARKET
              </a>
              {/* Centre: search (hidden on home page via client component) */}
              <div className="flex-1 flex justify-center">
                <HeaderSearch />
              </div>
              {/* Right: controls */}
              <div className="flex items-center gap-3 shrink-0">
                <WantListBadge />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-5xl w-full px-4 py-6 flex-1">{children}</main>
          <footer className="border-t border-subtle px-4 py-3 text-cream-dim">
            <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs">
              <p>© {new Date().getFullYear()} Scrymarket — not affiliated with Wizards of the Coast or any listed retailer.</p>
              <nav className="flex flex-wrap gap-x-4 gap-y-1">
                <a href="/about" className="hover:text-accent transition-colors">About</a>
                <a href="/faq" className="hover:text-accent transition-colors">FAQ</a>
                <a href="/contact" className="hover:text-accent transition-colors">Contact</a>
                <a href="/disclaimer" className="hover:text-accent transition-colors">Disclaimer</a>
                <a href="/privacy" className="hover:text-accent transition-colors">Privacy</a>
                <a href="/terms" className="hover:text-accent transition-colors">Terms</a>
              </nav>
            </div>
          </footer>
        </WantListProvider>
      </body>
    </html>
  );
}
