"use client";

import { useEffect, useRef } from "react";

const ATTRS: Record<string, string> = {
  "data-name": "bmc-button",
  "data-slug": "scrymarket",
  "data-color": "#FFDD00",
  "data-emoji": "",
  "data-font": "Cookie",
  "data-text": "Buy me a coffee",
  "data-outline-color": "#000000",
  "data-font-color": "#000000",
  "data-coffee-color": "#ffffff",
};

/**
 * The Buy Me a Coffee widget inserts its button as a sibling of its own <script>
 * tag, so the tag has to live where the button should render. next/script would
 * hoist it out of the footer, hence the manual insert into a container ref.
 */
export function BuyMeACoffee() {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.childElementCount > 0) return;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js";
    for (const [key, value] of Object.entries(ATTRS)) script.setAttribute(key, value);
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, []);

  return <span ref={containerRef} className="inline-flex items-center" />;
}
