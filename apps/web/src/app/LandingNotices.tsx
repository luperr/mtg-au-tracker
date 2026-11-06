import { Fragment } from "react";
import changelog from "./changelog/entries.json";
import { landingNotices, sydneyToday, type NoticeMarker } from "@/lib/notices";

const LINK_CLASS = "text-link underline visited:text-link-visited hover:opacity-80";

function Marker({ marker }: { marker: NoticeMarker }) {
  if (marker === "new") {
    return <span className="font-bold text-alert animate-blink motion-reduce:animate-none">new!</span>;
  }
  return <span className="text-alert" aria-hidden>★</span>;
}

/** The notices strip under the landing search box. Content lives in @/lib/notices. */
export function LandingNotices() {
  // Newest first — see changelog/page.tsx.
  const notices = landingNotices(sydneyToday(), changelog[0]);

  return (
    <p className="mt-3 text-center font-retro text-xs leading-[1.9] text-cream-dim">
      {notices.map(({ marker, text, link }, i) => (
        <Fragment key={text}>
          {i > 0 && <br />}
          <Marker marker={marker} /> {text}
          {link && (
            <>
              {" · "}
              <a href={link.href} className={LINK_CLASS}>{link.label}</a>
            </>
          )}
        </Fragment>
      ))}
    </p>
  );
}
