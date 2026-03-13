"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

export function DragDropSearch() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let counter = 0;

    function onDragEnter() {
      counter++;
      setDragging(true);
    }

    function onDragLeave() {
      counter--;
      if (counter === 0) setDragging(false);
    }

    function onDragOver(e: DragEvent) {
      e.preventDefault(); // required to allow drop
    }

    function onDrop(e: DragEvent) {
      e.preventDefault();
      counter = 0;
      setDragging(false);

      // Primary: parse alt attribute from dragged <img> HTML
      // Scryfall alt text format: "Card Name (Set Name #NNN)" — strip the set suffix
      const html = e.dataTransfer?.getData("text/html") ?? "";
      const altMatch = html.match(/<img[^>]+alt="([^"]+)"/i);
      if (altMatch?.[1]) {
        const name = altMatch[1].replace(/\s*\([^)]+#\d+\)\s*$/, "").trim();
        router.push(`/?q=${encodeURIComponent(name)}`);
        return;
      }

      // Fallback: text/plain (some browsers put alt text here)
      const text = e.dataTransfer?.getData("text/plain") ?? "";
      if (text.trim() && !text.startsWith("http")) {
        router.push(`/?q=${encodeURIComponent(text.trim())}`);
      }
    }

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [router]);

  if (!dragging) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-accent-muted/80 border-4 border-dashed border-accent flex items-center justify-center pointer-events-none">
      <div className="rounded-xl bg-surface/90 px-8 py-6 text-center shadow-2xl">
        <div className="text-xl font-bold text-cream">Drop card to search</div>
        <div className="text-sm text-cream-dim mt-1">Release to find prices</div>
      </div>
    </div>
  );
}
