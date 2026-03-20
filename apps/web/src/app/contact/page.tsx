import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact — Scrymarket",
  description: "Report bugs, missing stores, or wrong prices on Scrymarket.",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-cream mb-3">Contact & Feedback</h1>
        <p className="text-cream-dim leading-relaxed">
          Found a wrong price, want a store added, or have a suggestion? Use the form below —
          no account needed.
        </p>
      </header>

      <ContactForm />

      <p className="text-cream-dim text-sm">
        Response times vary — this is a solo side project. If you have a GitHub account you can
        also{" "}
        <a
          href="https://github.com/luperr/mtg-au-tracker/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          open an issue directly
        </a>
        .
      </p>
    </div>
  );
}
