/**
 * EPN's AU guidance (AANA Code / ACL) wants the disclosure prominent, not in small
 * print, and directly preceding the affiliate links — so callers render it just
 * above anything containing eBay links, and only when such a link is on screen.
 */
export function AffiliateDisclosure({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-cream-dim ${className}`}>
      Scrymarket contains eBay affiliate links which may earn Scrymarket a commission.{" "}
      <a href="/disclaimer#affiliate-links" className="underline hover:text-accent transition-colors">
        Learn more
      </a>
    </p>
  );
}
