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
      className="inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 no-underline"
      style={{ backgroundColor: "#FFDD00", color: "#000000", boxSizing: "border-box" }}
    >
      <Image src="/bmc-logo.svg" alt="" width={14} height={20} className="h-4 w-auto shrink-0" />
      <span className={`${cookie.className} ml-1.5 whitespace-nowrap text-[17px] leading-none`}>
        Buy me a coffee
      </span>
    </a>
  );
}
