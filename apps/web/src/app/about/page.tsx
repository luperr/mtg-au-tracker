import type { Metadata } from "next";
import { getStores } from "@/lib/db";

export const metadata: Metadata = {
  title: "About — Scrymarket",
  description: "What Scrymarket is, how it works, and who built it.",
};

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const stores = await getStores();
  const retailCount = stores.filter((s) => s.id !== "ebay_au").length;

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-10">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold text-cream">About Scrymarket</h1>
        <p className="text-cream-dim leading-relaxed">
          Buying MTG singles in Australia can really suck. Dozens of store websites you check
          one by one, and then if you&apos;re paying shipping across three stores and half a dozen
          eBay sellers, your budget gets burnt on postage before you&apos;ve even sleeved up.
        </p>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket exists because I got sick of doing it all manually. (And I might be a
          little cheap.)
        </p>
        <p className="text-cream-dim leading-relaxed">
          I&apos;m a Melbourne-based engineer and MTG player. I built this to solve my own
          problem — compare prices across Australian stores in one search — and figured if
          it&apos;s useful to me, it&apos;s probably useful to others.
        </p>
        <p className="text-cream-dim leading-relaxed">
          It currently tracks ~{retailCount} Australian stores daily, including eBay AU. The
          Want List optimiser works out the cheapest way to buy a list of cards across multiple
          stores, factoring in each store&apos;s flat-rate postage. No need for a million tabs
          and a calculator when trying to build a deck.
        </p>
        <p className="text-cream-dim leading-relaxed">
          Scrymarket is free for players. No paywalls, no premium tiers, no account required.
          That&apos;s never changing.
        </p>
        <p className="text-cream-dim leading-relaxed">
          For the tech nerds — the whole thing is open source. The code&apos;s on{" "}
          <a
            href="https://github.com/luperr/mtg-au-tracker"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            GitHub
          </a>
          {" "}if you want to poke around or verify I&apos;m not doing anything dodgy with your
          data. You can even spin up your own instance if you feel like it.
        </p>
        <p className="text-cream-dim leading-relaxed">
          This is a one-person side project and I build based on what people tell me. Wrong
          price? Missing store? Feature that would actually save you time?{" "}
          <a href="/contact" className="text-accent hover:underline">
            Let me know, I&apos;ll probably add it.
          </a>
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-cream">Stores we cover</h2>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
          {stores.map((store) => {
            const domain = new URL(store.base_url).hostname;
            const logoSrc = store.logo_url
              ?? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
            return (
              <a
                key={store.id}
                href={store.base_url}
                target="_blank"
                rel="noopener noreferrer"
                title={store.name}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-lg border border-accent-border hover:border-accent transition-colors text-center group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoSrc}
                  alt={store.name}
                  width={40}
                  height={40}
                  className="rounded object-contain w-10 h-10"
                />
                <span className="text-xs text-cream-dim group-hover:text-cream transition-colors leading-tight">
                  {store.name}
                </span>
              </a>
            );
          })}
        </div>
        <p className="text-base text-cream text-center pt-2">
          If your local game store is on this list — buy from them first. Keep your LGS alive.
        </p>
      </section>
    </div>
  );
}
