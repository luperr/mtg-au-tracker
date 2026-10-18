import { describe, it, expect } from "vitest";
import { landingNotices, summarise, sydneyToday, MAX_LANDING_NOTICES, type Notice } from "./notices.js";

const pin = (text: string, until?: string): Notice => ({ marker: "star", text, link: { label: "x", href: "/x" }, until });

describe("summarise", () => {
  it("keeps a short entry, dropping the full stop", () => {
    expect(summarise("Added Arcane Alfred.")).toBe("Added Arcane Alfred");
  });

  it("cuts at the first colon", () => {
    expect(summarise("New search, in beta: filter by store, set, condition.")).toBe("New search, in beta");
  });

  it("trims a long clause at a word boundary", () => {
    expect(
      summarise("Listings that carry a set and collector number are now cross-checked against the card name, so fewer end up on the wrong card."),
    ).toBe("Listings that carry a set and collector number…");
  });

  it("does not split on a decimal point", () => {
    expect(summarise("Prices under $0.50 now show.")).toBe("Prices under $0.50 now show");
  });
});

describe("landingNotices", () => {
  const latest = { date: "2026-10-18", text: "Added Arcane Alfred." };

  it("appends the latest changelog entry", () => {
    const out = landingNotices("2026-10-18", latest, [pin("a")]);
    expect(out.map((n) => n.text)).toEqual(["a", "latest: Added Arcane Alfred"]);
    expect(out[1].link).toEqual({ label: "changelog", href: "/changelog" });
  });

  it("marks a recent entry new and an old one with a star", () => {
    expect(landingNotices("2026-10-21", latest, [])[0].marker).toBe("new");
    expect(landingNotices("2026-10-22", latest, [])[0].marker).toBe("star");
  });

  it("drops pinned lines after their until date", () => {
    const pinned = [pin("expires", "2026-10-18"), pin("stays")];
    expect(landingNotices("2026-10-18", latest, pinned).map((n) => n.text)).toContain("expires");
    expect(landingNotices("2026-10-19", latest, pinned).map((n) => n.text)).not.toContain("expires");
  });

  it("caps the strip, keeping the changelog slot", () => {
    const out = landingNotices("2026-10-18", latest, [pin("a"), pin("b"), pin("c")]);
    expect(out).toHaveLength(MAX_LANDING_NOTICES);
    expect(out.map((n) => n.text)).toEqual(["a", "b", "latest: Added Arcane Alfred"]);
  });

  it("gives pinned lines every slot when there is no changelog", () => {
    expect(landingNotices("2026-10-18", undefined, [pin("a"), pin("b"), pin("c"), pin("d")])).toHaveLength(MAX_LANDING_NOTICES);
  });
});

describe("sydneyToday", () => {
  it("rolls over at Sydney midnight, not UTC", () => {
    expect(sydneyToday(new Date("2026-10-18T14:00:00Z"))).toBe("2026-10-19");
  });
});
