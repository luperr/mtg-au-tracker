// Adds a changelog entry from a merged PR's description. Run by .github/workflows/changelog.yml.
//
// The marker is an HTML comment, so it doesn't render on the PR:
//   <!-- changelog: Added Example Games. -->
// It may span lines. An empty marker (as left by the PR template) means "no entry".
//
// Env: PR_BODY, PR_NUMBER, MERGED_AT (ISO), ENTRIES_PATH. Prints "changed" or "unchanged".

import { readFileSync, writeFileSync } from "node:fs";

const { PR_BODY = "", PR_NUMBER, MERGED_AT, ENTRIES_PATH } = process.env;

const match = PR_BODY.match(/<!--\s*changelog:([\s\S]*?)-->/i);
const text = match?.[1].replace(/\s+/g, " ").trim();
if (!text) {
  console.log("unchanged");
  process.exit(0);
}

const pr = Number(PR_NUMBER);
const entries = JSON.parse(readFileSync(ENTRIES_PATH, "utf8"));

// A re-run of the workflow must not add the same PR twice.
if (entries.some((e) => e.pr === pr)) {
  console.log("unchanged");
  process.exit(0);
}

// The site's audience is in Australia; a UTC date would be a day early for morning merges.
const date = new Date(MERGED_AT).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

entries.unshift({ date, text, pr });
writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2) + "\n");
console.log("changed");
