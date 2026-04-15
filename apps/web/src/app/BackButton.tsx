"use client";

import { useRouter } from "next/navigation";

interface Props {
  /** Text shown in the link. Default: "Back to search" */
  label?: string;
  /** URL used as the href fallback (for right-click / no-JS). Default: "/" */
  fallback?: string;
  className?: string;
}

export function BackButton({
  label = "Back to search",
  fallback = "/",
  className = "mb-5 inline-flex items-center gap-1 text-sm text-accent hover:text-accent-light transition-colors",
}: Props) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    router.back();
  }

  return (
    <a href={fallback} onClick={handleClick} className={className}>
      ← {label}
    </a>
  );
}
