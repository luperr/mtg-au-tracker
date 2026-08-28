import Image from "next/image";
import { Cookie } from "next/font/google";

const cookie = Cookie({ subsets: ["latin"], weight: ["400"] });

/**
 * Buy Me a Coffee button.
 *
 * Rendered directly rather than via their button.prod.min.js widget: that script
 * emits its markup with document.writeln(), which is a no-op once the document
 * has been parsed, so it cannot work from a React app. The markup and colours
 * below are what the widget would have written for our data-* attributes.
 */
export function BuyMeACoffee() {
  return (
    <a
      href="https://buymeacoffee.com/scrymarket"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-[60px] min-w-[210px] items-center rounded-xl px-6 no-underline"
      style={{ backgroundColor: "#FFDD00", color: "#000000", boxSizing: "border-box" }}
    >
      <Image src="/bmc-logo.svg" alt="" width={22} height={32} className="h-8 w-auto shrink-0 scale-90" />
      <span className={`${cookie.className} ml-2 whitespace-nowrap text-[28px] leading-none`}>
        Buy me a coffee
      </span>
    </a>
  );
}
