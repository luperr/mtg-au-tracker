/**
 * Scryfall Sets import — fetches all sets from the Scryfall Sets API and
 * upserts them into the `sets` table.
 *
 * Called at the start of the bulk card import so that set metadata (set_type,
 * parent_set_code) is available before printings are processed.
 */

import { sql } from "drizzle-orm";
import { db, schema } from "../lib/db.js";
import { SCRYFALL_USER_AGENT, BATCH_SIZE } from "../lib/config.js";
import { logger } from "../lib/logger.js";

const SCRYFALL_SETS_URL = "https://api.scryfall.com/sets";

const log = logger.child({ component: "scryfall-sets" });

interface ScryfallSetObject {
  code: string;
  name: string;
  set_type: string;
  parent_set_code?: string;
  released_at: string;
  card_count: number;
  icon_svg_uri: string;
  digital: boolean;
}

interface ScryfallSetsResponse {
  object: "list";
  has_more: boolean;
  data: ScryfallSetObject[];
}

export async function importSets(): Promise<void> {
  log.info("Fetching Scryfall sets list");

  const res = await fetch(SCRYFALL_SETS_URL, {
    headers: { "User-Agent": SCRYFALL_USER_AGENT },
  });
  if (!res.ok) throw new Error(`Scryfall Sets API request failed: ${res.status}`);

  const body = (await res.json()) as ScryfallSetsResponse;
  const allSets = body.data;

  // Skip digital-only sets (e.g. MTGO treasure chests, Arena sets)
  const sets = allSets.filter((s) => !s.digital);

  log.info({ total: allSets.length, importing: sets.length }, "Upserting sets");

  for (let i = 0; i < sets.length; i += BATCH_SIZE) {
    const batch = sets.slice(i, i + BATCH_SIZE);
    await db
      .insert(schema.sets)
      .values(
        batch.map((s) => ({
          setCode: s.code,
          setName: s.name,
          setType: s.set_type,
          parentSetCode: s.parent_set_code ?? null,
          releasedAt: s.released_at,
          cardCount: s.card_count,
          iconSvgUri: s.icon_svg_uri,
        }))
      )
      .onConflictDoUpdate({
        target: schema.sets.setCode,
        set: {
          setName: sql`excluded.set_name`,
          setType: sql`excluded.set_type`,
          parentSetCode: sql`excluded.parent_set_code`,
          releasedAt: sql`excluded.released_at`,
          cardCount: sql`excluded.card_count`,
          iconSvgUri: sql`excluded.icon_svg_uri`,
        },
      });
  }

  log.info({ count: sets.length }, "Sets upserted");
}
