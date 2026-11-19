import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Win = { umami?: { track: ReturnType<typeof vi.fn> } };

// The queue is module state, so each test gets a fresh copy of the module.
async function load() {
  vi.resetModules();
  return import("./analytics.js");
}

describe("track", () => {
  let win: Win;

  beforeEach(() => {
    win = {};
    vi.stubGlobal("window", win);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends straight to Umami once it has loaded", async () => {
    const { track } = await load();
    win.umami = { track: vi.fn() };
    track("drag-search", { method: "text" });
    expect(win.umami.track).toHaveBeenCalledWith("drag-search", { method: "text" });
  });

  it("queues until the script loads, then flushes in order", async () => {
    const { track, flushQueue } = await load();
    track("card-search", { query: "bolt", results: 3 });
    track("card-click", { card: "Lightning Bolt", source: "search-v2" });

    win.umami = { track: vi.fn() };
    flushQueue();
    expect(win.umami.track.mock.calls).toEqual([
      ["card-search", { query: "bolt", results: 3 }],
      ["card-click", { card: "Lightning Bolt", source: "search-v2" }],
    ]);

    flushQueue();
    expect(win.umami.track).toHaveBeenCalledTimes(2);
  });

  it("caps the queue when the script never loads", async () => {
    const { track, flushQueue } = await load();
    for (let i = 0; i < 50; i++) track("drag-search", { method: "text" });
    win.umami = { track: vi.fn() };
    flushQueue();
    expect(win.umami.track).toHaveBeenCalledTimes(20);
  });

  it("does nothing on the server", async () => {
    vi.unstubAllGlobals();
    const { track, flushQueue } = await load();
    expect(() => {
      track("drag-search", { method: "text" });
      flushQueue();
    }).not.toThrow();
  });
});
