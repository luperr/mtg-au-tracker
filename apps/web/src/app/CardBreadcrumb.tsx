"use client";

import { useSearchParams } from "next/navigation";
import { Breadcrumb } from "./Breadcrumb";

/**
 * Client-side breadcrumb for card pages.
 * Reads ?q=<query> from the URL so the breadcrumb always reflects the actual
 * navigation context, regardless of ISR caching.
 */
export function CardBreadcrumb({ cardName }: { cardName: string }) {
  const params = useSearchParams();
  const fromQuery = params.get("q");

  if (fromQuery) {
    return (
      <Breadcrumb items={[
        { label: `"${fromQuery}"`, href: `/?q=${encodeURIComponent(fromQuery)}` },
        { label: cardName },
      ]} />
    );
  }

  return (
    <Breadcrumb items={[
      { label: "Search", href: "/" },
      { label: cardName },
    ]} />
  );
}
