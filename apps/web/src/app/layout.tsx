import type { Metadata } from "next";
import "./globals.css";

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
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <header className="border-b border-gray-800 bg-gray-900 px-4 py-3">
          <a
            href="/"
            className="text-lg font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Scrymarket
          </a>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
