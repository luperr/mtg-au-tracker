"use client";

import { useState } from "react";

type FaqItem = { q: string; a: React.ReactNode };

function toId(q: string) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/g, "");
}

const faqs: FaqItem[] = [
  {
    q: "How do I use the Want List optimiser?",
    a: (
      <div className="space-y-4">
        <p>
          The optimiser finds the cheapest way to buy your whole Want List across every store we
          track, postage included — so you pay shipping once per store, not once per card.
        </p>

        <div>
          <p className="font-semibold text-cream mb-1">1. Build your Want List</p>
          <p>
            Click <strong className="text-cream">+</strong> on a card, or paste a deck list into{" "}
            <strong className="text-cream">Import from list</strong> — quantities like
            &ldquo;4x Counterspell&rdquo; are kept. Each card has a quantity and is set to{" "}
            <strong className="text-cream">Any printing</strong>, so the optimiser can pick a
            cheaper version — switch it to <strong className="text-cream">This printing</strong> to
            keep the one you chose.
          </p>
        </div>

        <div>
          <p className="font-semibold text-cream mb-1">2. Set your preferences</p>
          <p>
            Choose the worst condition you&apos;ll accept, foil or non-foil for &ldquo;any
            printing&rdquo; cards, and the most stores you want to order from. Every store is
            included to start with, eBay too — untick any under{" "}
            <strong className="text-cream">Buy from</strong> to leave them out. If a store&apos;s postage is wrong — or you&apos;re picking
            up in person — click its postage to change it.
          </p>
        </div>

        <div>
          <p className="font-semibold text-cream mb-1">3. Read the plan</p>
          <p>
            Your Want List is laid out as the cheapest way to buy it: each card sits under the store
            to buy it from, with buy links, postage, and the total at the top. It updates whenever
            you change a quantity or a preference. Buttons like &ldquo;2 stores · $48.10&rdquo; show
            what ordering from fewer stores would cost. Anything that differs from the listing you
            added — a different printing, a lower condition, stock the store doesn&apos;t confirm —
            is flagged on the card.
          </p>
        </div>

        <p className="text-sm text-cream-dim">
          Only in-stock listings are considered. Cards that can&apos;t be bought — out of stock, or
          nothing matching your preferences — are listed separately so you can change or remove them.
        </p>
      </div>
    ),
  },
  {
    q: "Can I drag a card image onto the site to search for it?",
    a: (
      <>
        Yes. If you&apos;re browsing{" "}
        <a
          href="https://scryfall.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          Scryfall
        </a>
        , EDHREC, or most MTG sites, you can drag a card image directly onto any Scrymarket page
        and it will automatically search for that card. The card name is read from the image and
        you&apos;re taken straight to the results.
      </>
    ),
  },
  {
    q: "How often are prices updated?",
    a: "Store prices and eBay data are refreshed once daily, early morning AEST. The Scryfall card database is also refreshed daily to pick up newly released cards and printings.",
  },
  {
    q: "Which stores are tracked?",
    a: (
      <>
        Over 30 Australian retailers plus eBay AU — see the full list on the{" "}
        <a href="/about" className="text-accent hover:underline">About page</a>.
        If a store you buy from isn&apos;t listed,{" "}
        <a href="/contact" className="text-accent hover:underline">let me know</a> and
        I&apos;ll look at adding it.
      </>
    ),
  },
  {
    q: "What does the trend badge (↑ / ↓ / →) mean?",
    a: "It compares today's median price to the last recorded daily snapshot. ↑ means up more than 1%, ↓ means down more than 1%, → means roughly flat. It's based on price history across all tracked stores, not any single retailer.",
  },
  {
    q: "Why is a store missing a price for a card I know they stock?",
    a: (
      <>
        Either the scraper couldn&apos;t match the store&apos;s listing to the correct Scryfall
        printing, or the card was out of stock at scrape time. Try toggling{" "}
        <strong className="text-cream">In stock only</strong> off in the prices table to see all
        listings including out-of-stock ones.
      </>
    ),
  },
  {
    q: "Why is a card missing from search entirely?",
    a: "Card data comes from Scryfall's daily bulk export. Very recently released cards may not appear until the next daily refresh. Tokens, digital-only cards, and promo emblems are intentionally excluded.",
  },
  {
    q: "Does Scrymarket make money from these links?",
    a: (
      <>
        A little, from eBay only. Scrymarket is a participant in the eBay Partner Network, so
        links to eBay listings are affiliate links and I may earn a commission on qualifying
        purchases — at no extra cost to you. Links to the Australian retailers are plain links
        and earn nothing. Either way it has no bearing on which prices are shown or how
        they&apos;re ordered: the cheapest listing is always the cheapest listing, and the code
        that decides that is{" "}
        <a
          href="https://github.com/luperr/mtg-au-tracker"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          open source
        </a>
        {" "}if you want to check.
      </>
    ),
  },
  {
    q: "Is there an account or login required?",
    a: "No. The Want List is saved in your browser's local storage — no account needed. That said, it means your list won't carry over between devices.",
  },
  {
    q: "I found a bug or wrong price. How do I report it?",
    a: (
      <>
        <a href="/contact" className="text-accent hover:underline">Contact page</a> — there&apos;s
        a specific form for wrong prices that lets you pick the card and store. Takes about
        30 seconds.
      </>
    ),
  },
];

export default function FaqContent() {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openAndScroll(id: string) {
    setOpen((prev) => new Set([...prev, id]));
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">FAQ</h1>
      </header>

      {/* Table of contents */}
      <nav className="rounded-lg border border-accent-border p-4 space-y-1.5">
        <p className="text-xs text-cream-dim uppercase tracking-widest font-medium mb-3">
          Contents
        </p>
        {faqs.map(({ q }) => {
          const id = toId(q);
          return (
            <button
              key={id}
              onClick={() => openAndScroll(id)}
              className="block w-full text-left text-sm text-accent hover:text-cream transition-colors leading-snug py-0.5"
            >
              {q}
            </button>
          );
        })}
      </nav>

      {/* FAQ items */}
      <dl className="space-y-2">
        {faqs.map(({ q, a }) => {
          const id = toId(q);
          const isOpen = open.has(id);
          return (
            <div key={id} id={id} className="border border-accent-border rounded-lg overflow-hidden scroll-mt-6">
              <dt>
                <button
                  onClick={() => toggle(id)}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left font-semibold text-cream hover:text-cream transition-colors"
                  aria-expanded={isOpen}
                >
                  <span>{q}</span>
                  <svg
                    className={`w-4 h-4 flex-shrink-0 text-cream-dim transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </dt>
              {isOpen && (
                <dd className="px-4 pb-4 text-cream-dim leading-relaxed border-t border-accent-border pt-3">
                  {a}
                </dd>
              )}
            </div>
          );
        })}
      </dl>

      <p className="text-cream-dim text-sm">
        Still have a question?{" "}
        <a href="/contact" className="text-accent hover:underline">
          Get in touch.
        </a>
      </p>
    </div>
  );
}
