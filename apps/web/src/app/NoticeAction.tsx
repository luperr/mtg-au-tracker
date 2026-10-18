"use client";

import { useRouter } from "next/navigation";
import { setSearchV2, useSearchV2 } from "@/lib/search-v2/client";
import { trackEvent } from "@/lib/utils";
import type { NoticeAction as Action } from "@/lib/notices";

/**
 * A notice link that does something instead of navigating. Styled by the caller
 * (`className`) so it reads exactly like the `<a>` links beside it.
 */
export function NoticeAction({
  action,
  label,
  doneLabel,
  done: serverDone,
  className,
}: {
  action: Action;
  label: string;
  doneLabel: string;
  /** Whether the action is already in effect, as the server saw it. */
  done: boolean;
  className: string;
}) {
  const router = useRouter();
  const done = useSearchV2(serverDone);

  if (done) return <>{doneLabel}</>;

  function run() {
    trackEvent("notice-click", { action });
    setSearchV2(true);
    router.refresh();
  }

  return (
    <button type="button" onClick={run} className={`${className} cursor-pointer`}>
      {label}
    </button>
  );
}
