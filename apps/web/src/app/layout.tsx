import type { Metadata } from "next";
import { Bitcount_Prop_Double } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";
import { ThemeToggle } from "./ThemeToggle";
import { DragDropSearch } from "./DragDropSearch";
import { WantListProvider } from "./WantListContext";
import { AffiliateProvider } from "./AffiliateContext";
import { WantListBadge } from "./WantListBadge";
import { HeaderSearch } from "./HeaderSearch";
import { BuyMeACoffee } from "./BuyMeACoffee";
import { SITE_URL, ANALYTICS_SCRIPT_URL } from "@/lib/config";
import { getAffiliateConfig } from "@/lib/affiliate";

const bitcount = Bitcount_Prop_Double({ subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Scrymarket",
  description: "Compare Australian MTG card prices across stores and eBay",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🃏</text></svg>",
  },
  openGraph: {
    title: "Scrymarket",
    description: "Compare Australian MTG card prices across stores and eBay",
    url: SITE_URL,
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
  // Read on the server so the campaign id stays runtime config (see @/lib/affiliate).
  const affiliate = getAffiliateConfig();

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('theme');if(t==='light')document.documentElement.setAttribute('data-theme','light')})()` }} />
      </head>
      <Script
        src={ANALYTICS_SCRIPT_URL}
        data-website-id="ba5a4121-875c-4ad2-a05e-dbab6b207c03"
        strategy="afterInteractive"
      />
      <body className="min-h-screen bg-bg text-cream antialiased flex flex-col">
        <AffiliateProvider campaignId={affiliate.campaignId} rotationId={affiliate.rotationId}>
          <WantListProvider>
            <DragDropSearch />
            <header className="border-b border-subtle px-4 py-3 header-gradient">
              <div className="mx-auto max-w-5xl w-full flex items-center gap-4">
                {/* Left: logo + beta badge */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Desktop: SCRYMARKET + beta beside */}
                  <div className="hidden sm:flex items-center gap-2">
                    <a href="/" className={`${bitcount.className} text-2xl logo-gradient`}>
                      SCRYMARKET
                    </a>
                    <span className="text-[10px] font-bold tracking-widest px-1.5 py-0.5 bg-price text-bg uppercase rounded">
                      beta
                    </span>
                  </div>
                  {/* Mobile: SM with beta overlapping slightly below */}
                  <div className="sm:hidden inline-flex flex-col items-center leading-none">
                    <a href="/" className={`${bitcount.className} text-2xl logo-gradient`}>
                      SM
                    </a>
                    <span className="text-[9px] font-bold px-1.5 py-px bg-price text-bg uppercase rounded -mt-1" style={{ fontFamily: "sans-serif", letterSpacing: "0.1em" }}>
                      beta
                    </span>
                  </div>
                </div>
                {/* Centre: search (hidden on landing page via client component) */}
                <div className="flex-1 flex justify-center">
                  <Suspense fallback={<div className="flex-1" />}>
                    <HeaderSearch />
                  </Suspense>
                </div>
                {/* Right: controls */}
                <div className="flex items-center gap-3 shrink-0">
                  <WantListBadge />
                  <ThemeToggle />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-5xl w-full px-4 py-6 flex-1">{children}</main>
            <footer className="border-t border-subtle px-4 py-2 text-cream-dim">
              <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs">
                <p className="text-cream-dim/60">
                  <span className="hidden sm:inline">© {new Date().getFullYear()} Scrymarket — not affiliated with Wizards of the Coast or any listed retailer.</span>
                  <span className="sm:hidden">© {new Date().getFullYear()} Scrymarket</span>
                </p>
                <nav className="flex flex-wrap gap-x-3 gap-y-1">
                  <a href="/changelog" className="hover:text-accent transition-colors">Changelog</a>
                  <a href="/about" className="hover:text-accent transition-colors">About</a>
                  <a href="/faq" className="hover:text-accent transition-colors">FAQ</a>
                  <a href="/contact" className="hover:text-accent transition-colors">Contact</a>
                  <a href="/disclaimer" className="hover:text-accent transition-colors">Disclaimer</a>
                  <a href="/privacy" className="hover:text-accent transition-colors">Privacy</a>
                  <a href="/terms" className="hover:text-accent transition-colors">Terms</a>
                </nav>
                <BuyMeACoffee />
              </div>
            </footer>
          </WantListProvider>
        </AffiliateProvider>
      </body>
    </html>
  );
}
