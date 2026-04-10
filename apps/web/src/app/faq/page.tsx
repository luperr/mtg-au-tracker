import type { Metadata } from "next";
import FaqContent from "./FaqContent";

export const metadata: Metadata = {
  title: "FAQ — Scrymarket",
  description: "Frequently asked questions about Scrymarket.",
};

export default function FaqPage() {
  return <FaqContent />;
}
