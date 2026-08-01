import { runScryfallImport } from "./bulk-import.js";

runScryfallImport().catch((err: any) => {
  console.error("MSG:", err?.cause?.message ?? err?.message);
  console.error("DETAIL:", err?.cause?.detail);
  console.error("CONSTRAINT:", err?.cause?.constraint_name);
  console.error("CODE:", err?.cause?.code);
  process.exit(1);
});
