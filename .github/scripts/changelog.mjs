// Changelog flags in commit messages. Run by .github/workflows/changelog.yml.
//
// Every PR needs one of these as a line in some commit message (or an edit to entries.json):
//   Changelog: Added Example Games.     ← becomes a /changelog entry on merge
//   Changelog: none                     ← nothing users would notice
//
// Commit messages arrive on stdin, each terminated by a \x1e (git log --format=%B%x1e).
//
//   node changelog.mjs check   — exit 1 unless a flag is present or ENTRIES_CHANGED=true
//   node changelog.mjs apply   — prepend one entry from the message flags to ENTRIES_PATH;
//                                prints "changed" or "unchanged"

import { readFileSync, writeFileSync } from "node:fs";

const FLAG = /^changelog:[ \t]*(.*)$/gim;

const messages = readFileSync(0, "utf8").split("\x1e");
const flags = messages.flatMap((m) => [...m.matchAll(FLAG)].map((x) => x[1].trim()));
const notes = flags.filter((f) => f && f.toLowerCase() !== "none");

const mode = process.argv[2];

if (mode === "check") {
  if (flags.length > 0 || process.env.ENTRIES_CHANGED === "true") {
    console.log(notes.length ? `Changelog entry: ${notes.join(" ")}` : "Changelog: none, or edited directly");
    process.exit(0);
  }
  console.error(
    "No changelog flag found. Add a line to a commit message in this PR:\n" +
      "  Changelog: <one plain-English sentence users would care about>\n" +
      "  Changelog: none\n" +
      "or edit apps/web/src/app/changelog/entries.json directly.",
  );
  process.exit(1);
}

if (mode === "apply") {
  const { ENTRIES_PATH, PR_NUMBER } = process.env;
  const text = notes.join(" ");
  const entries = JSON.parse(readFileSync(ENTRIES_PATH, "utf8"));

  // Nothing to add, or a re-run of the workflow for a push already applied.
  if (!text || entries.some((e) => e.text === text)) {
    console.log("unchanged");
    process.exit(0);
  }

  // The site's audience is in Australia; a UTC date would be a day early for morning merges.
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const pr = Number(PR_NUMBER) || undefined;

  entries.unshift({ date, text, ...(pr && { pr }) });
  writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2) + "\n");
  console.log("changed");
  process.exit(0);
}

console.error("usage: changelog.mjs check|apply");
process.exit(2);
