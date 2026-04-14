"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    router.back();
  }

  return (
    <a
      href="/"
      onClick={handleClick}
      className="mb-5 inline-flex items-center gap-1 text-sm text-accent hover:text-accent-light transition-colors"
    >
      ← Back to search
    </a>
  );
}
