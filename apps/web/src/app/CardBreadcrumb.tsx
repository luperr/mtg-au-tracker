"use client";

import { useSearchParams } from "next/navigation";
import { Breadcrumb } from "./Breadcrumb";

/**
 * Client-side breadcrumb for card pages.
 * Reads ?from=<setCode>&fromName=<setName> from the URL so the breadcrumb
 * always reflects the actual navigation context, regardless of ISR caching.
 */
export function CardBreadcrumb({ cardName }: { cardName: string }) {
  const params = useSearchParams();
  const fromCode = params.get("from");
  const fromName = params.get("fromName");

  if (fromCode) {
    return (
      <Breadcrumb items={[
        { label: "Sets", href: "/sets" },
        { label: fromName ?? fromCode.toUpperCase(), href: `/sets/${fromCode}` },
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
